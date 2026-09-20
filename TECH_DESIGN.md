# TECH_DESIGN.md — Art Exhibition 技术设计

> **Day 5** · 2026-09-20 · 五步工作流第 4 步「技术方案」
> **上游**：`PRD.md` v4（Day 4 定义）· `research.md`（Day 3 研究）
> **下游**：Day 7 MVP 实现
> **仓库**：`github.com/XingHo-VibeCoding/Art-exhibition`
> **本文档语言**：中文（与 PRD / research 一致，便于技术评审阅读）
> **代码语言**：HTML / CSS / 原生 JavaScript（界面文案为英文，见 PRD §6.3）
> **本文档不含业务代码**，只回答「用什么做、为什么、数据怎么流」

---

## 一、这份文档解决什么

`PRD.md` 回答了**「做成什么样算完成」**（74 条验收标准）。
这份文档回答**「用什么做，以及数据怎么走」**。

它要结清一笔旧账：

> `research.md` §八 记下的张力 —— **「单文件零依赖」和「重动效」天生打架。**
> 当时写明：「**今天不解这个取舍，只把它记在纸上**」，判断权留给 Day 5。

**今天就是 Day 5。本节（§三）正式结清这笔账。**

---

## 二、技术路线（一句话）

> **纯前端静态站点：HTML + CSS + 原生 JavaScript + 内联 SVG，零外部依赖、零构建步骤、零后端、零数据库。**

### 2.1 技术栈清单

| 层 | 选择 | 版本 / 来源 | 理由 |
|---|---|---|---|
| **结构** | HTML5 单页 | 手写 | 三屏结构（揭幕 / 展场 / 聚焦），PRD §5.0 |
| **样式** | 原生 CSS3 | 手写 | `@keyframes` / `transform` / `cubic-bezier` / `radial-gradient` 覆盖全部动效与印刷质感 |
| **脚本** | 原生 JavaScript (ES2020+) | 手写，无框架 | 事件绑定、锚点、FLIP 聚焦动画、WAAPI 动画接管 |
| **图形** | 内联 SVG | 手写 | 十字规矩线（P2）、图标。零外部请求 |
| **字体** | 系统字体栈 | `"Helvetica Neue", Helvetica, Arial, "Segoe UI", system-ui, sans-serif` | 不加载网络字体 → 断网可用、零延迟（PRD §6.3） |
| **数据** | 内联 JS 对象（作品清单） | 手写 | 数据量小；无后端（见 §三） |
| **图片** | 本地静态资源 | 仓库内 | 自托管，不外链 |
| **版本控制** | Git + GitHub | 已有 | `github.com/XingHo-VibeCoding/Art-exhibition` |
| **托管** | GitHub Pages（待开启） | 平台能力 | 静态站天然适配，零服务器成本 |
| **构建工具** | **无** | —— | 不需要打包、转译、压缩。改完刷新即见 |
| **包管理器** | **无** | —— | 没有依赖，就不需要 npm |

### 2.2 三条纪律

| # | 纪律 | 对应验收 |
|---|---|---|
| 1 | **零外部请求**：不引 CDN、不引网络字体、不引统计脚本 | AC-38（断网全功能可用）、AC-41（无 404） |
| 2 | **零构建**：文件写完直接打开就能跑，不需要任何命令 | 降低 Day 7 出错面 |
| 3 | **动效曲线全部来自工序**，禁用网页默认缓动 | AC-60 / AC-61 / AC-62 / AC-63 / AC-64 |

---

## 三、★ 结清旧账：单文件零依赖 ↔ 重动效

> **对应 `research.md` §八。这笔账挂了三天，今天判完。**

### 3.1 问题的精确定义

`research.md` 当年的担心是：「真要炫起来，**迟早得引 JS 动画库或 WebGL**」。
所以真正要回答的是：**PRD 里那套动效，浏览器原生能力做不做得到？**

### 3.2 逐条核对：PRD 要求的动效 × 原生能力

