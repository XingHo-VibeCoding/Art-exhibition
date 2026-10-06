/**
 * 数据访问层 · works 表（like 函数）
 * 所属云函数：like（POST /api/like）
 * 契约：api-contract.md §4.2
 *
 * ── 这个文件为什么存在 ──────────────────────────────────────────
 * like 接口在写入之前，必须确认「这幅作品真实存在」（契约 §4.2 要求不存在时回 404）。
 * 这段对 works 表的只读查询，同样属于「数据访问」，从 index.js 搬到这里。
 *
 * ⚠️ 与 works 函数目录下的 worksRepository.js **不是同一段代码**：
 *    · 那个是完整作品列表读取（select=* + 展厅计数），服务 GET /api/works；
 *    · 这个只做一件事 —— 判断某个 _id 是否存在（select=_id&limit=1）。
 *    两者用途不同，故各自独立；共用的是底层 channel。
 *
 * ── 对外暴露 ────────────────────────────────────────────────────
 *   workExists(workId)   作品是否存在
 *
 * ── 结果形状 ────────────────────────────────────────────────────
 *   成功：{ ok:true, exists:boolean }
 *   失败：{ ok:false, kind:'NO_KEY'|'NETWORK'|'DB', message:'中文' }
 */

const channel = require('./channel');

const API_WORKS = '/works';

/** URL 编码：用户输入只会作为**值**参与 URL，不可能变成新的查询参数或 SQL 片段 */
function enc(s) {
  return encodeURIComponent(s);
}

/**
 * workId 指向的作品是否存在。
 *
 * 为什么要专门查一次，而不是直接插入让外键去拦：
 *   直接插入的话，「作品不存在」会以一个数据库报错的形式出现，
 *   而契约 §4.2 要求它必须是 404 NOT_FOUND 且 message 能看懂。
 *   显式查询一次，语义最清楚，也把错误拦在写操作之前（不产生任何写副作用）。
 */
async function workExists(workId) {
  const q = 'select=_id&_id=eq.' + enc(workId) + '&limit=1';
  const r = await channel.call('GET', API_WORKS, q, null, '作品存在性查询');
  if (!r.ok) return r;
  return { ok: true, exists: (Array.isArray(r.data) ? r.data : []).length > 0 };
}

module.exports = {
  workExists: workExists,
};
