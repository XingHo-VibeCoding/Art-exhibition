/**
 * 云函数：note（入口层）
 * 公网路径：/api/note —— 一条路径，四个方法
 *   GET    /api/note?workId=xx   读感想列表   （契约 §4.5）
 *   POST   /api/note             新增一条感想 （契约 §4.4）
 *   PATCH  /api/note/:id         修改一条感想 （契约 §4.6）
 *   DELETE /api/note/:id         删除一条感想 （契约 §4.7）
 *
 * ── Day 22 的主题：一个资源上的「增 · 删 · 改 · 查」闭环 ──────────
 *   前三个方法（GET / POST / PATCH / DELETE）落在**同一个函数、同一条路径**上，
 *   靠 HTTP 方法区分动作 —— 这就是 REST 的常规做法，也是契约 §4.5 路径修订的理由。
 *   本文件因此多了一件 works / like 都没有的活：**先按方法分派**，再进各自的处理函数。
 *
 * ── 这个文件只做三件事 ──────────────────────────────────────────
 *   ① 方法闸 + 参数校验：认方法、取 id、校验 workId / visitorId / text
 *   ② 业务决策 + 组装响应：决定回 404 还是 409、拼 data 形状、定 HTTP 状态码
 *   ③ 调数据访问层：所有「查 / 增 / 改 / 删」都交给 ./repository/ 下的两个文件
 *
 *   它**不再**出现任何 Data API 地址、https 调用、数据库错误码、Authorization 头。
 *   验收手法（今日检测题）：**只看非注释的代码行**，在本文件检索
 *   「数据库地址 / 鉴权头 / 查询串关键字」→ 命中 0；
 *   在 repository/ 里检索同样的关键字 → 全部命中。
 *   （脚本：`_ref/day22-note-tests/layer-check.js`，跑一次出结论。）
 *   （`GET` / `POST` / `PATCH` / `DELETE` 四个词在本文件里是 **HTTP 动词**，
 *     出现在方法闸与方法分派处，属正常且必然 —— 它们不是 SQL 关键字。）
 *
 * ── 这一层的职责边界 ──────────────────────────────────────────
 *   ✅ 负责：HTTP 方法闸、参数校验、业务判断（404 还是 409）、响应形状、HTTP 状态码
 *   ❌ 不负责：怎么拼数据库地址、怎么发请求、怎么把英文错误翻成中文、怎么认约束违例
 *             —— 那些全在 repository 里。入口层只读两三个字段：
 *                 r.ok     true 用 r.exists / r.row / r.rows / r.count / r.changed / r.deleted
 *                 r.kind   'FK' → 404；'UNIQUE' → 409；其余 → 500
 *
 * ── 今日的「防呆」写在哪（三道闸，都在本文件）────────────────────
 *   闸 A **方法闸**：不认识的动词，根本进不到业务逻辑 → 405 METHOD_NOT_ALLOWED
 *   闸 B **参数闸**：缺 id、缺 text、text 超 50 字、正文里混进白名单外的字段 → 400 / 413
 *   闸 C **存在性闸**：PATCH / DELETE 先查一次「这条在不在」→ 不在就 404，**绝不回「成功」**
 *   闸 C 是本日的核心：删除是**不可逆**操作，「删了不存在的东西却报成功」是最坏的一种谎。
 *
 * ── 钥匙（API Key）从哪来 ─────────────────────────────────────
 *   已随查询一起放进 repository/channel.js，本文件不再接触它。
 *   ⚠️ 云函数之间**不共享环境变量**：位置 = 控制台 → 云函数 → note → 函数配置 → 环境变量
 *      → CLOUDBASE_API_KEY（like 函数配过的那份对 note **无效**，必须单独配一次）
 */

const notesRepository = require('./repository/notesRepository');
const worksRepository = require('./repository/worksRepository');

/* ============================================================================
 *  一、出口 —— 与 works / like / health 同一套形状
 *  「同一个项目里，出口只该有一种长相」
 * ==========================================================================*/

