<!-- Parent: ../../AGENTS.md -->
# knowledgeChunk

知识库当前版本单个分块的只读 Markdown 详情。

- 只传应用内 documentId、分块映射 id 和列表返回的 revision；通过 request/knowledge 获取完整 Markdown，不从列表标题拼正文。
- 复用帮助中心的 settingRouterBuilder stacked、info-page/header 和原生 pop-gesture；towxmlstream.static + openTyper=false 与条款/文件预览的 Markdown 路径一致。
- 请求结果受账号 epoch 和卸载状态保护；版本变化、删除和权限错误不得继续渲染内容。
