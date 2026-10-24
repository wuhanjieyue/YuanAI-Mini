<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-12 | Updated: 2026-08-08 -->

# components/_self/yb-left-center

## Purpose
左侧抽屉的主体内容组件。展示搜索框、固定入口、真实历史对话列表、空态和底部聊天/设置入口。

## Entry Points

| File | Description |
|------|-------------|
| `index.js` | store 绑定、历史会话列表请求、首页功能选择、左侧抽屉交互、打开设置入口 |
| `index.wxml` | 左侧抽屉布局 |
| `index.json` | 小程序组件声明 |
| `../../../static_utils/`、`/static_wxss/`、`/static/` | 项目防抖、Iconfont/Flex/骨架基类与空态图片 |

## Dependencies
- `mobx-miniprogram-bindings` + `../../../store/index`
- `../../../static_router/settingRouter`
- `../../../request/chatStream`
- `../../../static_utils/eventBus` / `accentColor` / `homeFeature` / `chatModes`
- `wx.worklet`

## Data Sources
- `user`：来自 store
- `applicationSettings.pointColor`：控制底部聊天按钮的重点色
- `temporaryMode`：临时聊天模式标识，仅用于切换到系统默认重点色
- `chatRuns`：运行管理器维护的账号内活动状态，标题旁显示生成中/正在停止。
- `unreadConversations`：共享 Store 的服务端未读投影；最近、搜索及置顶行在非运行态显示重点色圆点。圆点显式绑定用户 accentStyle，即使临时模式也沿用重点色设置。运行图标保留旋转动画，字形为 icon-loading_flow_iconfont；打开侧栏或长按预览不标已读，删除/归档成功后清理对应本机投影。
- `chatHistory` / `pinnedChatHistory`：分别缓存最近和已置顶会话及其分页版本
- 首页实例是唯一历史请求控制器；侧边路由实例直接渲染同一份 Store，并通过事件把刷新和分页委托给首页实例
- attached 立即 flush Store、生成最近列表并计算胶囊高度；顶部 padding 与三个折叠区域完成样式绑定后派发 `contentready`。首次测量直接应用高度，不播放展开动画。
- 首屏 loading、分页 loading、失败状态通过现有 eventBus 的 `drawerHistoryLoadingRequest` / `drawerHistoryLoadingChange` 由首页控制器同步给路由实例；搜索状态仍由各实例管理，销毁时解除订阅。
- 首屏和搜索使用 5 个真实 `conversation-item` 行壳，分页使用 2 个；只将标题文本替换为灰色 shimmer 占位，骨架留在列表流中的真实数据位置，不使用居中遮罩。

## Behaviors
- `openSet()`：打开设置页，并监听 `archivedConversationChanged`，在取消归档或删除归档会话后调用现有 `refreshConversations()` 重载最近及置顶列表；清空 store 缓存不会自动触发请求。
- `closePage()`：关闭抽屉
- `loadConversations()`：通过 `request/chatStream` 拉取真实会话列表
- 最近与已置顶列表的首屏刷新都采用 latest-wins；新刷新不得被在途请求拦截，旧响应不得覆盖新缓存
- 普通刷新采用 stale-while-revalidate，保留已有置顶列表直到新请求成功；只有账号切换可以先清空 Store
- `selectConversation()`：向左侧抽屉页派发会话选择事件
- `startNewConversation()`：从库返回时只切换到聊天；已在聊天时沿用原逻辑清理当前轮次，不删除历史列表
- `openLibrary()`：派发 `selectfeature`，由首页容器切换到常驻的库组件
- 长按历史项：保持记录行静止，测量并派发锚点坐标，由 `pages/leftpage` 打开与设置页同款操作弹窗
- 置顶和重命名只替换对应缓存项；归档和删除只移除对应缓存项，不全量刷新会话列表

## For AI Agents

### Working In This Directory
- 历史记录不要写本地示例数据；列表数据必须通过 `request/chatStream.js` 的会话接口获取
- 会话长列表保持 `type="list" + enable-passive`，循环项保留 `list-item`，避免失去 Skyline 按需绘制与样式共享
- 上部功能项沿用原始间距，选中态保留 `var(--bg-l1)` 与 `mradius` 的原始视觉值；底部聊天按钮始终保持重点色样式
- 进入设置页时依赖 `settingRouterBuilder`，不要改成普通跳转而丢失动画
- 历史项长按不绑定单项缩放动画；保留菜单锚点测量和宿主页的触觉反馈
- 账号切换刷新历史列表时必须递增请求版本，禁止旧账号的异步响应重新写入 store
- 不要在组件内直接 `wx.navigateBack()`；关闭、聊天和库入口统一派发关闭事件，由宿主页面处理路由生命周期
- 组件使用 `styleIsolation: isolated`；语义色回退、图标码点和业务布局保留在本目录，通用工具类与图片复用项目 `static_utils/`、`static_wxss/` 和 `static/`
