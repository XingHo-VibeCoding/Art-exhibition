---
name: verify-project
description: ART EXHIBITION 项目的发布前检查。每次改完代码、每次发布前运行，逐项输出 PASS/FAIL 与证据。检查项来自 Day 15–24 真实踩过的坑——公网可达、健康接口、读写接口、硬编码密钥、Git 安全、数据库通路。当用户说「运行 verify-project」「发布前检查」「上线前过一遍」时使用。
---

# verify-project · 发布前检查

> 这个 Skill 是把 Day 15–24 的检查经验从"人脑"搬进"文件"。
> 人会忘，文件不会。**每次改完代码 / 每次发布前，跑一遍。**

## 怎么调用（自足说明 · 新对话直接可跑）

用户只说一句 **「运行 verify-project」** 即可。AI 按下方步骤执行，**不需要追问额外上下文**：

```bash
# 第 1 步：刷新 Git 快照（必须先做，检查脚本读它）
cd "C:/Users/Henry/Desktop/Vibe coding" && bash _ref/verify/refresh-git-snapshot.sh

# 第 2 步：运行检查
"C:/Users/Henry/.workbuddy/binaries/node/versions/22.22.2-6/node.exe" _ref/verify/run-checks.js
```

- **加 `--json`** 只输出 JSON（便于二次处理）。
- 退出码：`0` = 全 PASS，`1` = 有 FAIL，`2` = 脚本自身异常。

### 关键事实表（新对话照此执行，无需再探查）

| 项 | 值 |
|---|---|
| **项目根目录** | `C:/Users/Henry/Desktop/Vibe coding` |
| **检查脚本** | `_ref/verify/run-checks.js`（本机已存在） |
| **快照脚本** | `_ref/verify/refresh-git-snapshot.sh`（本机已存在） |
| **Node 可执行文件** | `C:/Users/Henry/.workbuddy/binaries/node/versions/22.22.2-6/node.exe` |
| **云函数基地址** | `https://art-exhibition-d7ggtul83d566a6c9.service.tcloudbase.com` |
| **静态托管地址** | `https://art-exhibition-d7ggtul83d566a6c9-1499147979.tcloudbaseapp.com/` |
| **Referer 取值（A1 关键）** | 静态托管地址本身（尾带 `/`）——即 `https://art-exhibition-d7ggtul83d566a6c9-1499147979.tcloudbaseapp.com/` |
| **期望作品数** | `85`（`works` 表真实行数，Day 16 灌入） |
| **写接口靶子** | `workId = theology-01-0x0`（该作品感想基线 0 条，便于净残留核对） |

> ⚠️ **本机环境铁律**：Node 的 `execFileSync` / `execSync` 包 `git` / `curl` 一律 **EBUSY 或不回结果**
> （`spawnSync C:\WINDOWS\system32\cmd.exe EBUSY`）。
> → 故 git 查询由 Bash 脚本直跑落盘，HTTP 请求用**纯 Node `https` 模块**。
> **脚本内绝不 spawn 任何子进程** —— 这是 Day 25 实测踩了两次坑后才定下的。
>
> 另一条：**`/tmp` 路径在 Git Bash 与 Node 之间不通用** —— 中间产物一律落 `_ref/verify/out/`。

---

## 检查项（13 项 · 每项判据可被证伪）

| ID | 检查项 | 怎么算通过（可证伪判据） | 出处（真踩过的坑） |
|---|---|---|---|
| **A1** | 公网首页可访问 | 带**站内 Referer** → HTTP 200 且 >50KB 且含 `Art Exhibition` 且非提示页 | Day 23 铁律：裸请求 200 = 假 PASS |
| **A1b** | 静态资源可达 | 作品图与背景图均 200 且 >10KB | Day 25：凭记忆写路径 → 404（漏报反面教材） |
| **A2** | 首页渲染完整 | `mvp/index.html` 的 `images/` 引用 ≥80 且 4 个展厅名全命中 | §5 映射表 |
| **B1** | `/api/health` 正常 | 200 且 `ok===true` 且 `service==='art-exhibition'` | Day 15 起第一枪 |
| **B2** | `/api/works` 读接口 | 200 且 `ok===true` 且 `works.length===85` 且 `series` 四厅 count 合计 85 | Day 24：探针凭记忆写形状 → 7 个假 FAIL |
| **E1** | 数据库可达（间接） | 经 `/api/works` 取回 85 条真实明细 | 本机无法直连 PG，故为**间接**验证（如实标注） |
| **B3** | `/api/note` 读列表 | 200 且 `ok===true` 且 `notes` 是数组 且 `total` 是数字 | §4.5 |
| **B4** | `/api/like` toggle | 同 payload 连发两次：`liked` true→false 且 `likes` −1（净影响 0） | §4.2 toggle 语义 + 自清理 |
| **B5** | `/api/note` 增删闭环 | POST 建 → GET 查得到 → DELETE 掉 → **再 GET 查不到**（净残留 0） | §4.7 零残留纪律 |
| **C1** | 无硬编码密钥（工作区） | 扫 135 个跟踪文件，`sk-` / `Bearer sk-` / `CLOUDBASE_API_KEY=` 真实值 → **0 命中** | Day 23：`sk-` 三处命中已逐条证伪 |
| **C2** | 无密钥进 Git 历史 | **历史文本非空** 且 全历史扫描 → 0 命中（空扫描直接 FAIL，见元检查一节） | §八 v1.9：18 提交双向 0 命中 ｜ Day 25：坏 ref 导致空扫描假 PASS |
| **D1** | `.gitignore` + `.env.example` | `.gitignore` 覆盖 `.env` 且存在 `cloud/.env.example` 且示例无真实值 且 `.env` 未被跟踪 | AGENTS.md 第五节 |
| **D2** | Git 工作区干净 | `git status --porcelain` 输出为空 | 发布纪律 |