/**
 * 统一构造 HTTP 响应。
 * 云开发的「HTTP 访问服务」认得 {statusCode, headers, body}，会原样翻译成真正的 HTTP 响应。
 */
function json(statusCode, payload) {
  return {
    statusCode: statusCode,
    headers: {
      // 显式声明字符集，避免中文 message / 感想正文在浏览器里变乱码
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(payload),
  };
}

/**
 * 统一构造失败响应 —— 契约 §3.2。
 * 失败时**不返回 data**，只返回 {ok:false, error:{code, message}}。
 * message 一律中文、能看懂；code 给机器读。
 */
function fail(statusCode, code, message) {
  return json(statusCode, {
    ok: false,
    error: { code: code, message: message },
  });
}

/** 契约 §4.4 / §4.6：text 上限 50 个**字符**（中英文同等计 1，emoji 算 1） */
const MAX_TEXT_CHARS = 50;
/** 契约 §4.2 沿用：id 类字段各 ≤ 64 字符 */
const MAX_ID_LEN = 64;
/** 契约 §4.5：limit 默认 20、上限 50 */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
/** 契约 §4.6 / §4.7：本路径只认这四个 HTTP 方法 */
const ALLOWED_METHODS = ['GET', 'POST', 'PATCH', 'DELETE'];
/** 契约 §4.6：PATCH 请求体只允许出现这两个键 —— id（定位）与 text（唯一可改字段） */
const ALLOWED_PATCH_KEYS = ['id', 'text'];

/* ============================================================================
 *  二、校验工具（入口层）
 * ==========================================================================*/

/**
 * 按「字符数」计算长度 —— 而不是 `String.length`。
 *
 * 为什么必须这么算：`'😀'.length === 2`。JavaScript 的 length 数的是 UTF-16 码元，
 * 而契约要的是**人眼看到的字符数**（emoji 算 1）。用 Array.from 展开成码点数组再数，
 * 才与数据库里 `char_length(text)` 的口径一致（PostgreSQL 的 char_length 也数码点）。
 */
function countChars(s) {
  return Array.from(String(s)).length;
}

/**
 * 取出一个必填的字符串参数，顺手做齐三件事：存在性、类型、长度。
 * 返回 {value} 或 {error}（给人看的中文）。
 */
function pickRequiredString(obj, key) {
  const v = obj[key];

  if (v === undefined || v === null) {
    return { error: '缺少必填参数 ' + key };
  }
  if (typeof v !== 'string') {
    return { error: '参数 ' + key + ' 必须是字符串，实际收到 ' + typeof v };
  }

  const trimmed = v.trim();
  if (trimmed === '') {
    return { error: '缺少必填参数 ' + key };
  }
  if (trimmed.length > MAX_ID_LEN) {
    return {
      error: '参数 ' + key + ' 超过 ' + MAX_ID_LEN + ' 个字符上限（实际 ' + trimmed.length + ' 个）',
    };
  }
  return { value: trimmed };
}

/**
 * 取出并校验感想正文 text（契约 §4.4 / §4.6 同规）。
 * 三种失败各归各的码：缺 → 400；不是字符串 → 400；trim 后空 → 400；超 50 字 → **413**。
 */
function pickText(obj, key) {
  const v = obj[key];

  if (v === undefined || v === null) {
    return { error: '缺少必填参数 ' + key };
  }
  if (typeof v !== 'string') {
    return { error: '参数 ' + key + ' 必须是字符串，实际收到 ' + typeof v };
  }

  const trimmed = v.trim();
  if (trimmed === '') {
    return { error: '参数 ' + key + ' 不能为空（去掉首尾空格后没有任何内容）' };
  }

  const n = countChars(trimmed);
  if (n > MAX_TEXT_CHARS) {
    return {
      tooLong: true,
      error: '感想正文超过 ' + MAX_TEXT_CHARS + ' 个字符上限（实际 ' + n + ' 个，emoji 按 1 个计）',
      count: n,
    };
  }
  return { value: trimmed };
}

/**
 * 从路径里取出「末段」——契约 §4.6 的 `:id` 来源 ①。
 *
 * 为什么写得这么小心：CloudBase 的 HTTP 访问服务**是否会转发末段路径**，
 * 我们事先没有证据（线上现有三个函数都只有一级路径）。所以这里做的是**尽力而为**：
 * 拿到就当 id，拿不到就交给 query / body 兜底（见 pickId）。**不赌平台行为。**
 *
 * @returns {string} 末段；若路径止于函数名（无 id）则返回空串
 */
function lastPathSegment(p) {
  const s = String(p || '').split('?')[0].replace(/\/+$/, '');
  if (!s) return '';
  const segs = s.split('/').filter(function (x) { return x !== ''; });
  const last = segs.length ? segs[segs.length - 1] : '';
  // 路径只到函数名（'/api/note'、'/note'）→ 没有 id 可言，返回空串
  if (last === 'note' || last === 'api') return '';
  return last;
}

/**
 * 取记录 id —— 契约 §4.6 定稿的**三处兜底**（Day 22 拍板）。
 *
 *   ① 路径末段（含 pathParameters）→ ② query `?id=` → ③ 请求体 `{id}`
 *
 * 三处都空 → 返回空串，由调用方回 400。这样无论平台转不转发路径参数，接口都能跑。
 *
 * @param {boolean} allowBody DELETE 传 false —— 契约 §4.7 明确「删除不从请求体取 id」
 */
function pickId(event, body, allowBody) {
  const candidates = [];

  // ① 路径：pathParameters（若有）视为路径的一部分，优先于裸路径
  if (event.pathParameters && typeof event.pathParameters === 'object') {
    if (typeof event.pathParameters.id === 'string') candidates.push(event.pathParameters.id);
  }
  const rawPath = String(event.path || (event.requestContext && event.requestContext.path) || '');
  candidates.push(lastPathSegment(rawPath));

  // ② query
  const q = event.queryStringParameters || {};
  if (q.id !== undefined && q.id !== null) candidates.push(String(q.id));

  // ③ 请求体
  if (allowBody && body && typeof body === 'object') {
    if (body.id !== undefined && body.id !== null) candidates.push(String(body.id));
  }

  for (let i = 0; i < candidates.length; i++) {
    const v = String(candidates[i] || '').trim();
    if (v !== '' && v.length <= MAX_ID_LEN) return { value: v };
    if (v !== '' && v.length > MAX_ID_LEN) {
      return { error: '记录 id 超过 ' + MAX_ID_LEN + ' 个字符上限（实际 ' + v.length + ' 个）' };
    }
  }
  return { value: '' };
}

/**
 * 把数据库里的一行整理成**对外的形状**。
 * ★ 统一**剔除 visitorId** —— 契约 §4.5 明示匿名作品不对外暴露访客标识；
 *   这条原则不只在「读列表」生效，改 / 删 / 新增的回吐同样遵守。
 *   「匿名」是全局原则，不是某个接口的局部选择。
 */
function projectNote(row) {
  return {
    _id: row._id,
    workId: row.workId,
    text: row.text,
    createdAt: row.createdAt,
  };
}

/* ============================================================================
 *  三、四个处理函数 —— 一个方法一个，职责单一
 * ==========================================================================*/

/** GET /api/note?workId=xx&limit=n —— 契约 §4.5 */
async function handleGet(event) {
  const q = event.queryStringParameters || {};

  // ---- 参数闸 ----
  const workIdCheck = pickRequiredString(q, 'workId');
  if (workIdCheck.error) return fail(400, 'INVALID_PARAM', workIdCheck.error);
  const workId = workIdCheck.value;

  let limit = DEFAULT_LIMIT;
  if (q.limit !== undefined && q.limit !== null && String(q.limit) !== '') {
    const n = Number(q.limit);
    if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) {
      return fail(400, 'INVALID_PARAM', 'limit 必须是 1 到 ' + MAX_LIMIT + ' 之间的整数，实际收到「' + q.limit + '」');
    }
    limit = n;
  }

  // ---- 存在性闸（与 like 同规：作品不存在 → 404，不是空列表）----
  const w = await worksRepository.workExists(workId);
  if (!w.ok) return fail(500, 'INTERNAL_ERROR', w.message);
  if (!w.exists) return fail(404, 'NOT_FOUND', '作品不存在：' + workId);

  // ---- 取数：列表 + 总数（★ 两行调用，数据库的事全在 repository 里）----
  const list = await notesRepository.listByWork(workId, limit);
  if (!list.ok) return fail(500, 'INTERNAL_ERROR', list.message);
  const rows = Array.isArray(list.rows) ? list.rows : [];

  // total 是**基数**，不随 limit 缩小（与 §4.1 的 series[].count 同理）。
  // ★ 它允许失败：计数挂了不该拖垮列表 —— 降级为「本次取回条数」，痕迹留在日志里。
  const cnt = await notesRepository.countByWork(workId);
  let total = rows.length;
  if (cnt.ok) {
    total = cnt.count;
  } else {
    console.error('[note] 感想计数失败，降级为已取回条数：' + cnt.message);
  }

  console.log('[note] OK GET workId=' + workId + ' limit=' + limit + ' rows=' + rows.length + ' total=' + total);

  return json(200, {
    ok: true,
    data: {
      notes: rows.map(projectNote),
      total: total,
    },
  });
}

