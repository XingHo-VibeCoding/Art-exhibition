/**
 * 数据访问层 · notes 表（note 函数）
 * 所属云函数：note（GET / POST / PATCH / DELETE /api/note）
 * 契约：api-contract.md §4.4（POST 写感想）/ §4.5（GET 读列表）/ §4.6（PATCH 改）/ §4.7（DELETE 删）
 *
 * ── 这个文件是 Day 22 的「四类操作」聚集地 ──────────────────────
 *   查  listByWork / countByWork / findById
 *   增  insertNote
 *   改  updateText
 *   删  deleteById
 * 一个资源上的完整闭环，全在这一个文件里 —— 想改数据库交互，只来这儿。
 * 入口层（index.js）搜 `select` / `notes` 一类的数据库关键字 → 命中 0 次。
 *
 * ── 它的职责边界 ────────────────────────────────────────────────
 *   ✅ 负责：notes 表的全部查询 —— 存在性、列表、计数、插入、改、删，以及 _id 生成
 *   ❌ 不负责：该改还是该删（业务决策）、参数校验、HTTP 状态码 —— 那是入口层的事
 *
 * ── 对外暴露 ────────────────────────────────────────────────────
 *   newNoteId()                     生成一条感想记录的 _id
 *   findById(id)                    按 _id 取一条（用于 PATCH/DELETE 的存在性前置查询）
 *   listByWork(workId, limit)       取某作品的感想列表（createdAt 降序）
 *   countByWork(workId)             某作品感想总数
 *   insertNote({workId,visitorId,text})  新增一条感想
 *   updateText(id, text)            改一条感想的正文
 *   deleteById(id)                  删一条感想
 *
 * ── 结果形状（两层之间的「合同」）────────────────────────────────
 *   成功：{ ok:true, exists?, row?, rows?, count?, changed?, deleted? }
 *   失败：{ ok:false, kind:'NO_KEY'|'NETWORK'|'DB'|'FK'|'UNIQUE', message:'中文' }
 */

const crypto = require('crypto');
const channel = require('./channel');

const API_NOTES = '/notes';

/** URL 编码：用户输入只会作为**值**参与 URL，不可能变成新的查询参数或 SQL 片段 */
function enc(s) {
  return encodeURIComponent(s);
}

/**
 * 生成一条感想记录的 _id。
 *
 * ⚠️ **注意：契约 §2.4 目前只定义了 works / likes 两套 _id 规则，notes 尚缺一条。**
 * 本函数**沿用 likes 的规则**（`note-<毫秒级时间戳>-<4 位随机十六进制>`），
 * 理由与 §2.4③ 完全相同：不用派生（visitorId 可能含中文/空格）、不用自增（并发撞车）、
 * 用最古老的 crypto.randomBytes（不受运行时版本影响）。
 * → **待回写契约**：收尾时应把这条补进 §2.4，登记为第 ④ 条（Day 22）。
 * 与种子数据的关系：`db/seed.sql` 里的 6 条是人工顺序编号（`note-0001`…），
 * 前缀相同、结构不同（无时间戳段），故与运行时生成值不会碰撞。
 */
function newNoteId() {
  return 'note-' + Date.now() + '-' + crypto.randomBytes(2).toString('hex');
}

/* ============================================================================
 *  一、查
 * ==========================================================================*/

/**
 * 按 _id 取一条感想。
 *
 * ★ 它是 PATCH / DELETE 的**前置查询**，也是这两个接口「防呆」的地基：
 *   先知道「这条到底在不在」，才能决定是「干正事」还是「回 404」。
 *   多花一次往返是故意的 —— 语义最清楚，且查得到时顺手就把旧值（previous / snapshot）拿到手了。
 *
 * @returns {Promise<{ok:true, exists:boolean, row:object|null} | {ok:false,...}>}
 */
async function findById(id) {
  const q = 'select=*&_id=eq.' + enc(id) + '&limit=1';
  const r = await channel.call('GET', API_NOTES, q, null, '按 id 查感想');
  if (!r.ok) return r;
  const rows = Array.isArray(r.data) ? r.data : [];
  return { ok: true, exists: rows.length > 0, row: rows.length > 0 ? rows[0] : null };
}

