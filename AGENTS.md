<!-- Generated: 2026-04-11 | Updated: 2026-08-01 -->

# YuanAI_mini

## Purpose
微信小程序 AI 对话应用（类 ChatGPT）。当前工程以 Skyline 渲染引擎为主，围绕「聊天首页 → 文件/语音/设置侧页 → Markdown 流式渲染 → 本地设置持久化」展开。

<!-- CODEGRAPH_START -->
## CodeGraph

This project has a CodeGraph MCP server (`codegraph_*` tools) configured. CodeGraph is a tree-sitter-parsed knowledge graph of every symbol, edge, and file. Reads are sub-millisecond and return structural information grep cannot.

### When to prefer codegraph over native search

Use codegraph for **structural** questions — what calls what, what would break, where is X defined, what is X's signature. Use native grep/read only for **literal text** queries (string contents, comments, log messages) or after you already have a specific file open.

| Question | Tool |
|---|---|
| "Where is X defined?" / "Find symbol named X" | `codegraph_search` |
| "What calls function Y?" | `codegraph_callers` |
| "What does Y call?" | `codegraph_callees` |
| "What would break if I changed Z?" | `codegraph_impact` |
| "Show me Y's signature / source / docstring" | `codegraph_node` |
| "Give me focused context for a task/area" | `codegraph_context` |
| "See several related symbols' source at once" | `codegraph_explore` |
| "What files exist under path/" | `codegraph_files` |
| "Is the index healthy?" | `codegraph_status` |

### Rules of thumb

- **Answer directly — don't delegate exploration.** For "how does X work" / architecture / trace questions, answer with 2-3 codegraph calls: `codegraph_context` first, then ONE `codegraph_explore` for the source of the symbols it surfaces. Codegraph IS the pre-built index, so spawning a separate file-reading sub-task/agent — or running a grep + read loop — repeats work codegraph already did and costs more for the same answer.
- **Trust codegraph results.** They come from a full AST parse. Do NOT re-verify them with grep — that's slower, less accurate, and wastes context.
- **Don't grep first** when looking up a symbol by name. `codegraph_search` is faster and returns kind + location + signature in one call.
- **Don't chain `codegraph_search` + `codegraph_node`** when you just want context — `codegraph_context` is one call.
- **Don't loop `codegraph_node` over many symbols** — one `codegraph_explore` call returns several symbols' source grouped in a single capped call, while each separate node/Read call re-reads the whole context and costs far more.
- **Index lag**: the file watcher debounces ~500ms behind writes; don't re-query immediately after editing a file in the same turn.
<!-- CODEGRAPH_END -->

## Architecture Overview

### Runtime Layers
1. **应用启动层**
   - `app.js`：初始化应用、系统尺寸、胶囊按钮位置、全局动画时长
   - `app_config.js`：HTTP 后端地址
2. **页面层**
   - `pages/index/`：首页容器，管理功能切换、侧边栏、页面级动画与路由
   - `pages/setting/`：设置主面板 + 内嵌子面板
   - `pages/leftpage/`、`pages/filePage/`、`pages/aboutWebView/`：侧滑/半屏路由页
3. **组件层**
   - `components/_self/`：聊天、库、侧栏和设置等项目内业务组件
   - `components/` 根目录：可独立整理的基础组件；`components/_shared/` 只提供根目录组件包内部公共依赖
4. **渲染层**
   - `mdPackage/`：Markdown 完成态/流式态渲染与聊天流服务
5. **状态与工具层**
   - `store/`：MobX + `wx.setStorageSync`
   - `request/`：HTTP API 封装
   - `static_utils/`：动画、请求、单位换算、事件总线、设置辅助
   - `static_router/`：`wx.router.addRouteBuilder` 自定义转场
6. **服务端接口**
   - 服务端位于同级 `../YuanAI_backend/` 独立工程；前端仅通过 HTTP/SSE/COS 通信。
   - 本工程不存放后端、Skill 包、SAG 源码、服务配置或运行数据。

### Main User Flows
- **首页功能流**：`pages/index/index.js` 按 currentFeature 挂载 `components/_self/yb-chat-view` / `components/_self/yb-library-view` / `components/_self/yb-create-view`，切换时对应组件随 wx:if 销毁
- **聊天流**：`components/_self/yb-chat-view` → `components/_self/yb-chat-input` → `mdPackage/components/assisStream`
- **设置流**：`pages/index/index.js` → `pages/setting/index.js` → `components/yb-flyout` / 设置子组件
- **文件流**：`pages/filePage/index.js` 通过 `eventChannel.emit('addFile')` 回传文件
- **侧边栏流**：`pages/index/index.js` 与 `pages/leftpage/index.js` 共享 `wx.worklet.shared` 状态

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `pages/` | 页面层：聊天、设置、语音、日志、文件、网页容器（see `pages/AGENTS.md`） |
| `components/` | 基础组件、项目内 `_self` 组件与包内 `_shared` 依赖（see `components/AGENTS.md`） |
| `mdPackage/` | Markdown/TOWXML 渲染与聊天流服务（see `mdPackage/AGENTS.md`） |
| `store/` | MobX 全局状态与本地持久化（see `store/AGENTS.md`） |
| `request/` | HTTP API 封装（see `request/AGENTS.md`） |
| `static_utils/` | 通用工具、设置辅助、音色配置（see `static_utils/AGENTS.md`） |
| `static_router/` | Skyline/`wx.router` 转场构建器（see `static_router/AGENTS.md`） |
| `static_wxss/` | 全局颜色、图标、公共样式资源（see `static_wxss/AGENTS.md`） |
| `static/` | 图片、Logo、加载素材（see `static/AGENTS.md`） |

