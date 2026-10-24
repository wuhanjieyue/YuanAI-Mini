<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-01 | Updated: 2026-08-01 -->

# assisStream

## Purpose
流式助手消息组件，订阅主包运行管理器的消息快照，展示正文和结构化处理时间线；每个页面会话轮次拥有一个稳定 `turnKey`。

## Key Files

| File | Description |
|------|-------------|
| `index.js` | 消息投影、思维链状态、Markdown 渲染和 finish 事件 |
| `index.wxml` | 流式消息、思维链和流式渲染器布局 |
| `index.wxss` | 流式消息与过渡效果 |
| `index.json` | 组件注册配置 |

## For AI Agents

- 安装阶段复用命令逐字播放与最近40字符窗口，保留服务端已脱敏 pip/npm 命令中的路径、版本号和标点；标题仍为“安装依赖”。终态沿用原清理，不播放内部驱动或原始日志。

### Working In This Directory

- presentation v1 的新节点直接显示后端文案，仅按 format 选择普通文字、代码或思考播放；不根据工具名/阶段改写内容。保留游标、40字符窗口、并发轮换和停止门禁。completedTools 透传 presentation，完成工具组仅选取后端 groupTitle；无 presentation 的旧缓存节点不展示，不再读取 reasoningContent 生成过程内容。
- 组件通过 `observeTurn` 接收已归约的消息快照与连接状态；禁止在组件中创建、取消或重连云端任务。
- 普通用户发送后先沿用三点波浪加载；上传、等待队首与尚未创建云端轮次都保持此状态。显式创建图片（imging）不在挂载、上传/模型准备/轮次创建等待期间创建 Canvas 占位，也不显示通用三点。取得 `/turns` 成功响应中的 turnId/runId 后常驻显示无图标“正在处理 + 耗时”，每秒更新，无箭头且不可打开详情。真实顶层 model_request 开始后在下方追加思考行，即使尚无思考 token；后续实际推理替换同请求空行，不生成重复节点。离线和重连不另添正文提示。
- `turnKey` 的一次性启动保护和 `resetStream()` 的渲染代次保护必须保留，旧流结束后不能触发首页 `finish`。
- 本地用户消息展示与云端任务提交分离：挂载后发出 `streammounted`，父组件只通过 `startTurn()` 传入已就绪的模型选择；不要恢复为属性 observer 自动发请求。
- 首发态用户消息保留“外层动画/测量 + 内层限宽气泡”的两层结构，与完成态一致，避免 Skyline 长文本按固有宽度溢出。
- 正常 finish 前先完成尺寸测量；完成后保留 `mdText`、思维链和 Stream 节点，只增加完成态操作栏，再向父级回传。用户停止直接本地完成，不等待尺寸测量或云端终态。
- 空正文和重置状态使用空字符串，不向打字器传占位换行；快照到达前消费占位字符会导致首字丢失。加载指示由空正文判断。
- 不含正文文本段时，思考文字读取当前过程节点 presentation 的当前语言 content，不用旧 reasoningContent、阶段标题或 details 补正文。主 Agent 和实际函数的推理/正文以24毫秒逐字显示，标点清句；首次恢复既有快照直接对齐当前句，重复快照不重复入队。同批（run/modelRequest/parentCall 相同）多个实际函数 running 时，当前函数连续3秒没有新正文或逐字播放则依顺序轮换，最后回到第一个；单个函数、ready/exec、主推理与不同批次不参与。轮换保留各函数的播放游标，首次轮换到未展示的函数播放已收到的积压；普通终态切换仍跳过未展示并行函数的切换前积压，串行下一函数从首段播放。重复快照不延后轮换，终态、停止、重置、卸载清理轮换定时器；轮换仅投影本地摘要，不修改完整trace或执行工具。
- 打字器输入只取后端 presentation.content/responseItems，format 决定文字、代码或思考播放；主正文不替换工具名称。保留累计快照、原协议偏移、语言切换与 resetStream 清理。
- 父级 CodeGraph 指引适用；修改投影契约前查询首页、服务层和渲染器调用链。
- 时间线 thinkItem 通过 nodeEnded 接收已有 playbackStopped；自身结束或后续输出只结束旧行展示，不改写工具真实状态。思考完成标题与闪动统一由 thinkItem/processTrace 显示投影处理。

