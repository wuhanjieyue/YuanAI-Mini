<!-- Parent: ../AGENTS.md -->

# mdPackage/services

## Purpose

连接 Markdown 分包与主包运行管理器，只读订阅轮次快照。

## Entry Point

`chatStream/index.js` 导出 `observeTurn(key, listener)`，转交 `wx.yuanAI.chatRuntime.observe` 并返回取消监听函数。

## Boundaries

- `assisStream` 按稳定轮次 key 订阅，卸载时取消监听。
- 创建、取消、网络订阅与重连统一由 `request/chatRuntime.js` 管理；渲染组件不拥有任务生命周期。
- 快照契约改动需同时检查 `app.js`、`request/chatRuntime.js`、`request/chatStream.js` 与上层消息投影。

## Verification

`tests/chatRuntime.test.js`、`tests/chatFallback.test.js` 和 `tests/chatProcessTimeline.test.js` 覆盖运行生命周期与只读投影。
