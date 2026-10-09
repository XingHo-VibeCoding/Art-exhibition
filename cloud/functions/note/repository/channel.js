/**
 * 数据访问层 · 共用通道（note 函数）
 * 所属云函数：note（GET / POST / PATCH / DELETE /api/note，契约 §4.4–§4.7）
 *
 * ── 这个文件为什么存在 ──────────────────────────────────────────
 * notes 表要读（列表 / 按 id 查）、要写（新增）、要改（PATCH）、要删（DELETE），
 * works 表要查存在性 —— 五件事都需要「跟数据库说话」，
 * 而这段话**只有一套**：拼 Data API 地址 → 发 https 请求 → 把英文错误翻成中文
 *   → 识别约束违例（唯一 / 外键）。
 * 若让两个 repository 各抄一份，就正好犯了分层要治的病 —— 重复。
 * 所以把这段公共能力单独放这里，notesRepository / worksRepository 各 require 一次。
 *
 * ── 与 like 函数的 channel 有何不同 ─────────────────────────────
 * 只有一个字：动词。like 只需要 GET / POST / DELETE；
 * note 多了一个 **PATCH**（修改）。request() 本就接受任意方法字符串，
 * 所以这次**没有改逻辑**，只是把它登记进注释、并加一句「PATCH 也会走这条路」。
 * —— 这就是分层的红利：新增一个动作，通道层一行都不用改。
 *
 * ── 它的职责边界 ────────────────────────────────────────────────
 *   ✅ 负责：地址拼接、https 请求（GET/POST/PATCH/DELETE）、超时、错误翻译、约束识别
 *   ❌ 不负责：HTTP 方法闸、参数校验、业务判断（该改还是该删）—— 那是入口层的事
 *
 * ── 结果形状（数据访问层内部统一的「合同」）────────────────────
 *   成功：{ ok:true,  data: <Data API 原样返回的 JSON> }
 *   失败：{ ok:false, kind:'NO_KEY'|'NETWORK'|'DB'|'FK'|'UNIQUE',
 *                    message:'中文，可直接放进响应体' }
 *   kind 为什么分这么细：入口层需要靠它区分
 *     · 'FK'     → 作品不存在，回 404
 *     · 'UNIQUE' → 撞唯一约束（同一访客对同一作品重复提交），回 409
 *     · 其余     → 一律 500 + 中文 message
 *   技术细节（英文原文、SQLSTATE）由本文件自己记进日志，**绝不往外递**。
 *
 * ── 钥匙（API Key）从哪来 ───────────────────────────────────────
 *   从云函数环境变量读，**绝不写进代码**。
 *   配置位置：控制台 → 云函数 → note → 函数配置 → 环境变量 → CLOUDBASE_API_KEY
 *   ⚠️ **云函数之间不共享环境变量** —— like 函数配过的那份对 note 无效，必须单独配。
 *   ⚠️ 该 Key 对应角色 service_role（BYPASSRLS），只能在服务端使用，永不进仓库 / 前端。
 */

const https = require('https');

// 环境 ID 不是密钥，可写默认值；用环境变量覆盖是为留一条「换环境不改代码」的后路
const ENV_ID = process.env.TCB_ENV_ID || 'art-exhibition-d7ggtul83d566a6c9';
const API_KEY = process.env.CLOUDBASE_API_KEY || '';
const DATA_API_BASE = 'https://' + ENV_ID + '.api.tcloudbasegateway.com/v1/rdb/rest';

// 日志前缀。所有 console 都带它，出问题时一眼能看出是哪条链路在说话
const LOG = '[note] ';

// 缺钥匙时的中文提示。放常量里，让上层不必知道这个句子长什么样
const NO_KEY_MESSAGE = '服务端未配置数据库密钥（CLOUDBASE_API_KEY），请联系管理员';

/* ============================================================================
 *  一、通道 —— 与数据库 Data API 通话（读 / 写 / 改 / 删四用）
 * ==========================================================================*/

/**
 * 向 Data API 发一次请求。
 *
 * @param {string} method   'GET' | 'POST' | 'PATCH' | 'DELETE'
 * @param {string} path     形如 '/notes'、'/works'
 * @param {string} query    形如 '_id=eq.xxx&limit=1'（不含 ?），可为空串
 * @param {object|null} body  仅 POST / PATCH 用；为 null 表示不带请求体
 * @returns {Promise<{statusCode:number, body:any, raw:string}>}
 *
 * ★ 为什么全程没有拼接 SQL：
 *   所有用户输入都先过「类型 + 长度」校验，再用 encodeURIComponent 编进 URL，
 *   最终由 Data API（PostgREST）交给 PostgreSQL 预编译执行。哪怕 id 传成
 *   "' OR 1=1 --"，也只会被当作一个**普通查询值**，而不是 SQL 代码。
 */
