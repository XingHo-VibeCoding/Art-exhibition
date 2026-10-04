# API 契约 · ART EXHIBITION

> **本文件的地位：第 3 周的唯一仲裁物。**
> 前端照它调用，后端照它实现。双方**都不去猜对方的代码**；有分歧，以本文件为准。
> 要改接口，先改这份文档，再改代码 —— 顺序不能反。
>
> - **版本**：v1.3（Day 17 回写，2026-10-04）
> - **状态**：**部分已实现**。`GET /api/health`（Day 15）与 `GET /api/works`（Day 17）**已上线并通过验证**；
>   其余 4 个（`/api/like` · `/api/stats` · `/api/note` · `/api/notes`）待 Day 18–19 实现。
> - **数据来源**：由 `mvp/index.html` 的真实页面结构反推（七个页面动作 → 五个待实现接口）。

---

## 一、通用约定

| 项 | 约定 |
|---|---|
| 协议 | HTTPS |
| 基地址 | `https://art-exhibition-d7ggtul83d566a6c9.service.tcloudbase.com` |
| 路径前缀 | 一律 `/api/` |
| 编码 | `content-type: application/json; charset=utf-8` |
| 时间 | 一律为 **毫秒级 Unix 时间戳**（number），字段名以 `At` 结尾 |
| 命名 | 请求/响应字段一律 `camelCase` |
| 匿名 | **不收集**姓名、手机号、邮箱；`visitorId` 仅为前端本地生成的随机串 |
| 鉴权 | S1 阶段**无鉴权**（公开画廊）；如需后台管理，另行登记 |

---

## 二、数据表（3 张）

> 第 3 周建表以此为准。表名、字段名、类型三处都必须一致。

### 2.1 `works` · 作品主表

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `_id` | string | ✓ | 作品唯一标识。**生成规则见下方 §2.4**，稳定不变 |
| `name` | string | ✓ | 英文标题（展墙上显示的那一行） |
| `img` | string | ✓ | 站内相对路径，如 `images/arcana/01_愚者_0_THE-FOOL_494x741.png` |
| `series` | string | ✓ | 所属展厅 id，枚举：`theology` / `arcana` / `anime-worlds` / `other-works` |
| `material` | string | ✓ | 材质方言（v5 决策：**只做属性字段，不参与导航**），当前全部为 `print` |
| `note` | string | ✓ | 中文作品解说（**仅聚焦视图可见**，不上展墙） |
| `verse` | string \| null | | 经句（**仅 `theology` 展厅有**，其余为 `null`） |
| `order` | number | ✓ | 作者策展位次（**位次永按此字段，热度不参与排序**，见 §6）。**编号规则见 §2.4** |
| `createdAt` | number | ✓ | 入库时间戳 |

**实际数据量（Day 16 灌入，已核实）**：共 **85** 行，按展厅分布 `theology 29` / `arcana 22` / `other-works 19` / `anime-worlds 15`。

> ⚠️ `series` 只认这 4 个值——以「页面真实渲染」为准（`mvp/index.html` 的 `SERIES` 数组按 `img` 路径前缀分组）。
> `index.html` 里另有一套 6 组的 `SOURCE_SERIES`（SYMBOLIC WORLDS / SCREEN DREAMS / …），那是**中间态**，**不进数据库**。

### 2.2 `likes` · 点赞记录表

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `_id` | string | ✓ | 记录唯一标识 |
| `workId` | string | ✓ | 指向 `works._id` |
| `visitorId` | string | ✓ | 匿名访客标识（前端生成并持久化，用于防重复计数） |
| `createdAt` | number | ✓ | 点赞时间戳 |

**索引建议**：`workId`（统计用）、`workId + visitorId` 联合唯一（防重复）。

