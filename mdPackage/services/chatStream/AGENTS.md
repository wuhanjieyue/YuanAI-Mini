<!-- Parent: ../AGENTS.md -->
# chatStream

主包运行管理器与 Markdown 分包之间的只读适配层。`observeTurn(key, listener)` 转交 `wx.yuanAI.chatRuntime.observe`，返回取消监听函数。

组件挂载、卸载只影响渲染监听；创建、取消、身份、网络与重连逻辑统一在 `request/chatRuntime.js`。验证运行 `tests/chatFallback.test.js` 和 `tests/chatRuntime.test.js`。
