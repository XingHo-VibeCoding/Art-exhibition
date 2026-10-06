/**
 * 数据访问层 · likes 表（like 函数）
 * 所属云函数：like（POST /api/like）
 * 契约：api-contract.md §4.2（匿名点赞 · 切换式 toggle）/ §2.4
 *
 * ── 这个文件为什么存在 ──────────────────────────────────────────
 * Day 18 为了先跑通，likes 表的读/写/删/计数直接写在 index.js 里。
 * Day 19 把它们整体搬到这里 —— 从此 index.js 里再也看不到 URL 拼接和 SQL 关键字。
 *
 * ── 它的职责边界 ────────────────────────────────────────────────
 *   ✅ 负责：likes 表的全部查询 —— 存在性、插入、删除、计数，以及 _id 生成
 *   ❌ 不负责：该插入还是该删除（业务决策）、参数校验、HTTP 状态码 —— 那是入口层的事
 *
 * ── 对外暴露 ────────────────────────────────────────────────────
 *   likeExists(workId, visitorId)   这个人对这幅画赞过没？（用于决定走插入还是删除）
 *   insertLike({workId, visitorId}) 插入一条点赞记录
 *   deleteLike(workId, visitorId)   删除这个人对这幅画的点赞记录
 *   countLikes(workId)              该作品当前点赞总数
 *
 * ── 结果形状（两层之间的「合同」）────────────────────────────────
 *   成功：{ ok:true, exists?, count? }
 *   失败：{ ok:false, kind:'NO_KEY'|'NETWORK'|'DB'|'FK'|'UNIQUE', message:'中文' }
 */

const crypto = require('crypto');
const channel = require('./channel');

const API_LIKES = '/likes';

/** URL 编码：用户输入只会作为**值**参与 URL，不可能变成新的查询参数或 SQL 片段 */
function enc(s) {
  return encodeURIComponent(s);
}

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
 * 这个人对这幅画赞过没？（契约 §4.2 的切换前置查询）
 * 只取 _id 一列 + limit=1，够判断存在性即可，尽量轻。
 */
async function likeExists(workId, visitorId) {
  const q = 'select=_id&workId=eq.' + enc(workId) + '&visitorId=eq.' + enc(visitorId) + '&limit=1';
  const r = await channel.call('GET', API_LIKES, q, null, '点赞存在性查询');
  if (!r.ok) return r;
  return { ok: true, exists: (Array.isArray(r.data) ? r.data : []).length > 0 };
}

/**
 * 插入一条点赞记录。
 *
 * ⚠️ 这里**不是**「先查再写就完事」：查询与写入之间存在极短的并发窗口。
 *    真正的防线是数据库层的 (workId, visitorId) 联合唯一约束 ——
 *    撞车时 Data API 会回 23505，由 channel 归成 kind:'UNIQUE'，
 *    入口层据此转入「取消」路径。若作品被并发删掉则回 23503（kind:'FK'）。
 */
async function insertLike(options) {
  const row = {
    _id: newLikeId(),
    workId: options.workId,
    visitorId: options.visitorId,
    createdAt: Date.now(),
  };
  return channel.call('POST', API_LIKES, '', row, '写入点赞');
}

/** 删除这个人对这幅画的点赞记录（契约 §4.2 的「取消」动作） */
async function deleteLike(workId, visitorId) {
  const q = 'workId=eq.' + enc(workId) + '&visitorId=eq.' + enc(visitorId);
  return channel.call('DELETE', API_LIKES, q, null, '取消点赞');
}

/**
 * 该作品当前点赞总数。
 *
 * ★ 契约 §4.2「计数口径」：likes 必须是该作品**当前**总数，且必须**在动作之后**重新查库得出。
 *   这里多花一次往返是故意的 —— 它让这个接口能自证「真的读到了库」：
 *   同一条请求连发两次，likes 会 +1 再 -1 回到原值；若返回常数，这个数字不会动。
 */
async function countLikes(workId) {
  const q = 'select=_id&workId=eq.' + enc(workId);
  const r = await channel.call('GET', API_LIKES, q, null, '计数查询');
  if (!r.ok) return r;
  return { ok: true, count: (Array.isArray(r.data) ? r.data : []).length };
}

module.exports = {
  likeExists: likeExists,
  insertLike: insertLike,
  deleteLike: deleteLike,
  countLikes: countLikes,
};
