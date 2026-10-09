/**
 * 云函数：works（入口层）
 * 公网路径：GET /api/works
 * 契约：api-contract.md §4.1（读取作品列表）
 *
 * ── Day 19 分层重构后，这个文件只做三件事 ────────────────────────
 *   ① 接请求：认 HTTP 方法、读 query 参数
 *   ② 校验 + 组装响应：白名单校验、拼 data.series、定 HTTP 状态码
 *   ③ 调数据访问层：把「查数据库」交给 ./repository/worksRepository.js 的两行调用
 *
 *   它**不再**出现任何 SQL、Data API 地址、数据库错误码、https 调用。
 *   验收手法（今日检测题）：在本文件检索 SQL 关键字 → 命中 0 次；
 *   在 repository/worksRepository.js 里检索同样的关键字 → 全部命中。
 *
 * ── 这一层的职责边界 ──────────────────────────────────────────
 *   ✅ 负责：HTTP 方法闸、参数校验（白名单）、响应形状、HTTP 状态码
 *   ❌ 不负责：怎么拼数据库地址、怎么发请求、怎么把英文错误翻成中文
 *             —— 那些全在 repository 里。入口层只需要读两个字段：
 *                 r.ok      true 就用 r.rows；false 就用 r.message
 *
 * ── 数据流 ────────────────────────────────────────────────────
 *   浏览器 ──GET /api/works──▶ 本文件（接请求/校验/组装）
 *                                   │  listWorks() / listSeriesColumn()
 *                                   ▼
 *                        repository/worksRepository.js（拼地址/发请求/翻错误）
 *                                   │  HTTPS
 *                                   ▼
 *                        PostgreSQL 的 public.works 表
 *
 * ── 钥匙（API Key）从哪来 ─────────────────────────────────────
 *   数据库那把钥匙已随查询一起搬进 repository，本文件不再接触它。
 *   配置位置（未变）：控制台 → 云函数 → works → 函数配置 → 环境变量 → CLOUDBASE_API_KEY
 */

const worksRepository = require('./repository/worksRepository');

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
 * ★ Day 23：把数据访问层的失败翻译成 HTTP 响应 —— 三类分流的总闸。
 *
 * 为什么抽成这一个函数：works / like / note 三个接口都要做同一件事，
 * 各写一遍就会长出三种长相；而契约 §3.3 是错误码的「唯一定义处」，
 * 那么消费它的地方也该只有一处形态。
 *
 * 契约 §3.3「错误三分类」在这里落地：
 *   第一类 用户输入错 → 400，由各个校验闸直接 fail()，不经过这里
 *   第二类 网络 / 接口错 → 503（路不通，重试可能好转）
 *   第三类 服务端错     → 500（我们错了，详细原因进日志）
 *
 * ★ 判定依据**只有** r.kind —— 数据访问层明确给出的分类。
 *   不许靠 HTTP 状态码或英文消息去反推：Data API 会把多种失败折叠成同一个状态码，
 *   靠状态码猜必然误判（契约 §3.3 判定纪律 2）。
 *
 * @param {{ok:false, kind:string, message:string}} r 数据访问层返回的失败结果
 * @returns 可直接 return 的响应对象
 */
function answerFailure(r) {
  // ── 第二类：网络 / 接口错 ───────────────────────────────────────
  // 「路不通」和「我们错了」是两件事：前者重试可能好转，后者重试也没用。
  // 给它们不同的状态码，验收时「断网」与「改错表名」才能拿回两个不同的数字。
  if (r.kind === 'NETWORK') {
    return fail(503, 'SERVICE_UNAVAILABLE', '数据暂时拿不到，请稍后再试');
  }

  // ── 第三类：服务端错 ────────────────────────────────────────────
  // r.message 是数据层从**白名单映射表**里翻译出来的中文（如「数据库暂时不可用，请稍后再试」），
  // 已经剔除英文原文、表名、SQL 片段，可以安全给用户看。
  // 详细的技术原因，数据层已用 console.error 记进服务端日志 —— 给人看人话，给机器看日志。
  // 缺失时用中性兜底句：宁可模糊，也绝不透出技术细节（契约 §3.3）。
  return fail(500, 'INTERNAL_ERROR', r.message || '服务端处理请求时出错，请稍后再试');
}

/**
 * ★ Day 23 兜底闸：整个请求的最后一道防线。
 *
 * ── 它和 answerFailure() 的区别 ──────────────────────────────────
 *   answerFailure 是**海关**：只检査数据层明明白白报告回来的失败（带 kind 标签）。
 *   本函数是**围墙**：拦的是压根不走海关的那些 ——
 *     · event 是 undefined（平台传了个空事件）
 *     · 某个 JSON.parse 炸了
 *     · 类型意外、内存溢出……
 *   它们不返回 {ok:false}，而是**直接抛**。抛出去就是 500 + 一整屏英文堆栈，
 *   而契约 §3.3 明写「500 不向外暴露堆栈」。这道围墙就是为这句话存在的。
 *
 * ── 为什么整段包住，而不是只包业务逻辑 ──────────────────────────
 *   连 `event.httpMethod` 这种最开头的取值都可能炸（event 若为 undefined）。
 *   只包业务，等于在大门旁边留了扇没锁的窗。
 */
exports.main = async function (event, context) {
  try {
    return await handleRequest(event, context);
  } catch (e) {
    // 技术细节（英文堆栈）只进服务端日志，供将来排错；
    // 响应体里只给一句人能看懂的中文 —— 契约 §3.3 第三类「服务端错」
    console.error('[works] 未捕获异常：' + (e && e.stack ? e.stack : e));
    return fail(500, 'INTERNAL_ERROR', '服务端处理请求时出错，请稍后再试');
  }
};

async function handleRequest(event, context) {
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

  // ---------- 2. 请求数据库：主查询（★ 一行调用，SQL 全在 repository 里）----------
  // 钥匙检查、地址拼接、超时、英文错误翻译，全部由数据访问层负责。
  // 入口层只判断 r.ok：失败时 r.message 已是可直接放进响应体的中文（契约 §3.2）。
  // 入口层只判断 r.ok：失败时把整个 r 交给 answerFailure 分类，
  // 自己不关心是网络断了还是表没了 —— 怎么区分那是数据访问层已经给出的标签。
  const r = await worksRepository.listWorks({ series: seriesFilter, limit: limit });
  if (!r.ok) {
    return answerFailure(r);
  }
  const works = r.rows;

  // ---------- 3. 请求数据库：各展厅作品数（★ 又一行调用）----------
  // 为什么要单独查一次：契约 §4.1 要求 data.series[].count 是**该展厅的作品总数**，
  // 它是导航用的基数，**不能**随 ?series= 的过滤而变小（否则点进 arcana 后，
  // 导航上 arcana 写 22、其它厅写 0，页面就自相矛盾了）。
  // 所以全量取一次 series 字段（85 行、单字段，很轻），在内存里数。
  //
  // ★ 它**允许失败**：汇总挂了不该拖垮主查询 —— 作品列表照样返回，
  //   count 降级为「当前查到条数」，痕迹留在日志里。
  const r2 = await worksRepository.listSeriesColumn();
  let seriesRows = [];
  if (r2.ok) {
    seriesRows = r2.rows;
  } else {
    console.error('[works] 展厅汇总失败，降级处理：' + r2.message);
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

  // ---------- 4. 成功返回：契约 §3.1 的成功形状 ----------
  // 业务数据一律装在 data 里，即使只有一个字段也不提到顶层
  return json(200, {
    ok: true,
    data: {
      series: seriesList,
      works: works,
    },
  });
}
