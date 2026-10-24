<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-12 | Updated: 2026-10-02 -->

# pages/aboutWebView

## Purpose
关于/帮助类网页容器页。单页使用 WebView 渲染器与原生导航栏，其余页面继续使用 Skyline。

## Entry Points

| File | Description |
|------|-------------|
| `index.js` | 读取路由参数、设置原生标题并绑定主题 |
| `index.wxml` | 主题背景与 `web-view` |
| `index.json` | `renderer: webview` 与原生导航栏配置 |

## Input Contract
通过路由参数接收：
- `title`
- `url`

## Dependencies
- `../../static_utils/themeBinding`
- `web-view`

## For AI Agents

### Working In This Directory
- 参数值会 `decodeURIComponent`，传参时应保持一致
- 使用普通 `wx.navigateTo` 打开，不传 Skyline 专用 `routeType`；返回使用原生导航栏。
- `web-view` 会铺满页面并覆盖其他组件，不在其上叠加自定义标题栏或关闭按钮。
- 页面级 renderer 配置要求基础库 2.30.4+；外部网页需符合微信业务域名要求，真实页面加载和跨渲染器返回需在开发者工具/真机验证。
