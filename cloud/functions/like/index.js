/**
 * 云函数：like（入口层）
 * 公网路径：POST /api/like
 * 契约：api-contract.md §4.2（匿名点赞 · 切换式 toggle）
 *
 * ── Day 19 分层重构后，这个文件只做三件事 ────────────────────────
 *   ① 接请求 + 校验：方法闸、body 解析、必填字段存在性/类型/长度（八道闸）
 *   ② 业务决策 + 组装响应：读「作品/点赞是否存在」的结果，决定走插入还是删除，定 HTTP 状态码
 *   ③ 调数据访问层：所有「查数据库」都交给 ./repository/ 下的两个文件
 *
 *   它**不再**出现任何 SQL、Data API 地址、https 调用、数据库错误码。
 *   验收手法（今日检测题）：在本文件检索 SQL 关键字 → 命中 0；
 *   在 repository/ 里检索同样的关键字 → 全部命中。
 *
 * ── 这一层的职责边界 ──────────────────────────────────────────
 *   ✅ 负责：HTTP 方法闸、参数校验、业务判断（插入 or 删除）、响应形状、HTTP 状态码
 *   ❌ 不负责：怎么拼数据库地址、怎么发请求、怎么把英文错误翻成中文、怎么认约束违例
 *             —— 那些全在 repository 里。入口层只读两个字段：
 *                 r.ok      true 用 r.exists / r.count / r.data；false 用 r.kind / r.message
 *                 r.kind    'FK' → 回 404；'UNIQUE' → 转入取消；其余 → 500
 *
 * ── 与 works 函数最大的区别：读是看，写是用 ─────────────────────
 *   读接口只需要「拿回来、整理好、递出去」；
 *   写接口多出三件必须自己扛的事 ——
 *     ① 校验：缺字段、超长、不存在，一律在**碰到数据库之前**拦住；
 *     ② 防重复：同一个人对同一幅画提交两次，到底算什么？（本文件答案：算「取消」）
 *     ③ 错误处理：失败时必须告诉人「错在哪、怎么改」，且只讲中文。
 *   这三件事是**入口层的活**，重构后依然留在这里；被搬走的只是「怎么查库」。
 *
 * ── 钥匙（API Key）从哪来 ─────────────────────────────────────
 *   已随查询一起搬进 repository/channel.js，本文件不再接触它。
 *   ⚠️ 云函数之间不共享环境变量：位置 = 控制台 → 云函数 → like → 函数配置 → 环境变量 → CLOUDBASE_API_KEY
 */

const likesRepository = require('./repository/likesRepository');
const worksRepository = require('./repository/worksRepository');

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

/**
 * ★ Day 23：把数据访问层的失败翻译成 HTTP 响应 —— 三类分流的总闸。
 * 与 works / note 同构（逻辑一致，差别只在注释里举的例子）。
 *
 * 契约 §3.3「错误三分类」在这里落地：
 *   第一类 用户输入错 → 400，由 pickRequiredString 等校验直接 fail()，不经过这里
 *   第二类 网络 / 接口错 → 503（路不通，重试可能好转）
 *   第三类 服务端错     → 500（我们错了，详细原因进日志）
 *
 * ⚠️ 本接口的 FK / UNIQUE 两个 kind **不经过这里**：
 *     它们在业务分支里另有归宿（FK → 404 作品不存在；UNIQUE → 转入取消路径），
 *     是「业务语义」而不是「故障」，由调用处显式处理。
 *     这里只负责「出了故障」的那部分 —— 故障与业务的界线清楚了，两边才都清楚。
 *
 * ★ 判定依据**只有** r.kind，不许靠 HTTP 状态码或英文消息反推（契约 §3.3 判定纪律 2）。
 *
 * @param {{ok:false, kind:string, message:string}} r 数据访问层返回的失败结果
 * @returns 可直接 return 的响应对象
 */
function answerFailure(r) {
  // ── 第二类：网络 / 接口错 ── 与服务端错分开，验收时才自证得了
  if (r.kind === 'NETWORK') {
    return fail(503, 'SERVICE_UNAVAILABLE', '数据暂时拿不到，请稍后再试');
  }

  // ── 第三类：服务端错 ── r.message 是数据层翻译过的中文（已剔除英文原文、表名、SQL），
  //    可以直接给用户看；详细技术原因已由数据层 console.error 进日志。
  return fail(500, 'INTERNAL_ERROR', r.message || '服务端处理请求时出错，请稍后再试');
}

// 契约 §4.2：workId / visitorId 均为必填，且各 ≤ 64 字符
const MAX_ID_LEN = 64;

/* ============================================================================
 *  二、校验工具（入口层）
 * ==========================================================================*/

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
 *  三、入口
 * ==========================================================================*/