### Testing Requirements
- 纯样式改动做 diff 检查即可。
- 修改流协议、思维链或 finish 时手测正常结束、错误结束、停止后旧流回调和空内容。

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->

- citations 随快照替换，重置时清空，完成时传入 assistantItem；来源点击逐层转发至首页。

- 图片随快照替换；纯图片和空内容的终态直接收尾，取消保留已有内容，不使用故障兜底文案。
- 显式创建图片与主 Agent 自主生图复用同一生成中图片卡片及 Canvas 点阵，默认占位为576×768（3:4）、75vw宽和100vw高，与后端默认尺寸同步。占位依据真实生图执行节点或服务端 image_generation 事件，不从用户输入猜测；摘要尚在播放时不越过时间线门禁。空运行快照保留已挂载占位，正式图片到达后替换，完成/失败/取消且未交付时清除。
- 重新生成事件来自消息操作栏，交由聊天视图提交；组件不复用旧流回调。
- 打开过程详情时，事件中的 turnKey 使用当前订阅的 runtimeKey（_startedTurnKey），不使用列表渲染的稳定 turnKey；重试提交失败恢复旧回复时一并恢复原运行标识，防止详情页订阅旧过程并覆盖新结果。
- 完成态操作栏仅保留复制、反馈、分享、更多；分享和更多动作逐层转发，更多中的重试仍走重新生成事件。
- 无服务端消息 ID 的失败终态由操作栏直接发出 `retryLocal`；重新提交前 `restartLocalTurn()` 重置原行渲染并重新订阅，不另添用户气泡。

- responseItems 阶段的 responseItems 定义来源/思考/回答条目边界，来源每条24毫秒逐字且标点不清句，按 processId 独立游标；实际函数节点直接播放 responseContent。正常终态先排空本地队列再收起，不阻塞服务端；取消立即清理，恢复快照不重播。displayProcessTrace 仅控制当前行，打开详情传完整 processTrace，默认折叠。
- textSegments 时间线按顶层 modelRequest 顺序累积“思考行 → 公开摘要纯文本 → 工具行”；下一请求追加而不替换上轮摘要。pending 仅在同请求已有真实顶层调用时可作为摘要，否则等待用途确认。一句话摘要使用原生 text，复用24ms逐 Unicode 字符队列，整段保留标点和换行；不解析 Markdown。即使下一节点或 final 已收到，也仅展示到首个尚未播放完的摘要；正文结束、同一主请求模型完成、已校验工具ready/执行、下一主请求或正式final等真实后续证据可确认摘要结束；完整前缀已显示后才放行后续节点、产物卡片及正常收起，禁止瞬时补齐或用超时跳过摘要。仅proposed和工具子模型完成不能关闭主摘要，衔接时完整投影最后的公开能力名，不修改原段状态。主推理按24ms逐字显示当前句，句尾保留到下一句首字到达，末尾空白不清空当前句。未确认用途且无真实调用的 pending 正文不能结束思考播放；可展示摘要/工具/正式回答接管时停止播放，思考自身结束则丢弃剩余播放队列并保留已显示当前句，聊天思考行继续保留；同请求摘要首个非空白字符显示时才隐藏该行，首字与隐藏同批提交，完整详情仍保留原节点。工具区结束即停字，沿用一条稳定行显示 completedTools 的公开名称列表；实际执行状态只读原 trace。每个主请求的工具区只保留一个稳定行，同槽工具切换/3秒轮换不算新行交接，复用 currentProcessNode 选择真实工具；exec 仅在实际工具尚未出现时展示；实际工具完成的间隙保留完成行，同轮随后新工具仍可接管原槽，下一主行开始后才永久结束该槽。不同主请求的工具行仍按轮次累积。子工具文本只留在该轮工具行和完整详情。processTrace 保留原服务端快照，timelineTrace 是安全显示投影，用于完整详情和完成态本地消息；不送回归约器或模型历史。
- 确认 final 或无正文终态且全部摘要文本已播放完后，.stream-process-row 通过 shared 收起进度/opacity + applyAnimatedStyle/timing 在650ms内收起，图片不参与；900ms watchdog只处理收起的测量/动画回调丢失，不越过摘要门禁。收起完成才发布正式 mdText 并重建 Markdown 子节点，顶部切换为“已处理 + 耗时 + 箭头”。失败兜底遵循相同切换，操作栏仍等待 Turn 终态与最终 Markdown finish；正式正文始终流式，不提前补齐。点击停止继续立即收起和本地完成。当前协议在模型响应结束时确认 final，用途未确认前不猜测正式正文。
- 当前摘要逐字完整显示、尚无可展示后续时，在其下方复用 thinkItem 显示“正在思考”占位，并沿用完整详情入口。未收到结束信号时，复用每秒处理时钟，在最后一字显示后至少500ms仍无增量时显示占位，避免连续小块响应频繁闪烁；新摘要文字到达即撤销并继续原游标播放，不将队列暂空视为摘要完成。已确认结束时无需等时钟。占位仅为本地显示，不加入 processTrace/timelineTrace 或伪造工具执行状态。工具、下一主请求或 final 接管后撤销，停止/重置/卸载同步清除。
- 过程游标按真实 node.id 保存，工具行轮换保留各函数游标，24ms逐 Unicode 字符保留当前句；同批多个实际 running 函数连续3秒没有新输出或逐字播放时沿用 syncToolRotation 轮换，仅为最新 active 组启动一个定时器。重复快照不延后轮换，单工具/ready/exec不参与；普通终态切换跳过从未展示的并行函数积压，串行下一函数从首段播放。responseItems 来源条目保留标点，公开名称替换后的显示范围与原始 UTF-16 offsets 分开。恢复首快照不重播，停止/重置/卸载清理游标、时钟、收起回调并取消共享值上的旧动画。不含 textSegments，或文本段为空且含权威 content 的消息，按独立正文与活动过程行展示。

