<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-12 | Updated: 2026-07-12 -->

# pages/leftpage

## Purpose
首页左侧抽屉页。承载左侧菜单/历史区域，并与首页共享拖拽位移状态。

## Entry Points

| File | Description |
|------|-------------|
| `index.js` | 抽屉页生命周期、手势响应、关闭逻辑 |
| `index.wxml` | 左侧内容容器与点击关闭区域 |
| `index.json` | 注册 `yb-left-center` |
| `router.js` | 抽屉专用 route builder |

## Dependencies
- `../../store/index`
- `../../static_utils/routerUtil.js`
- `components/_self/yb-left-center`
- `components/yb-flyout`
- 首页共享的 `wx.pageTrans` / `wx.leftTrans` 等值

## Shared State Coupling
- `wx.pageTrans`
- `wx.pageScale`
- `wx.pageFilter`
- `wx.leftTrans`
- `wx.leftOp`

## Working Notes
- 页面本身不维护业务数据，主要职责是拖拽/关闭和触觉反馈
- 历史项长按菜单由页面根层的 `yb-flyout` 承载，使用外部 viewport 锚点矩形并避免被 `yb-left-center` 宿主尺寸裁剪
- 长按同一 flyout 的 preview slot 展示最近 5 条消息：优先读取聊天缓存（缓存为新到旧，预览按旧到新渲染），无缓存时 `getConversationMessages({ limit:5 })` 并显示公共 skeleton；不把 5 条预览写入完整聊天缓存。沿用 `assis-done` 与公共消息投影，隐藏操作栏、禁用内部触摸/滚动，内容超出时从底部裁剪；点击预览复用 `selectConversation` 的 EventChannel 和退场路径。
- 预览请求检查账号 epoch、打开轮次、关闭/卸载状态；关闭开始取消回填，账号重置立即清理弹层。预览期望 675rpx（90vw）×40vh，和下方操作菜单联合计算位置，空间不足时同比压缩高度；操作菜单可滚动，预览始终不可滚动。
- 长按时保持聊天单项静止，不附加缩放抖动；菜单的展开与抽屉转场继续沿用现有动画。
- 打开历史项长按菜单时，仅在 `applicationSettings.hapticFeedback` 开启后通过 `triggerHaptic` 触发重反馈
- 账号切换由首页常驻历史控制器响应；本页 `yb-left-center` 只渲染共享 Store，刷新和分页事件经 EventChannel 委托给首页实例
- 首页会把 `currentFeature` 作为查询参数传入；侧栏用它保持“聊天 / 库”选中态一致
- 功能入口通过页面 `eventChannel` 通知仍在栈内的首页切换，不为功能本身新增页面路由
- `contentready` 和页面样式绑定都完成后，才切换 `wx.drawerRouteVisible`；卸载或正在关闭时忽略迟到回调。
- 真实列表保持可见直到路由退场完成，卸载时将首页 shared 值复位，再交还显示权，避免切回未同步滚动/搜索态的首页预展示。
- 组件内所有关闭意图均由本页 `closePage()` 统一执行，避免不同入口绕过路由状态恢复
- `router.js` 入场不附加整页位移；退场从当前抽屉进度驱动同一组位移/缩放/模糊 shared 值。页面背景透明，保持禁用路由快照。
- `page-meta` 的透明原生背景使用 `#ffffff00`，与 `backgroundColorContent` 一致；`transparent` 会在当前 Skyline 开发工具触发 invalid backgroundColor。WXSS 继续使用透明背景。
- 查询参数 `temporaryMode` 与 `feature` 同步首页视觉状态。

## For AI Agents

### Working In This Directory
- 抽屉动画是首页和本页联动效果，修改时必须同时检查 `pages/index/index.js` 与 `pages/leftpage/router.js`
- 避免在本页引入新的状态源，优先沿用首页共享值

- 聊天重命名继续复用 yb-confirm-dialog 的 inputMode；按钮横排、取消在左、保存于右。
