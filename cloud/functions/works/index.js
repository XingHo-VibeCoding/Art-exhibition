/**
 * 云函数：works
 * 公网路径：GET /api/works
 * 契约：api-contract.md §4.1（读取作品列表）
 *
 * ── 这个函数在整条链路的什么位置 ──────────────────────────────────
 *
 *   浏览器
 *     │  GET https://{envId}.service.tcloudbase.com/api/works        ← ①「外门」：云函数 HTTP 访问
 *     ▼
 *   云函数 works（本文件，跑在云端）
 *     │  GET https://{envId}.api.tcloudbasegateway.com/v1/rdb/rest/works   ← ②「内门」：数据库 Data API
 *     ▼
 *   PostgreSQL 的 public.works 表（85 行）
 *
 *   这两段地址长得很像，但完全不是一回事：
 *     · service.tcloudbase.com     = 云函数的大门，对外，谁都能敲门
 *     · api.tcloudbasegateway.com  = 数据库的 Data API，对内，必须带钥匙
 *   云函数在这里的角色是「门童」：接住外面的请求，替它拿着钥匙去敲内门，再把结果整理好递出去。
 *
 * ── 钥匙（API Key）从哪来 ─────────────────────────────────────────
 *   数据库那把钥匙 **绝不写进代码**，而是从云函数的环境变量里读。
 *   配置位置：控制台 → 云函数 → works → 函数配置 → 环境变量 → 新增 CLOUDBASE_API_KEY
 *   ⚠️ 这把钥匙对应数据库角色 service_role，是管理员级（能绕过行级权限），
 *      只能在服务端使用，**永远不能出现在返回给前端的内容里**。
 *   ⚠️ 代码里只出现 process.env.CLOUDBASE_API_KEY 这个名字，密钥值永远不进仓库。
 */

const https = require('https');

// 环境 ID 不是密钥，可以写默认值；用环境变量覆盖是为了留一条「换环境不改代码」的后路
const ENV_ID = process.env.TCB_ENV_ID || 'art-exhibition-d7ggtul83d566a6c9';
const API_KEY = process.env.CLOUDBASE_API_KEY || '';
const DATA_API_BASE = 'https://' + ENV_ID + '.api.tcloudbasegateway.com/v1/rdb/rest';

// 契约 §2.1 的展厅枚举。这里是「白名单」——只有名单内的值才允许拼进请求，
// 名单外的值直接拒绝。这是参数校验的第一道闸，也是「不用拼 SQL」的前提。
const SERIES_IDS = ['theology', 'arcana', 'anime-worlds', 'other-works'];

// 展厅显示名。★ 从 mvp/index.html 的 SERIES 数组逐字抄来，不是我自己编的
//   （契约 §4.1 只给了 THEOLOGY 一个例子，其余三个若凭感觉写，界面就会和契约对不上）
const SERIES_NAMES = {
  theology: 'THEOLOGY',
  arcana: 'ARCANA',
  'anime-worlds': 'ANIME WORLDS',
  'other-works': 'OTHER WORKS',
};

/**
 * 统一构造 HTTP 响应。
 * 云开发的「HTTP 访问服务」认得 {statusCode, headers, body} 这个形状，会原样翻译成真正的 HTTP 响应。
 * 形状与 health 函数保持一致 —— 同一个项目里，出口只该有一种长相。
 */
