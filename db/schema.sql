-- ============================================================================
--  ART EXHIBITION · schema.sql
--  建表脚本 · 严格从 api-contract.md §2 推导，字段名/类型/枚举三处一致
--  方言：PostgreSQL（CloudBase SQL 型数据库）
--  执行位置：CloudBase 控制台 → SQL 型数据库 → SQL 编辑器 → schema 选 public
--
--  ⚠️ 三条硬约束（写在这里，防止以后自己踩）
--   1. 表必须建在 public schema —— 控制台明示「唯一可通过 REST API (PostgREST)
--      访问的 Schema」，建到别的 schema，第 17~19 天的接口一个都读不到。
--   2. 所有 camelCase 字段名必须加双引号 —— PG 默认把未加引号的标识符转小写，
--      "workId" 不加引号会变成 workid，前端字段就对不上了。
--   3. "order" 是 PG 保留字，必须加双引号 —— 不加会直接语法报错。
--
--  本脚本可重复执行：先 DROP 后 CREATE。开发期专用。
--  ⚠️ 第 20 天部署上线后禁止再执行（会清空真实数据）。
-- ============================================================================

-- ---------- 清理（顺序不能反：先删子表，再删父表，否则外键拦住）----------
DROP TABLE IF EXISTS "notes"  CASCADE;
DROP TABLE IF EXISTS "likes"  CASCADE;
DROP TABLE IF EXISTS "works"  CASCADE;


-- ============================================================================
--  2.1  works · 作品主表
--  存什么：展品本身。画叫什么、挂在哪个厅、策展第几位、作者解说是什么。
--  共 85 行，来自 mvp/index.html 里原本写死的 SOURCE_SERIES。
-- ============================================================================
CREATE TABLE "works" (
  "_id"       TEXT        PRIMARY KEY,          -- 作品唯一标识。由图片路径派生：文件夹-序号-尺寸
  "name"      TEXT        NOT NULL,             -- 英文标题（展墙上显示的那一行）
  "img"       TEXT        NOT NULL,             -- 站内相对路径，含中文文件名，原样保存
  "series"    TEXT        NOT NULL,             -- 所属展厅 id，见下方 CHECK 枚举
  "material"  TEXT        NOT NULL DEFAULT 'print',  -- 材质方言。v5 决策：只做属性字段，不参与导航
  "note"      TEXT        NOT NULL,             -- 中文作品解说（仅聚焦视图可见，不上展墙）
  "verse"     TEXT,                             -- 经句。仅 theology 展厅有，其余为 NULL
  "order"     INTEGER     NOT NULL,             -- 作者策展位次。热度永不影响此字段
  "createdAt" BIGINT      NOT NULL,             -- 入库时间戳（毫秒级 Unix）

  -- 契约 §2.1 的 series 枚举，写进数据库层做最后一道闸
  CONSTRAINT "works_series_enum"
    CHECK ("series" IN ('theology', 'arcana', 'anime-worlds', 'other-works')),

  -- 同一展厅内位次不重复（策展顺序的唯一性）
  CONSTRAINT "works_series_order_uniq" UNIQUE ("series", "order")
);

COMMENT ON TABLE  "works"            IS '作品主表：展品本身。85 行，源自 index.html 的写死数据';
COMMENT ON COLUMN "works"."_id"      IS '作品唯一标识。由图片路径派生（文件夹-序号-尺寸），如 arcana-01-494x741。选 TEXT 不选 UUID：它需要可读、可重现、稳定不变';
COMMENT ON COLUMN "works"."name"     IS '英文标题，展墙上显示的那一行。即契约 §2.1 name';
COMMENT ON COLUMN "works"."img"      IS '站内相对路径。含中文文件名，PG 的 TEXT 无字符集之忧，原样保存不作转义';
COMMENT ON COLUMN "works"."series"   IS '所属展厅 id。枚举 theology/arcana/anime-worlds/other-works。选 TEXT+CHECK 而非 PG 原生 ENUM 类型：CHECK 改起来只需一条 ALTER，原生 ENUM 增删值更麻烦';
COMMENT ON COLUMN "works"."material" IS '材质方言。v5 已拍板：只做属性字段，不参与导航、不显示为文字。当前全部为 print';
COMMENT ON COLUMN "works"."note"     IS '中文作品解说，仅聚焦视图可见。⚠️ 与 notes.text 同名不同物：此字段是作者写的，notes.text 是观众写的';
COMMENT ON COLUMN "works"."verse"    IS '经句。仅 theology 展厅的 29 条有值，其余 56 条为 NULL——这正是「可空」的意义';
COMMENT ON COLUMN "works"."order"    IS '作者策展位次。⚠️ 位次永按此字段，热度不参与排序（契约 §4.3 已拍板）。用 INTEGER 不用 SMALLINT：位次可能超过 32767 的极端情况不值得赌';
COMMENT ON COLUMN "works"."createdAt" IS '入库时间戳，毫秒级 Unix。必须 BIGINT：毫秒数已超 INTEGER 上限（2147483647），用 INT 会溢出';


