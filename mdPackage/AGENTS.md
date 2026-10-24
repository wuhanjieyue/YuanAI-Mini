<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-11 | Updated: 2026-04-11 -->

# mdPackage

## Purpose
聊天内容渲染分包。负责把模型输出转换为小程序可显示的富文本内容，同时提供流式聊天请求服务。

## Entry Points

| File | Description |
|------|-------------|
| `index.js` | 将同一套 `towxmlstream` 解析器挂到 `wx.streamTowxml` / `wx.towxml` |
| `services/chatStream/index.js` | 通过 `wx.yuanAI.chatRuntime.observe` 只读订阅轮次快照 |

## Modules

| Directory / File | Purpose |
|------------------|---------|
| `pages/archivedChat/` | 归档会话只读查看页，复用设置叠层路由与静态 Markdown 渲染（see `pages/archivedChat/AGENTS.md`） |
| `pages/filePreview/` | 库内及交付文本的只读预览、页面内加载与文件转存，复用设置路由与静态 Markdown 渲染（see `pages/filePreview/AGENTS.md`） |
| `pages/knowledgeChunks/` / `pages/knowledgeChunk/` | 知识库分块列表与完整 Markdown 详情，复用帮助中心的设置叠层路由（see 各目录 `AGENTS.md`） |
| `pages/terms/` | 使用条款独立页，复用设置叠层路由与静态 Markdown 渲染（see `pages/terms/AGENTS.md`） |
| `pages/privacy/` | 隐私政策独立页，复用设置叠层路由与静态 Markdown 渲染（see `pages/privacy/AGENTS.md`） |
| `pages/skillDetail/` | 默认60vh、可上滑展开的 HTTP Skill详情弹窗，复用 upRouterBuilder、库的更新时间格式和静态 Markdown 渲染（see `pages/skillDetail/AGENTS.md`） |
| `components/` | 渲染组件层：流式助手消息、完成态消息、思考片段、TOWXML 引擎（see `mdPackage/components/AGENTS.md`） |
| `services/` | 主包运行管理器的轮次观察入口（see `mdPackage/services/AGENTS.md`） |

## Dependencies
- `wx.yuanAI.chatRuntime.observe`
- TOWXML 及其子组件（audio-player / echarts / latex / table 等）
- `wx.streamTowxml`
- `wx.towxml`

## Working Notes
- `assisStream` 与 `services/chatStream/index.js` 共同构成主聊天的流式渲染链路
- `towxmlstream/` 同时承载流式打字和完成态一次性渲染；通过 `openTyper` 区分模式
- 该目录是 `app.json` 中声明的普通分包，改入口路径时需同步更新 `app.json`

## Test Coverage
- `tests/chatFallback.test.js`、`tests/chatProcessTimeline.test.js` 与 `tests/towxml.test.js` 覆盖消息投影、流式与静态渲染。

## For AI Agents

### Working In This Directory
- 流式与完成态共用 `towxmlstream` 组件，但必须分别保持 `openTyper=true/false` 的生命周期
- 修改聊天运行快照契约时，同时检查 `app.js`、`request/chatRuntime.js`、`request/chatStream.js` 与 `backend/chat_api/`。
- 修改解析器配置时，优先保持流式和静态解析结果一致

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
