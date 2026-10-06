/**
 * 数据访问层 · works 表
 * 所属云函数：works（GET /api/works）
 * 契约：api-contract.md §4.1
 *
 * ── 这个文件为什么存在 ────────────────────────────────────────────
 * Day 17 为了先跑通，把「查数据库」的代码直接写在了 index.js 里。
 * 能跑，但那是**两种语言住一间屋**：index.js 一边说 HTTP（接请求、返响应），
 * 一边说数据库（拼 Data API 地址、认 SQLSTATE 错误码）。
 * Day 19 把后者整体搬到这里 —— 从此：
 *   · 想改查询，只来这个文件；
 *   · 想换数据库，只重写这个文件，index.js 一行不用动；
 *   · 在 index.js 里搜 `select` / `insert`，命中 0 次。
 *
 * ── 它的职责边界（三层里的最里层）────────────────────────────────
 *   ✅ 负责：拼 Data API 地址、发 https 请求、把数据库的英文错误翻成中文、
 *            把原始响应整理成一个**固定的结果形状**交给上层。
 *   ❌ 不负责：判断 HTTP 方法、校验 series/limit 白名单、组装响应形状、
 *            决定用哪个 HTTP 状态码 —— 那是入口层（index.js）的事。
 *
 * ── 对外只暴露两件事 ─────────────────────────────────────────────
 *   listWorks({ series, limit })  读作品主查询
 *   listSeriesColumn()            只读 series 列（给展厅计数用）
 *
 * ── 结果形状（两层之间的「合同」）─────────────────────────────────
 *   成功：{ ok: true,  rows: [...] }
 *   失败：{ ok: false, kind: 'NO_KEY' | 'NETWORK' | 'DB', message: '中文，可直接放进响应体' }
 *   为什么这么定：入口层拿到 `ok:false` 只需要一行 `fail(500, 'INTERNAL_ERROR', r.message)`，
 *   不必知道数据库说了什么、错在第几层。技术细节（英文原文）由本文件自己记进日志。
 *
 * ── 钥匙（API Key）从哪来 ────────────────────────────────────────
 *   数据库那把钥匙 **绝不写进代码**，从云函数环境变量读。
 *   配置位置：控制台 → 云函数 → works → 函数配置 → 环境变量 → CLOUDBASE_API_KEY
 *   ⚠️ 该 Key 对应数据库角色 service_role（BYPASSRLS，管理员级），
 *      只能在服务端使用，**永远不能出现在返回给前端的内容里**，也永不进仓库。
 */

const https = require('https');

// 环境 ID 不是密钥，可以写默认值；用环境变量覆盖是为了留一条「换环境不改代码」的后路
const ENV_ID = process.env.TCB_ENV_ID || 'art-exhibition-d7ggtul83d566a6c9';
const API_KEY = process.env.CLOUDBASE_API_KEY || '';

// ★ 数据库的「内门」—— 与云函数对外的大门（service.tcloudbase.com）完全不是一回事：
//   api.tcloudbasegateway.com 是对内的 Data API（基于 PostgREST），必须带钥匙
const DATA_API_BASE = 'https://' + ENV_ID + '.api.tcloudbasegateway.com/v1/rdb/rest';

// 缺钥匙时的中文提示。放在常量里是为了让 index.js 不必知道这个句子长什么样
const NO_KEY_MESSAGE = '服务端未配置数据库密钥（CLOUDBASE_API_KEY），请联系管理员';

/* ============================================================================
 *  一、通道 —— 与数据库 Data API 通话
 * ==========================================================================*/

/**
 * 用 Node 内置的 https 模块发一个 GET 请求，并把响应体解析成 JSON。
 *
 * 为什么不用 fetch：本机没验证过云函数的 Node 运行时版本，而内置 https 模块
 * 从 Node 0.x 起就有，**不受运行时版本影响**。少一个变量，就少一轮可能的返工。
 * 为什么不装 axios/node-fetch：AGENTS.md 附录明令「不使用未经确认的第三方依赖」。
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

/* ============================================================================
 *  二、翻译 —— 把数据库的英文错误翻成中文
 *  规矩（Day 17 定）：**英文原文一律只进日志，响应体里只放中文**。
 *  依据：契约 §3.2（message 中文）+ §3.3（500 不向外暴露堆栈/表结构）。
 * ==========================================================================*/

