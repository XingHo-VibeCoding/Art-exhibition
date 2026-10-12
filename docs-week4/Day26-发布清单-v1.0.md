# Day 26 · 发布清单（v1.0）

> **本清单的作用**：发布前后各照着走一遍，**不靠记忆、不靠「我部署了」**。
> **建立**：2026-10-12（Day 26 · 第 4 周）
> **配套**：`Day26-回滚手册.md`（出事时的手册）、`Day26-回滚演练记录.md`（演练取证）

---

## 一、版本号与发布内容

| 项 | 值 |
|---|---|
| **版本号** | **v1.0**（本项目第一个正式版本标记） |
| **环境** | `art-exhibition`（`art-exhibition-d7ggtul83d566a6c9`，上海） |
| **静态托管地址** | `https://art-exhibition-d7ggtul83d566a6c9-1499147979.tcloudbaseapp.com/` |
| **云函数基地址** | `https://art-exhibition-d7ggtul83d566a6c9.service.tcloudbase.com` |
| **代码基线** | git commit `12b61bec5f66e9ee92dd22ca32a354688bfa0b3d`（Day 25c，2026-10-11） |
| **版本标记** | git 附注标签 `v1.0`（对象 `b69af263…`，指向提交 `12b61be`；已推送远端）｜见 §5.1 |
| **发布日** | 2026-10-12 |

### 1.1 发布物清单（线上根目录）

| 文件 | 线上路径 | 字节数 | SHA256（前 16 位） | 本地同源 |
|---|---|---|---|---|
| 展墙首页 | `/`（=`/index.html`） | **142760** | `2a165ed3b81623be` | `mvp/index.html` |
| 检查台 | `/checkup.html` | **50003** | `9e00489ff150398f` | `checkup.html` |
| 展墙图片资源 | `/images/**`、`/assets/**` | 85 张 / 196.6MB | —— | `mvp/images/**` 等 |

### 1.2 发布内容说明

**这一版线上提供两样东西：**

1. **静态展墙**（`/`）—— 85 件作品、四个展厅（`theology` 29 / `arcana` 22 / `anime-worlds` 15 / `other-works` 19），
   单文件 + GSAP 动画，**数据写死在页面里，零 API 调用**。
2. **公网检查台**（`/checkup.html`）—— 四块面板，接四个线上接口：
   `GET /api/health`、`GET /api/works`（85 条）、`POST /api/like`（toggle）、`/api/note` 四方法（增删改查闭环）。

### 1.3 ★ 本次发布相对「上一版线上」的实际差异：**代码零差异**

**实测证据（2026-10-12）**：线上与本地两份文件**逐字节一致**（SHA256 全等）。

```
mvp/index.html    本地 2a165ed3b81623be  ==  线上 2a165ed3b81623be   ✅
checkup.html      本地 9e00489ff150398f  ==  线上 9e00489ff150398f   ✅
```

→ 故 **v1.0 的性质 = 「给现存线上状态打版本标记 + 建立备份 + 全项复核」**，
**不是**「上传一批新代码」。

> 📌 **顺带纠正一条过期记忆**：此前记录「Day 24 的 BUG-01 修复（48935 → 50003 字节）已修但未部署」。
> 实测：**线上 `checkup.html` 字节数 = 50003，`addBusy` 出现 4 次 —— 与本地完全一致，该修复早已在线上。**
> 教训：**「未部署」这类结论会过期**，每次发布前用字节数 + 关键标记复核一次，不要凭旧记录下判断。

### 1.4 明确**不在** v1.0 范围内的部分（如实登记，不装）

| 项 | 状态 |
|---|---|
| `GET /api/stats`（热度统计） | **未实装** —— 线上返回 404 `INVALID_PATH` |
| 展墙接真实接口 | **未做** —— 展墙数据仍写死在 `mvp/index.html`（评论区/点赞未接进展墙） |
| BUG-02 `commitEdit` 同型缺闸 | 已登记（P2），未修 |
| BUG-03 弹层预览 `.length` 截断 emoji | 已登记（P3），未修 |