function request(method, path, query, body) {
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
    }

    // ★ 让 Data API 把「被这次动作碰到的那一行」回吐出来。
    //   · PATCH 靠它拿到「改后的整条」
    //   · DELETE 靠它拿到「**确实删掉了什么**」—— 这是删除操作唯一能自证的证据：
    //     返回空数组就等于明说「一行都没动」，比只看 HTTP 状态码可靠得多
    //     （PostgREST 删一行不存在的记录时**仍返回 2xx**，只看状态码会误判为成功）。
    //   · POST 靠它拿到新插入的那条。
    if (method === 'POST' || method === 'PATCH' || method === 'DELETE') {
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
 *  二、翻译 —— 把数据库的英文错误翻成中文 / 认出约束违例
 *  规矩（Day 17 定）：**英文原文一律只进日志，响应体里只放中文**。
 *  依据：契约 §3.2（message 中文）+ §3.3（500 不向外暴露堆栈/表结构）。
 * ==========================================================================*/

/** 取响应体里的数据库机器码（PostgREST 会把 PostgreSQL 的 SQLSTATE 原样放在 code 字段） */
function dbCodeOf(res) {
  return String((res && res.body && res.body.code) || '');
}

/** 取响应体里的英文原文（仅用于**本文件内部**判断，绝不往外递） */
function bodyMessageOf(res) {
  return String((res && res.body && res.body.message) || '');
}

/**
 * 该响应是否是「唯一约束冲突」。
 * 对 notes 表来说，唯一约束只有一个：(workId, visitorId) ——
 * 即「同一访客对同一作品重复留感想」（契约 §4.4 → 409 CONFLICT）。
 *
 * ⚠️ 必须**认机器码**，不能只看 HTTP 状态码：
 *    PostgREST 把「唯一冲突 23505」和「外键违例 23503」**都翻译成 HTTP 409**。
 *    只看 409 会把「作品不存在」误判成「重复提交」，回错错误码。
 *
 * ★★ Day 22 线上实测修正（此处原有一个**假阴性**）：
 *    原实现写的是 `if (code) return code === '23505';` —— 一旦平台网关
 *    改写了 code（实测确实不是标准的 '23505'），就**直接判为「不是唯一冲突」**，
 *    于是重复提交漏成 500 INTERNAL_ERROR，而契约 §4.4 明写应为 409 CONFLICT。
 *    → 改为三段式：① 标准码 → ② 原文关键字 → ③ **409 兜底**。
 *    第 ③ 段为什么成立：调用方 call() **先**判外键违例、再判本函数，
 *    PostgREST 的 409 只有「唯一冲突 / 外键违例」两类，外键已被摘走，剩下的就是唯一冲突。
 */
function isUniqueViolation(res) {
  const code = dbCodeOf(res);
  if (code === '23505') return true; // PostgreSQL: unique_violation（标准码，最精确）

  // 网关改写 code 时，退到原文找关键字（双引号内的约束名也含 unique 字样）
  const text = bodyMessageOf(res) + ' ' + String((res && res.raw) || '');
  if (/duplicate key|unique constraint|already exists|23505/i.test(text)) return true;

  // 兜底：走到这里说明「不是外键违例」的 409 —— 对本函数而言只剩唯一冲突。
  return res && res.statusCode === 409;
}

/**
 * 该响应是否是「外键违例」——说明 workId 指向的作品不存在。
 * 同样做两段式：标准码 → 原文关键字（不依赖网关是否保留 SQLSTATE）。
 */
function isForeignKeyViolation(res) {
  if (dbCodeOf(res) === '23503') return true; // PostgreSQL: foreign_key_violation
  const text = bodyMessageOf(res) + ' ' + String((res && res.raw) || '');
  return /foreign key|23503/i.test(text);
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
    // —— 约束类（写 / 改操作才会遇到）——
    '23505': '该访客对这幅作品已经留过感想了（唯一性冲突）',
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
 *  三、统一的一次调用 —— 所有查询都从这里出去
 * ==========================================================================*/

/**
 * 向 Data API 发一次请求，并把结果规范化成统一的 {ok,data} / {ok:false,kind,message}。
 * 抽成一个函数的好处：钥匙闸、超时、错误翻译、约束识别这四件事**只写一遍**，
 * 两个 repository 的所有查询都复用。
 *
 * @param {string} method 'GET' | 'POST' | 'PATCH' | 'DELETE'
 * @param {string} path   '/notes' | '/works'
 * @param {string} query  查询串（不含 ?），可为空串
 * @param {object|null} body  POST / PATCH 的请求体
 * @param {string} label  仅用于日志，标明这是哪一次查询
 */
async function call(method, path, query, body, label) {
  // 钥匙闸放在最前面：没钥匙就不必发请求，省一次往返，也避免把错误归因到网络上
  if (!API_KEY) {
    console.error(LOG + '未配置 CLOUDBASE_API_KEY 环境变量');
    return { ok: false, kind: 'NO_KEY', message: NO_KEY_MESSAGE };
  }

  let res;
  try {
    res = await request(method, path, query, body);
  } catch (e) {
    // 网络层抛出的原文是英文（ENOTFOUND / timeout / socket hang up），只进日志；
    // 响应体里换成人能看懂的中文 —— 契约 §3.2
    console.error(LOG + label + '异常：' + (e && e.message));
    return { ok: false, kind: 'NETWORK', message: explainNetworkError(e) };
  }

  if (!isOk(res)) {
    // ⚠️ 判断顺序有讲究：先认外键违例（机器码最精确），再认唯一冲突。
    //    两者在 HTTP 层都是 409，顺序反了会把「作品不存在」当成「重复提交」。
    if (isForeignKeyViolation(res)) {
      console.error(LOG + label + '失败（外键违例）：' + res.raw);
      return { ok: false, kind: 'FK', message: explainDbError(res) };
    }
    if (isUniqueViolation(res)) {
      console.warn(LOG + label + '失败（唯一冲突）：' + res.raw);
      return { ok: false, kind: 'UNIQUE', message: explainDbError(res) };
    }
    console.error(LOG + label + '失败（HTTP ' + res.statusCode
      + ' / code=' + (dbCodeOf(res) || '无') + '）：' + res.raw);
    return { ok: false, kind: 'DB', message: explainDbError(res) };
  }

  return { ok: true, data: res.body };
}

module.exports = {
  call: call,
};