- 刷新由父级 list-item 在清空响应前保留实测最小高度；reloadResponse 保留原 streamMinHeight，observeTurn 不用 chatHeight 覆盖刷新轮次，避免内部占位增高；刷新完成也不回写全局 chatHeight，保持历史底部留白。

- towxml 打字器按实例初始化并在终态停止；resetStream / restoreResponse 必须递增 markdownKeys，只重建正式回答 Markdown 子节点，清除旧 batch 与游标，保留外层消息和高度占位。摘要语言或非追加文本替换只重置对应文本游标；已播放完的摘要按交接原文重投影公开名称，不吸收迟到追加。最终正文仅在收起完成时递增 key；独立正文同一 Turn 新主请求首个正文增量替换旧正文并递增 key。旧 key 的 finish/stopped 回调不可结算新正文；摘要旧定时器和提交回调不可放行新一轮。
- 取消终态即使没有处理过程，也显示不可点击的“你在 X 后停止了”；有过程时保留详情入口。历史归一化同样依据 cancelled 状态恢复该行。

- generatedFiles 与用户 attachments 分开；finish 同时回传助手文件 contentParts/attachments，重新生成清空旧文件。流式输出期间不挂载助手文件卡片，settled 后复用 messageAttachments 的 delivery 模式，在正文后、操作栏前展示交付列表；用户附件保持原展示。

- `responseStarted` 仅记录真实上游 chunk，不能替代 `/turns` 创建成功的展示边界。主 Agent 思考行显示“正在思考”，pending/commentary 摘要显示在其下方正文区；独立正文同时展示一个活动过程行。实际函数的经服务端校验公开流展示在所属节点，不能混入主正文。exec 只根据 public.toolNames 展示服务端“正在使用…”标题和 icon-skill-tool，无名称时隐藏；不显示通用状态、summary、脚本、参数或脚本输出。

- Markdown artifactlink 只在当前助手 generatedImages/generatedFiles 元数据中解析，再转为既有 previewFile 事件；图片元数据透传给 towxml，未完整图片语法由正文内的既有图片卡片占位。imagecards 仅报告打字器已渲染的产物 ID，使正文接管对应卡片；不能用尚未打印的全文提前隐藏图片。Markdown key 更新时清空接管 ID，旧 key 的事件不得更新新正文；图片元数据继续参与 finish 与历史缓存。