---

## 二、发布前必须通过的验证项

> **判据来源**：`verify-project` Skill（`docs-week4/verify-project.SKILL.md`）。
> **规则**：逐项输出 PASS/FAIL 与证据（数字、字节数、命中数），**禁止空口 PASS**。

### 2.1 怎么跑

```bash
cd "C:/Users/Henry/Desktop/Vibe coding"
bash _ref/verify/refresh-git-snapshot.sh
"C:/Users/Henry/.workbuddy/binaries/node/versions/22.22.2-6/node.exe" _ref/verify/run-checks.js
```

退出码 `0` = 全 PASS ｜ `1` = 有 FAIL ｜ `2` = 脚本异常。**发布前必须为 `0`。**

### 2.2 15 项检查清单

| ID | 检查项 | 通过判据 |
|---|---|---|
| A1 | 公网首页可访问 | 带**站内 Referer** → 200 且 >50KB 且含 `Art Exhibition` 且非提示页 |
| A1b | 静态资源可达 | 作品图与背景图均 200 且 >10KB |
| A2 | 首页渲染完整 | `mvp/index.html` 的 `images/` 引用 ≥80 且 4 个展厅名全命中 |
| A3 | 部署一致性 | 线上字节数 == 本地字节数 |
| B1 | `/api/health` | 200 且 `ok===true` 且 `service==='art-exhibition'` |
| B2 | `/api/works` | 200 且 `ok===true` 且 `works.length===85` 且 series 合计 85 |
| B3 | `/api/note` 读列表 | 200 且 `ok===true` 且 `notes` 是数组 且 `total` 是数字 |
| B4 | `/api/like` toggle | 同 payload 连发两次：`liked` true→false 且 `likes` −1（净影响 0） |
| B5 | `/api/note` 增删闭环 | POST → GET 查得到 → DELETE → 再 GET 查不到（**净残留 0**） |
| C1 | 无硬编码密钥（工作区） | 扫全部跟踪文件，`sk-` / `Bearer sk-` / `CLOUDBASE_API_KEY=` 真实值 → **0 命中** |
| C2 | 无密钥进 Git 历史 | **历史文本非空**且全历史扫描 → 0 命中（空扫描直接 FAIL） |
| D1 | `.gitignore` + `.env.example` | 覆盖 `.env`、`.env.example` 存在且无真实值、`.env` 未被跟踪 |
| D2 | Git 工作区干净 | `git status --porcelain` 为空 |
| E1 | 数据库可达 | 经 `/api/works` 取回 85 条（**间接验证**，本机无服务端 Key） |
| F1 | 云函数三件套 | `works` / `like` / `note` 三个函数均在线且可响应 |

### 2.3 发布前实测结果

**运行时间**：2026-10-12 15:31:04
**原始输出**：`_ref/verify/out/day26-01-before-commit.txt`（不动仓库，就地留档）

```
合计 14 PASS / 1 FAIL ｜ 结论：❌ 未通过发布检查   （退出码 1）
```

| ID | 结果 | 关键证据 |
|---|---|---|
| A1 | PASS | HTTP 200 / 139.4KB / 含 `Art Exhibition` / 非提示页（带站内 Referer） |
| A1b | PASS | 作品图 200 / 783KB ｜ 背景图 200 / 9836KB |
| A2 | PASS | `images/` 引用 96 处 / 展厅名命中 4/4 |
| **A3** | **PASS** | **线上 142760B == 本地 142760B（逐字节相等）** |
| F1 | PASS | 3 个云函数均含 `index.js` + `package.json` + `repository/` |
| B1 | PASS | `{"ok":true,"service":"art-exhibition"}` |
| B2 | PASS | 顶层 key = `ok,data`；`works.length=85`；series 4 个合计 85 |
| E1 | PASS | 经 `/api/works` 取回 85 条真实明细（间接验证） |
| B3 | PASS | `notes` 是数组 / `total` 是数字 |
| B4 | PASS | `liked` true→false；`likes` 6→5（净影响 0） |
| B5 | PASS | 建 → 查得到 → 删 → 删后仍在=false（**净残留 0**） |
| C1 | PASS | 扫 136 个跟踪文件 / 命中 0 处 |
| C2 | PASS | 全历史扫描 814KB / 命中 0 处 |
| D1 | PASS | `.gitignore` 覆盖 `.env` + `cloud/.env.example` 无真实值 |
| **D2** | **FAIL** | **2 个未提交文件 —— 恰是今天新建的两份 Day26 文档** |

