<!-- Parent: ../../AGENTS.md -->

# terms

使用条款独立只读页。

- 由设置页使用 `settingRouterBuilder` 的 `stacked` 选项打开。
- Markdown 文案保存在 `content.js`，复用 `towxmlstream.static` 与 `towxml openTyper=false` 渲染。
- 首帧先通过 `bindPageTheme` 绘制与升级页一致的主题页面壳，再于 `wx.nextTick` 解析 Markdown，避免同步解析期间露出透明路由后的遮罩色。
- 页面仅提供右上角关闭与原生返回手势，不在设置页内嵌二级面板中展示。