function json(statusCode, payload) {
  return {
    statusCode: statusCode,
    headers: {
      // 显式声明字符集，避免中文（作品解说里有大量中文）在浏览器里变成乱码
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(payload),
  };
}

/**
 * 统一构造失败响应 —— 契约 §3.2 的失败形状。
 * 失败时**不返回 data 字段**，只返回 {ok:false, error:{code, message}}。
 * message 一律中文、能看懂；code 给机器读。
 */
function fail(statusCode, code, message) {
  return json(statusCode, {
    ok: false,
    error: { code: code, message: message },
  });
}

/**
 * 用 Node 内置的 https 模块发一个 GET 请求，并把响应体解析成 JSON。
 *
 * 为什么不用 fetch：本机没验证过云函数的 Node 运行时版本，而内置 https 模块
 * 从 Node 0.x 起就有，**不受运行时版本影响**。少一个变量，就少一轮可能的返工。
 * 为什么不装 axios/node-fetch：AGENTS.md 附录明令「不使用未经确认的第三方依赖」，
 * 而这个函数只需要十几行内置代码就能写完。
 *
 * @returns {Promise<{statusCode:number, body:any, raw:string}>}
 */
function getJson(url, headers) {
  return new Promise(function (resolve, reject) {
    const req = https.get(url, { headers: headers, timeout: 8000 }, function (res) {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', function (chunk) { raw += chunk; });
      res.on('end', function () {
        let body = null;
        try { body = raw ? JSON.parse(raw) : null; } catch (e) { body = null; }
        resolve({ statusCode: res.statusCode, body: body, raw: raw });
      });
    });
    req.on('timeout', function () {
      // 云函数默认超时有限，明确掐断并给出可读原因，好过让请求悬着直到整体超时
      req.destroy(new Error('请求数据库 Data API 超时（8s）'));
    });
    req.on('error', reject);
  });
}

/**
 * 把数据库返回的错误，翻译成一句**纯中文**。
 *
 * 契约 §3.2：message 要「中文、直接说明怎么错、怎么改」；
 * 契约 §3.3：500 的错误「不向外暴露堆栈」。
 * Data API（基于 PostgREST）的错误体 {code, message, details, hint} 全是英文，
 * 且 message/details 里可能带表名、列名、SQL 片段 —— 直接透出**两头都违例**。
 * 所以这里的规矩是：**英文原文一律只进日志，响应体里只放中文**。
 * 判据顺序：先认数据库机器码（最精确），认不出再退到 HTTP 状态码，最后给兜底句。
 */
function explainDbError(res) {
  const b = (res && res.body) || {};
  const dbCode = String(b.code || '');
  const status = res && res.statusCode;

  // ① 数据库机器码（PostgREST 的 PGRSTxxx / PostgreSQL 的 SQLSTATE）
  const BY_CODE = {
    '42P01': '数据库中不存在作品数据表',          // PostgreSQL: undefined_table
    '42501': '数据库拒绝了本次读取（权限不足）',    // PostgreSQL: insufficient_privilege
    'PGRST205': '数据库中不存在作品数据表',       // PostgREST: 表不在 schema cache 中
    'PGRST202': '数据库中不存在作品数据表',
    'PGRST301': '数据库访问凭证无效或已过期',
    'PGRST102': '数据库查询条件格式不正确',
    'PGRST116': '数据库返回的记录条数不符合预期',
  };
  if (BY_CODE[dbCode]) return BY_CODE[dbCode];

  // ② HTTP 状态码兜底
  const BY_STATUS = {
    400: '数据库拒绝了本次查询条件',
    401: '数据库访问凭证缺失或无效',
    403: '数据库拒绝了本次读取（权限不足）',
    404: '数据库中不存在作品数据表',
    500: '数据库内部出错，暂时无法读取作品数据',
    503: '数据库暂时不可用，请稍后再试',
  };
  if (BY_STATUS[status]) return BY_STATUS[status];

  // ③ 双兜底：连状态码都认不出时，也不把英文原文抛出去
  return '数据库读取失败，请稍后再试';
}

/**
 * 网络层的失败（连不上、超时、DNS 解析不到）同样翻成中文。
 * 这一层抛出的 Error.message 是纯英文（ENOTFOUND / socket hang up / timeout），
 * 直接当作 message 返回就违了契约 §3.2。原文照旧只进日志。
 */
function explainNetworkError(e) {
  const msg = String((e && e.message) || '');
  if (msg.indexOf('超时') !== -1 || /timeout|ETIMEDOUT/i.test(msg)) {
    return '连接数据库超时，请稍后再试';
  }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(msg)) {
    return '找不到数据库服务地址，请稍后再试';
  }
  if (/ECONNREFUSED|ECONNRESET|socket hang up/i.test(msg)) {
    return '数据库服务暂时无法连接，请稍后再试';
  }
  return '无法连接数据库，请稍后再试';
}

