<!-- Parent: ../../AGENTS.md -->

# privacy

隐私政策独立只读页。

- 由设置页使用 `settingRouterBuilder` 的 `stacked` 选项打开。
- Markdown 文案保存在 `content.js`，复用 `towxmlstream.static` 与 `towxml openTyper=false` 渲染。
- 首帧先绘制主题页面壳，再于 `wx.nextTick` 解析 Markdown，避免同步解析期间露出路由遮罩色。
