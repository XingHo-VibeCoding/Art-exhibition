/**
 * 数据访问层 · works 表（note 函数专用，只做一件事）
 * 所属云函数：note（GET / POST / PATCH / DELETE /api/note）
 * 契约：api-contract.md §4.4（POST 需校验 workId 存在）/ §4.5（GET 需校验 workId 存在）
 *
 * ── 为什么 note 函数也要碰 works 表 ─────────────────────────────
 * 感想是**挂在作品上**的：notes.workId 是指向 works._id 的外键。
 * 于是有两条路让「作品不存在」浮出来：
 *   ① 先查一次 works（就是本文件）—— 在**写之前**就拦住，不产生任何写副作用；
 *   ② 靠数据库外键违例 —— 要等写入那一刻才炸，错误还得翻译。
 * 契约要求「作品不存在」必须是干净的 404 + 中文说明，故本函数统一走 ①。
 *
 * ── 与 works 函数里的同名文件是什么关系 ────────────────────────
 * **不是共享的**。云函数各自独立打包，`require('../works/repository/...')` 在
 * 上传后根本不存在。所以每个云函数自带一份自己的 repository ——
 * 这是云函数形态的固有代价（换来的是彼此隔离、单独部署）。
 * 本文件只保留了 note 用得上的那一件事，没有把 works 函数里的三个查询全抄过来。
 *
 * ── 对外暴露 ────────────────────────────────────────────────────
 *   workExists(workId)  该作品在 works 表里存在吗？
 *
 * ── 结果形状（两层之间的「合同」）────────────────────────────────
 *   成功：{ ok:true, exists:boolean }
 *   失败：{ ok:false, kind:'NO_KEY'|'NETWORK'|'DB'|..., message:'中文' }
 */

const channel = require('./channel');

const API_WORKS = '/works';

/**
 * 作品存在性查询。
 *
 * 只取 _id 一列 + limit=1 —— 够判断存在性即可，尽量轻。
 * 为什么不在入口层直接拼字符串：所有用户输入都先过校验，
 * 到这里只做 encodeURIComponent，再由 Data API 预编译执行（见 channel.js 头注）。
 *
 * @param {string} workId
 * @returns {Promise<{ok:true, exists:boolean} | {ok:false, kind:string, message:string}>}
 */
async function workExists(workId) {
  const q = 'select=_id&_id=eq.' + encodeURIComponent(workId) + '&limit=1';
  const r = await channel.call('GET', API_WORKS, q, null, '作品存在性查询');
  if (!r.ok) return r;
  return { ok: true, exists: (Array.isArray(r.data) ? r.data : []).length > 0 };
}

module.exports = {
  workExists: workExists,
};