## Key Files

| File | Description |
|------|-------------|
| `app.js` | 注册 `App`，初始化设备信息和全局共享数据 |
| `app.json` | 页面路由、Skyline 渲染配置、分包配置 |
| `app.wxss` | 全局样式入口 |
| `app_config.js` | 后端地址与可替换的应用静态资源地址配置 |
| `package.json` | 项目依赖与脚本配置 |

## External Dependencies
- `mobx-miniprogram`
- `mobx-miniprogram-bindings`
- 原生 `wx.request` 与 RequestTask（业务 HTTP/SSE）
- Python 3.12、LangChain、LangGraph 与 AG-UI Python 集成（Agent）
- 微信小程序原生能力：`wx.router`、`wx.worklet`、`wx.chooseMedia`、`wx.getRecorderManager`

## For AI Agents

### Working In This Directory
- 这是 **Skyline + worklet** 项目，不要按 Web/React 方式重写动画与布局
- Skyline 开发者工具热重载仍处于开发中，保持 `project.private.config.json` 的 `compileHotReLoad: false`，源码变更后手动编译
- `project.config.json` 的小程序打包忽略目录保留 backend、skill、tmp、.codegraph、.understand-anything、tests 的打包忽略，防止误放后台资料进入小程序包；实际后端、Skill 与工作区均已迁至独立工程。
- 长按、弹窗、拖拽等事件驱动交互动画优先沿用 `shared + applyAnimatedStyle + timing/spring`；WXSS `@keyframes` 只用于 loading 等不依赖交互状态的自动循环动画
- 弹窗触发行动画需保留：右侧值区域缩入（scale + opacity + translateY）
- 页面/组件注册依赖各自 `.json` 的 `usingComponents`
- 路由大量依赖 `wx.router.addRouteBuilder` 和 `wx.router.removeRouteBuilder`
- 设置与用户偏好默认值必须与 `store/index.js` 和页面展示逻辑同步

### Code Placement Rules
- 请求封装统一放在 `request/` 下；页面和组件不要直接散落 `wx.cloud.callFunction`、HTTP 请求或参数拼装。新增接口先查 `request/AGENTS.md` 和现有 `request/request.js`。
- Skyline 自定义路由统一放在 `static_router/` 下；新增或调整 `wx.router.addRouteBuilder` / `removeRouteBuilder` 时，先复用现有 route builder 和 `static_utils/routerUtil.js`。
- 应用级通用工具统一放在 `static_utils/` 下；仅供根目录可独立组件复用且不含业务状态的微型工具放在 `components/_shared/`。`_self/` 直接复用项目工具，不在组件包内复制。写新工具前先查两处现有实现，能复用就不要再写一份。
- 应用级通用样式放在 `static_wxss/`；仅供根目录隔离组件共同导入的基础类放在 `components/_shared/`。`_self/` 显式导入 `static_wxss/`；组件独有尺寸、状态选择器和动画样式继续保留在组件内。
- 已有颜色变量时不要重复硬编码同类颜色。组件独有的尺寸、状态选择器和动画样式保留在组件 WXSS；只有被两个以上模块复用或属于语义化设计令牌时，才新增公共样式。
- 复用公共类必须保持原值与覆盖顺序；不把相近尺寸取整。原生 `button` 的项目样式只写元素内 `style`，按压透明度由外层 `view` 的 hover 类承担。无法等价替换的位置继续保留原有局部样式。
- 涉及样式修改时，交付说明需列出复用的公共类或变量，并说明仍保留局部样式的原因。
- 全局变量和跨页面状态优先走 `store/` 的 MobX 管理方式；新增状态需同步默认值、setter 和持久化 key。页面订阅参考：
  ```js
  this.storeBindings = createStoreBindings(this, {
    store,
    fields: ['user', 'settings'],
    actions: ['setUser'],
  })
  ```
- 页面代码只保留页面编排、交互状态和生命周期逻辑；请求、路由、工具、公共样式、全局状态分别回到上面对应目录。
- 服务端代码、Skill、MCP 配置和所有运行文件统一放在同级 `../YuanAI_backend/`；前端不得导入后端源码或向前端目录写后台运行文件。

### Documentation Maintenance Rules
- 更新模块结构时同步刷新对应子目录 `AGENTS.md`
- 新增顶层模块时，在本文件 `Subdirectories` 中登记
- 新增运行时约束（动画、路由、存储键）时，优先写入最小作用域的 `AGENTS.md`

- 后端独立运行方式见 [服务端说明](../YuanAI_backend/README.md)。小程序 apiBaseUrl 仅配置网络地址，身份依赖可信服务端 Token。后端本地工作区为 `../YuanAI_backend/tmp/yuanai-workspaces`，不在小程序工程中。