exports.main = async function (event, context) {
  const method = String(event.httpMethod || 'GET').toUpperCase();
  const path = String(event.path || '');

  console.log('[works] ' + method + ' ' + path + ' query=' + JSON.stringify(event.queryStringParameters || {}));

  // ---------- 0. 方法闸：本接口只承诺 GET ----------
  if (method !== 'GET') {
    return fail(405, 'METHOD_NOT_ALLOWED', '仅支持 GET /api/works');
  }

  const q = event.queryStringParameters || {};

  // ---------- 1. 参数校验（契约 §4.1：series 可选 / limit 可选）----------
  // 校验放在最前面：不合格的请求**根本不要碰到数据库**，省一次往返，也不给脏参数任何机会。
  let seriesFilter = null;
  if (q.series !== undefined && q.series !== null && String(q.series) !== '') {
    seriesFilter = String(q.series);
    if (SERIES_IDS.indexOf(seriesFilter) === -1) {
      return fail(
        400,
        'INVALID_PARAM',
        'series 只能是 ' + SERIES_IDS.join(' / ') + ' 之一，实际收到「' + seriesFilter + '」'
      );
    }
  }

  let limit = null;
  if (q.limit !== undefined && q.limit !== null && String(q.limit) !== '') {
    const n = Number(q.limit);
    // 必须是正整数：小数、负数、非数字、Infinity 全部拒之门外
    if (!Number.isInteger(n) || n < 1) {
      return fail(400, 'INVALID_PARAM', 'limit 必须是大于 0 的整数，实际收到「' + q.limit + '」');
    }
    limit = n;
  }

  // ---------- 2. 钥匙检查 ----------
  // 放在这里而不是开头：参数错了先报参数错，更符合排查直觉。
  if (!API_KEY) {
    console.error('[works] 未配置 CLOUDBASE_API_KEY 环境变量');
    return fail(500, 'INTERNAL_ERROR', '服务端未配置数据库密钥（CLOUDBASE_API_KEY），请联系管理员');
  }

  // ---------- 3. 请求数据库：主查询 ----------
  // ★ 参数化在这里的含义：用户输入先过「白名单 / 类型校验」，再经 encodeURIComponent
  //   拼进 URL 的 query string，由 Data API 交给 PostgreSQL 预编译执行。
  //   **全程没有拼接任何 SQL 字符串** —— 就算 series 传成 "'; DROP TABLE works; --"，
  //   它在第 1 步就被枚举校验挡掉了；即使绕过，也只会被当作一个普通的查询值，而不是 SQL 代码。
  const params = ['select=*', 'order=order.asc']; // order=order.asc → 按 "order" 列升序，位次永远由它决定
  if (seriesFilter) params.push('series=eq.' + encodeURIComponent(seriesFilter));
  if (limit !== null) params.push('limit=' + limit);
  const worksUrl = DATA_API_BASE + '/works?' + params.join('&');

  let worksRes;
  try {
    worksRes = await getJson(worksUrl, {
      Authorization: 'Bearer ' + API_KEY,
      Accept: 'application/json',
    });
  } catch (e) {
    // 网络层抛出的原文是英文（ENOTFOUND / timeout / socket hang up），只进日志；
    // 响应体里换成人能看懂的中文 —— 契约 §3.2
    console.error('[works] 主查询异常：' + (e && e.message) + ' url=' + worksUrl);
    return fail(500, 'INTERNAL_ERROR', explainNetworkError(e));
  }

  if (worksRes.statusCode < 200 || worksRes.statusCode >= 300) {
    console.error('[works] 主查询失败：' + worksRes.raw);
    return fail(500, 'INTERNAL_ERROR', explainDbError(worksRes));
  }

  const works = Array.isArray(worksRes.body) ? worksRes.body : [];

  // ---------- 4. 请求数据库：各展厅作品数 ----------
  // 为什么要单独查一次：契约 §4.1 要求 data.series[].count 是**该展厅的作品总数**，
  // 它是导航用的基数，**不能**随 ?series= 的过滤而变小（否则点进 arcana 后，
  // 导航上 arcana 写 22、其它厅写 0，页面就自相矛盾了）。
  // 所以这里全量取一次 series 字段（85 行、单字段，很轻），在内存里数。
  let seriesRows = [];
  try {
    const countRes = await getJson(DATA_API_BASE + '/works?select=series&order=order.asc', {
      Authorization: 'Bearer ' + API_KEY,
      Accept: 'application/json',
    });
    if (countRes.statusCode >= 200 && countRes.statusCode < 300 && Array.isArray(countRes.body)) {
      seriesRows = countRes.body;
    } else {
      // 汇总失败不该拖垮主查询：作品列表照样返回，count 降级为当前查到条数并在日志留痕
      console.error('[works] 展厅汇总查询失败，降级处理：' + countRes.raw);
    }
  } catch (e) {
    console.error('[works] 展厅汇总查询异常，降级处理：' + e.message);
  }

  const counts = {};
  seriesRows.forEach(function (row) {
    const id = row && row.series;
    if (id) counts[id] = (counts[id] || 0) + 1;
  });
  const hasCounts = seriesRows.length > 0;

  // 展厅顺序按前端导航固定顺序（theology → arcana → anime-worlds → other-works），
  // 不是按字典序、也不是按数量 —— 契约 §4.1 明确要求这个顺序
  const seriesList = SERIES_IDS.map(function (id) {
    return {
      id: id,
      name: SERIES_NAMES[id],
      count: hasCounts ? (counts[id] || 0) : works.filter(function (w) { return w.series === id; }).length,
    };
  });

  // ---------- 5. 成功返回：契约 §3.1 的成功形状 ----------
  // 业务数据一律装在 data 里，即使只有一个字段也不提到顶层
  return json(200, {
    ok: true,
    data: {
      series: seriesList,
      works: works,
    },
  });
};
