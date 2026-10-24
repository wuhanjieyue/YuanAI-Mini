<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-12 | Updated: 2026-04-12 -->

# components/_self/yb-title-nav

## Purpose
首页顶部导航栏。负责打开左侧抽屉、展示当前功能名称、触发功能切换弹窗，并按页面参数展示固定 Tab。

## Entry Points

| File | Description |
|------|-------------|
| `index.js` | 标题栏动画与事件派发 |
| `index.wxml` | 抽屉按钮、模型名称与版本区域 |
| `index.json` | 小程序组件声明 |

## Properties
- `featureName: String`
- `featureMenuEnabled: Boolean`（默认开启；关闭时隐藏下拉图标并禁止弹出功能菜单）
- `tabs: Array<{id: String, name: String}>`（默认空；Tab 与标题共用一层玻璃背景）
- `activeTab: String`（激活项由页面控制，组件不自行修改）
- `tabsDisabled: Boolean`（菜单打开时禁止切换）
- `model: Object`（兼容旧调用）

## Events
- `openLeft`
- `showFeatures`
- `tabchange: {id}`（只派发有效且非激活 Tab；页面处理查询）
- `heightchange: {height}`（px；页面更新滚动内容首个占位节点）

## Animation State
- `modelNameSca`
- `modelNameOpa`
- `modelNameTra`

## Working Notes
- 通过 createStoreBindings 订阅 Store.hasUnreadConversations 和用户 accentStyle，卸载时销毁绑定。圆点复用 skyother.wxss 的 chat-unread-dot/cradius 与 --accent-action-bg；顶部局部覆盖为22rpx，top=16rpx/right=16rpx，位于圆形按钮内部，不改变按钮及导航高度。
- 高度直接读取 `wx.getMenuButtonBoundingClientRect()`；动画时长固定为原有的 160ms
- `.title-view` 仅包裹标题行，以保持 `.more-icon` 的胶囊对齐；静态标题高度通过内联样式设置，标题缩放/位移动画继续由 Worklet 管理。
- 抽屉入口复用设置顶部按钮的 `glass-view/cradius` 公共样式，外框 92rpx 正圆，原双横线在框内居中且保持左对齐；显式导入 `skyother.wxss` 供隔离组件使用。外框尺寸保留局部，按钮中心继续沿用 `.more-icon` 的胶囊对齐，不增加导航高度。
- 有 Tab 时整体高度增加 120rpx（22 顶部 + 36 Tab padding + 42 行高 + 20 底部），每项内边距为 18rpx 36rpx；按 windowWidth 换算，不读取受抽屉缩放影响的 viewport 矩形。Tab 参数变化重新派发整体高度。
- 导入 `asset-cards.wxss` 复用 `asset-tabs/asset-tab/asset-tab-active`；Tab 区域不再单独添加玻璃背景。高度、行高与标题动画选择器保留局部。
- 导航容器与标题、Tab 之间均不画边框，统一由背景渐变过渡到页面内容，无需页面传入边框参数。
- 背景沿用设置页 `.move-bg` 的纵向渐变方式：前 65% 保持 `--glass-92`，之后淡出至底部完全透明，覆盖标题和 Tab 整体；同设置页不叠加背景模糊，使底部透明区域直接透出内容。渐变放在组件内，复用公共主题变量，不改变标题与 Tab 的局部尺寸。
- `showFeatures()` 实测 `.model-name-anchor` 的 viewport 矩形，再触发标题动画并随事件传给父组件作为弹窗锚点
- `featureMenuEnabled === false` 时标题只展示名称，不响应功能菜单点击
- `closeFeatures()` 负责恢复标题区域视觉状态
- 顶部菜单测量期间屏蔽重复点击；关闭时使旧测量失效，迟到回调不得再次隐藏标题。宿主必须在 flyout.open 返回 false 时调用 closeFeatures 恢复外部触发项。
- 组件使用 `styleIsolation: isolated`；布局、颜色 fallback、字体类与下拉图标码点保留在本目录，字形数据复用应用级 `static_wxss/skyfontline.wxss`

## For AI Agents

### Working In This Directory
- 若修改标题区结构，需同步检查 `.model-name`、`.model-name-anchor`、`.title-view`、`.more-icon` 的 worklet 样式绑定
- 标题显示字段来源于 `featureName`；模型选择由输入框的模型摘要入口负责