/**
 * 把数据库返回的错误，翻译成一句**纯中文**。
 * Data API（PostgREST）的错误体 {code, message, details, hint} 全是英文，
 * 且 message/details 里可能带表名、列名、SQL 片段 —— 直接透出**两头都违例**。
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

/* ============================================================================
 *  三、统一的一次读取 —— 所有查询都从这里出去
 * ==========================================================================*/

/**
 * 向 Data API 发一次 GET，并把结果规范化成统一的 {ok, rows} / {ok:false, ...}。
 * 抽成一个函数的好处：钥匙闸、超时、错误翻译这三件事**只写一遍**，
 * 以后新增查询（比如 Day 19 之后的 stats）直接复用，不会各写各的。
 *
 * @param {string} query 形如 'select=*&order=order.asc'（不含 ?）
 * @param {string} label 只用于日志，标明这是哪一次查询
 */
async function callWorksApi(query, label) {
  // 钥匙闸放在最前面：没钥匙就不必发请求，省一次往返，也避免把错误归因到网络上
  if (!API_KEY) {
    console.error('[works] 未配置 CLOUDBASE_API_KEY 环境变量');
    return { ok: false, kind: 'NO_KEY', message: NO_KEY_MESSAGE };
  }

  const url = DATA_API_BASE + '/works?' + query;

  let res;
  try {
    res = await getJson(url, {
      Authorization: 'Bearer ' + API_KEY,
      Accept: 'application/json',
    });
  } catch (e) {
    // 网络层抛出的原文是英文（ENOTFOUND / timeout / socket hang up），只进日志；
    // 响应体里换成人能看懂的中文 —— 契约 §3.2
    console.error('[works] ' + label + '异常：' + (e && e.message));
    return { ok: false, kind: 'NETWORK', message: explainNetworkError(e) };
  }

  if (res.statusCode < 200 || res.statusCode >= 300) {
    console.error('[works] ' + label + '失败：' + res.raw);
    return { ok: false, kind: 'DB', message: explainDbError(res) };
  }

  return { ok: true, rows: Array.isArray(res.body) ? res.body : [] };
}

/* ============================================================================
 *  四、对外暴露的两个查询
 * ==========================================================================*/

/**
 * 读作品列表（契约 §4.1 的主查询）。
 *
 * ★ 参数化在这里的含义：用户输入已经在**入口层**过完「白名单 / 类型校验」，
 *   到这儿只做 encodeURIComponent，再拼进 URL 的 query string，
 *   由 Data API 交给 PostgreSQL 预编译执行。**全程没有拼接任何 SQL 字符串** ——
 *   就算 series 传成 "'; DROP TABLE works; --"，它也只会被当作一个普通的查询值。
 *
 * @param {{series?:string|null, limit?:number|null}} options
 * @returns {Promise<{ok:true, rows:any[]} | {ok:false, kind:string, message:string}>}
 */
async function listWorks(options) {
  const opts = options || {};

  // order=order.asc → 按 "order" 列升序，位次永远由它决定（契约 §4.1）
  const params = ['select=*', 'order=order.asc'];
  if (opts.series) params.push('series=eq.' + encodeURIComponent(opts.series));
  if (opts.limit !== null && opts.limit !== undefined) params.push('limit=' + opts.limit);

  return callWorksApi(params.join('&'), '主查询');
}

/**
 * 只读 series 一列的全部行，供入口层在内存里数出各展厅的作品总数。
 *
 * 为什么单独一次查询：契约 §4.1 要求 data.series[].count 是**该展厅的作品总数**，
 * 它是导航用的基数，**不能**随 ?series= 的过滤而变小（否则点进 arcana 后，
 * 导航上 arcana 写 22、其它厅写 0，页面就自相矛盾了）。
 * 所以这里全量取一次 series 字段（85 行、单字段，很轻），在内存里数。
 *
 * ★ 它**允许失败**：汇总挂了不该拖垮主查询 —— 入口层会据此降级处理。
 */
async function listSeriesColumn() {
  return callWorksApi('select=series&order=order.asc', '展厅汇总');
}

module.exports = {
  listWorks: listWorks,
  listSeriesColumn: listSeriesColumn,
};
