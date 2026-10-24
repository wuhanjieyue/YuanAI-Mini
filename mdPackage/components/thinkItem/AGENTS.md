<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-01 | Updated: 2026-08-01 -->

# thinkItem

## Purpose
处理过程摘要项；流式时展示当前阶段/Tool，完成后回传结构化时间线由页面层打开详情。

## Key Files

| File | Description |
|------|-------------|
| `index.js` | 属性定义和 `{ processTrace, processDurationMs, content, durationText }` 的 `open` 事件回传 |
| `index.wxml` | 思维链标题、内容和状态布局 |
| `index.wxss` | 展开态与状态样式 |
| `index.json` | 组件注册配置 |

## For AI Agents

### Working In This Directory

- presentation v1 节点标题和交接标题直接取后端双语字段，已结束工具组只显示后端 groupTitle（当前节点或 completedTools 携带），不得重复添加“已完成”或状态后缀。保留原有图标、箭头、计时、点击和折叠交互。无 presentation 的节点不显示文案。
- `thinkStatus === 1` 或 `2` 且时间线非空时触发 `open`，并透传 `stopped`；组件自身不执行页面跳转。
- 组件不负责流请求、持久化或 Markdown 解析；这些逻辑留在 `assisStream` 和页面层。
- 父级 CodeGraph 指引适用；修改属性协议前查询父组件调用方。

### Testing Requirements
- 样式改动做 diff 检查即可。
- 修改状态或事件时手测流式完成、历史消息和完整思考页跳转。

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->

- 节点标题通过 processTrace.localizeProcessNode 选择后端双语字段，不做固定标题识别或工具名称回退；保留类别图标、真实状态和完整详情入口。整轮“已处理 + 耗时”属于页面汇总提示。
- Keep the visible icon/title/response in a single outer `text` so wrapped lines start at the row's left edge. Loading shimmer uses an absolute, aria-hidden span overlay with transparent duplicate text for intrinsic sizing; measuring inline `text` returned zero-sized bounds in Skyline 1.4.21, and text pseudo-elements did not render the shimmer. Keep this decorative loop in local WXSS.
- Skyline 内联段落的 max-lines="1" 和 overflow="ellipsis" 放在包含图标、标题、箭头和详情的外层 text 上；嵌套详情不独立控制行数。整行最多一行，实时详情由 assisStream 投影最近40个 Unicode 字符的滑动窗口，换行和制表符显示为空格；保留接续布局，完整过程页不截断。
- 标题/完成态时长右侧始终使用公共字体的 `icon-arrow-right`，与标题同用 `ft32`（32rpx）；复用局部 think-icon-gap 提供8rpx间隔，不使用字符箭头；processingOnly 顶部计时行隐藏箭头并禁止打开详情。是否打开详情仍由 openReasoning 的真实内容校验决定。

- 当前行只展示后端标题与实时句子；bash/安装命令仅播放后端已脱敏公开内容。停止状态和打开完整详情交互保持不变。

- assisStream 创建成功后顶部 processingOnly 行固定显示无图标“正在处理 + 耗时”；下方 timelineNode 行保留每个思考/工具的标题、箭头及当前句，完成节点不改成整轮耗时。timelineNode shimmer 仅在节点 active 且整轮未取消/失败时播放，点击透传完整 timelineTrace。普通完成摘要仍由 thinkStatus=2 显示整轮“已处理 + 耗时”。无正文文本段的活动行使用 thinkingStarted。
- completedTools 透传真实调用的 presentation，完成工具组只选后端 groupTitle；不接受旧字符串工具名，不去重拼接标题，不追加完成前缀。
- timelineNode 的 nodeEnded 复用父组件 playbackStopped，标题使用后端 endedTitle；不改原始状态。无真实节点的页面等待占位仍使用本地“正在思考”。
