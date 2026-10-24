<!-- Parent: ../AGENTS.md -->

# components/_self

## Purpose

YuanAI 项目内组件。这里放不适合作为独立开源单元的业务容器、业务面板和依赖宿主 shared 状态的组合组件。

## Components

- `yb-chat-view`、`yb-left-center`、`yb-archived-chats`：直接接入 store、请求、路由或聊天领域策略。
- `yb-chat-input`、`yb-feature-popup`、`yb-log-box`、`yb-reasoning-slider`、`yb-user-content`：通过 `selectOwnerComponent()` 使用聊天宿主的 shared 状态。
- `yb-library-view`、`yb-tasks-view`、`yb-knowledge-view`、`yb-plugins-view`、`yb-create-view`、`yb-title-nav`、`yb-fun-list`：首页与聊天产品流程的组合视图。
- `yb-asset-actions`：创作与库共用的操作菜单；每个列表挂一个实例，透传主题和菜单状态。
- `yb-subsetting-personalization`、`yb-subsetting-notification`、`yb-subsetting-data-control`：绑定 YuanAI 设置字段、文案和操作语义的业务面板。

- `yb-trending-search`：空会话的每日推荐列表；数据由 `request/dailyRecommendations.js` 同步，宿主决定可见性，组件负责文案与排版。
- `yb-plugins-view`：HTTP 已安装全量与推荐分页 Skill 展示、服务端搜索和账号隔离，复用公共搜索样式与主题变量（see `yb-plugins-view/AGENTS.md`）。
- `yb-knowledge-view`：知识库 mock 列表、全部/文件/图片筛选、搜索与固定加号菜单；复用文件卡片、预览和本地来源操作（see `yb-knowledge-view/AGENTS.md`）。

## Boundaries

- `_self` 是普通目录，不登记为 `app.json` 的 `subPackages`。
- 可复用 `components/` 根目录组件，并直接使用项目 `store/`、`request/`、`static_router/`、`static_utils/`、`static_wxss/` 与 `static/`。
- `_shared/` 只服务根目录的可独立整理组件，`_self/` 不从中复制或引用项目已有依赖。
- 目录归类不改变现有 properties/events、Worklet、路由或业务状态协议。
- 真正需要独立发布某个组件时，再按实际需求拆 container/view。
- 底部搜索关闭按钮保持静态 class，query 只通过行内 pointer-events 控制点击；宽高、透明度和缩放交给既有 Worklet，避免清空时 class 重算覆盖反向退场。
- 搜索关闭时通过 searchAnimation.prepareSearchClose 捕获起始高度与按钮进度；input 的 worklet:onkeyboardheightchange 同步驱动按钮缩小淡出、搜索框回伸与列表高度。退场期间 blur/普通键盘回调不再启动独立 timing；重新聚焦恢复正常键盘避让，键盘已收起则沿用按钮的 timing 退场。

## For AI Agents

- 新增直接依赖项目 store、请求、路由、领域策略或宿主 shared 状态的组件时，优先放在本目录。
- 移动组件后同步更新页面及组件 `usingComponents`、测试路径和架构文档。

- `yb-archived-chats` 单项长按复用 `yb-flyout` 的中心展开与锚点动画。查看在菜单关闭后通过 `viewconversation` 请求设置页打开独立只读路由；取消归档恢复历史列表，删除不二次确认并物理清理会话关联数据。菜单关闭后发起操作，成功后局部移除记录且不重置整页 loading，失败保留记录供重试。

- `yb-archived-chats` 的纵向手势处理器须在组件内直接包裹实际 `scroll-view`；组件内 Worklet 只读写从宿主取得的 shared 值（滚动位置、startPan、primaryAnimation），不可直接调用宿主 Worklet 方法，普通 `bindscroll` 仅处理菜单关闭。
- `yb-archived-chats` 首次加载使用真实分组标题和记录行壳的 5 行骨架，分页使用 2 个真实记录行壳；骨架留在列表流中。空态仅在请求成功、展示数据更新完成且无分组时展示；失败仅显示失败提示。

- yb-asset-actions 在 afterclose 后统一执行 creation/library 的原生分享、图片保存、重命名、永久删除；chatAsset 回传本地副本给宿主切新会话。sample 保留暂未开放提示。

- `yb-read-aloud`：聊天朗读控制条，复用公共提醒胶囊；业务请求在request/speech.js，原生音频、临时MP3与操作/销毁竞态在组件内管理。

- `yb-tasks-view`：计划任务真实列表，使用标题导航公共三 tab、无长按任务卡；组件销毁后取消轮询与账号订阅。`yb-task-menu` 为列表/编辑页共用 flyout，afterclose 后派发操作；菜单期间透传 actionschange 锁住首页抽屉。

- yb-tasks-view 读取真实任务分页，前台每5秒最多刷新50个已加载任务状态，后台停止轮询；yb-task-menu 通过 API 完成立即运行、暂停/恢复、删除和打开最近执行聊天，无分享/通知入口。

- 计划任务已完成 tab 读取每次成功执行的对话分页，按完成时间倒序；点击直接打开对应 conversationId，不提供任务配置操作。切换数据源使旧请求失效，已完成列表不使用任务状态轮询。

- 三个计划任务 tab 使用 status=active/paused/completed 分别在服务端筛选，每页15条；触底按游标追加，切换 tab 清空游标并丢弃旧请求，追加失败重试保留已加载列表。