| 动效 | PRD 出处 | 原生实现手段 | 判定 |
|---|---|---|---|
| 色块匀速收拢 + 字标压印显影 | §5.1 / §6.5.5 | `transform` + `@keyframes` | ✅ 原生 |
| 背景**网点压印**换版（半调网点由稀到密） | §5.2 / §6.4 P4 | CSS `radial-gradient` 产网点 + `background-size` 动画（详见 3.3） | ✅ 原生 |
| 三块版**依次**到位（主版 → 辅版 → 金属，金属最后） | §6.5.5 / AC-66 | `animation-delay` 串联 | ✅ 原生 |
| 卡片**非均匀错峰**入位（首尾≈中段 2 倍） | §6.5.3 / AC-59 | 错峰数组绑定卡片序号 + `animation-delay` | ✅ 原生 |
| **错版换版**：旧墨侧移 8px 淡出、新墨反向移入归位 | §5.3 | `transform: translateX()` + `opacity` | ✅ 原生 |
| **纸层全程零位移**（纸不动，动的只有墨） | §5.3 / AC-17 | 结构上不给纸层写任何动画 | ✅ 原生 |
| 对位回弹**只回一次**（过冲后回正） | §6.5.4 | `cubic-bezier()` 自定义曲线 | ✅ 原生 |
| 匀速「刮墨」曲线 | §6.5.4 / AC-61 | `linear` | ✅ 原生 |
| 快起急停「压印」曲线（不回弹） | §6.5.4 / AC-62 | `cubic-bezier(0.1, 0.9, 0.2, 1)` 一类 | ✅ 原生 |
| 慢起快走「揭纸」曲线 | §6.5.4 | `cubic-bezier(0.6, 0, 0.85, 0.2)` 一类 | ✅ 原生 |
| 聚焦视图从**网格原位**放大移入（非黑底弹图） | §5.5 / AC-34 | `getBoundingClientRect()` + `transform`（FLIP 手法） | ✅ 原生 |
| 聚焦关闭，反向回到**它原来的位置** | AC-36 / AC-37 | 同上，反向播放 | ✅ 原生 |
| 悬停错版层分离 4–6px，200ms 内合回 | §5.3 静置态 / AC-23 | `:hover` + `transform` + `transition` | ✅ 原生 |
| 滚动时卡片依次浮现 | §5.4 / AC-30 | `IntersectionObserver` + class 切换 | ✅ 原生 |
| 切换动画**进行中再次切换 → 立即接管**（不排队、不卡顿） | §5.3 / AC-21 | Web Animations API：`getComputedStyle()` 读当前值 + `.cancel()` + 重开 | ✅ 原生 |
| **连按 10 次，错峰节奏不塌** | AC-68 | 错峰值绑定**卡片序号**而非点击次数 | ✅ 原生 |
| `prefers-reduced-motion` 退化为「只留高光帧与终态」 | §6.5.6 / AC-39 / AC-69 | `@media (prefers-reduced-motion: reduce)` | ✅ 原生 |
| 主题锚点 `#limbo` + 刷新保持主题 | §5.2 / AC-12 / AC-13 | `location.hash` + `localStorage` | ✅ 原生 |

> **核对结果：PRD 要求的每一项动效，原生 CSS / SVG / 少量原生 JS 均可覆盖。**
> **没有任何一项需要 WebGL、Canvas 或第三方动画库。**

### 3.3 ★ 关键手法：网点压印怎么用 CSS 办到

这是唯一一个「听起来像要画布」的需求——「半调网点由稀到密压印」。

**但 CSS 的 `radial-gradient` 天生就是产网点的：**

```css
/* 网点底：PRD §6.4 P4 要求 7px 间距、13% 墨量 */
.halftone {
  background-image: radial-gradient(circle, currentColor 1.5px, transparent 1.6px);
  background-size: 16px 16px;   /* ← 这个值就是「网点间距」 */
  opacity: .13;                  /* ← 13% 墨量 */
}

/* 换版：网点「由稀到密」压印 = 动画 background-size 从疏到密 */
@keyframes press {
  from { background-size: 40px 40px; }   /* 稀 */
  to   { background-size: 7px 7px;  }    /* 密（PRD 规定的 7px） */
}
```

- **「由稀到密」** → 动画 `background-size`（间距）由大到小
- **「旧墨被刮走」** → `mask-image` 做一道移动的遮罩（刮刀）
- **「13% 墨量」** → `opacity`

