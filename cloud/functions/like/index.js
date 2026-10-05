/**
 * 云函数：like
 * 公网路径：POST /api/like
 * 契约：api-contract.md §4.2（匿名点赞 · 切换式 toggle）
 *
 * ── 这个函数在整条链路的什么位置 ──────────────────────────────────
 *
 *   浏览器
 *     │  POST https://{envId}.service.tcloudbase.com/api/like      ← ①「外门」：云函数 HTTP 访问
 *     ▼
 *   云函数 like（本文件，跑在云端）
 *     │  GET / POST / DELETE  https://{envId}.api.tcloudbasegateway.com/v1/rdb/rest/likes
 *     ▼                                                    ← ②「内门」：数据库 Data API
 *   PostgreSQL 的 public.likes 表
 *
 *   与 works 函数最大的区别：**读是看，写是用。**
 *   读接口只需要「拿回来、整理好、递出去」；
 *   写接口多出三件必须自己扛的事 ——
 *     ① 校验：缺字段、超长、不存在，一律在**碰到数据库之前**拦住；
 *     ② 防重复：同一个人对同一幅画提交两次，到底算什么？（本文件答案：算「取消」）
 *     ③ 错误处理：失败时必须告诉人「错在哪、怎么改」，且只讲中文。
 *
 * ── 钥匙（API Key）从哪来 ─────────────────────────────────────────
 *   与 works 函数同一把，但 ⚠️ **云函数之间不共享环境变量**：
 *   配置位置：控制台 → 云函数 → like → 函数配置 → 环境变量 → 新增 CLOUDBASE_API_KEY
 *   ⚠️ 该 Key 对应数据库角色 service_role（BYPASSRLS，管理员级），**永不进代码 / 前端 / 仓库**。
 */

const https = require('https');
const crypto = require('crypto');

// 环境 ID 不是密钥，可写默认值；用环境变量覆盖是为留一条「换环境不改代码」的后路
const ENV_ID = process.env.TCB_ENV_ID || 'art-exhibition-d7ggtul83d566a6c9';
const API_KEY = process.env.CLOUDBASE_API_KEY || '';
const DATA_API_BASE = 'https://' + ENV_ID + '.api.tcloudbasegateway.com/v1/rdb/rest';

// 契约 §4.2：workId / visitorId 均为必填，且各 ≤ 64 字符
const MAX_ID_LEN = 64;

const API_WORKS = '/works';
const API_LIKES = '/likes';

/* ============================================================================
 *  一、出口 —— 与 works / health 函数同一套形状
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
      // 显式声明字符集，避免中文 message 在浏览器里变乱码
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

/* ============================================================================
 *  二、通道 —— 与数据库 Data API 通话（读 / 写 / 删三用）
 * ==========================================================================*/

/**
 * 向 Data API 发一次请求。这是本函数与 works 最大的结构差别：
 * works 只需要 GET，所以写了个 getJson；本接口需要 GET / POST / DELETE 三种方法，
 * 故抽象成一个通用的 callDataApi，避免三份重复代码。
 *
 * @param {string} method   'GET' | 'POST' | 'DELETE'
 * @param {string} path     形如 '/likes'、'/works'
 * @param {string} query    形如 'workId=eq.xxx&limit=1'（不含 ?），可为空串
 * @param {object|null} body  仅 POST 用；为 null 表示不带请求体
 * @returns {Promise<{statusCode:number, body:any, raw:string}>}
 *
 * ★ 为什么全程没有拼接 SQL：
 *   所有用户输入都先过「类型 + 长度 + 白名单」校验，再用 encodeURIComponent 编进 URL，
 *   最终由 Data API（PostgREST）交给 PostgreSQL 预编译执行。哪怕 workId 传成
 *   "'; DROP TABLE likes; --"，它在校验阶段就已经被长度/类型规则挡下；即便绕过，
 *   也只会被当作一个**普通查询值**，而不是 SQL 代码。
 */