### 2.3 `notes` · 一句话感想表

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `_id` | string | ✓ | 记录唯一标识 |
| `workId` | string | ✓ | 指向 `works._id` |
| `visitorId` | string | ✓ | 匿名访客标识 |
| `text` | string | ✓ | 感想正文，**长度 ≤ 50 个字符**（中英文同等计 1 字符） |
| `createdAt` | number | ✓ | 提交时间戳 |

> ⚠️ 注意：`notes.text` 是**观众写的**；`works.note` 是**作者写的作品解说**。两者同名不同物，写代码时不要混。

---

### 2.4 两条生成规则（Day 16 定稿，2026-10-02）

> 这两条是在真实数据落地时才浮出来的问题——Day 15 登记契约时用了一个简化例子，
> 没覆盖「中文文件名」与「全站顺序」两个真实情况。此处补定，此后**不得再改**。

#### ① `works._id` 生成规则

**格式**：`<图片所在文件夹>-<该文件夹内两位序号>-<尺寸>`

| 例 | 说明 |
|---|---|
| `arcana-01-494x741` | 文件夹 arcana，第 1 张，原图 494×741 |
| `theology-01-0x0` | 文件夹 theology，第 1 张，**文件名不含尺寸**，故记 `0x0` |

**为什么不用原始路径**：真实 `img` 含中文（`配图-实战-神学-创世纪.jpg`）、空格（`result-1 (29).png`）、
中文括号与加号（`（波点艺术+拼贴艺术）`）。这些字符若进 `_id`，前端拿它当 URL 参数或 DOM id 都会出问题。
故 `_id` 一律为**纯 ASCII、无空格**。

**稳定性**：`_id` 由「文件夹 + 文件夹内出现顺序 + 尺寸」决定。**只要 `index.html` 里作品顺序不变，`_id` 就不变。**
若未来新增作品，追加在数组末尾即可，不影响既有 `_id`。

#### ② `works.order` 编号规则（已拍板）

**编号方式**：先按展厅固定顺序分组（`theology` → `arcana` → `anime-worlds` → `other-works`），
组内保持 `index.html` 原始先后，再全站连续编号 **1 → 85**。

| 展厅 | `order` 区间 |
|---|---|
| `theology` | 1 – 29 |
| `arcana` | 30 – 51 |
| `anime-worlds` | 52 – 66 |
| `other-works` | 67 – 85 |

**为什么这样排**：契约 §4.1 要求「`works` 按 `order` 升序」返回。若 `order` 沿用 `SOURCE_SERIES` 的原始
顺序（ARCANA 在前、THEOLOGY 在后），则按 `order` 扫描时四个展厅是**交错**的。重排后同一展厅连续，
前端分组与分页都更自然。**位次语义不变**——它仍然只表示「作者策展顺序」，热度依旧不影响它。

---

### 2.5 建表脚本位置

| 文件 | 用途 | 可重复执行 |
|---|---|---|
| `db/schema.sql` | 建表（含主键、外键、唯一约束、字段注释） | ✓（先 DROP 后 CREATE） |
| `db/seed.sql` | 建表 + 灌入 85 条作品 + 8 条点赞 + 6 条感想 | ✓（先删后建再插入） |

> ⚠️ **仅开发期使用**。Day 20 部署上线后**禁止再执行** —— 两个脚本都会 DROP 表，会清空真实数据。
> 上线后的数据变更一律用**增量 SQL**。

---

## 三、统一响应形状

### 3.1 成功

```json
{
  "ok": true,
  "data": { }
}
```

- `ok` 恒为 `true`
- 业务数据一律装在 `data` 里；即使只有一个字段也**不要**提到顶层