**为什么这套工具和这个需求是同一副骨头**：
丝网印刷的半调网点，本来就是**用网格排的**；而 CSS 的 `background-size` **就是网格**。
用画布（Canvas）去画网点，等于用一支笔一格一格描——能做，但没必要；CSS 的网格引擎天生干这个。

### 3.4 被否掉的方案与理由

#### ❌ 方案 B1 · CDN 引入动画库（如 GSAP）

| 项 | 内容 |
|---|---|
| **好处** | 仓库不增体积；时序编排 API 直观 |
| **否决理由 1** | ❌ **违反 AC-38**（断网后动效全失效），这是 PRD 硬约束 |
| **否决理由 2** | ❌ 违反 `PRD.md` B5「某个动效原生 CSS / SVG 确实做不出才引」——核对后确认原生做得出 |
| **否决理由 3** | 引入外部请求 → 增加首屏不确定性（CDN 抖动、版本变更） |
| **判定** | **出局。** 唯一好处（省体积）不值得交换硬约束 |

#### ❌ 方案 B2 · 库文件下载后放进仓库（本地引入 GSAP）

> 这是 B 的**变体**，也是唯一一个"看起来真的可行"的替代方案。所以单独算过细账。

| 项 | 内容 |
|---|---|
| **好处** | ✅ **仍满足 AC-38**（本地文件，断网可用）；AC-21 中途接管、AC-68 连按不塌写起来更顺手 |
| **代价 1** | 仓库 +约 23–70KB 第三方代码 |
| **代价 2** | ★ **四条自定义曲线反而更难**：PRD §6.5.4 要求「刮墨 / 压印 / 对位 / 揭纸」四条来自工序的曲线，GSAP 只有 `linear` 开箱可用，另外三条要引 `CustomEase` 插件手写 |
| **代价 3** | ★ **验收范围扩大**：AC-60 / AC-64 要求「代码检查确认无 `ease` / 弹簧」。用了库之后，这条从「看自己几行 CSS」变成「审一份几十 KB 的第三方实现」 |
| **代价 4** | ★ **世界观相反**：GSAP 的默认缓动模型是 `spring` / `bounce`——**正是 PRD 明令禁止的「软着陆」**。用一个世界观相反的库，再逐条掰回来，比手写更费劲 |
| **关键验证** | AC-21（中途接管）可用 **Web Animations API 原生实现**：`getComputedStyle()` 读当前值 → `.cancel()` 取消 → `animate()` 从当前值续接（约 10 行）<br>AC-68（连按不塌）的关键是**错峰值绑定卡片序号**而非点击次数——**这是设计问题，不是工具问题**，换库也一样要想清楚 |
| **判定** | **净收益为负。** 省下的两项（AC-21 / AC-68）原生已能优雅解决；多付出的两项（自定义曲线、验收范围）是实打实的 |

#### ❌ 方案 C · WebGL / Three.js

| 项 | 内容 |
|---|---|
| **否决理由 1** | ❌ 违反 AC-38（断网失效） |
| **否决理由 2** | ❌ **违背 PRD 的美学立场**（这是根本原因）：<br>· §5.3 明令「**纸不动，动的只有墨**」——WebGL 的强项是全画面渲染，方向正相反<br>· §6.4 的印刷物证（P1 错版 2–4px / P4 网点 7px·13% / P5 85% 实地墨）在逐像素渲染里反而更难精确控制<br>· 动势卡原则「**背景尽量不动，倾斜才有参照**」 |
| **判定** | **出局。** 不是做不到，是**它讲的是另一个语言**——本站要的是「一张纸上的墨」，不是「一块屏幕里的空间」 |

### 3.5 结论：张力消解

> **当年「迟早得引库」的担心，是在没有逐条核对动效规格时写下的。**
> **今天逐条核完了：PRD 的每一项动效都落在原生能力之内。担心没有成立。**
>
> 因此 `research.md` §八 的张力**不是被妥协掉的，是被核对掉的**——
> `PRD.md` B5 与 `BL-4` 写下的触发条件（「某个动效原生确实做不出」）**至今未触发**。

**并且：选原生不只是「最省」，更是「最对」。**