/** POST /api/note —— 契约 §4.4 */
async function handlePost(body) {
  // ---- 参数闸 ----
  const workIdCheck = pickRequiredString(body, 'workId');
  if (workIdCheck.error) return fail(400, 'INVALID_PARAM', workIdCheck.error);

  const visitorIdCheck = pickRequiredString(body, 'visitorId');
  if (visitorIdCheck.error) return fail(400, 'INVALID_PARAM', visitorIdCheck.error);

  const textCheck = pickText(body, 'text');
  if (textCheck.error) {
    return textCheck.tooLong
      ? fail(413, 'TEXT_TOO_LONG', textCheck.error)
      : fail(400, 'INVALID_PARAM', textCheck.error);
  }

  const workId = workIdCheck.value;
  const visitorId = visitorIdCheck.value;
  const text = textCheck.value;

  // ---- 存在性闸 ----
  const w = await worksRepository.workExists(workId);
  if (!w.ok) return fail(500, 'INTERNAL_ERROR', w.message);
  if (!w.exists) return fail(404, 'NOT_FOUND', '作品不存在：' + workId);

  // ---- 写入 ----
  const ins = await notesRepository.insertNote({ workId: workId, visitorId: visitorId, text: text });
  if (!ins.ok) {
    // ⚠️ 判断顺序有讲究：先认外键违例，再认唯一冲突（两者 HTTP 层都是 409）。
    if (ins.kind === 'FK') {
      return fail(404, 'NOT_FOUND', '作品不存在：' + workId);
    }
    if (ins.kind === 'UNIQUE') {
      return fail(409, 'CONFLICT', '同一位访客对这幅作品已经留过感想了（每人每幅限一条）');
    }
    return fail(500, 'INTERNAL_ERROR', ins.message);
  }

  console.log('[note] OK POST workId=' + workId + ' visitorId=' + visitorId + ' id=' + (ins.row && ins.row._id));

  return json(200, { ok: true, data: { note: projectNote(ins.row) } });
}