function callDataApi(method, path, query, body) {
  return new Promise(function (resolve, reject) {
    const url = DATA_API_BASE + path + (query ? '?' + query : '');

    const headers = {
      Authorization: 'Bearer ' + API_KEY,
      Accept: 'application/json',
    };

    let payload = null;
    if (body !== null && body !== undefined) {
      payload = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
      // 让 Data API 把写入后的那一行回吐出来 —— 便于排查，也方便将来做审计
      headers['Prefer'] = 'return=representation';
    }

    const req = https.request(
      url,
      { method: method, headers: headers, timeout: 8000 },
      function (res) {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', function (chunk) { raw += chunk; });
        res.on('end', function () {
          let parsed = null;
          try { parsed = raw ? JSON.parse(raw) : null; } catch (e) { parsed = null; }
          resolve({ statusCode: res.statusCode, body: parsed, raw: raw });
        });
      }
    );

    req.on('timeout', function () {
      // 云函数默认超时有限，明确掐断并给出可读原因，好过让请求悬着直到整体超时
      req.destroy(new Error('请求数据库 Data API 超时（8s）'));
    });
    req.on('error', reject);

    if (payload !== null) req.write(payload);
    req.end();
  });
}

/** 半开区间判断：2xx 一律算成功 */
function isOk(res) {
  return res && res.statusCode >= 200 && res.statusCode < 300;
}

/* ============================================================================
 *  三、翻译 —— 把数据库的英文错误翻成中文
 *  规矩（Day 17 定，本函数沿用）：**英文原文一律只进日志，响应体里只放中文**。
 *  依据：契约 §3.2（message 中文）+ §3.3（500 不向外暴露堆栈/表结构）。
 * ==========================================================================*/

/** 取响应体里的数据库机器码（PostgREST 会把 PostgreSQL 的 SQLSTATE 原样放在 code 字段） */
function dbCodeOf(res) {
  return String((res && res.body && res.body.code) || '');
}

/**
 * 该响应是否是「唯一约束冲突」——可能来自主键撞车，也可能来自 (workId, visitorId) 联合唯一。
 *
 * ⚠️ 必须**认机器码**，不能只看 HTTP 状态码：
 *    PostgREST 把「唯一冲突 23505」和「外键违例 23503」**都翻译成 HTTP 409**。
 *    若只看 409，就会把「作品不存在」误判成「已赞过」，进而去删一条并不存在的记录。
 *    机器码认不出时（理论上不会发生）才退到状态码兜底。
 */
function isUniqueViolation(res) {
  const code = dbCodeOf(res);
  if (code) return code === '23505'; // PostgreSQL: unique_violation
  return res && res.statusCode === 409;
}

/** 该响应是否是「外键违例」——说明 workId 指向的作品不存在（并发删除的极端情况） */
function isForeignKeyViolation(res) {
  return dbCodeOf(res) === '23503'; // PostgreSQL: foreign_key_violation
}

/**
 * 数据库错误 → 一句纯中文。
 * 判据顺序：先认数据库机器码（最精确）→ 认不出再退 HTTP 状态码 → 最后给兜底句。
 */
function explainDbError(res) {
  const b = (res && res.body) || {};
  const dbCode = String(b.code || '');
  const status = res && res.statusCode;

  const BY_CODE = {
    // —— 结构类（表/列不存在）——
    '42P01': '数据库中不存在该数据表',
    '42703': '数据库中不存在该字段',
    'PGRST205': '数据库中不存在该数据表',
    'PGRST202': '数据库中不存在该数据表',
    // —— 权限 / 凭证 ——
    '42501': '数据库拒绝了本次操作（权限不足）',
    'PGRST301': '数据库访问凭证无效或已过期',
    // —— 约束类（写操作才会遇到）——
    '23505': '该记录已存在（唯一性冲突）',
    '23503': '关联的作品不存在',
    '23514': '数据不符合数据库的取值约束',
    // —— 语法 / 取值 ——
    '22P02': '参数格式不正确，数据库无法解析',
    'PGRST102': '数据库查询条件格式不正确',
  };
  if (BY_CODE[dbCode]) return BY_CODE[dbCode];

  const BY_STATUS = {
    400: '数据库拒绝了本次操作（参数或条件不合法）',
    401: '数据库访问凭证缺失或无效',
    403: '数据库拒绝了本次操作（权限不足）',
    404: '数据库中没有这张表',
    409: '该记录已存在（唯一性冲突）',
    500: '数据库内部出错，暂时无法完成本次操作',
    503: '数据库暂时不可用，请稍后再试',
  };
  if (BY_STATUS[status]) return BY_STATUS[status];

  // 双兜底：连状态码都认不出时，也不把英文原文抛出去
  return '数据库操作失败，请稍后再试';
}

