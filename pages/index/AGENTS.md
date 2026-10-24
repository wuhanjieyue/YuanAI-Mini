<!-- Parent: ../AGENTS.md -->
<!-- Updated: 2026-08-08 -->

# pages/index

- 插件菜单的 trySkill.detail.item 由 startSkillTrial 交给 finishSkillTrial，切换聊天、重置会话并预填 exampleMessage；不自动发送。插件页接收 themeStyle 并透传到 flyout portal。

## Purpose

小程序首页容器。负责承载聊天、库及轻量功能占位视图；聊天业务由 `components/_self/yb-chat-view` 独立管理。

## Entry Points

| File | Description |
|------|-------------|
| `index.js` | 功能选择、抽屉手势、页面路由和跨功能协调 |
| `index.wxml` | 按当前功能挂载对应首页业务组件 |
| `index.wxss` | 首页容器、抽屉层和功能切换层样式 |
| `initShareValue.js` | 初始化抽屉手势与聊天交互锁 shared 值 |

## Responsibilities

- `currentFeature` 是首页当前功能的唯一状态源，稳定值由 `static_utils/homeFeature.js` 定义。
- 所有首页功能使用 `wx:if` 按需创建；切换功能会销毁当前组件的局部状态。
- 知识库当前为本地 mock；透传 themeStyle、actionschange 与 chatAsset，菜单与确认框沿用首页抽屉锁，聊聊这个沿用 startAssetChat 的新聊天附件草稿流程。
- 左抽屉、文件页、设置页和语音页的路由继续由首页注册和执行。
- 创作组件激活时不自动打开 Try it；独立页面和路由仍保留。
- 所有首页功能使用全屏右滑打开左抽屉，并以横向位移占优和最小拖动进度抑制纵向滚动误触。
- 会话选择先切回聊天，再调用 `chat-view.loadConversation()`。
- `app.json.preloadRule` 在进入首页后由微信框架预下载 `md` 普通分包，适用于 Wi-Fi 与移动网络；不阻塞发送，不保证组件已经注入或挂载。不要改用仅支持 Worker 分包的 `wx.preDownloadSubpackage`。

## Shared State

- 抽屉：`wx.pageTrans`、`wx.pageScale`、`wx.pageFilter`、`wx.leftTrans`、`wx.leftOp`
- 手势仲裁：`wx.homePressFlag`、`wx.homeContentShow`；`assetActionsOpen` shared 由列表 `actionschange` 驱动，菜单关闭/组件销毁后释放抽屉锁。
- 临时模式重点色：`temporaryMode` 仅覆盖首页、聊天区和抽屉的展示色，不写入用户设置。
- 抽屉交接：`wx.drawerRouteVisible` 是唯一显示权标志，两页通过 `flush: 'sync'` 的 animated style 切换；真实路由准备完成前，预展示始终保持在聊天层之上。导航失败回位，重复打开合并。

## Component Graph

- `yb-left-center`
- `yb-chat-view`
- `yb-library-view`
- `yb-tasks-view`
- `yb-knowledge-view`
- `yb-plugins-view`
- `yb-create-view`

## For AI Agents

- 不要把消息、输入、附件或流式状态放回首页。
- 新功能优先新增独立业务组件，并通过首页的稳定 feature id 按需挂载。
- 修改抽屉手势时同步检查 `pages/leftpage`；修改聊天交互锁时同步检查 `components/_self/yb-chat-view`。

- openSourcesPage 使用已有 upRouterBuilder 打开 sourcesPage，并通过 showSources EventChannel 传递 citations。

- `openCreation` 以已有 upRouterBuilder 打开 createDetail，并通过 EventChannel 传入当前云列表条目。
- `openSkill` 接收插件项的稳定 id，以已有 upRouterBuilder 打开默认60vh、可展开的 mdPackage/pages/skillDetail。trySkill 回传后在 onShow 切回聊天、重置新会话并调用 prefillSkill；用 assetCacheEpoch 阻止旧账号回填，导航失败取消待处理动作，不自动发送。
- openSkill 的 skillRemoved 回传在同一 assetCacheEpoch 下调用已挂载 pluginsView.updateSkill，同步安装状态并保留搜索与分页。
- 详情页回传的创作提示词在弹层关闭后切换到聊天，重置为新会话并调用聊天视图直接发送；原草稿不保留。

- 点击或手势打开侧栏均经 dyNavigate，打开时调用现有 checkConversationStatus 校验共享会话列表缓存。

- 设置 openStorageCategory EventChannel 将 currentFeature 切至 library，并传 storageCategory/storageNavigationId；库首次挂载和重复导航均清空搜索，加载对应分类。

- filePage 的 selectFeature 回传支持可选 skill 元数据：原四个模式调用 selectFeature，其他已启用 Skill 调用 selectSkill 并保留草稿；传 skillId 恢复高亮，assetCacheEpoch 拦截旧账号回传，@ 入口仍仅清除完整单个 @。

- 创作/文件库菜单 chatAsset 的 files/epoch 由 startAssetChat 消费：在同一账号下切至聊天、resetChatSession，再 addSelectedFiles 到附件等待区；不会提交轮次，迟到账号回传被丢弃。

- conversationFiles 的 chatAsset EventChannel 仅保存同 epoch 的 _pendingAssetChat，弹窗退场后 onShow 经 startAssetChat 重置并加入附件；不能在半屏页未关闭时切换底层会话。

MCP 详情沿用 skillDetail 路由并附 kind=mcp，待处理试用记录携带 kind；finishSkillTrial 对 MCP 调用 prefillMcp，其余保持 prefillSkill。插件分类菜单的 actionschange 复用首页抽屉手势锁。

- openTaskEditor 复用 settingRouterBuilder 设置页路由，以 editTask / taskUpdated / taskAction EventChannel 对接当前 tasksView 的静态示例数据，不触发真实调度。