### 3.2 失败

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_PARAM",
    "message": "缺少必填参数 workId"
  }
}
```

- `code`：**机器读**，全大写下划线，取自下表
- `message`：**人读**，中文，直接说明怎么错、怎么改
- 失败响应**不返回** `data` 字段
- HTTP 状态码必须与 `code` 语义一致（下表已绑定）

### 3.3 错误码字典（唯一定义处）

| HTTP | `code` | 何时用 |
|---|---|---|
| 400 | `INVALID_PARAM` | 缺必填参数、参数类型不对、枚举值非法 |
| 404 | `NOT_FOUND` | `workId` 在 `works` 里查不到 |
| 405 | `METHOD_NOT_ALLOWED` | 方法不支持（`/api/health` 已用此码） |
| 409 | `CONFLICT` | 同一访客对同一作品重复提交（如感想刷屏） |
| 413 | `TEXT_TOO_LONG` | `notes.text` 超过 50 字符 |
| 429 | `RATE_LIMITED` | 同 `visitorId` 短时间请求过于频繁 |
| 500 | `INTERNAL_ERROR` | 服务端异常（不向外暴露堆栈） |

---

## 四、接口清单（6 个）

### 4.0 `GET /api/health` ✅ **已实现（Day 15）**

链路探针。不连数据库、不写业务。

| 项 | 内容 |
|---|---|
| 方法 | `GET` |
| 路径 | `/api/health` |
| 请求参数 | 无 |
| 响应 200 | `{ "ok": true, "service": "art-exhibition" }` |
| 错误 | 405 `METHOD_NOT_ALLOWED`（非 GET） |
| 实测地址 | `https://art-exhibition-d7ggtul83d566a6c9.service.tcloudbase.com/api/health` |

> 说明：此接口是**第一个上线的接口**（Day 17 起 `GET /api/works` 亦已上线）。其响应形状是 §3 之外的极简形态（不含 `data` 包裹），因为它是部署探针而非业务接口；后续业务接口一律遵循 §3。

---

### 4.1 `GET /api/works` · 读取作品列表 ✅ **已实现（Day 17）**

> **清单特意点名的漏项：一定不能忘列表读取接口。** 页面初始渲染的全部数据都来自这里。

| 项 | 内容 |
|---|---|
| 方法 | `GET` |
| 路径 | `/api/works` |
| Query 参数 | `series`（可选）展厅 id，用于只取一个展厅；缺省 = 全部<br>`limit`（可选）最多返回条数，缺省 = 全部 |
| 请求体 | 无 |
| 响应 200 | `{ "ok": true, "data": { "series": [...], "works": [...] } }` |
| 实测地址 | `https://art-exhibition-d7ggtul83d566a6c9.service.tcloudbase.com/api/works` |

**`data.series[]` 形状**：

```json
{ "id": "theology", "name": "THEOLOGY", "count": 29 }
```

**`data.works[]` 形状**：严格对应 §2.1 `works` 表的全部字段。

```json
{
  "_id": "arcana-01-494x741",
  "name": "THE FOOL",
  "img": "images/arcana/01_愚者_0_THE-FOOL_494x741.png",
  "series": "arcana",
  "material": "print",
  "note": "轻装上路的人站在悬崖边，脚下的空白既像危险，也像尚未写下的命运。",
  "verse": null,
  "order": 30,
  "createdAt": 1759363200000
}
```

**排序**：`works` 按 `order` 升序；`series` 按前端导航固定顺序（`theology` → `arcana` → `anime-worlds` → `other-works`）。

**错误**：400 `INVALID_PARAM`（`series` 不在枚举内、`limit` 非大于 0 的整数）、405 `METHOD_NOT_ALLOWED`（非 `GET`）、500 `INTERNAL_ERROR`（数据库读取失败；`message` 一律中文，不透出英文原文与表结构细节）。

> **实现说明（Day 17，2026-10-04）**：数据来自 PostgreSQL 的 `public.works` 表，经数据库
> **Data API**（`{envId}.api.tcloudbasegateway.com/v1/rdb/rest/works`，基于 PostgREST）读取。
> 云函数**不直连数据库**；API Key 仅存于服务端环境变量，永不进代码、前端与仓库。
> 另有两条实现约定：① `data.series[].count` 恒为**全库**该展厅作品总数，**不随** `?series=` / `?limit=` 缩小（它是导航基数）；
> ② 参数**不拼接 SQL** —— 先过枚举/类型白名单，再交给 Data API 预编译执行。

