<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-11 | Updated: 2026-07-12 -->

# mdPackage/components

## Purpose
承载聊天消息渲染组件，包括流式助手消息、完成态消息、思考折叠块，以及统一的 TOWXMLStream 渲染引擎。

## Modules

| Directory | Purpose |
|-----------|---------|
| `assisStream/` | 订阅运行记录并投影助手消息的流式渲染组件（see `mdPackage/components/assisStream/AGENTS.md`） |
| `assisDone/` | 完成态消息组件，使用 `towxmlstream` 的静态模式解析消息（see `mdPackage/components/assisDone/AGENTS.md`） |
| `assisAct/` | 助手消息操作区（see `mdPackage/components/assisAct/AGENTS.md`） |
| `thinkItem/` | 完成态思考入口，向上回传完整内容路由事件（see `mdPackage/components/thinkItem/AGENTS.md`） |
| `messageAttachments/` | 用户图片/文件附件与回复尾部文件交付列表（see `messageAttachments/AGENTS.md`） |
| `towxmlstream/` | 流式增量打字与完成态一次性 Markdown/HTML 渲染入口（see `mdPackage/components/towxmlstream/AGENTS.md`） |

## Key Flows

### Stream Rendering
1. 父组件在模型选择就绪后通过 `startTurn()` 显式启动对应 `turnKey`
2. `assisStream/index.js` 做一次性启动保护并通过 `observeTurn` 订阅运行记录
3. 请求运行管理器负责云端提交、订阅、恢复与取消
4. 渲染组件投影权威正文、过程、来源、图片和任务状态
5. 将完整正文快照写入 `mdText.text`，空正文使用空字符串
6. `towxmlstream/towxml` 负责逐段渲染
7. 完成后通过 `finish` 事件回传新消息
- 用户消息的特别参数与显式 Skill 共用 `featureLabel` 标签，流式、完成态、长按和 finish 回传均保留；feature 仅表示四种原有模式，不能作为标签是否可见的条件。
- 用户消息附件由 `messageAttachments` 在流式与完成态共用渲染

### Done Rendering
- `assisDone/index.js` 中的 `parseContent()` 调统一解析器的 `wx.towxml(content, 'markdown')`
- `assisDone/index.wxml` 通过 `openTyper=false` 让同一 `towxmlstream` 组件直接渲染完整节点树
- 用户消息长按时会读取页面 shared 值并触发放大展示

## Dependencies
- `../../services/chatStream/index`
- `wx.streamTowxml`
- `wx.towxml`
- `wx.worklet`

## Risks / Hotspots
- `towxmlstream/towxml.js` 是高复杂度增量渲染逻辑，修改前需明确性能影响
- `assisStream/index.js` 同时处理流、思维链和完成态收尾
- `assisStream.resetStream()` 会使当前流版本失效，旧流结束后不得再触发首页 `finish`
- `assisStream.finish()` 必须先测量并更新 `chatHeight`、隐藏流式内容，再向首页触发 `finish`；父页面会在事件后关闭 `streamStatus`
- `assisDone/index.js` 与首页长按用户内容展示逻辑耦合

## For AI Agents

### Working In This Directory
- 流式与完成态使用同一渲染组件，修改时分别核对 `openTyper=true/false` 分支
- 如果只改聊天流协议，优先改 `assisStream` 与 `services/chatStream`
- 如果只改显示效果，优先改 `assisDone` / `towxmlstream`，避免改上层页面

- `generatedImages/` 在流式与历史消息中共用结构化生图卡片，独立于 Markdown 渲染。

- 外观通过 theme 属性从聊天容器/归档页传入 assisDone、assisStream、generatedImages 和 towxml。towxml → batch/decode → latex/yuml/echarts 全链路透传实时主题；主题切换不重置流、打字定时器或事件上下文。