/** PATCH /api/note/:id —— 契约 §4.6 */
async function handlePatch(event, body) {
  // ---- 参数闸 ①：取 id（三处兜底）----
  const idCheck = pickId(event, body, true);
  if (idCheck.error) return fail(400, 'INVALID_PARAM', idCheck.error);
  const id = idCheck.value;
  if (id === '') {
    return fail(400, 'INVALID_PARAM', '缺少记录 id：请用 PATCH /api/note/<id>，或带 ?id=<id>');
  }

  // ---- 参数闸 ②：白名单 —— 请求体只许出现 id 与 text ----
  const extraKeys = Object.keys(body).filter(function (k) {
    return ALLOWED_PATCH_KEYS.indexOf(k) === -1;
  });
  if (extraKeys.length > 0) {
    return fail(
      400,
      'INVALID_PARAM',
      '请求体只允许出现 id（用于定位记录）与 text（唯一可改字段），不支持：' + extraKeys.join(' / ')
    );
  }

  // ---- 参数闸 ③：text 必填 + 合规 ----
  const textCheck = pickText(body, 'text');
  if (textCheck.error) {
    return textCheck.tooLong
      ? fail(413, 'TEXT_TOO_LONG', textCheck.error)
      : fail(400, 'INVALID_PARAM', textCheck.error);
  }
  const text = textCheck.value;

  // ---- 存在性闸（★ 本日的防呆核心之一）----
  // 先查一次「这条到底在不在」。不在 → 404，且**什么都没改**（不产生任何写副作用）。
  // 顺带把旧值 previous 拿到手 —— 这正是契约 §4.6「响应带 previous 对照单」的来源。
  const f = await notesRepository.findById(id);
  if (!f.ok) return fail(500, 'INTERNAL_ERROR', f.message);
  if (!f.exists) return fail(404, 'NOT_FOUND', '感想不存在：' + id);

  const previousText = f.row.text;

  // ---- 改 ----
  const u = await notesRepository.updateText(id, text);
  if (!u.ok) return fail(500, 'INTERNAL_ERROR', u.message);
  // 极端并发兜底：查到了、改之前被别人删了 → 改动命中 0 行。
  // 这种情况**必须回 404**，绝不能回「改成功」——
  // 「报告说改了、但其实没有任何一行被改」是本接口最坏的一种谎。
  if (u.changed === 0) return fail(404, 'NOT_FOUND', '感想不存在：' + id);

  console.log('[note] OK PATCH id=' + id + ' changed=' + u.changed);

  return json(200, {
    ok: true,
    data: {
      note: projectNote(u.row),
      previous: { text: previousText },
    },
  });
}

