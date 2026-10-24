<!-- Parent: ../AGENTS.md -->

# pages/helpCenter

帮助中心独立使用指南页。

- 由设置页使用 `settingRouterBuilder` 的 `stacked` 选项打开。
- `content.js` 保存面向用户的 Markdown 使用说明，不包含代码实现逻辑。
- 复用 `assis-done` 的静态 Markdown 渲染并关闭消息操作栏；通过 `componentPlaceholder` 异步引用 md 分包，保持主包页面入口。
- 主题、关闭按钮和返回手势沿用升级页交互。

- openSource.js 提供第 11 节开源与第三方声明，追加在使用指南后。修改根 LICENSE、NOTICE、THIRD_PARTY_NOTICES.md 或 THIRD_PARTY_LICENSES.md 时同步更新全文，aboutPages 测试检查一致性。