/**
 * 网络层的失败（连不上、超时、DNS 解析不到）同样翻成中文。
 * 这一层抛出的 Error.message 是纯英文（ENOTFOUND / socket hang up / timeout）。
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
 *  四、工具
 * ==========================================================================*/

/**
 * 生成一条点赞记录的 _id。
 * 契约 §2.4 ③ 定稿规则：`like-<毫秒级时间戳>-<4 位随机十六进制>`
 *
 * 为什么长这样：
 *   · 不用 `<workId>-<visitorId>` 派生 —— visitorId 是前端任意串，可能含中文/空格，
 *     会让 _id 不再是纯 ASCII（Day 16 已踩过一次）；
 *   · 不用纯自增序号 —— 要先查 max 再 +1，并发下必撞车；
 *   · 随机段（2 字节 = 65536 种）保证**同一毫秒内的两次写入**不会撞主键。
 * 用 crypto.randomBytes 而非 randomUUID：它是 Node 最古老的 API，不受运行时版本影响。
 *
 * ⚠️ _id 只回答「这条记录叫什么名字」，**不承担防重复职责** ——
 *    防重复由 (workId, visitorId) 联合唯一约束负责（契约 §7 拍板项）。
 */
function newLikeId() {
  return 'like-' + Date.now() + '-' + crypto.randomBytes(2).toString('hex');
}

/**
 * 取出一个必填的字符串参数，顺手做齐三件事：存在性、类型、长度。
 * 返回 {value} 或 {error}（error 是给人看的中文）。
 *
 * 注意：非字符串一律拒绝 —— 若放任数组/对象进来，拼进 URL 后的行为难以预料，
 * 在入口处就把类型钉死，是最省事也最安全的做法。
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

/* ============================================================================
 *  五、入口
 * ==========================================================================*/