/** DELETE /api/note/:id —— 契约 §4.7 */
async function handleDelete(event) {
  // ---- 参数闸：取 id（契约 §4.7 —— 删除不从请求体取 id，故 allowBody = false）----
  const idCheck = pickId(event, null, false);
  if (idCheck.error) return fail(400, 'INVALID_PARAM', idCheck.error);
  const id = idCheck.value;
  if (id === '') {
    return fail(400, 'INVALID_PARAM', '缺少记录 id：请用 DELETE /api/note/<id>，或带 ?id=<id>');
  }

  // ---- 存在性闸（★ 本日防呆的核心）----
  // 为什么必须显式查一次，而不是「直接删、看返回空不空」：
  //   Data API 删一行**不存在**的记录时，**HTTP 仍返回 2xx、body 是空数组 []**。
  //   若只看状态码就回「删除成功」，防呆就漏了 —— 那正是本日检测题点名要抓的错。
  //   显式先查，语义最清楚；且查到的那一行，正好就是响应里要回吐的 snapshot。
  const f = await notesRepository.findById(id);
  if (!f.ok) return fail(500, 'INTERNAL_ERROR', f.message);
  if (!f.exists) return fail(404, 'NOT_FOUND', '感想不存在：' + id);

  const snapshot = projectNote(f.row);

  // ---- 删 ----
  const d = await notesRepository.deleteById(id);
  if (!d.ok) return fail(500, 'INTERNAL_ERROR', d.message);
  // 第二道交叉验证：数据访问层会回吐「**真正被删掉的行数**」。
  // 若在「查」与「删」之间被并发删掉了 → 命中 0 行 → 同样按 404 处理。
  if (d.deleted === 0) return fail(404, 'NOT_FOUND', '感想不存在：' + id);

  console.log('[note] OK DELETE id=' + id + ' deleted=' + d.deleted);

  return json(200, {
    ok: true,
    data: {
      deleted: true,
      // 快照 = 被删记录的「遗照」。数据**物理上确实删掉了**（GET 不再返回、select 查不到），
      // 但这份快照让人看得见「刚才消失的是什么」，将来若要做「撤销删除」也有据可依。
      // ⚠️ 它不是软删除 —— 响应里有快照 ≠ 库里还留着。
      snapshot: snapshot,
    },
  });
}