| 维度 | 原生 CSS / SVG | 第三方动画库 |
|---|---|---|
| **语汇是否同构** | ✅ **平面、有限、物理** —— 和「墨 / 版 / 纸」的印刷语汇同构 | ⚠️ 默认世界观是「自然物理运动」（spring / bounce） |
| **曲线来源** | ✅ 直接写 `cubic-bezier`，与工序一一对应 | ⚠️ 要覆盖库的默认值 |
| **每毫秒可知** | ✅ 知道自己写的哪一行在动 | ⚠️ 部分行为在库内部 |
| **验收成本** | ✅ 审自己的代码 | ⚠️ 审第三方实现 |

> **一句话**：用原生不是"退而求其次"，是因为**这套工具的形状，和这场展览要讲的语言，恰好是同一个形状**。

---

## 四、数据流图

### 4.1 一句话说清

> **数据从「作者本地的一批图片和一份手写清单」出发，被组装成页面文件，经 GitHub 送到观众浏览器，在本地渲染成一场展览。全程没有任何服务器在运行时参与。**

### 4.2 图（主图 · 内联 SVG）

> 下图内嵌在本文档中，可直接截图用于交付。

<svg viewBox="0 0 900 520" width="100%" role="img" xmlns="http://www.w3.org/2000/svg">
  <title>Art Exhibition 数据流图</title>
  <desc>作品图片与作品清单在作者本地组装成站点文件，推送到 GitHub 仓库，经 GitHub Pages 分发给观众浏览器，在浏览器内渲染成展览。本地预览路径与发布路径并行，不经过任何服务器端逻辑。</desc>
  <defs>
    <marker id="ar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M2 1L8 5L2 9" fill="none" stroke="#5F5E5A" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    </marker>
    <marker id="ar2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M2 1L8 5L2 9" fill="none" stroke="#185FA5" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    </marker>
  </defs>

  <text x="30" y="34" font-family="system-ui,-apple-system,sans-serif" font-size="17" font-weight="500" fill="#2C2C2A">Art Exhibition · 数据流图</text>
  <text x="30" y="56" font-family="system-ui,-apple-system,sans-serif" font-size="12" fill="#5F5E5A">实线 = 发布路径（上线）　虚线 = 本地预览路径（写代码时）</text>

  <rect x="30" y="76" width="840" height="180" rx="16" fill="#F1EFE8" stroke="#B4B2A9" stroke-width="0.5"/>
  <text x="50" y="100" font-family="system-ui,-apple-system,sans-serif" font-size="13" font-weight="500" fill="#444441">① 作者侧（本地电脑 C:\Users\Henry\Desktop\Vibe coding）</text>

  <g>
    <rect x="50" y="116" width="185" height="72" rx="10" fill="#FAEEDA" stroke="#BA7517" stroke-width="0.5"/>
    <text x="142" y="140" font-family="system-ui,-apple-system,sans-serif" font-size="13" font-weight="500" fill="#412402" text-anchor="middle" dominant-baseline="central">作品图片</text>
    <text x="142" y="160" font-family="system-ui,-apple-system,sans-serif" font-size="11" fill="#854F0B" text-anchor="middle" dominant-baseline="central">2:3 竖版 · PNG</text>
    <text x="142" y="176" font-family="system-ui,-apple-system,sans-serif" font-size="11" fill="#854F0B" text-anchor="middle" dominant-baseline="central">6 个系列</text>
  </g>

  <g>
    <rect x="255" y="116" width="185" height="72" rx="10" fill="#FAEEDA" stroke="#BA7517" stroke-width="0.5"/>
    <text x="347" y="140" font-family="system-ui,-apple-system,sans-serif" font-size="13" font-weight="500" fill="#412402" text-anchor="middle" dominant-baseline="central">作品清单</text>
    <text x="347" y="160" font-family="system-ui,-apple-system,sans-serif" font-size="11" fill="#854F0B" text-anchor="middle" dominant-baseline="central">内联 JS 对象</text>
    <text x="347" y="176" font-family="system-ui,-apple-system,sans-serif" font-size="11" fill="#854F0B" text-anchor="middle" dominant-baseline="central">名 / 系列 / 编号</text>
  </g>

  <g>
    <rect x="460" y="116" width="185" height="72" rx="10" fill="#FAEEDA" stroke="#BA7517" stroke-width="0.5"/>
    <text x="552" y="140" font-family="system-ui,-apple-system,sans-serif" font-size="13" font-weight="500" fill="#412402" text-anchor="middle" dominant-baseline="central">三块印版规格</text>
    <text x="552" y="160" font-family="system-ui,-apple-system,sans-serif" font-size="11" fill="#854F0B" text-anchor="middle" dominant-baseline="central">PRD §6.1 六套主题色</text>
    <text x="552" y="176" font-family="system-ui,-apple-system,sans-serif" font-size="11" fill="#854F0B" text-anchor="middle" dominant-baseline="central">写进 CSS 变量</text>
  </g>

  <g>
    <rect x="665" y="116" width="185" height="72" rx="10" fill="#E1F5EE" stroke="#0F6E56" stroke-width="0.5"/>
    <text x="757" y="140" font-family="system-ui,-apple-system,sans-serif" font-size="13" font-weight="500" fill="#04342C" text-anchor="middle" dominant-baseline="central">站点文件</text>
    <text x="757" y="160" font-family="system-ui,-apple-system,sans-serif" font-size="11" fill="#0F6E56" text-anchor="middle" dominant-baseline="central">index.html</text>
    <text x="757" y="176" font-family="system-ui,-apple-system,sans-serif" font-size="11" fill="#0F6E56" text-anchor="middle" dominant-baseline="central">+ images/</text>
  </g>

  <path d="M235 152 L249 152" fill="none" stroke="#5F5E5A" stroke-width="1.4" marker-end="url(#ar)"/>
  <path d="M440 152 L454 152" fill="none" stroke="#5F5E5A" stroke-width="1.4" marker-end="url(#ar)"/>
  <path d="M645 152 L659 152" fill="none" stroke="#5F5E5A" stroke-width="1.4" marker-end="url(#ar)"/>
  <text x="50" y="218" font-family="system-ui,-apple-system,sans-serif" font-size="12" fill="#444441">四种原料在这里被「组装」成一份可直接打开的印张 —— 没有编译、没有打包。</text>
  <text x="50" y="240" font-family="system-ui,-apple-system,sans-serif" font-size="12" fill="#444441">■ 关键：图片与清单是「数据」，index.html 是「载体」，两者都是文件，谁也不用请求谁。</text>

  <rect x="30" y="276" width="840" height="120" rx="16" fill="#E6F1FB" stroke="#85B7EB" stroke-width="0.5"/>
  <text x="50" y="300" font-family="system-ui,-apple-system,sans-serif" font-size="13" font-weight="500" fill="#042C53">② 发布侧（GitHub · 运行时唯一的「中转站」）</text>

  <g>
    <rect x="60" y="316" width="230" height="60" rx="10" fill="#FFFFFF" stroke="#378ADD" stroke-width="0.5"/>
    <text x="175" y="338" font-family="system-ui,-apple-system,sans-serif" font-size="13" font-weight="500" fill="#0C447C" text-anchor="middle" dominant-baseline="central">Git 仓库 · main 分支</text>
    <text x="175" y="358" font-family="system-ui,-apple-system,sans-serif" font-size="11" fill="#185FA5" text-anchor="middle" dominant-baseline="central">github.com/.../Art-exhibition</text>
  </g>

  <path d="M290 346 L344 346" fill="none" stroke="#185FA5" stroke-width="1.6" marker-end="url(#ar2)"/>

  <g>
    <rect x="354" y="316" width="230" height="60" rx="10" fill="#FFFFFF" stroke="#378ADD" stroke-width="0.5"/>
    <text x="469" y="338" font-family="system-ui,-apple-system,sans-serif" font-size="13" font-weight="500" fill="#0C447C" text-anchor="middle" dominant-baseline="central">GitHub Pages 托管</text>
    <text x="469" y="358" font-family="system-ui,-apple-system,sans-serif" font-size="11" fill="#185FA5" text-anchor="middle" dominant-baseline="central">把文件发出去（待开启）</text>
  </g>

  <text x="614" y="340" font-family="system-ui,-apple-system,sans-serif" font-size="12" fill="#185FA5" dominant-baseline="central">→ 只发文件，不跑程序</text>
  <text x="614" y="360" font-family="system-ui,-apple-system,sans-serif" font-size="12" fill="#185FA5" dominant-baseline="central">　（无后端逻辑）</text>

  <rect x="30" y="416" width="840" height="90" rx="16" fill="#E1F5EE" stroke="#0F6E56" stroke-width="0.5"/>
  <text x="50" y="440" font-family="system-ui,-apple-system,sans-serif" font-size="13" font-weight="500" fill="#04342C">③ 观众侧（浏览器 · 终点，也是唯一「运行程序」的地方）</text>

  <g>
    <rect x="60" y="456" width="200" height="40" rx="10" fill="#FFFFFF" stroke="#1D9E75" stroke-width="0.5"/>
    <text x="160" y="476" font-family="system-ui,-apple-system,sans-serif" font-size="12" fill="#0F6E56" text-anchor="middle" dominant-baseline="central">下载全部文件</text>
  </g>

  <path d="M270 476 L304 476" fill="none" stroke="#0F6E56" stroke-width="1.6" marker-end="url(#ar2)"/>
  <path d="M314 476 L348 476" fill="none" stroke="#0F6E56" stroke-width="1.6" marker-end="url(#ar2)"/>

  <g>
    <rect x="358" y="456" width="200" height="40" rx="10" fill="#FFFFFF" stroke="#1D9E75" stroke-width="0.5"/>
    <text x="458" y="476" font-family="system-ui,-apple-system,sans-serif" font-size="12" fill="#0F6E56" text-anchor="middle" dominant-baseline="central">JS 读清单，渲染卡片</text>
  </g>

  <path d="M568 476 L602 476" fill="none" stroke="#0F6E56" stroke-width="1.6" marker-end="url(#ar2)"/>

  <g>
    <rect x="612" y="456" width="230" height="40" rx="10" fill="#C0DD97" stroke="#639922" stroke-width="0.5"/>
    <text x="727" y="476" font-family="system-ui,-apple-system,sans-serif" font-size="12" font-weight="500" fill="#173404" text-anchor="middle" dominant-baseline="central">看到展览（以本地文件运行）</text>
  </g>

  <path d="M780 400 L780 240 L790 240" fill="none" stroke="#888780" stroke-width="1.2" stroke-dasharray="5 4"/>
  <path d="M790 240 L790 200" fill="none" stroke="#888780" stroke-width="1.2" stroke-dasharray="5 4" marker-end="url(#ar)"/>
  <text x="700" y="430" font-family="system-ui,-apple-system,sans-serif" font-size="11" fill="#5F5E5A">虚线：写代码时直接</text>
  <text x="700" y="446" font-family="system-ui,-apple-system,sans-serif" font-size="11" fill="#5F5E5A">双击 index.html 预览</text>