#### ★ 唯一 FAIL 的诚实说明（不掩盖、也不当成代码问题）

`D2` 的判据是 `git status --porcelain` **行数为 0**。当前 2 条脏条目：

```
?? docs-week4/Day26-发布清单-v1.0.md
?? docs-week4/Day26-回滚手册.md
```

→ **这个 FAIL 是「今天自己的工作还没提交」造成的，不是线上代码有问题。**
→ 按 `AGENTS.md` 第五节，提交统一放在当日收尾（"中途不要边做边提交"），
   故**收尾提交完成后会复跑一次**，届时 D2 转 PASS，全项 15/15。
→ **复跑输出**：`_ref/verify/out/day26-02-after-commit.txt`（两轮输出**刻意不同名**，避免证据被覆盖）。

> ⚠️ 这一条本身是「探针说真话」的正面案例：**检查台抓到了发布者自己的工作区状态**。
> 若把它悄悄跳过，就成了「只报好消息的检查」——那还不如没有。

#### ★ 收尾复跑：15 PASS / 0 FAIL（发布检查正式通过）

**运行时间**：2026-10-12 15:59:02 ｜ **原始输出**：`_ref/verify/out/day26-04-final-after-commit.txt`

```
合计 15 PASS / 0 FAIL ｜ 结论：✅ 通过发布检查   （退出码 0）
```

`D2` 转为 **PASS（无未提交改动）** —— 与上面 docstring 中的预判完全一致：**那个 FAIL 只是「文档尚未提交」，不是代码问题。**

> 过程留三步原始输出，**刻意不同名、不覆盖**：
> `day26-01-before-commit.txt`（14/1）→ `day26-03-after-rollback.txt`（回滚后 14/1）→ `day26-04-final-after-commit.txt`（15/0）。

---

## 三、发布方式与步骤

### 3.1 发布方式

**控制台手动上传（本机无 cloudbase / tcb CLI）。**

- 入口：控制台 → 静态网站托管 → **文件管理**
- 上传已存在的同名文件 = **覆盖**
- 通过控制台上传**会自动刷新 CDN 节点缓存**

### 3.2 发布步骤（本次为「确认型发布」）

| 步 | 谁做 | 动作 | 预期 |
|---|---|---|---|
| 1 | 我 | 跑 verify-project → 全 PASS（§2.3） | 退出码 0 |
| 2 | 我 | 校验线上 == 本地（字节数 + SHA256） | 两份文件全等 |
| 3 | 我 | 打 git 附注标签 `v1.0` 并推送（§5.1） | `git tag -l` 可见 `v1.0` |
| 4 | 我 | 建立数据基线备份（§5.2） | `_ref/backups/v1.0/` 三个文件 + SHA256 |
| 5 | **主人** | 浏览器打开线上首页与 `checkup.html`，肉眼走一遍核心流程 | 页面正常、无红色报错 |
| 6 | **主人** | 截图三张（见 §3.3） | 图内含**地址栏 + 页面** |
| 7 | 我 | 回写 §2.3 实测结果 | 清单闭合 |

> **为什么本次不需要主人上传任何文件**：线上与本地已逐字节一致（§1.3）。
> 若将来 v1.x 确有代码改动，本表第 1 步之后插入「主人上传改动文件」→「我复核线上字节数」两步。

### 3.3 本次交付截图（三张）

