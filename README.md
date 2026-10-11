# Art Exhibition · 动态印刷剧场

> 试行方案：GSAP + Vite。本文只回答三件事：项目是什么、怎么运行、每天怎样验收。
> 详细设计见 `PRD.md`、`TECH_DESIGN.md`、`DESIGN_V5.md`。

## 一、项目定位

这是一个把 2:3 竖版作品组织成线上展览的动态印刷剧场。作品不是静态卡片列表，而是通过“压、刷、揭、对位、收束”五种物理动作被印出来、挂上墙、抽出观看，再回到原位。

当前技术路线：

- `GSAP`：时间轴、布局转场、滚动编排和交互接管。
- `Vite`：本地开发、构建和静态部署。
- 原生 HTML/CSS/JavaScript：结构、材质和交互，不引入 UI 框架。
- 本地素材和本地 npm 依赖：不使用 CDN，不加载网络字体。

## 二、运行方式

在 `mvp/` 目录执行：

```bash
npm install
npm run dev
```

浏览器打开终端输出的本地地址。生产构建：

```bash
npm run build
npm run preview
```

每次实现前先运行 `npm install`（依赖未变化时无需重复安装），每次实现后至少运行 `npm run build`。

## 三、每日执行规则

每天只做当天板块，不提前实现后续功能。每个板块都必须完成：

1. 说明它在动态印刷剧场中的位置。
2. 修改前列出文件和实现边界。
3. 完成后运行构建和页面验证。
4. 提供桌面端、移动端或交互过程的可见证据。
5. 记录已完成、部分完成、未完成项。

## 四、七日试行计划

| 天数 | 主题 | 交付物 |
|---|---|---|
| Day 1 | Vite 与 GSAP 迁移 | `package.json`、Vite 入口、可构建的应用壳 |
| Day 2 | 动效设计系统 | 五种物理动作、时间轴令牌、reduced-motion 降级 |
| Day 3 | 首屏揭幕 | 多层印版压合、压印高光、可跳过揭幕 |
| Day 4 | 展墙滚动 | 主作/辅助作/版号的分级入场与滚动编排 |
| Day 5 | 主题换版 | 旧主题离场、新主题刷出、动画接管 |
| Day 6 | 聚焦校样台 | GSAP Flip 原位放大、换印、关闭回位、触摸拖拽 |
| Day 7 | 收口验收 | 根入口、性能、移动端、截图、完成标准对照表 |

## 五、当前状态

已完成：原生 MVP 展墙骨架、编辑型展墙布局、六套主题令牌、刷子刷出原型、聚焦视图、键盘与触摸基础操作。

未完成：GSAP/Vite 迁移、统一动效系统、主题换版时间轴、根目录正式入口、最终性能验收。

当前只有 `ARCANA` 有四张真实作品，其余主题是策展预留展位。

## 六、发布前检查（verify-project）

> 2026-10-11（Day 25）新增。第 3–4 周积累了云函数、数据库、静态托管三层，
> 检查项多了人会忘。这一节把检查固化成一个可复用的 Skill。

**一句话用法**：对 AI 说 **「运行 verify-project」**，它会逐项输出 PASS / FAIL 与证据。

**手工命令**（等价，任何时候可自己跑）：

```bash
cd "<项目根目录>"
bash _ref/verify/refresh-git-snapshot.sh                                  # 第 1 步：刷新 Git 快照
"C:/Users/Henry/.workbuddy/binaries/node/versions/22.22.2-6/node.exe" _ref/verify/run-checks.js   # 第 2 步：跑检查
```

退出码：`0` = 全 PASS，`1` = 有 FAIL，`2` = 脚本自身异常。

**覆盖 15 项检查**（检查项全部来自 Day 15–24 真实踩过的坑）：

| 组 | 检查项 |
|---|---|
| A 公网与静态 | A1 首页可访问（带站内 Referer）· A1b 静态资源可达 · A2 首页渲染完整 · A3 前端部署一致（字节数比对） |
| B 云函数接口 | B1 `/api/health` · B2 `/api/works`（85 条）· B3 `/api/note` 读 · B4 `/api/like` toggle · B5 `/api/note` 增删闭环 |
| C 密钥安全 | C1 工作区无硬编码密钥 · C2 Git 历史无密钥 |
| D Git 纪律 | D1 `.gitignore` + `.env.example` · D2 工作区干净 |
| E 数据库 | E1 数据库可达（间接，经 `/api/works`） |
| F 部署依赖 | F1 云函数三件套完整（`index.js` + `package.json` + `repository/`） |

**Skill 正本**：`docs-week4/verify-project.SKILL.md`（入库）；
运行时副本：`.workbuddy/skills/verify-project/SKILL.md`。

> ⚠️ **本机环境铁律**：Node 的 `execFileSync` / `execSync` 包 `git` / `curl` 一律 **EBUSY**。
> 故 git 查询走 Bash 脚本落盘，HTTP 请求用纯 Node `https` 模块 —— 脚本内不 spawn 任何子进程。