</svg>

### 4.3 图（简版 · 只读一段话）

> 若只需口头说清，用这一句：

```
本地图片 + 本地清单
      ↓ 组装（无编译）
   index.html（含 CSS/JS/图片）
      ↓ git push
   GitHub 仓库
      ↓ 分发（GitHub Pages）
   观众浏览器
      ↓ 在本地执行 JS
   渲染成展览
```

**一段话版本：**

> **从哪来**：作品图片和我手写的作品清单，都在我电脑的本地文件夹里。
> **到哪去**：它们被组装成一个 `index.html`（连样式、脚本、图片一起），推送到 GitHub，由 GitHub Pages 分发给观众。
> **观众打开链接时**：浏览器把整个页面下载到本地，**由浏览器自己执行 JS、渲染出展览**。服务器只负责「发文件」，从头到尾**不运行任何业务程序**，也没有数据库。

### 4.4 数据流图的四个关键判定

| # | 判定 | 依据 |
|---|---|---|
| 1 | **数据是静态的**：作品清单以 JS 对象形式写死在页面里，不来自服务器查询 | 无后端（§五）；数据量 6 系列，更新频率季度级（`research.md` §三） |
| 2 | **GitHub 不参与运行**：它只是「文件分发」。页面打开后，GitHub 就下班了 | 静态站本质。页面运行不依赖任何服务在线 |
| 3 | **浏览器是唯一的「执行者」**：所有动效、切换、渲染都发生在观众设备上 | 零依赖 → AC-38（断网仍可用，文件已在本地） |
| 4 | **有一条并行短路径**：开发时作者直接双击 `index.html`，**跳过 GitHub**。这就是 AC-38「断网可用」的来源 | 零构建 → 文件即成品 |

