<!-- Parent: ../AGENTS.md -->
# conversationFiles

当前聊天文件库半屏页，复用 settingRouterBuilder 和 yb-library-view 的 conversationScope 模式。

- showConversationFiles 输入当前会话与本地消息；loadFiles 读取所有消息页后按 owner 的 id/fileID 续签及获取名称/标签，不扩大到整个文件库。
- 列表操作复用 yb-asset-actions；refreshscopedfiles 重新读消息与元数据，账号 epoch、分页版本与 unload 丢弃迟到响应。
- chatAsset 验证 epoch 后经 opener EventChannel 原样回传 epoch/files，再 navigateBack；首页在 onShow 创建新聊天草稿，不自动发送。