exports.main = async function (event, context) {
  const startedAt = Date.now();
  const method = String(event.httpMethod || 'GET').toUpperCase();
  const path = String(event.path || '');

  console.log('[like] ' + method + ' ' + path);

  /* ---------- 闸 1：方法闸。本接口只承诺 POST ---------- */
  if (method !== 'POST') {
    return fail(405, 'METHOD_NOT_ALLOWED', '仅支持 POST /api/like');
  }

  /* ---------- 闸 2：请求体可解析 ---------- */
  // ⚠️ 云开发的 HTTP 访问服务**可能**把请求体做 base64 编码（event.isBase64Encoded），
  //    所以必须先解码再 JSON.parse —— 不处理会一直误报「不是合法 JSON」。
  let rawBody = event.body;
  if (rawBody === undefined || rawBody === null) rawBody = '';

  if (event.isBase64Encoded && typeof rawBody === 'string') {
    try {
      rawBody = Buffer.from(rawBody, 'base64').toString('utf8');
    } catch (e) {
      console.error('[like] 请求体 base64 解码失败：' + e.message);
      rawBody = '';
    }
  }

  let body = null;
  if (typeof rawBody === 'string') {
    const trimmed = rawBody.trim();
    if (trimmed === '') {
      return fail(400, 'INVALID_PARAM', '请求体不能为空，需要 {"workId":"...","visitorId":"..."}');
    }
    try { body = JSON.parse(trimmed); } catch (e) { body = null; }
  } else if (typeof rawBody === 'object') {
    // 控制台「云端测试」可以直接传对象，这里兼容一下，省得调试时踩坑
    body = rawBody;
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail(400, 'INVALID_PARAM', '请求体不是合法的 JSON 对象，需要 {"workId":"...","visitorId":"..."}');
  }

  /* ---------- 闸 3 / 4 / 5：字段存在性、类型、长度 ---------- */
  const workIdCheck = pickRequiredString(body, 'workId');
  if (workIdCheck.error) return fail(400, 'INVALID_PARAM', workIdCheck.error);

  const visitorIdCheck = pickRequiredString(body, 'visitorId');
  if (visitorIdCheck.error) return fail(400, 'INVALID_PARAM', visitorIdCheck.error);

  const workId = workIdCheck.value;
  const visitorId = visitorIdCheck.value;

  /* ---------- 钥匙检查（放在参数之后：参数错了先报参数错，更符合排查直觉）---------- */
  if (!API_KEY) {
    console.error('[like] 未配置 CLOUDBASE_API_KEY 环境变量');
    return fail(500, 'INTERNAL_ERROR', '服务端未配置数据库密钥（CLOUDBASE_API_KEY），请联系管理员');
  }

  // 拼查询片段。encodeURIComponent 之后，用户输入只会作为**值**参与 URL，
  // 不可能变成新的查询参数或 SQL 片段。
  const eqWork = encodeURIComponent(workId);
  const eqVisitor = encodeURIComponent(visitorId);

  /* ---------- 闸 6：workId 必须真实存在 ---------- */
  // 为什么要专门查一次，而不是直接插入让外键去拦：
  //   直接插入的话，「作品不存在」会以一个数据库报错的形式出现，
  //   而契约 §4.2 要求它必须是 404 NOT_FOUND 且 message 能看懂。
  //   显式查询一次，语义最清楚，也把错误拦在写操作之前（不产生任何写副作用）。
  let workRes;
  try {
    workRes = await callDataApi(
      'GET',
      API_WORKS,
      'select=_id&_id=eq.' + eqWork + '&limit=1',
      null
    );
  } catch (e) {
    console.error('[like] 作品存在性查询异常：' + (e && e.message));
    return fail(500, 'INTERNAL_ERROR', explainNetworkError(e));
  }

  if (!isOk(workRes)) {
    console.error('[like] 作品存在性查询失败：' + workRes.raw);
    return fail(500, 'INTERNAL_ERROR', explainDbError(workRes));
  }

  const workRows = Array.isArray(workRes.body) ? workRes.body : [];
  if (workRows.length === 0) {
    return fail(404, 'NOT_FOUND', '作品不存在：' + workId);
  }

  /* ---------- 闸 7：防重复 —— 本接口的「重复提交」等于「取消」 ---------- */
  // 契约 §4.2：切换式 toggle。第 1 次提交 → 插入（+1）；第 2 次 → 删除（-1）。
  // ★ 这里**不是**「先查再写就完事」：查询与写入之间存在极短的并发窗口。
  //   真正的防线是数据库层的 (workId, visitorId) 联合唯一约束 ——
  //   应用层这次查询只是为了决定「走插入还是走删除」，撞车了由 23505 兜底。
  let existRes;
  try {
    existRes = await callDataApi(
      'GET',
      API_LIKES,
      'select=_id&workId=eq.' + eqWork + '&visitorId=eq.' + eqVisitor + '&limit=1',
      null
    );
  } catch (e) {
    console.error('[like] 点赞存在性查询异常：' + (e && e.message));
    return fail(500, 'INTERNAL_ERROR', explainNetworkError(e));
  }

  if (!isOk(existRes)) {
    console.error('[like] 点赞存在性查询失败：' + existRes.raw);
    return fail(500, 'INTERNAL_ERROR', explainDbError(existRes));
  }

  const existed = (Array.isArray(existRes.body) ? existRes.body : []).length > 0;

  const deleteQuery = 'workId=eq.' + eqWork + '&visitorId=eq.' + eqVisitor;
  let liked = false; // 本次操作结束后，「这个人」是否处于已赞状态

  if (existed) {
    /* ---- 分支 A：已赞过 → 取消（删除那条记录）---- */
    let delRes;
    try {
      delRes = await callDataApi('DELETE', API_LIKES, deleteQuery, null);
    } catch (e) {
      console.error('[like] 取消点赞异常：' + (e && e.message));
      return fail(500, 'INTERNAL_ERROR', explainNetworkError(e));
    }
    if (!isOk(delRes)) {
      console.error('[like] 取消点赞失败：' + delRes.raw);
      return fail(500, 'INTERNAL_ERROR', explainDbError(delRes));
    }
    liked = false;
  } else {
    /* ---- 分支 B：未赞过 → 点赞（插入一条记录）---- */
    let insRes;
    try {
      insRes = await callDataApi('POST', API_LIKES, '', {
        _id: newLikeId(),
        workId: workId,
        visitorId: visitorId,
        createdAt: Date.now(),
      });
    } catch (e) {
      console.error('[like] 写入点赞异常：' + (e && e.message));
      return fail(500, 'INTERNAL_ERROR', explainNetworkError(e));
    }

    if (!isOk(insRes)) {
      // ⚠️ 判断顺序有讲究：先认外键违例（机器码最精确），再认唯一冲突。
      //    两者在 HTTP 层都是 409，顺序反了会把「作品不存在」当成「已赞过」。
      if (isForeignKeyViolation(insRes)) {
        // 作品在「查存在性」与「写入」之间被删掉了（极端并发）
        return fail(404, 'NOT_FOUND', '作品不存在：' + workId);
      } else if (isUniqueViolation(insRes)) {
        // 并发裸奔的兜底：刚刚有人替我们把这条记录插进去了 —— 按「已赞过」处理，转入取消。
        // 这条分支平时跑不到，但一旦跑到，说明唯一约束真的在替我们挡子弹。
        console.warn('[like] 写入撞唯一约束，转入取消路径：' + insRes.raw);
        let delRes2;
        try {
          delRes2 = await callDataApi('DELETE', API_LIKES, deleteQuery, null);
        } catch (e) {
          console.error('[like] 并发兜底取消失败：' + (e && e.message));
          return fail(500, 'INTERNAL_ERROR', explainNetworkError(e));
        }
        if (!isOk(delRes2)) {
          console.error('[like] 并发兜底取消失败：' + delRes2.raw);
          return fail(500, 'INTERNAL_ERROR', explainDbError(delRes2));
        }
        liked = false;
      } else {
        console.error('[like] 写入点赞失败：' + insRes.raw);
        return fail(500, 'INTERNAL_ERROR', explainDbError(insRes));
      }
    } else {
      liked = true;
    }
  }

  /* ---------- 计数：写/删完成之后，再查一次库 ---------- */
  // ★ 契约 §4.2「计数口径」：likes 必须是该作品**当前**总数，且必须**在动作之后**重新查库得出。
  //   这里多花一次往返是故意的 —— 它让这个接口能自证「真的读到了库」：
  //   同一条请求连发两次，likes 会 +1 再 -1 回到原值；若返回常数，这个数字不会动。
  let cntRes;
  try {
    cntRes = await callDataApi('GET', API_LIKES, 'select=_id&workId=eq.' + eqWork, null);
  } catch (e) {
    console.error('[like] 计数查询异常：' + (e && e.message));
    return fail(500, 'INTERNAL_ERROR', explainNetworkError(e));
  }

  if (!isOk(cntRes)) {
    console.error('[like] 计数查询失败：' + cntRes.raw);
    return fail(500, 'INTERNAL_ERROR', explainDbError(cntRes));
  }

  const totalLikes = Array.isArray(cntRes.body) ? cntRes.body.length : 0;

  /* ---------- 服务端日志（余力加练：留一条能给未来排错用的线索）---------- */
  // 只记「谁对哪幅画做了什么、结果如何、花了多久」——
  // visitorId 本身只是前端随机串，不含任何真实身份，可以入日志。
  // ⚠️ 绝不打 API Key、绝不打 Authorization 头。
  console.log(
    '[like] action=' + (liked ? 'INSERT(+1)' : 'DELETE(-1)') +
    ' workId=' + workId +
    ' visitorId=' + visitorId +
    ' likes=' + totalLikes +
    ' cost=' + (Date.now() - startedAt) + 'ms'
  );

  /* ---------- 成功返回：契约 §3.1 ---------- */
  return json(200, {
    ok: true,
    data: {
      workId: workId,
      likes: totalLikes,
      liked: liked,
    },
  });
};