---

## 五、前后端与数据库分工

### 5.1 三者的职责边界

| 角色 | 职责 | 类比 |
|---|---|---|
| **前端** Frontend | 人在屏幕上看到与操作的一切 | 餐桌、菜单、装修 |
| **后端** Backend | 运行在服务器上、处理请求与逻辑 | 后厨。接单、炒菜、定规矩 |
| **数据库** Database | 存放数据，可查、可增、可改、可删 | 冷库。食材存在那儿 |

**为什么必须分开**：它们的**变化速度**不同。改菜单不必动后厨，换菜谱不必换桌椅。分工的本质是**把「会变的东西」隔开**。

**三者永不越界**：前端不直接碰数据库（中间必有后端）；后端不画界面（只回数据）；数据库不懂业务（只认增删改查）。

### 5.2 本站的判定：一个都不要

| 三兄弟 | 本站需要吗 | 判定依据 |
|---|---|---|
| **前端** | ✅ **全部工作在这儿** | PRD 74 条验收中，绝大多数是前端的事 |
| **后端** | ❌ **不需要** | 无登录、无上传、无实时数据。观众点开就是看，没有「要服务器替他办的事」 |
| **数据库** | ❌ **不需要** | 6 个系列、每系列十余张图，数据量小到可直接写在 HTML 里 |