/**
 * 取某作品的感想列表（契约 §4.5：`createdAt` 降序，新的在前）。
 *
 * @param {string} workId
 * @param {number|null} limit  已由入口层校验过（1–50）
 */
async function listByWork(workId, limit) {
  const params = ['select=*', 'workId=eq.' + enc(workId), 'order=createdAt.desc'];
  if (limit !== null && limit !== undefined) params.push('limit=' + limit);

  const r = await channel.call('GET', API_NOTES, params.join('&'), null, '感想列表查询');
  if (!r.ok) return r;

  // ⚠️ **Day 22 线上实测抓到的 bug 就出在这一行**：
  //    通道层对外承诺的形状是 { ok:true, data:<Data API 原样 JSON> }，
  //    而入口层按本文件头部「结果形状」读的是 r.rows —— **两边对不上**。
  //    后果极具欺骗性：接口回 200、total 正确（total 走的是 countByWork，另一条查询），
  //    只有 notes 恒为空数组 —— 表现为「数量对、列表空」这种一眼看不出是 bug 的样子。
  //    → 修法：在数据访问层就地**归一化**成 rows（与 findById 的 row、countByWork 的 count 同族），
  //      入口层不必知道通道的原始形状。这叫「在边界上翻译一次，内部只说一种话」。
  const rows = Array.isArray(r.data) ? r.data : [];
  return { ok: true, rows: rows };
}

/**
 * 某作品的感想总数（契约 §4.5 的 `data.total`）。
 * 与 works 的 series[].count 同理：它是**基数**，不随 `limit` 缩小。
 */
async function countByWork(workId) {
  const q = 'select=_id&workId=eq.' + enc(workId);
  const r = await channel.call('GET', API_NOTES, q, null, '感想计数查询');
  if (!r.ok) return r;
  return { ok: true, count: (Array.isArray(r.data) ? r.data : []).length };
}

/* ============================================================================
 *  二、增 / 改 / 删
 * ==========================================================================*/

/**
 * 新增一条感想（契约 §4.4）。
 *
 * ⚠️ 重复提交由数据库层的 `(workId, visitorId)` 联合唯一约束拦截 ——
 *    撞车时 Data API 回 23505，channel 归成 kind:'UNIQUE'，入口层据此回 409 CONFLICT。
 *    应用层的「先查再插」在并发下有竞态窗口，**不作为防线**。
 */
async function insertNote(options) {
  const row = {
    _id: newNoteId(),
    workId: options.workId,
    visitorId: options.visitorId,
    text: options.text,
    createdAt: Date.now(),
  };
  const r = await channel.call('POST', API_NOTES, '', row, '新增感想');
  if (!r.ok) return r;
  const rows = Array.isArray(r.data) ? r.data : [];
  return { ok: true, row: rows.length > 0 ? rows[0] : row, inserted: rows.length };
}

/**
 * 改一条感想的正文（契约 §4.6 —— 只改 `text`，白名单在入口层把关）。
 * PATCH 只发送 text 一个字段，别的列连碰都不碰。
 */
async function updateText(id, text) {
  const q = '_id=eq.' + enc(id);
  const r = await channel.call('PATCH', API_NOTES, q, { text: text }, '修改感想');
  if (!r.ok) return r;
  const rows = Array.isArray(r.data) ? r.data : [];
  return { ok: true, rows: rows, row: rows.length > 0 ? rows[0] : null, changed: rows.length };
}

/**
 * 删一条感想（契约 §4.7）。
 *
 * ★ `deleted` 是本次删除**真正命中的行数**（靠 Prefer: return=representation 回吐）。
 *   它比 HTTP 状态码可靠：PostgREST 删一行不存在的记录时**仍返回 2xx**，
 *   只有这个数字会变成 0。入口层用它做最后一道交叉验证。
 */
async function deleteById(id) {
  const q = '_id=eq.' + enc(id);
  const r = await channel.call('DELETE', API_NOTES, q, null, '删除感想');
  if (!r.ok) return r;
  const rows = Array.isArray(r.data) ? r.data : [];
  return { ok: true, rows: rows, deleted: rows.length };
}

module.exports = {
  newNoteId: newNoteId,
  findById: findById,
  listByWork: listByWork,
  countByWork: countByWork,
  insertNote: insertNote,
  updateText: updateText,
  deleteById: deleteById,
};