### 输出格式（样例）

```
════════ verify-project ════════
环境：art-exhibition-d7ggtul83d566a6c9
时间：2026/10/11 20:23:55
────────────────────────────────
[A1] 公网首页可访问        PASS  证据：HTTP 200 / 139.4KB / 含"Art Exhibition"=true
[A1b] 静态资源可达        PASS  证据：作品图 200 783KB ｜ 背景图 200 9836KB
...
[C1] 无硬编码密钥(工作区)  FAIL  证据：扫描 135 个跟踪文件 / 命中 1 处
        checkup.html :: sk- 长串 ×1 → sk-verifyprobe…（当场真实串）
────────────────────────────────
合计 12 PASS / 1 FAIL ｜ 结论：❌ 未通过发布检查
```

**每条后面必须跟证据（数字、字节数、命中数）——禁止空口 PASS，禁止「看起来正常」。**

---

## ★ 默认域名的「提示页」机制（Day 25 完整解开）

Day 23 只知道"带导航头会看到 404 + 提示页"，但**根因在 Referer**。Day 25 实验矩阵结论：

| 请求特征 | 返回 | 含义 |
|---|---|---|
| 全裸（无任何头） | **200 + 真实页面** | 放行 |
| 导航头，无 Referer | **404 + 18KB 提示页** | 拦截 |
| 只带**站内** Referer | **200 + 真实页面** | 放行 |
| 导航头 + **站内** Referer | **200 + 真实页面** | 放行 |
| 导航头 + **站外** Referer | **404 + 18KB 提示页** | 拦截 |

> **机制**：网关按 Referer 判定「是否站外直接导航」。
> - 无 Referer（裸请求/API）→ 放行
> - Referer = 本站（站内跳转）→ 放行
> - 带导航语义且 Referer 为站外/缺失 → 拦截
>
> 这解释了真实浏览器为什么看到提示页：**首次访问带导航语义但无站内 Referer** → 被拦；
> **点「确定访问」后带上站内 Referer** → 放行。
>
> **给同伴的第一句话仍是**：「先点『确定访问』」——否则他会把 404 回报成"打不开"。
> **根治 = 绑自定义域名**（`https://docs.cloudbase.net/service/alias`）。

---

## 故意弄坏实验（证明秤不是摆设）

Day 25 实测记录：往 `checkup.html` 注入一行假密钥
`<script>const LEAKED_API_KEY = "sk-<此处为 26 位探测串>";</script>`
（**本文件不写完整串** —— 否则 C2 会扫到本文件自身。演示串只存在于实验当场，事后一律脱敏。）

| 项 | 好状态 | 坏状态 | 说明 |
|---|---|---|---|
| **C1** | PASS（0 命中） | **FAIL（命中 1 处）** | 精确指出文件与内容 |
| **C2** | PASS | PASS | ✅ 正确 —— 假密钥**未提交**，不在历史里（判据精准，不误报） |
| **D2** | PASS | **FAIL（1 文件未提交）** | 附带抓到工作区不干净 |

**三条判据各司其职、互不污染** —— 这正是"判据指向机制"的体现：
C1 管"当前文件"、C2 管"历史"、D2 管"工作区"。

**为什么要做这个实验**：只在失败路径生效的检查，无法证明"换了"。
「works 返回 85 条」只能证明**无回归**，不能证明**检查生效**。
**要证明秤是真的，只能真触发一次失败路径。**

---

## 密钥扫描白名单机制（Day 25 建立）

C1 / C2 支持一张**精确形状白名单**（`SECRET_WHITELIST`，定义在 `run-checks.js`），
用于排除「形状像密钥、但已逐条查证为无害」的串 —— 避免检查长期红着、失去意义。

**白名单纪律（三条，不可放松）**

1. **只认精确形状** —— 用固定的字面前缀 + 字符类精确匹配，**不做模糊放过**。
2. **每条必须写明「为什么无害」与追认日期**。
3. **真凭据永不入白名单** —— 只能从代码与历史里彻底移除，白名单不是"消音器"。

### 现有条目（1 条）

| 形状 | 来源 | 为什么无害 |
|---|---|---|
| `sk-verifyprobe` + 连续 0 | Day 25 故意弄坏实验的探测串 | **从未是任何服务的真实凭据**，是我为验证 C1 判据当场编造的占位串 |