**这个选择有名字，叫「静态站」（Static Site）——它不等于「简化版」。**

> **类比**：本站是**一家只有一个摊位的面馆**——老板既是厨子也是伙计，客人点单当场就下锅，中间不需要传菜员。
> 大网站必须分三层，是因为它有 100 张桌子，不分开谁也忙不过来。

### 5.3 这个选择的代价（诚实记录）

| | 有数据库 | 本站（无数据库） |
|---|---|---|
| 加一张新作品 | 后台点几下 | **手工编辑数据文件** |
| 谁承担这个代价 | 已被 PRD 决策过 | |

> **代价已被 PRD 提前付清**：`PRD.md` A4 判定「作品增删频率极低，手工维护即可」；`BL-8` 已写好升级条件——「**作品更新频率高到手改数据成为负担**」时，再考虑轻量内容管理。
> 因此本节不是重新讨论，是**确认这个判定成立**。

### 5.4 三者的最终分工图（一屏看完）

| 环节 | 谁负责 | 本站的具体形态 |
|---|---|---|
| 数据存放 | ~~数据库~~ | **作品清单（内联 JS 对象）+ 图片文件** |
| 业务逻辑 | ~~后端~~ | **无**。规则全部写在 CSS / JS 里，在浏览器执行 |
| 呈现与交互 | **前端** | HTML 结构 + CSS 动效 + JS 交互 |
| 分发 | ~~服务器程序~~ | **GitHub Pages**（只发文件） |

> **一句话结论**：**本站把「后端 + 数据库」这两层压缩进了「一个静态文件」。**
> 不是因为做不了，是因为**这个规模不需要**——而 PRD 已经把数据规模与更新频率作为判据写进了决策。

---

## 六、目录结构规划（Day 7 依此落地）

```
Art-exhibition/
├── index.html          # 唯一页面（结构 + 样式 + 脚本）
├── images/             # 作品图片，按系列分目录
│   ├── sleight/
│   ├── unreal/
│   ├── limbo/
│   ├── world-line/
│   ├── fifty-two/
│   └── arcana/
├── PRD.md              # Day 4 产出
├── TECH_DESIGN.md      # Day 5 产出（本文档）
├── research.md         # Day 3 产出
└── AGENTS.md           # 项目规则
```

**关于「单文件 vs 拆文件」**：本版**样式与脚本内联在 `index.html` 中**——这是 PRD B5「零依赖」的最直接体现，也让断网可用性不依赖任何路径正确性。
若 Day 7 内联体积过大影响维护，可按 `BL-4` 的触发条件评估拆分，但**拆分不增加依赖**（只是把内联拆成同目录的 `style.css` / `app.js`）。

