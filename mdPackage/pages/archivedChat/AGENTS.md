<!-- Parent: ../../AGENTS.md -->

# archivedChat

归档会话只读查看页，入口由设置页在长按菜单关闭后打开。

- 使用 `settingRouterBuilder` 与 `routeOptions: { stacked: true }`，保持设置页的尺寸、圆角和曲线；支持右滑及下拉返回，均向下退场。原生纵向返回通过 `scroll-view associative-container="pop-gesture"` 协调。
- 工具过程与底部操作栏复用聊天页的 `think-item` / `assis-act`，保留带服务端 presentation 的 processTrace、耗时和反馈字段；不使用旧 reasoningContent 生成过程；过程默认折叠，点击打开已有 reasoningPage。操作栏使用 compact 模式，仅保留复制正文和来源。
- 直接复用 `towxmlstream.static`、`towxml openTyper=false`、附件与生图组件，不实例化依赖聊天首页 shared 状态的 assisDone。
- 通过 `request/chatStream` 读取最近 30 条消息；顶部加载更早消息。数据更新后的 nextTick 定位到原首条消息（不等待屏外虚拟列表项 ready），首次打开定位末尾。
- 关闭保留上一层设置页。取消归档成功后通过 EventChannel 通知设置页刷新归档列表与历史列表，再返回；不提供发送或删除入口。
- 请求返回后检查页面存活状态，避免返回或手势关闭后写入已卸载页面。
- Markdown artifactlink 通过 towxml 上的 messageId 只查当前消息 contentParts，再复用 previewMessageAttachment 的所有权下载/只读预览；不得跨消息查找产物。
- 已删除文件卡片和正文文件链接统一显示 `yb-notice-capsule` 删除提醒，仅右侧“获取更多容量”打开订阅页，不自动跳转。
- 助手文件附件在正文后、操作栏前复用 messageAttachments 的 delivery 模式，用户附件保持原展示。
- 正文静态解析传入当前消息 contentParts 作为图片元数据；generatedImages 按 content/settled 去重，并透传 item.status，使正常完成时只展示正文最终图片，停止及无最终图片引用时保留补显示。正文与补显示图片复用同一卡片及不可用状态入口。