/* ============================================================================
 *  四、入口 —— 先过方法闸，再按方法分派
 * ==========================================================================*/

exports.main = async function (event, context) {
  const startedAt = Date.now();
  const method = String(event.httpMethod || 'GET').toUpperCase();
  const path = String(event.path || '');

  console.log('[note] ' + method + ' ' + path
    + ' query=' + JSON.stringify(event.queryStringParameters || {})
    + ' pathParams=' + JSON.stringify(event.pathParameters || null));

  /* ---------- 闸 A：方法闸（最外层，不认识的动词进不到业务逻辑）---------- */
  if (ALLOWED_METHODS.indexOf(method) === -1) {
    return fail(405, 'METHOD_NOT_ALLOWED',
      '本路径只支持 ' + ALLOWED_METHODS.join(' / ') + '，实际收到 ' + method);
  }

  /* ---------- 请求体解析（仅 POST / PATCH 需要）---------- */
  // ⚠️ CloudBase 的 HTTP 访问服务**可能**把请求体做 base64 编码（event.isBase64Encoded），
  //    必须先解码再 JSON.parse —— 不处理会一直误报「不是合法 JSON」。
  let body = null;
  if (method === 'POST' || method === 'PATCH') {
    let rawBody = event.body;
    if (rawBody === undefined || rawBody === null) rawBody = '';

    if (event.isBase64Encoded && typeof rawBody === 'string') {
      try {
        rawBody = Buffer.from(rawBody, 'base64').toString('utf8');
      } catch (e) {
        console.error('[note] 请求体 base64 解码失败：' + e.message);
        rawBody = '';
      }
    }

    if (typeof rawBody === 'string') {
      const trimmed = rawBody.trim();
      if (trimmed === '') {
        return fail(400, 'INVALID_PARAM', '请求体不能为空，需要 JSON 对象');
      }
      try { body = JSON.parse(trimmed); } catch (e) { body = null; }
    } else if (typeof rawBody === 'object') {
      // 控制台「云端测试」可以直接传对象，这里兼容一下，省得调试时踩坑
      body = rawBody;
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return fail(400, 'INVALID_PARAM', '请求体不是合法的 JSON 对象');
    }
  }

  /* ---------- 按方法分派 ---------- */
  try {
    if (method === 'GET') return await handleGet(event);
    if (method === 'POST') return await handlePost(body);
    if (method === 'PATCH') return await handlePatch(event, body);
    if (method === 'DELETE') return await handleDelete(event);
  } catch (e) {
    // 兜底闸：任何没被预料到的异常，都不许以「500 裸报错 + 英文堆栈」的形式漏出去
    // （契约 §3.3：500 只回中文，不暴露堆栈）。技术细节进日志，不进响应。
    console.error('[note] 未捕获异常：' + (e && e.stack ? e.stack : e));
    return fail(500, 'INTERNAL_ERROR', '服务端处理请求时出错，请稍后再试');
  }

  // 理论上到不了这里（方法闸已拦），留着是给未来加方法时一个明确的失败点
  return fail(405, 'METHOD_NOT_ALLOWED', '本路径只支持 ' + ALLOWED_METHODS.join(' / '));
};