> ⚠️ **历史遗留说明**：该串曾被写入本文件并提交（commit `899ba9d`），随后在工作区脱敏。
> 因仓库为公开仓库、且该串**非真凭据**，判定**无需改写历史**（改写公开仓库历史的代价远大于收益，
> 且违反 AGENTS.md「禁止强制推送」）。此处如实登记，不隐藏。

### 白名单自身的回归测试

白名单最大的风险是「把真密钥也放过」。故配了**逆向回归测试**（`_ref/verify/whitelist-regression.js`）：

```bash
"C:/Users/Henry/.workbuddy/binaries/node/versions/22.22.2-6/node.exe" _ref/verify/whitelist-regression.js
```

5 条用例，**含 4 条"必须仍被抓住"的逆命题**（真实形状 / 相似但不精确 / 前缀不同 / Bearer 真密钥）
—— 只有「探测串」一条允许放过。**实测 5 PASS / 0 FAIL。**

> 测试原则同 Day 23：**只测"该放过的放过了"不够，必须测"该抓的还抓得住"** ——
> 前者证明白名单生效，后者证明**判据锐度没有降低**。

---

## ★★ 元检查：防止「扫描对象为空」造成的假 PASS（Day 25 真实踩坑）

**这是今天最值钱的一条判据。**

### 事故经过

Day 25 收尾时，`refs/remotes/origin/main` 这个 git 引用文件里被写入了一个
**7 位短 hash**（`26435ec`，正常应为 40 位）。git 的 ref 文件**必须存完整 hash**，
于是：

```
git log -p --all  →  fatal: bad object refs/remotes/origin/main
                  →  输出为空
                  →  _history.txt 0 字节
                  →  C2 扫描 0 字节 → **表面 PASS，实际什么都没查**
```

**这是最危险的一类失效**：它**不报错**，只是悄悄不再工作。
如果只看报告，你会以为"C2 通过" —— 而它要么从没工作过，要么早已停摆。

### 修法（两道防线）

| 防线 | 位置 | 做法 |
|---|---|---|
| **上游拦截** | `refresh-git-snapshot.sh` | `git log -p --all` 失败时**显式报警**；历史文本 0 字节时打印警告 |
| **下游判据** | `run-checks.js` 的 `checkC2()` | `historyScan.length === 0` → **直接判 FAIL**，并提示"常见原因 = git 引用损坏" |

### 为什么不能只靠"命中 0 处 = PASS"

> **「查了、没找到」与「根本没查」必须是两个结论。**
> 前者是 PASS，后者是 FAIL。若二者都显示 PASS，这条检查就退化成了摆设。

**证伪测试（Day 25 实测）**：把快照里 `historyScan` 置空 → C2 立刻 **FAIL** 并给出
「⚠ 扫描对象为空（历史文本 0 字节）→ 无法证明查过任何东西 = 假 PASS」；
恢复真实快照 → C2 回 PASS（811KB / 0 命中）。

### 一般化（这条可以迁移到任何检查项）

**凡是"扫描 / 遍历 / 统计"类的判据，都必须先断言「扫描对象非空」。**
否则一旦上游数据源坏掉，检查会从 FAIL 静默退化成 PASS —— 而这比一直 FAIL 危险得多。

---

## 已知局限（如实标注，不装）

1. **E1 是间接验证** —— 本机无服务端 API Key，不能直连 PG。「数据库可连接」只能靠
   `/api/works` 返回真实数据来**间接**证明。报告里已标 `[间接验证]`。
2. **A2 不能验"数据来自数据库"** —— 展墙 `mvp/index.html` 的数据当前**写死在文件里**（零 API 调用），
   A2 只能验"页面渲染完整"。要真验数据同源，得等展墙接上 API。
3. **提示页依赖 Referer 放行** —— 未绑自定义域名前，这是默认域名的既有行为。
4. **B4/B5 会真写数据库** —— 但都有**自清理**（like 连发两次 toggle 回原值；note 建完即删），
   净残留 = 0。若不希望任何写操作，可跳过 B4/B5（删掉主流程里两行调用即可）。

---

## 文件结构

```
项目根/
├─ _ref/verify/                       ← 不进仓库（.gitignore 已挡 _ref/）
│   ├─ run-checks.js                  ← 检查脚本（纯 Node，不 spawn）
│   ├─ refresh-git-snapshot.sh        ← Git 快照导出（Bash 直跑）
│   └─ out/                           ← 中间产物（快照 json / 响应缓存）
├─ docs-week4/
│   └─ verify-project.SKILL.md        ← 本文件正本（入库）
└─ .workbuddy/skills/verify-project/
    └─ SKILL.md                       ← 运行时副本（.workbuddy 不进仓库）
```

**为什么正本在 `docs-week4/`**：`.workbuddy/` 与 `_ref/` 都在 `.gitignore` 里，
若只放那两处则**无法入库**，而今日完成标准要求"Skill 文件已入库"。

---

_创建：2026-10-11（Day 25 · 第 4 周）｜ 检查项来源：Day 15–24 真实踩坑记录_