- 时间线局部样式保留收起容器 overflow:hidden 和摘要段间16rpx留白；节点复用 thinkItem 的主题文字/图标样式。摘要原生 text 沿用正文32rpx字号、1.8行高，颜色复用公共 --text，尺寸仍在组件局部样式；展示前缀去掉末尾空白以免空行撑高，内部段落、队列原文和游标保持不变。正式正文复用 towxml，未新增公共颜色或动画库。

- 点击停止是显示截止点：先捕获点击时长和 `#streamMarkdown.stopTyping()` 返回的实际已打印正文，缺少子节点时保持空正文，不使用收到但未显示的全文；清理计时/逐字/轮换/收起回调，立即设共享 height/opacity 为0并隐藏所有过程段、固定停止摘要、显示操作栏，正式回答节点不重建。正常终态仍沿用650ms收起和Markdown完成。停止后快照不能改正文、时长、过程或展示状态；云端取消仍由运行管理器负责。
- 停止时尚无服务端turnId的组件只保留一次身份订阅：创建响应到达后更新消息真实IDs并派发conversationready，不再投影响应。无ID停止消息附带本地localTurnKey供聊天视图补缓存身份，不能因此重新打开停止按钮或再次触发finish。

- `applyCloudSnapshot` 是消息展示入口和停止门禁，统一保存权威快照、文本段与模型请求，再由 `assistantProcessTimeline` 确定展示数据。`applyTimelineSnapshot` / `applyBodySnapshot` 只负责各自内容投影，共用 `snapshotArtifacts` 的产物与引用来源，不能重新接受停止后的快照。
- 文字播放按摘要整段、过程当前句、来源条目处理；运行中 bash 的 public.command 复用 `advanceProcessText` 逐字累积，保留原始换行与标点，终态停止播放并在完整过程详情展示结果。此播放是参数展示，不是沙箱 stdout 流。实时过程文字经 `processTextWindow` 显示最近40个 Unicode 字符，每新增一字滑去首字，换行和制表符显示为空格；正常分句及来源条目边界保持，恢复和并发切换同样应用窗口，不改原文、游标、摘要段或完整过程详情。`isWaitingForNextNode` 是摘要等待占位的唯一判定，快照与计时更新共用；`clearSearchTyping` 统一清理条目播放计时器并使已排队回调失效。

- `stopDisplay()` 返回实际已打印正文 UTF-16 长度和点击耗时，重复调用返回相同边界，由聊天视图交给运行管理器持久化；渲染组件仍不发请求。恢复带 displayStop 的消息只展示保存的正式正文，后台仍收尾时不重新挂载流式响应。

- 同请求实际操作已结束时，failed/unknown exec 优先保留为该组标题，不能被成功子调用掩盖。completedTools 仅包含 completed 子调用；含 failed/partial/unknown/cancelled 的组不显示笼统已完成汇总。保持原摘要打字顺序、并发轮换与展开动画，完整详情实时反映子调用状态。

- 图片按服务端 contentParts.callId 匹配真实子调用，再归入该主请求的稳定工具槽；复用 generatedImages，位于工具行之后、下一主请求之前。摘要门禁尚未放行工具槽时，不从尾部提前挂载同一图片。生成中、完成与失败更新原槽；旧无关联产物继续走尾部兼容展示。停止后保留已收到的产物并拒绝迟到快照，缺少已展示工具槽的产物在停止时释放到兼容槽。
- 650ms 收起只测量/动画 `.stream-process-row`，共享进度与透明度；图片是每个工具槽中过程行的稳定兄弟组件，不参与收起，不因 processCollapsed 重挂载。重置、停止和卸载清理行样式及旧动画回调；最终正文仍按当前 Markdown key 的 imagecards 接管对应产物，旧 key 不能隐藏图片。恢复/重试回滚同时保留图片槽和兼容产物数组。
- 工具槽和兼容图片槽向 generatedImages 透传 terminalStatus。正常完成且正式正文已渲染最终图片后，中间版本不再补显示；生成中顺序、停止时已交付图片和完整产物元数据保留。
