<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-11 | Updated: 2026-08-08 -->

# pages

## Purpose
页面层负责承载所有用户可见的场景：聊天、设置、文件、语音、侧边栏、日志与网页容器。页面普遍依赖 Skyline + `wx.worklet` 动画，以及 `wx.router` 自定义转场。

## Modules

| Directory / File | Purpose |
|------------------|---------|
| `index/` | 首页容器，常驻切换聊天/文件库视图并协调侧边栏、页面动画与路由（see `pages/index/AGENTS.md`） |
| `setting/` | 设置页主面板，含应用设置、聊天设置、建议、个性化、数据控制、通知、关于页入口（see `pages/setting/AGENTS.md`） |
| `upgrade/` | 升级订阅展示页，复用设置页叠层路由（see `pages/upgrade/AGENTS.md`） |
| `usageLimits/` | 整数元额度购买半屏页，复用 `upRouterBuilder`；使用情况和限制由设置页内嵌二级面板承载 |
| `helpCenter/` | 帮助中心 Markdown 使用指南，复用设置页叠层路由（see `pages/helpCenter/AGENTS.md`） |
| `createTryIt/` | 创作功能激活时展示的固定 45vh Try it 底部弹窗 |
| `loginPrompt/` | 复用 Try it 路由的通用手机号授权登录提示页 |
| `leftpage/` | 左侧菜单抽屉页，与首页共享侧滑状态（see `pages/leftpage/AGENTS.md`） |
| `filePage/` | 文件/图片/相机入口页，负责向聊天页回传文件（see `pages/filePage/AGENTS.md`） |
| `reasoningPage/` | 完整思考过程半屏页，通过 EventChannel 接收消息内容（see `pages/reasoningPage/AGENTS.md`） |
| `voiceChat/` | 语音聊天壳页，当前逻辑较轻（see `pages/voiceChat/AGENTS.md`） |
| `logPage/` | 日志展示页（see `pages/logPage/AGENTS.md`） |
| `reportError/` | 报错反馈页，手动入口复用设置叠层路由，摇动入口使用底部路由（see `pages/reportError/AGENTS.md`） |
| `aboutWebView/` | 关于/帮助类 WebView 容器页（see `pages/aboutWebView/AGENTS.md`） |
| `profilePage/` | 用户资料编辑页（see `pages/profilePage/AGENTS.md`） |

## Key Files

| File | Description |
|------|-------------|
| `index/index.js` | 首页功能切换、文件/设置/语音入口、侧边栏路由与页面级手势 |
| `conversationFiles/index.js` | 当前聊天附件文件库，沿用设置页路由并复用文件库网格 |
| `index/initShareValue.js` | 首页容器使用的 worklet shared 状态初始化 |
| `setting/index.js` | 设置页配置常量、面板状态、弹窗与持久化入口 |
| `leftpage/router.js` | 左侧抽屉专用 route builder |

## Dependencies
- `../../store/index`
- `../../static_utils/*`
- `../../static_router/*`
- `../../request/request`
- `components/_self/yb-chat-input`
- `components/_self/yb-title-nav`
- `components/yb-models-select`
- `components/yb-flyout`
- `components/_self/yb-subsetting-*`
- `/mdPackage/components/*`

## Interaction Patterns
- 页面多以半屏 / 浮层形式出现，使用 `routeType` + 自定义 route builder 进入
- 手势关闭通常使用 `GestureState` + worklet shared 变量计算进度
- 设置页与首页都依赖全局 `su_system` / `su_menu` 尺寸信息
- 文件页通过 `eventChannel.emit('addFile')` 把选择结果回传给聊天页

## Test Coverage
- `tests/homeFeature.test.js` 检查首页功能归一化、按需挂载和创作弹窗交互
- 高风险改动区域：`index/index.js`、`components/_self/yb-chat-view/index.js`、`setting/index.js`

## For AI Agents

### Working In This Directory
- 新增页面需补 `.js/.json/.wxml/.wxss` 四件套并登记到 `app.json`
- 交互页优先沿用现有 bottom-sheet / side-sheet 动画范式
- 设置入口统一使用 `setting/`。
- 涉及页面尺寸、胶囊按钮或安全区时，优先从 `getApp().globalData.su_system` / `su_menu` 读取

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->

- `sourcesPage/`：消息来源半屏页，复用 reasoningPage 的路由、手势和吸附，通过 showSources 接收来源列表。
- `conversationFiles/` 读取完整消息后通过 request/assetCache 补当前聊天附件的最新 name/tags，重算 displayName；账号 epoch、刷新版本和卸载阻止迟到响应。临时聊天不读取持久库元数据。

- DarkMode：页面 onLoad 调用 bindPageTheme，onUnload 调用 unbindPageTheme，onShow 同步导航前景；page-meta 在首节点提供原生背景，内容根 view/draggable-sheet 必须显式绑定 themeStyle，不能仅依赖 page-meta 的自定义变量更新。透明侧页保持透明 root-background-color。

- `createDetail/`：创作图片详情，复用工具列表 upRouterBuilder + draggable-sheet；初始/最大高度均为屏幕 60%，只允许下拉关闭，提示词原生 max-lines=3。
- `memoryAbout/`：记忆摘要的“关于记忆”30% 高度说明页，复用 upRouterBuilder + draggable-sheet，仅提供“知道了”关闭入口。背景与圆角由 scroll-view 承载；内容卡以 screenHeight * 0.3 为最小高度，不使用滚动列表子项 height:100%；标题、正文和按钮禁止 flex 收缩。
- `usageLimits/purchase/`：购买额度页复用 `upRouterBuilder` + draggable-sheet 展示静态人民币金额，购买操作只提示暂未开放；使用情况和限制由 `pages/setting/` 的内嵌二级面板承载。

- `taskEdit/`：计划任务新增/编辑页，复用 settingRouterBuilder 与 flyout，按设置页 Worklet 阈值下拉关闭并与滚动边界仲裁，通过 request/tasks 保存后由 EventChannel 回填列表；周期动态切换单次日期/时分、小时分钟、日间隔、工作日、周星期、月日号和自定义单位；间隔 1–99，月日号 32 表示最后一天，切换保留选项，日期滚轮按年月收敛日号。后端持久队列每 5 秒检查，2 个 Agent 名额；通知本轮不开放。

- `taskEdit/` 关闭按钮和下拉关闭均比较初始表单快照；有变更通过 flyout 确认放弃。保存等待后端 API 成功后用 EventChannel 回填，loading/check 状态期间阻止重复保存与关闭，卸载清理反馈计时器。任务说明使用原生 auto-height 与15行的 max-height 上限。

- `taskEdit/` 时间下方的模型字段复用 `yb-models-select` 两层弹窗和聊天模式模型目录，modelId/effortId 仅写入当前任务草稿；打开弹窗不改表单快照、不修改聊天全局选择。
