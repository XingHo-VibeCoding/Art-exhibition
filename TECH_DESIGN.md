# TECH_DESIGN.md — Art Exhibition 动态印刷剧场技术方案

> 试行版 · 2026-09-22
> 本文替换旧版“原生 CSS + 零依赖”方案，作为 GSAP + Vite 实现期的技术契约。

## 一、技术决策

项目采用 `Vite + GSAP + 原生 HTML/CSS/JavaScript`。GSAP 使用本地 npm 依赖，不使用 CDN；Vite 负责开发服务器和生产构建，不引入 React/Vue 等 UI 框架。

选择 GSAP 的理由：

- `timeline` 能把压、刷、揭、对位、收束编排成可读的工序时间轴；
- `Flip` 适合卡片从展墙原位进入聚焦校样台；
- `ScrollTrigger` 适合展墙滚动中的分级入场；
- 动画运行中可通过 `killTweensOf`、时间轴状态和当前进度接管，不排队；
- 所有依赖锁在仓库内，断网运行不依赖第三方服务器。

## 二、依赖与命令

`mvp/package.json` 只允许保留必要依赖：

| 依赖 | 用途 |
|---|---|
| `gsap` | 时间轴、Flip、ScrollTrigger、Draggable |
| `vite` | 开发服务器与生产构建 |

命令契约：

```bash
npm install
npm run dev
npm run build
npm run preview
```

## 三、目录边界

```text
mvp/
├─ index.html              # Vite HTML 入口
├─ package.json            # 脚本与本地依赖
├─ src/
│  ├─ main.js              # 应用启动与全局状态
│  ├─ data/series.js       # 主题与作品数据
│  ├─ motion/tokens.js     # 时长、曲线、动作名
│  ├─ motion/unveil.js     # 首屏揭幕
│  ├─ motion/floor.js      # 展墙滚动与入场
│  ├─ motion/theme.js      # 主题换版
│  ├─ motion/focus.js      # Flip 聚焦、换印、回位
│  └─ styles/              # 结构样式与主题令牌
└─ images/                 # 本地作品素材
```

根目录只保留档案和最终入口；实验代码与素材留在 `mvp/`。

## 四、动效设计系统

所有动效只能归入五种物理动作：

| 动作 | 视觉含义 | GSAP 实现 |
|---|---|---|
| `press` | 版面压合、急停 | timeline + 受控 ease |
| `squeegee` | 刮墨、刷痕推进 | clip/mask + stagger |
| `lift` | 揭纸、作品离墙 | translate + opacity |
| `register` | 套印对位、一次回正 | 位移 + 轻微过冲 |
| `reveal` | 作品从遮蔽中显影 | clip-path / mask |

禁止：bounce、elastic、无限循环粒子、无物理来源的缩放弹跳、黑闪和白闪。

动效令牌统一放在 `src/motion/tokens.js`，每个动画必须声明：动作名、时长、延迟、可否被接管、reduced-motion 终态。

## 五、状态与动画边界

- 数据状态与视觉状态分离，主题、作品索引、聚焦状态由 `main.js` 管理；
- GSAP 只负责视觉过渡，不在动画回调里偷偷修改业务数据；
- 新动画开始前必须销毁或接管旧时间轴；
- 主题切换、聚焦切换和关闭聚焦都必须支持中断；
- `prefers-reduced-motion: reduce` 下直接到终态，不隐藏作品、不阻塞操作；
- 图片使用本地路径，页面不得产生外部网络请求。

## 六、性能约束

- 优先动画 `transform`、`opacity`、`clip-path`，避免逐帧改变布局尺寸；
- 不在滚动事件中执行昂贵的同步布局测量；
- 首屏动效结束后销毁一次性时间轴；
- 作品图懒加载，聚焦切换只保留当前图和相邻图；
- 桌面与移动端都要验证无明显横向溢出、无空白帧、无持续高 CPU 动画。

## 七、每日验收接口

每一天完成后必须提供：

1. `npm run build` 输出；
2. 当前板块修改文件清单；
3. 至少一张桌面或移动截图，视觉改动按项目规则检查体积；
4. 交互过程的可见结果；
5. 未完成项与残余风险。

## 八、七日交接

| Day | 模块 | 技术重点 |
|---|---|---|
| 1 | 迁移 | Vite 入口、GSAP 安装、旧数据接入 |
| 2 | 动效系统 | tokens、reduced-motion、时间轴生命周期 |
| 3 | 揭幕 | 多层压印时间轴、跳过与清理 |
| 4 | 展墙 | ScrollTrigger、分级入场、性能 |
| 5 | 换版 | 主题时间轴、刷痕、接管 |
| 6 | 聚焦 | Flip、换印、Draggable、回位 |
| 7 | 收口 | 构建、入口、移动端、截图与 GitHub |