---

### 4.2 `POST /api/like` · 匿名点赞

| 项 | 内容 |
|---|---|
| 方法 | `POST` |
| 路径 | `/api/like` |
| 请求体 | `{ "workId": "string", "visitorId": "string" }` |
| 响应 200 | `{ "ok": true, "data": { "workId": "...", "likes": 12, "liked": true } }` |

- 行为：**切换式**（toggle，已拍板，见 §7）—— 未赞过则 +1 并返回 `liked:true`；已赞过则 -1 并返回 `liked:false`
- `likes` 恒为该作品**当前**总数（不返回增量）
- 实现约束：`visitorId` 由前端生成并持久化；服务端对 `workId + visitorId` 建**联合唯一索引**

**错误**：400 `INVALID_PARAM`（缺 `workId`/`visitorId`）、404 `NOT_FOUND`（`workId` 不存在）、429 `RATE_LIMITED`。

---

### 4.3 `GET /api/stats` · 热度统计

| 项 | 内容 |
|---|---|
| 方法 | `GET` |
| 路径 | `/api/stats` |
| 请求参数 | 无 |
| 响应 200 | `{ "ok": true, "data": { "totalLikes": 128, "byWork": { "workId": 9 }, "bySeries": { "arcana": 40 } } }` |

**用途限制（v5 已拍板，不得越界）**：热度**只允许改变「入场先后」**（动画出场节奏），
**绝不允许改变作品位次**。位次永远由 `works.order` 决定。把「热度」译成「节奏」，不译成「等级」。

**错误**：本接口无入参，故无 400；仅在统计读取失败时返回 500 `INTERNAL_ERROR`。

---

### 4.4 `POST /api/note` · 写一句话感想

| 项 | 内容 |
|---|---|
| 方法 | `POST` |
| 路径 | `/api/note` |
| 请求体 | `{ "workId": "string", "visitorId": "string", "text": "string" }` |
| 响应 200 | `{ "ok": true, "data": { "note": { "_id": "...", "workId": "...", "text": "...", "createdAt": 1790000000000 } } }` |

- `text` 上限 **50 字符**；服务端**必须**用 `String.length` 之外的方式按「字符数」校验（emoji 算 1 个）
- 服务端须 trim 首尾空白；trim 后为空 → 400

**错误**：400 `INVALID_PARAM`、404 `NOT_FOUND`、413 `TEXT_TOO_LONG`、409 `CONFLICT`、429 `RATE_LIMITED`。

---

### 4.5 `GET /api/notes` · 读取感想列表

| 项 | 内容 |
|---|---|
| 方法 | `GET` |
| 路径 | `/api/notes` |
| Query 参数 | `workId`（**必填**）、`limit`（可选，默认 20，上限 50） |
| 响应 200 | `{ "ok": true, "data": { "notes": [ ... ], "total": 7 } }` |

**`data.notes[]` 形状**（**不含 `visitorId`** —— 匿名作品不对外暴露访客标识）：

```json
{ "_id": "...", "workId": "...", "text": "光从黑暗里分开的那一刻……", "createdAt": 1790000000000 }
```

**排序**：`createdAt` 降序（新的在前）。

**错误**：400 `INVALID_PARAM`（缺 `workId`）。

---

## 五、页面动作 → 接口 映射表

> 左列 = `mvp/index.html` 上**真实存在的每个动作**（已逐行核对源码）；
> 右列 = 该动作需要后端提供什么。**这是本契约的推导依据，也是验收清单要求的那张表。**