| # | 内容 | 要点 |
|---|---|---|
| 1 | **v1.0 公网可访问** | 地址栏可见 + 展墙首页（或检查台四面板全绿） |
| 2 | **回滚前后的提交记录** | `git log` / 控制台更新时间，证明「坏版本 → 退回」确实发生 |
| 3 | **回滚后页面仍正常** | 地址栏可见 + 页面正常（与第 1 张同机位对比更佳） |

---

## 四、发布后逐项验证

| # | 验证项 | 怎么验 | 通过判据 |
|---|---|---|---|
| 1 | 首页可达（**访客视角**） | 真实浏览器打开默认域名（提示页 → 点「确定访问」） | 展墙正常渲染 |
| 2 | 首页可达（**取证视角**） | 带**站内 Referer** 的 curl（§`回滚手册` 6.1） | 200 + 142760 字节 |
| 3 | 检查台可用 | 浏览器打开 `/checkup.html` | 四面板返回真实数据，无 `Failed to fetch` |
| 4 | 四个接口 | 跑 verify-project 的 B1–B5 | 全 PASS |
| 5 | 数据完整 | `GET /api/works` | 85 条，series 合计 85 |
| 6 | 位次未乱 | 检查 `works[].order` | 升序 1–85（热度**不得**改位次） |
| 7 | 检查台回归 | 点 `ADD NOTE` 后连按回车 | **只发 1 个 POST**（BUG-01 修复生效） |

> ⚠️ **第 7 项是「证明修复在线上」的正面验证** —— 光看字节数只能证明「文件是新的」，
> 真按下去不出重复请求，才证明**行为**也换了。

---

## 五、备份方式

### 5.1 代码版本标记

**本次实际执行（2026-10-12）**：

```bash
cd "C:/Users/Henry/Desktop/Vibe coding"

# 1) 用文件写 tag message（避免命令行转义/编码问题）
"C:/Users/Henry/.workbuddy/binaries/node/versions/22.22.2-6/node.exe" -e "
  require('fs').writeFileSync('.git/TAG_MSG_TMP.txt', '...多行内容...', 'utf8')"

# 2) 打附注标签（-a = annotated，带作者/日期/说明）
git tag -a v1.0 -F .git/TAG_MSG_TMP.txt

# 3) 推送标签
GIT_TERMINAL_PROMPT=0 timeout 90 git push origin v1.0
```

**标记对象**（实测值，2026-10-12）

| 项 | 值 |
|---|---|
| 标签名 | `v1.0`（**附注标签**，非轻量标签） |
| 标签对象哈希 | `b69af2631845c504025275b4441435159630d59f` |
| **指向的提交** | `12b61bec5f66e9ee92dd22ca32a354688bfa0b3d`（Day 25c） |
| 远端确认 | `refs/tags/v1.0 = b69af26…`（`git ls-remote --tags origin` 复核） |

> **为什么 v1.0 打在 `12b61be` 而不是收尾提交上**：版本标记的语义是「**线上部署物对应的代码状态**」。
> 线上部署物 = `mvp/` 的内容，与 `12b61be` 逐字节一致；而 Day26 的两份文档是**发布过程记录**，
> 不属于发布物本身。→ 故用「部署物对应的提交」作标记，语义最精确。

**验证标记存在**：
```bash
git tag -l                      # → v1.0
git rev-list -n 1 v1.0          # → 12b61be…（指向的提交）
git ls-remote --tags origin     # → refs/tags/v1.0（确认已到远端；exit code 会骗人，看输出）
```

**「怎么取回上一版」的当场演示**

> ⚠️ **陷阱（2026-10-12 实测踩到，务必先读）**：本仓库 `core.autocrlf=true`
> —— **git 里存的是 LF 版**，`git show` 取出来是 **140280 字节**；
> 而**线上/工作区是 142760 字节**（实测为**混合行尾**：2480 个 `CRLF` + 302 个孤立 `LF`）。
> git 的行尾归一化是**有损**的（只记得「CRLF 可以变 LF」，记不住「哪些 LF 本来没有 `\r`」），
> → **从 git 仓库无法逐字节重建线上文件**。
> → 若拿 `git show` 的产物去和线上比，会得出「标签里的版本 ≠ 线上版本」的**错误结论**。
> （我第一次就差点这么判——见 `Day26-回滚演练记录.md` 的「踩坑实录」。）

