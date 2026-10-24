<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-01 | Updated: 2026-08-01 -->

# assisDone

## Purpose
完成态助手消息组件，负责把最终 Markdown 内容解析成可展示节点，并承载完成后的消息操作和用户内容长按展示。

## Key Files

| File | Description |
|------|-------------|
| `index.js` | 内容解析、消息数据拼装和完成态交互 |
| `index.wxml` | 完成态消息布局 |
| `index.wxss` | 消息与展开态样式 |
| `index.json` | 组件注册配置 |

## For AI Agents

### Working In This Directory
- `wx.towxml(content, 'markdown')` 是统一解析入口；子组件通过 `openTyper=false` 走完成态静态渲染。
- 完成态与 `assisStream` 的字段保持兼容，特别是 reasoning、feature 和消息 ID。
- 父级 CodeGraph 指引适用；修改消息事件或数据结构前查询首页调用方。

### Testing Requirements
- 局部样式改动做 diff 检查即可。
- 修改解析、完成态回传或长按行为时手测 Markdown、思维链和消息操作。

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->

- 将操作栏的 openSources 事件向父组件转发，历史消息沿用 citations 字段。
- 完成态操作栏复用流式完成态的四个常驻入口；历史消息缺少模型名时由聊天视图传入当前模型名作为显示回退。

- 助手 contentParts 透传至 Markdown 图片解析，generatedImages 同时接收 item.status：正常完成且正文引用了生成图片时只展示正文最终版本，其余场景补显示未引用图片；不删除中间版本元数据。正文图片复用同一卡片，历史消息避免重复展示。纯图片消息也必须通知 renderReady。

- `showActions` 默认 true；本地助手欢迎消息传 false，只复用正常回复正文，不显示操作栏。
- 正文解析器的 tap 通过 contenttap 回传，宿主可接入本地欢迎行选择入口；普通消息不监听该事件。

- 助手文件 attachments 复用 messageAttachments 的 delivery 模式，在正文后、操作栏前展示圆角文件列表；用户附件保持原展示。文件预览事件继续走宿主所有权下载入口。图片与文件均可存在于 contentParts。

- Markdown artifactlink 仅在当前 item.contentParts 的交付完成产物中解析，通过 previewFile 复用宿主所有权续签和图片/文件预览，不使用正文中的实际下载地址。
