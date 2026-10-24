<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-11 | Updated: 2026-08-23 -->

# components

## Purpose

小程序组件层。根目录保留可独立整理的基础组件，`_self/` 收纳 YuanAI 项目业务组件，`_shared/` 只收纳根目录组件包内部的公共依赖。

## Modules

| Directory | Purpose |
|-----------|---------|
| `_self/` | YuanAI 业务容器、业务面板及依赖宿主 shared 状态的组合组件（see `components/_self/AGENTS.md`） |
| `_shared/` | 根目录组件共用且不含业务状态的工具、WXSS 和静态资源（see `components/_shared/AGENTS.md`） |
| `yb-notice-capsule/` | 公共提醒胶囊，支持内容及前后缀 slot（see `yb-notice-capsule/AGENTS.md`） |
| `yb-confirm-dialog/` | 通用确认弹窗（see `components/yb-confirm-dialog/AGENTS.md`） |
| `yb-dot-matrix-loading/` | Canvas 点阵 loading（see `components/yb-dot-matrix-loading/AGENTS.md`） |
| `yb-file-list/` | 文件附件列表（see `components/yb-file-list/AGENTS.md`） |
| `yb-flyout/` | Skyline 通用锚点弹窗，提供三 slot 与 root-portal 定位（see `components/yb-flyout/AGENTS.md`） |
| `yb-gauge-trigger/` | 推理程度表盘入口（see `components/yb-gauge-trigger/AGENTS.md`） |
| `yb-cascader/` | 最多十级数据选择，独立父子层动画与透明安全容器（see `components/yb-cascader/AGENTS.md`） |
| `yb-models-select/` | 模型与推理强度选择弹窗（see `components/yb-models-select/AGENTS.md`） |
| `yb-subsetting-list-card/` | 设置列表卡片容器（see `components/yb-subsetting-list-card/AGENTS.md`） |

## Key Components

### `_self/yb-chat-view`

- 是聊天业务的状态与交互边界，通过事件请求首页执行页面级路由。
- 首页按功能通过 `wx:if` 挂载组件；聊天运行状态由主包 `chatRuntime` 管理。

### `yb-flyout`

- 通过 `trigger` / `anchor` / `popup` slots 解耦交互和业务内容。
- 使用 `root-portal` 逃逸 Sheet/scroll-view 裁剪，并按实测 portal 原点定位。

### `yb-models-select`

- 只消费宿主传入的模型、档位和锁态，复用 `yb-flyout` 定位。

### `yb-subsetting-list-card`

- 是设置页列表型面板的通用承载组件，为父级回传点击项和开关变化。

## Dependencies

- `../static_wxss/skyfontline.wxss`：应用级只注册一份内嵌图标字体。
- `_shared/`：根目录组件间共用的无业务状态工具、WXSS 基类与静态资源。
- `wx.worklet`：交互动画与 shared 状态。
- 父页面/组件 `properties`、`triggerEvent` 与公开方法协议。
- `_self/` 中的宿主业务容器可依赖 `store/`、`request/`、`static_router/` 与领域工具。

## Release Boundary

- 根目录组件应保持显式 properties/events 契约，不直接导入宿主 store、请求、路由或领域策略。
- 根目录组件可以依赖 `_shared/`；单独复制时须同时带上实际引用的共享文件。
- 基础组件显式导入 `static_wxss/skyother.wxss` / `skycolor.wxss` 复用公共样式；独立整理时也需携带这些 WXSS。尺寸、状态覆盖和动画选择器继续留在组件内。
- `_self/` 仅表示项目内组件分类，不是小程序分包，也不承诺独立发布。
- `_self/` 中的 container/view 仅在真正需要单独发布时再拆，不提前注入大量回调或 RPC 抽象。

## Test Coverage

- `tests/componentNaming.test.js` 校验根目录与分组目录中的组件入口和引用路径。
- `tests/componentIsolation.test.js` 校验样式、资源、字体与宿主依赖边界。
- `tests/ybFlyoutPosition.test.js` 覆盖 `yb-flyout` 定位、slot 和调用接线。

## For AI Agents

### Working In This Directory

- 项目业务组件放入 `_self/`；可独立整理的基础组件留在根目录。
- 弹窗类组件继续使用 `shared + timing/spring + applyAnimatedStyle`。
- `properties` 与 `triggerEvent` 命名保持现有小驼峰风格。
- 新增设置子组件优先复用 `yb-subsetting-list-card` 的行交互模式。
- 隔离组件不要重复内嵌字体 data URI；字形数据统一由 `static_wxss/skyfontline.wxss` 注册。
- 只有两个以上根目录组件使用且语义完全一致的内容才进入 `_shared/`；`_self/` 优先复用项目 `static_utils/`、`static_wxss/` 与 `static/`，Worklet 函数、动画选择器和业务规则保持局部。

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