**正确的取回方式（按权威性排序）**：

| 优先级 | 来源 | 做法 | 自校验判据 |
|---|---|---|---|
| ① | **线上文件本身**（最权威） | 带站内 Referer `curl -o` 下载 `/` | 142760 B，sha256 以 `2a165ed3b81623be` 开头 |
| ② | **本地工作区文件** | `cp mvp/index.html <目标>` | 同上 |
| ③ | git tag（**仅源码级对照，不可直接上传**） | `git show v1.0:mvp/index.html` | 140280 B（LF 版） |

**本次实际执行（① 线上下载 + 自校验）**：

```bash
cd "C:/Users/Henry/Desktop/Vibe coding"
HOST="art-exhibition-d7ggtul83d566a6c9-1499147979.tcloudbaseapp.com"
curl -s -o _ref/rollback/v1.0-index.html -H "Referer: https://$HOST/" "https://$HOST/"
# 断言：142760 字节 且 sha256 前缀 2a165ed3b81623be 且 与 mvp/index.html 逐字节相等
```

**实测结果**：`142760 / 2a165ed3b81623be2921050531308a57300ce6d80a1ccc7c96f2d5aba9c52d0d` ✅
→ 最终**归档为 `_ref/rollback/v1.0/index.html`**（★ 必须命名为 `index.html`，控制台同名上传才会覆盖线上根文件；理由见回滚手册 §3.2 文件名陷阱）。

> ### ★ 常温储备规则（本次演练推出）
> 静态托管控制台**没有历史版本**，所以「回退弹药」只能平时存：
> **每次发布后立刻从线上 `curl` 一份当前文件 → 存进 `_ref/rollback/<版本>/index.html` → 记下 sha256。**
> 出事那一刻才去找文件，就已经晚了。

### 5.2 数据导出（发布前基线）

| 备份源 | 覆盖 | 位置 | 状态 |
|---|---|---|---|
| **API 只读快照** | `works` 85 条 + `notes` 9 条 | `_ref/backups/v1.0/`（`works-export.json` / `notes-export.json` / `manifest.json`） | ✅ 已建立 |
| **控制台 SQL 导出** | 三表全量（含 `likes`） | 控制台 → SQL 型数据库 → SQL 编辑器 | ⚠ 待执行（第 27 天） |

**生成方式（可复现）**：
```bash
"C:/Users/Henry/.workbuddy/binaries/node/versions/22.22.2-6/node.exe" _ref/backups/export-v1.0.js
```
脚本内置两条硬断言：`works.length === 85`（否则拒绝产出）、notes 扫描 0 失败（否则拒绝产出）——
**宁可没有备份，也不要一份「不完整的备份」**。

> ⚠️ **已知缺口（如实登记）**：`likes` 表**没有任何公开读取入口**
> （`POST /api/like` 是切换式写入，无 GET 全量）。故 API 快照**不含 likes**。
> 要备份 likes，只能走控制台 SQL。此项已记入回滚手册 §5.2。

---

## 六、回滚预案（出事时走这里）

**→ `docs-week4/Day26-回滚手册.md`**

| 层 | 对象 | 手段 | 演练状态 |
|---|---|---|---|
| 第 3 层 | 静态托管文件 | 用上一版文件覆盖上传 | ✅ **2026-10-12 已真实演练成功，耗时 2 分 35 秒**（见 `Day26-回滚演练记录.md`） |
| 第 4 层 | 云函数代码 | 重新部署上一版 zip | ⚠ 手册内容，不实操（原因见手册 §4） |
| 第 5 层 | 数据库数据 | 用发布前备份重新导入 | ⚠ 手册内容，不实操（原因见手册 §5） |

**一句话记住**：**回滚救代码，备份救数据 —— 两件事不能互相顶替。**

---

_创建：2026-10-12（Day 26 · 第 4 周）｜ 版本：v1.0（首个正式版本标记）_
