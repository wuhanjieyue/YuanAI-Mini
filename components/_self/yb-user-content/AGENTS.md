<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-12 | Updated: 2026-07-12 -->

# components/_self/yb-user-content

## Purpose
长按用户消息后的放大查看组件。支持显示全文，并提供复制/编辑操作入口。

## Entry Points

| File | Description |
|------|-------------|
| `index.js` | 展开/关闭动画与编辑事件 |
| `index.wxml` | 内容浮层与操作句柄 |
| `index.json` | 小程序组件声明 |

## Properties
- `content: String`
- `hapticFeedback: Boolean`

## Events
- `showOldContent`
- `editContent`

## Parent Coupling
该组件依赖所属页面上的 shared 值：
- `contentShow`
- `contentSca`
- `contentTop`
- `contentRight`
- `contentHeight`
- `moveSca`
- `moveTop`
- `oldTop`

触觉调用复用 `static_utils/haptic.js`，显式导入 `skyfontline.wxss`、`skyother.wxss` 和 `skycolor.wxss`。内边距、字号、圆角与气泡色复用公共类；窗口高度读取、图标码点和特有布局留在组件内。可见气泡用 `.user-content-panel` 绑定 Worklet，避免与公共 `.user-content` 的布局规则冲突。父级 shared 值仍是消息原位放大/还原的显式动画协议。

## Working Notes
- `show(rect, featureLabel)` 先以原气泡排版宽度测量隐藏副本的自然高度，再交由宿主 prepareUserContent 计算位置/缩放；可见气泡不设置固定高度。菜单两行使用48rpx行高和每行64rpx上下内边距，修改时同步宿主菜单空间计算。
- `close()` 会把内容卡片还原回原始位置，并通知父页面恢复旧消息显示
- `copy()` 使用小程序标准剪贴板 API，复制成功后关闭浮层

## For AI Agents

### Working In This Directory
- 若补 `copy()`，优先使用微信小程序标准剪贴板 API，并保留当前关闭/编辑交互
- 不要在本组件内重新计算消息起止位置，位置数据由父页面提供

- 浮层正文和隐藏测量副本均使用源气泡 computedStyle 的字号、字体、字重、行高、字距、对齐及换行规则；不能仅依赖隔离组件的默认继承。复制/编辑菜单保留独立样式。