| # | 页面动作 | 现状（Day 15 为止） | 需要的接口 |
|---|---|---|---|
| 1 | 打开页面，看到四个展厅 + 整面展墙 | 数据**写死**在 `index.html` 的 `SOURCE_SERIES` 里 | `GET /api/works` |
| 2 | 点展厅按钮，切到该展厅 | 纯前端过滤 + `localStorage` 记上次看的展厅 | 复用 ①（或带 `?series=`） |
| 3 | 点一幅画，进聚焦视图看作品解说 | 数据写死（`note` / `verse` 字段） | 复用 ①（响应已含这两个字段） |
| 4 | 赞 / 收藏这幅画 | **不存在** | `POST /api/like` |
| 5 | 看这幅画被赞了多少、哪个展厅最热 | **不存在** | `GET /api/stats` |
| 6 | 给这幅画留一句感想（≤50 字） | **不存在** | `POST /api/note` |
| 7 | 看别人留的感想 | **不存在** | `GET /api/notes` |

**只有 1–3 是页面现在已经有的动作**（对应接口就是把写死的数据搬到库里）；
**4–7 是 v5 新增的「作者反馈系统」**，页面 UI 与后端都还没有。

---

## 六、第 3 周实施顺序（本文件登记、按序实现）

| 天 | 做什么 | 对应接口 |
|---|---|---|
| Day 16 | 建三张表 + 灌入 **85** 条作品数据（✅ 已完成） | （建表，无接口） |
| Day 17 | 实现列表读取（✅ 后端已完成并验证；前端接入仍按原计划在 Day 20） | `GET /api/works` |
| Day 18 | 实现点赞 | `POST /api/like` |
| Day 19 | 实现感想读写 + 统计 | `POST /api/note`、`GET /api/notes`、`GET /api/stats` |
| Day 20 | 配 CORS、前端接 SDK、全链路联调 | 全部 |

**约束**：跨域（CORS）**今天与 Day 16–19 都不配**，Day 20 统一处理。

---

## 七、已拍板决定（Day 15，2026-10-01）

> 原「待主人拍板项」两条，主人已当场裁定。**此两条为定稿，第 3 周不得再改**（要改须先改本文件）。

1. **点赞为「切换式」（toggle）** —— 已定。
   可取消，情绪更自由；实现上必须建 `workId + visitorId` 联合唯一索引，保证同一访客对同一作品**至多一条**记录。
2. **`api-contract.md` 放主目录** —— 已定。
   与 `PRD.md` 同级，作为第 3 周唯一仲裁物；`AGENTS.md` 个人规则 A 的档案数已同步由 5 更改为 6。

---

## 八、变更记录

| 日期 | 版本 | 变更 | 变更人 |
|---|---|---|---|
| 2026-10-01 | v1.0 | 首次登记：3 表 + 6 接口 + 统一错误形状（Day 15，仅登记不实现） | AI 起草 |
| 2026-10-01 | **v1.1** | 主人逐行核对通过；两条待决项裁定（点赞=切换式、文档置主目录），§7 由「待拍板」转为「已拍板」 | AI 起草，主人裁定 |
| 2026-10-02 | **v1.2** | Day 16 真实建表后回写：新增 §2.4 两条生成规则（`_id` 格式、`order` 按展厅重排 1–85）与 §2.5 脚本位置；§2.1 补记实际数据量 85 行及各厅分布；澄清 `series` 只认页面真实渲染的 4 值（`SOURCE_SERIES` 的 6 组为中间态，不入库） | AI 起草，主人拍板 |
| 2026-10-04 | **v1.3** | Day 17 实现并上线 `GET /api/works`：§4.1 标记「✅ 已实现」，补实测地址、错误码清单与实现说明（Data API 读取 / `count` 恒为全库数 / 参数不拼 SQL）。**修正两处笔误**：§4.1 示例 `_id`（`images-arcana-01-the-fool` → 真值 `arcana-01-494x741`，`order` 同步 1 → 30）、§6 的「灌入 92 条」→ **85** 条；§4.0 说明中「唯一已上线的接口」表述更新 | AI 起草，主人拍板 |