---

## 七、技术决策记录（Decision Log）

| # | 决策 | 结论 | 理由 | 落实 |
|---|---|---|---|---|
| **TD-1** | 前端框架 | **不用**（原生） | 三屏单页，无路由、无状态管理需求。框架解决的问题本站一个都没有 | §2.1 |
| **TD-2** | 构建工具 | **不用** | 文件即成品。零构建 = 少一层出错的地方 | §2.2 |
| **TD-3** | 动画库 | **不引**（原生 CSS + WAAPI） | ★ 见 §三：逐条核对后确认原生可覆盖；GSAP 世界观（spring/bounce）与 PRD §6.5.4 相反 | §3.5 |
| **TD-4** | 后端 | **不要** | 无服务端逻辑需求 | §5.2 |
| **TD-5** | 数据库 | **不要** | 数据规模小、更新频率低（PRD A4 / BL-8） | §5.2 |
| **TD-6** | 字体 | **系统字体栈** | 断网可用、零加载延迟 | §2.1 |
| **TD-7** | 网点压印实现 | **CSS `radial-gradient` + `background-size` 动画** | 网格引擎天生产网点；无需 Canvas | §3.3 |
| **TD-8** | 中途接管（AC-21） | **Web Animations API** | `getComputedStyle` + `.cancel()` + 续接；原生即为此设计 | §3.2 |
| **TD-9** | 错峰不均匀（AC-59/68） | **错峰数组绑定卡片序号** | 抗连按的关键在「绑定序号」而非点击次数——设计问题，非工具问题 | §3.2 |
| **TD-10** | 托管 | **GitHub Pages** | 静态站天然适配，零成本。需在 GitHub 手动开启（Day 7 或之后） | §4.2 |

---

## 八、与 PRD 的一致性核对

> 本文档的每一条选择，都必须能对回 PRD 的约束。逐条核过：

| PRD 约束 | 本文档的落实 | 状态 |
|---|---|---|
| AC-38 断网全功能可用 | 零依赖 + 零构建（§2.2） | ✅ |
| B5 能原生解决就绝不引 | 逐条核对确认原生可覆盖（§3.2） | ✅ |
| §5.3 纸不动，动的只有墨 | 结构上不给纸层写动画（§3.2） | ✅ |
| §6.5.4 禁用 ease / 弹簧 | 自定义 `cubic-bezier` 四条工序曲线（§3.2） | ✅ |
| AC-21 中途接管 | WAAPI（TD-8） | ✅ |
| AC-59 / AC-68 错峰不均匀、连按不塌 | 错峰数组绑定序号（TD-9） | ✅ |
| AC-39 / AC-69 减少动态效果 | `@media (prefers-reduced-motion)` | ✅ |
| §6.3 不指定字体但须轻量、无花体 | 系统字体栈（TD-6） | ✅ |
| §6.4 P4 网点 7px / 13% | CSS 网点方案（TD-7） | ✅ |
| A4 无后台，手工维护 | 无数据库，清单内联（TD-5） | ✅ |

**未发现冲突。** 本文档与 `PRD.md` v4 无抵触项。

---

## 九、下一步（Day 7 交接）

| 步骤 | 产出 | 前置 |
|---|---|---|
| Day 6 | （按当日清单） | —— |
| Day 7 | MVP 实现 | 本文档 §2 技术栈 + §4 数据流 + PRD §10 的 74 条验收 |

**交接给 Day 7 的三条提醒：**

> 1. **先把数据流走通，再加动效。** 顺序：清单 → 渲染卡片 → 揭幕 → 换版 → 换印 → 聚焦。**数据流是骨架，动效是肌肉。**
> 2. **AC-17（纸不动，墨动）、AC-39（减少动态效果）、AC-57（高光 ≤10%）、AC-59（错峰不均匀）** 是 PRD 点名的四条"漏掉就退化"的验收——写的时候就照它们写，别等最后补。
> 3. **不要引入任何外部文件。** 一旦引了第一个，AC-38 就没了。

---

*最后更新：2026-09-20 · Day 5*