-- ============================================================================
--  2.2  likes · 点赞记录表
--  存什么：观众对展品的点赞动作。谁（匿名 visitorId）赞了哪幅画（workId）。
--  契约 §7 已拍板：切换式（toggle），故必须有 (workId, visitorId) 联合唯一约束。
-- ============================================================================
CREATE TABLE "likes" (
  "_id"       TEXT    PRIMARY KEY,   -- 记录唯一标识
  "workId"    TEXT    NOT NULL,      -- 指向 works._id ← 关联键
  "visitorId" TEXT    NOT NULL,      -- 匿名访客标识，前端生成并持久化
  "createdAt" BIGINT  NOT NULL,      -- 点赞时间戳（毫秒级 Unix）

  -- 外键：画没了，它的点赞跟着走，不留孤儿记录
  CONSTRAINT "likes_workId_fk"
    FOREIGN KEY ("workId") REFERENCES "works"("_id") ON DELETE CASCADE,

  -- ★ 契约 §7 拍板项：同一访客对同一作品至多一条记录。
  --   这是「切换式点赞」能成立的地基 —— 点赞时存在则删、不存在则插，全赖这条约束兜底。
  CONSTRAINT "likes_workId_visitorId_uniq" UNIQUE ("workId", "visitorId")
);

-- 统计用：按作品聚合点赞数
CREATE INDEX "likes_workId_idx" ON "likes" ("workId");

COMMENT ON TABLE  "likes"             IS '点赞记录表：观众对展品的点赞动作。匿名，无用户表';
COMMENT ON COLUMN "likes"."_id"       IS '记录唯一标识。独立于 works._id，一条点赞记录一个 id';
COMMENT ON COLUMN "likes"."workId"    IS '指向 works._id。★ 这是与 works 表的唯一关联键';
COMMENT ON COLUMN "likes"."visitorId" IS '匿名访客标识，前端本地生成的随机串。仅为防重复计数，不收集任何真实身份信息';
COMMENT ON COLUMN "likes"."createdAt" IS '点赞时间戳，毫秒级 Unix。BIGINT 理由同 works.createdAt';


-- ============================================================================
--  2.3  notes · 一句话感想表
--  存什么：观众给某幅画留的一句话（≤50 字符）。
--  与 likes 的区别：likes 只记「赞了没」，notes 还要存观众写的那句话。
-- ============================================================================
CREATE TABLE "notes" (
  "_id"       TEXT    PRIMARY KEY,   -- 记录唯一标识
  "workId"    TEXT    NOT NULL,      -- 指向 works._id ← 关联键
  "visitorId" TEXT    NOT NULL,      -- 匿名访客标识
  "text"      TEXT    NOT NULL,      -- 感想正文，≤50 字符
  "createdAt" BIGINT  NOT NULL,      -- 提交时间戳（毫秒级 Unix）

  CONSTRAINT "notes_workId_fk"
    FOREIGN KEY ("workId") REFERENCES "works"("_id") ON DELETE CASCADE,

  -- 契约 §4.4：同一访客对同一作品重复提交 → 409 CONFLICT。这条约束是它的实现依据。
  CONSTRAINT "notes_workId_visitorId_uniq" UNIQUE ("workId", "visitorId"),

  -- 契约 §4.4：text 上限 50 字符，超出 → 413 TEXT_TOO_LONG。
  -- ⚠️ 这里用 char_length 而非 length(byte)：契约要求「中英文同等计 1 字符」，
  --    octet_length 会把一个汉字算 3 字节，中文用户写到 17 字就被拦，属严重误判。
  CONSTRAINT "notes_text_len" CHECK (char_length("text") <= 50),
  -- 服务端须 trim 首尾空白，trim 后为空 → 400 INVALID_PARAM
  CONSTRAINT "notes_text_not_blank" CHECK (char_length(btrim("text")) > 0)
);

-- 读取用：按作品取感想列表，且契约 §4.5 要求 createdAt 降序
CREATE INDEX "notes_workId_createdAt_idx" ON "notes" ("workId", "createdAt" DESC);

COMMENT ON TABLE  "notes"             IS '一句话感想表：观众给某幅画留的话，≤50 字符';
COMMENT ON COLUMN "notes"."_id"       IS '记录唯一标识';
COMMENT ON COLUMN "notes"."workId"    IS '指向 works._id。★ 与 works 表的关联键';
COMMENT ON COLUMN "notes"."visitorId" IS '匿名访客标识。⚠️ 契约 §4.5 明确：对外返回感想列表时不暴露此字段';
COMMENT ON COLUMN "notes"."text"      IS '感想正文 ≤50 字符。⚠️ 与 works.note 同名不同物：此字段是观众写的，works.note 是作者写的作品解说';
COMMENT ON COLUMN "notes"."createdAt" IS '提交时间戳，毫秒级 Unix。契约 §4.5 要求按此字段降序返回';


-- ============================================================================
--  建表结果自检（执行完这段应看到 3 张表、3 个外键/唯一约束齐全）
-- ============================================================================
-- 列出三张表：
--   SELECT table_name FROM information_schema.tables
--    WHERE table_schema = 'public' AND table_name IN ('works','likes','notes')
--    ORDER BY table_name;
--
-- 看字段与类型：
--   SELECT table_name, column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name IN ('works','likes','notes')
--    ORDER BY table_name, ordinal_position;