/**
 * ★ Day 23 兜底闸：整个请求的最后一道防线（与 works / note 同构）。
 *
 * ── 它和 answerFailure() 的区别 ──────────────────────────────────
 *   answerFailure 是**海关**：只检査数据层明明白白报告回来的失败（带 kind 标签）。
 *   本函数是**围墙**：拦的是压根不走海关的那些 —— event 是 undefined、
 *   JSON.parse 炸了、类型意外、内存溢出……它们不返回 {ok:false}，而是**直接抛**。
 *   抛出去就是 500 + 一整屏英文堆栈，而契约 §3.3 明写「500 不向外暴露堆栈」。
 *
 * ── 为什么整段包住 ──────────────────────────────────────────────
 *   连最开头的 `event.httpMethod` 都可能炸（event 若为 undefined）。
 *   只包业务，等于在大门旁边留了扇没锁的窗。
 */
exports.main = async function (event, context) {
  try {
    return await handleRequest(event, context);
  } catch (e) {
    // 技术细节只进服务端日志；响应体里只给一句中文 —— 契约 §3.3 第三类
    console.error('[like] 未捕获异常：' + (e && e.stack ? e.stack : e));
    return fail(500, 'INTERNAL_ERROR', '服务端处理请求时出错，请稍后再试');
  }
};

async function handleRequest(event, context) {
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

  /* ---------- 闸 6：workId 必须真实存在（★ 一行调用）---------- */
  // 为什么专门查一次，而不是直接插入让外键去拦：
  //   直接插入的话，「作品不存在」会以一个数据库报错的形式出现，
  //   而契约 §4.2 要求它必须是 404 NOT_FOUND 且 message 能看懂。
  //   显式查询一次，语义最清楚，也把错误拦在写操作之前（不产生任何写副作用）。
  const w = await worksRepository.workExists(workId);
  if (!w.ok) return answerFailure(w);
  if (!w.exists) return fail(404, 'NOT_FOUND', '作品不存在：' + workId);

  /* ---------- 闸 7：防重复 —— 本接口的「重复提交」等于「取消」---------- */
  // 契约 §4.2：切换式 toggle。第 1 次提交 → 插入（+1）；第 2 次 → 删除（-1）。
  // ★ 这里**不是**「先查再写就完事」：查询与写入之间存在极短的并发窗口。
  //   真正的防线是数据库层的 (workId, visitorId) 联合唯一约束 ——
  //   应用层这次查询只是为了决定「走插入还是走删除」，撞车了由 23505 兜底。
  const e = await likesRepository.likeExists(workId, visitorId);
  if (!e.ok) return answerFailure(e);

  let liked = false; // 本次操作结束后，「这个人」是否处于已赞状态

  if (e.exists) {
    /* ---- 分支 A：已赞过 → 取消（删除那条记录）---- */
    const d = await likesRepository.deleteLike(workId, visitorId);
    if (!d.ok) return answerFailure(d);
    liked = false;
  } else {
    /* ---- 分支 B：未赞过 → 点赞（插入一条记录）---- */
    const ins = await likesRepository.insertLike({ workId: workId, visitorId: visitorId });

    if (!ins.ok) {
      // ⚠️ 判断顺序有讲究：先认外键违例（kind:'FK'），再认唯一冲突（kind:'UNIQUE'）。
      //    两者在 HTTP 层都是 409，顺序反了会把「作品不存在」当成「已赞过」。
      if (ins.kind === 'FK') {
        // 作品在「查存在性」与「写入」之间被删掉了（极端并发）
        return fail(404, 'NOT_FOUND', '作品不存在：' + workId);
      } else if (ins.kind === 'UNIQUE') {
        // 并发裸奔的兜底：刚刚有人替我们把这条记录插进去了 —— 按「已赞过」处理，转入取消。
        // 这条分支平时跑不到，但一旦跑到，说明唯一约束真的在替我们挡子弹。
        const d2 = await likesRepository.deleteLike(workId, visitorId);
        if (!d2.ok) return answerFailure(d2);
        liked = false;
      } else {
        return answerFailure(ins);
      }
    } else {
      liked = true;
    }
  }

  /* ---------- 计数：写/删完成之后，再查一次库（★ 一行调用）---------- */
  // ★ 契约 §4.2「计数口径」：likes 必须是该作品**当前**总数，且必须**在动作之后**重新查库得出。
  //   这里多花一次往返是故意的 —— 它让这个接口能自证「真的读到了库」：
  //   同一条请求连发两次，likes 会 +1 再 -1 回到原值；若返回常数，这个数字不会动。
  const c = await likesRepository.countLikes(workId);
  if (!c.ok) return answerFailure(c);

  const totalLikes = c.count;

  /* ---------- 服务端日志（余力加练：留一条能给未来排错用的线索）---------- */
  // 只记「谁对哪幅画做了什么、结果如何、花了多久」——
  // visitorId 本身只是前端随机串，不含任何真实身份，可以入日志。
  // ⚠️ 绝不打 API Key、绝不打 Authorization 头。
  // 注：action 刻意用 LIKED / UNLIKED 这类**动作词**，而不写数据库的增删关键字 ——
  //     那些词是数据访问层的事；写在入口层会让「接口文件搜 SQL 关键字应命中 0」的验收失真。
  console.log(
    '[like] action=' + (liked ? 'LIKED(+1)' : 'UNLIKED(-1)') +
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
}
