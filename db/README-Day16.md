# Day 16 执行手册 · 在 CloudBase 控制台建表灌数据

> 这份是**给你照着点**的操作指南。SQL 我已经写好并本地验证过了，你只需要复制粘贴 + 截图。
> 环境：`art-exhibition` ｜ schema 一律选 **`public`**

---

## 第 0 步 · 打开 SQL 编辑器

CloudBase 控制台 → 环境 `art-exhibition` → 左侧「**SQL 型数据库**」→ 子菜单「**SQL 编辑器**」

看到你截图里那个页面就对了。注意页面左上角 schema 下拉框，**确认是 `public`**。

---

## 第 1 步 · 执行建表脚本

1. 打开项目里的 `db/schema.sql`
2. **全选 → 复制**（从第一行 `-- =====` 到最后一行的注释，整份都要）
3. 粘贴进控制台的 SQL 编辑器
4. 点「执行」

**期望结果**：无报错。左侧「表」下应该出现 `works` / `likes` / `notes` 三张表。

**如果报错**：把报错原文发我，别自己改 SQL。

---

## 第 2 步 · 执行种子脚本（第一次）

1. 打开 `db/seed.sql`
2. 全选复制，粘贴进编辑器
3. 点「执行」

**期望结果**：无报错。这一步会 `DROP` 再 `CREATE` 再插入，所以即使上一步已经建过表也没关系——**这正是"可重复执行"的含义**。

> ⚠️ 因为 seed.sql 里已经包含建表语句，**第 1 步和第 2 步在功能上是重叠的**。你可以只跑 seed.sql 一步到位。
> 但建议**两步都跑**，这样能顺便验证 schema.sql 单独也能用（它是你日后要长期维护的那份）。

---

## 第 3 步 · 验证数据真实存在（★ 今天的截图）

在编辑器里贴这条，执行：

```sql
SELECT 'works' AS t, count(*) AS rows FROM "works"
UNION ALL SELECT 'likes', count(*) FROM "likes"
UNION ALL SELECT 'notes', count(*) FROM "notes";
```

**期望看到**：

| t | rows |
|---|---|
| works | **85** |
| likes | **8** |
| notes | **6** |

再看每厅分布：

```sql
SELECT "series", count(*) AS cnt, min("order") AS min_ord, max("order") AS max_ord
  FROM "works" GROUP BY "series" ORDER BY min_ord;
```

**期望看到**（注意 order 区间：契约 §2.4 定的、按展厅连续）：

| series | cnt | min_ord | max_ord |
|---|---|---|---|
| theology | 29 | 1 | 29 |
| arcana | 22 | 30 | 51 |
| anime-worlds | 15 | 52 | 66 |
| other-works | 19 | 67 | 85 |

看真实数据行（**这张截图要能看到表名 + 至少 5 行**）：

```sql
SELECT "_id", "name", "series", "order" FROM "works" ORDER BY "order" LIMIT 10;
```

```sql
SELECT * FROM "likes" ORDER BY "createdAt";
```

```sql
SELECT "_id", "workId", "text", "createdAt" FROM "notes" ORDER BY "createdAt" DESC;
```

### 📸 今天的截图怎么拍

点左侧「**表**」→ 点进 `works` 表 → 切到「**数据**」页 → 你能看到表名和真实数据行。

**截图要求**：图里要有**表名**，以及**每张核心表至少 5 行数据**。`works` 表 85 行很轻松；
`likes`（8 行）和 `notes`（6 行）也够 5 行，各截一张。

---

## 第 4 步 · 验证可重复执行（★ 第二张截图）

**把 `db/seed.sql` 整份再执行一遍。**

**期望结果**：无报错。

然后把第 3 步第一条 count 语句再跑一次——**行数应该还是 85 / 8 / 6，不是 170 / 16 / 12**。

> 这一步就是在验证"先删后建再插入"的逻辑成立。行数翻倍 = 脚本不合格。

---

## 第 5 步 · 关联是否通（顺手验一下外键）

```sql
SELECT l."_id", w."name" AS work_name, l."visitorId"
  FROM "likes" l JOIN "works" w ON w."_id" = l."workId"
 ORDER BY l."createdAt";
```

**期望**：每行都能查到对应的 `work_name`。若出现空值，说明外键断了。

---

## 完成后告诉我这三件事

1. 第 1、2 步执行有没有报错
2. 三张表的实际行数（是不是 85 / 8 / 6）
3. 第二遍执行 seed.sql 有没有报错、行数有没有翻倍

然后我列改动文件清单，你确认后提交推送。

---

## 附：常见报错对照

| 报错 | 原因 | 怎么办 |
|---|---|---|
| `relation "works" does not exist` | 表没建成功 | 回去看第 1 步的报错 |
| `syntax error at or near "order"` | `order` 没加双引号 | 不会发生——我全文已加引号，若真出现说明复制时漏了 |
| `column "workid" does not exist` | camelCase 字段没加引号 | 同上，复制不完整 |
| `permission denied` | schema 不是 public | 检查左上角 schema 下拉框 |
| 中文变问号 `???` | 粘贴时编码丢了 | 用 UTF-8 打开 .sql 文件再复制 |
