<!-- Parent: ../AGENTS.md -->
<!-- Updated: 2026-08-08 -->

# components/_self/yb-chat-view

## Purpose

完整的聊天功能视图。拥有聊天消息、输入、附件、模型/模式弹层、流式会话和聊天内动画；不拥有首页功能选择或页面路由。

## Entry Points

| File | Description |
|------|-------------|
| `index.js` | 聊天状态机、历史缓存、附件上传和组件协调 |
| `index.wxml` | 标题、消息流、输入区及聊天弹层 |
| `index.wxss` | 原首页聊天区域的局部样式 |
| `initShareValue.js` | 输入、附件、消息长按等聊天 shared 值 |

## Chat Lifecycle

- 历史消息进入 `chats` 并由 `assis-done` 渲染；当前页面产生的轮次进入 `sessionTurns`，`assis-stream` 完成后保留原实例。
- 新轮次先写入 `sessionTurns` 显示本地消息；模型选择就绪后，通过 `streammounted` / `startTurn()` 显式握手启动请求，不依赖 Skyline list 子项的二次属性传播。
- 发送时快照当前 feature 与本地待发附件，上传完成后组装含 fileID 的 `contentParts`；输入区在发送时立即清空。
- `endStream` / `stopVoice` 处理中断态；`resetChatSession` 统一清理当前轮次、附件、模式和流式显示。
- 会话缓存命中时先显示最近 30 条，再通过 `/messages/status` 校验版本；旧分页仅追加到当前视图。
- 普通聊天和计划任务对话加载/校验历史期间均允许编辑输入框，发送仍由 startChat 的加载状态守卫拦截；缓存校验成功或失败回写前保存当前草稿，避免覆盖加载期间的输入。
- 未读仅在当前可见会话成功加载或缓存版本校验通过，且完成态助手消息 runId 匹配服务端 completedRunId 时，通过 chatRuntime.markConversationRead 提交后端回执；旧缓存、加载失败、隐藏页迟到响应均保留提醒。页面返回时若当前会话已变为未读，复用 loadConversation 读取结果。
- 切换会话不再阻止云端任务；当前视图只挂接所属会话的活跃轮次，后台活跃轮次前台每5秒发现，组件销毁不代表取消。
- 停止必须调用 `/turns/cancel`；仅临时聊天离开时主动取消，普通会话离开只解除展示。
- 单条消息最多 9 个附件；选择时只保留本地预览，点击发送后才上传。未发送附件可直接移除；已上传附件删除仍走云文件清理。上传失败保留原消息供重试。
- 新附件仅接受 TXT、DOC、DOCX、PDF、XLS、XLSX、MD、PPT、PPTX、JPG、JPEG、PNG、GIF、BMP；后缀统一小写比较，选择器过滤后还需在上传前校验。
- 历史首次加载使用与历史列表底部留白对齐的两轮错落消息骨架；用户气泡行复用右对齐语义，助手内容左对齐。加载更早消息仍在原 120rpx 区域使用紧凑骨架；复用 `/static_wxss/skeleton.wxss`，不得改变滚动锁定和分页时序。

## Host Contract

- 本目录是 YuanAI 的宿主业务容器，不是独立发布组件；它拥有 store、请求、缓存和聊天领域策略。
- `openLeft`：请求首页打开侧栏。
- `openFile`：携带当前聊天参数，请求首页打开文件页。
- `openReasoning`：携带 `{ processTrace, processDurationMs, content, durationText }`，请求首页打开完整处理过程页；后两项仅用于旧消息兼容。
- `openSettings` / `openVoice`：请求首页执行已有页面路由。
- `modeChange`：通知首页当前聊天模式，用于临时模式的页面重点色隔离。
- 顶部模式/当前会话菜单转发 `yb-title-nav` 的锚点矩形；工作模型菜单打开前实测 `.model-summary` 并传给 `yb-models-select`。
- 套餐策略在本组件中解析为模型和档位的 `locked` 字段；`yb-models-select` 与 `yb-reasoning-slider` 只消费最终锁态。
- 聊天/临时滑杆展示当前模型的完整五档（轻度/中/高/极高/超高），由 `modelCatalog.getReasoningChoices(models, modelId)` 从目录派生；默认按目录选择 Yuan-Go 高，权限不足时仍回退到可用档位。模型弹窗复用 Yuan Bot 的完整目录与全部档位，按当前模式传入与滑杆一致的模型/程度；切换模型时同步重建滑杆档位与仪表盘进度，未编辑滑杆或重开弹窗不能改写实际选择。聊天模型与程度一起快照到新发送、附件排队和本地重试；Yuan Bot 的选择仍独立保存。
- 聊天空态由 `yb-log-box` 统一渲染；本组件传入 `temporary-mode` 与 `work-mode`，并接收 `showTemporaryInfo` 打开现有说明弹窗。
- `loadConversation()`、`selectFeature()`、`addSelectedFiles()` 是首页路由回调可调用的公开方法。
- `selectSkill(item)` 仅设置已有 Skill 图片/双语标题标签并保留输入草稿；filePage 选中后下次发送继续快照 skillIds。`prefillSkill(item)` 复用选择逻辑并预填服务端 exampleMessage 并设置 selectedSkill 图片/标题标签，不提交消息。selectedSkill 与四个 feature 模式互斥；关闭标签、重置聊天或账号会清除选择。发送时将稳定 id 快照为 skillIds，附件准备和本地重试沿用该快照，不由技能 id 推断 feature 或图片占位；发送后沿用既有标签清理行为。
- 发送、附件准备、重试及历史恢复保留 `{type:'skill', id, title, titleEn}` contentPart，用户消息标签由 `getChatMessageLabel` 统一投影，不能以 feature 是否非空决定 Skill 标签可见性。
- 创建聊天分支由完成态消息的 `moreAction(branch)` 触发，服务端返回新会话后直接 `loadConversation`；创建点由会话 `branchOrigin.cutoffSeq` 在历史消息中投影，源标题可点击回跳。

## Shared Animation State

- 输入区：`keyHeight`、`inputHeight`
- 底部 AI 提示绝对定位于 chat-shell 现有 36px 留白内，不参与 chat-page、输入区或键盘高度计算；键盘覆盖时不随输入区上移，文案使用 chat.disclaimer 双语词典。
- 页面 hide 时通过 `pageHidden` 卸载仪表盘，避免 Canvas 在透明半屏路由下穿透；show 时按已提交档位重建，输入区占位不变。
- `modelPickerOpen` 与 `reasoningSliderOpen` 联合驱动仪表盘隐藏，保证滑杆到模型弹窗交接时入口不会闪回；Bot 摘要在 modelPickerOpen 期间禁止被布局同步恢复。模型弹窗拒绝打开/关闭时清理状态并恢复入口；异步目录与锚点测量期间屏蔽重复打开。
- 普通滑杆 `closing` 立即设置 `reasoningSliderClosing`，启动仪表盘既有 160ms 恢复；收起完成前仍保留 `reasoningSliderOpen` 和首页手势锁，完成/直接 dismiss 时清理 closing 状态。模型弹窗交接不提前恢复入口。
- 底部栏：`btSca`、`btTrax`、`btTray`
- 文件与功能区布局镜像：`fileHeight`、`funHeight`（由子组件 `heightchange` 同步）
- 长按内容：`contentShow`、`contentTop`、`contentRight`、`moveSca`
- `pressFlag` / `contentShow` 与首页手势锁共享引用，避免聊天长按和抽屉手势冲突。

## Style And Resource Boundary

- 本组件使用 `styleIsolation: isolated`；本地保留聊天领域逻辑、图标码点和动画样式，Iconfont 基类、loading、通用格式化、rpx 换算与触觉调用分别复用 `static_wxss/`、`static/` 和 `static_utils/`。
- `mdPackage` 消息/Markdown 子组件保留各自的 `apply-shared/shared` 配置与全局主题契约；不要误认为父组件隔离已使 Markdown 子树可独立分发。

## For AI Agents

- 输入、弹层和长按子组件仍通过 `selectOwnerComponent()` 读取本组件 shared 值；不要重新耦合到 `pages/index`。文件与功能栏保持自身动画状态，仅以 `heightchange` 同步容器留白。
- 调整 WXML 类名时同步检查所有 `applyAnimatedStyle` 选择器。
- 首页按功能挂载聊天视图；detached 释放渲染订阅并保存当前会话内存视图，普通云端任务继续运行。

- 历史助手消息保留归一化 citations，转发 openSources 至首页；不在组件内导航。普通/失败消息优先使用服务器 displayContent/displayModelRequestId，兼容缺失字段的 content 存档。取消/取消中消息只展示顶层 final 文本段，缺少文本段的旧消息使用 content 存档；pending/commentary 摘要仅保留在处理过程。缓存快照应用时复用同一归一化规则，不能因版本相同或离线恢复旧摘要正文；已冻结的正式正文前缀（包括空串）继续保留，不补出已缓冲尾巴。
- 现代历史助手消息的过程详情复用 `streamProcessTimeline` 显示投影，按真实 `modelRequests` 保留无推理 token 的主请求思考行及请求顺序；不修改原消息或正文选择。缺少文本段且有旧正文的消息继续使用 `normalizeProcessTrace`。

- 首次提交统一调用 `chatRuntime.submitTurn`，渲染组件只投影；打开历史通过云端 activeTurn 恢复源问题和 Stop 状态。
- 连续发送时每条用户消息立即进入 `sessionTurns`；同会话待发送项由 `chatRuntime` 串行提交并在历史恢复时重新投影，较早轮次完成不能清除后续排队气泡。
- 附件发送后立即显示本地消息并清空输入区；原文件留在轮次中供预览和重试，上传成功取得全部 fileID 后才向 `/turns` 提交。创作入口 `sendCreationPrompt` 复用此发送路径。
- 附件选择与发送前共用 `attachmentSelectionError`：单个 PDF 最多50 MiB，其余支持的图片/文件最多20 MiB；未登录时整条消息的全部附件合计最多5 MiB，分批选择也计入已有草稿。输入附件上限独立于后端分析引擎的容量上限。超限不加入草稿或发送队列，复用上传失败提示。
- 点击已删除文件卡片或正文文件链接时，复用上传提醒胶囊：左侧显示删除提醒，右侧“获取更多容量 + icon-arrow-right”；只有点击右侧才打开订阅页。普通上传提醒仍显示关闭按钮。
- 本地失败且无消息 ID 的原轮次通过 `retryLocalTurn` 重新校验模型并在原 `sessionTurns` 行重试；若同会话仍有运行轮次则排到队尾。
- `loadConversation`、模型目录等待、历史分页及完成回调均检查账号 epoch 和视图代次；缓存校验期间禁止新发送，保留草稿。
- 输入停止按钮同步冻结当前可见输出并恢复发送/语音，同时发送云端取消请求。临时会话不写消息缓存和侧栏目录。
- 停止后的本地finish不等待云端取消完成；无服务端ID的cancelled消息也保存到会话内存，用localTurnKey匹配迟到conversationready并补全真实会话/轮次/消息IDs。补身份只更新对应停止行和缓存，不改截止正文/时长或当前新轮次的输入状态。
- 当前轮次stopped标记阻止停止后模型目录准备触发首次提交；晚挂载的组件先进入停止门禁，就绪运行仅接纳身份。用户显式重新生成或本地重试清除该轮次标记。
- `regenerate` 使用原 turnId 提交新执行实例；先确认原 list-item，再在同一行替换响应。所选轮次成为最新轮次，移除其后的本地消息、分支提示与旧高度占位；历史刷新用 historyInline 投影到原 chats 行。提交前失败还原原数据，云端已创建轮次后失败则重新加载会话。
- 重试的用户气泡插件标签与本次 feature 同步，包括 historyInline 和同一行再次重试；通过保留的 userMessageId 找到共用用户消息，只替换 feature contentPart，保留正文和附件。创建失败恢复原标签，普通重试沿用最近一次插件。
- 助手 feature 只沿用服务端轮次选择或同轮用户的 feature 标签；不能根据图片产物推断 imging。普通聊天自主生图及其重新生成均不创建本地图片占位，仅显式【创建图片】选择保留加载卡片。

- 标题命名轮询由 chatRuntime 管理；组件通过最近/置顶共享缓存同步当前标题，不持有命名计时器。加载历史发现 pending 时交给运行管理层继续检查。

- `yb-trending-search` 负责推荐 mock；仅设置开启、会话为空且未加载/校验、输入失焦且无原始文本时显示。显示时挂载并在 ready 绑定动画；隐藏时立即禁止组件宿主的 pointer-events，再通过 visible 播放退场动画，完成后用 wx:if 销毁宿主；ready 前已经隐藏时直接通知卸载，避免透明宿主遮挡聊天点击。焦点通过输入组件原生事件同步，文本通过 getAskText 同步。

- 推荐点击只通过 selectFeature(searching) + setCopytext 回填和聚焦；不提交聊天。显示额外要求 recommendationItems 恰好三条。
- 每日推荐缓存最多保留三十条候选、至少九条有效才完成，界面只展示三条；手动刷新只在前端随机换一组，不触发新的 LLM 任务。
- 每日推荐请求只在进入前台或设置重新启用时查询一次；queued/running 不启动定时轮询，结果在下次自然查询时读取。

- history-initial-loading 定位容器常驻并以 hidden 切换，骨架内容按需挂载；高度随 chat-page，底部复用列表的 pdheight/inputHeight/fileHeight/funHeight 加 chatHeight，不使用固定屏幕底部偏移。

- 工作模式的稳定 modeId 仍为 `work`，展示名称为 `Yuan Bot`。空会话复用 `yb-log-box` 的 Logo、布局与键盘高度动画，显示“专属于你的云端助理机器人”；不显示目录选择欢迎行与热门推荐，不写入 chats/sessionTurns 或提交后端。
- Yuan Bot 开发期间禁用底部输入与发送/语音入口，占位说明为“此功能正在开发中”；复用 chatInput.disabled/disabledPlaceholder，startChat 同步阻止工作模式新发送。切回聊天恢复原草稿，已运行会话仍可停止。

- 活动过程详情属于同一轮展示；页面导航期间用 setProcessDetailVisible 保留原 SSE 可见所有权，避免临时轮次因打开详情被取消。导航失败与页面返回清理该标记，普通离开维持原生命周期。

- 历史助手文件 attachments 也从 contentParts 规范化，保留 assetId/删除状态；与流式 finish 的文件附件字段一致。

- 聊天上传/历史附件的 src 只使用本地 previewPath 或后端 CDN URL；fileID 是 COS Object Key。历史和 file_delivery/image_generation SSE 返回 urlExpiresAt，已删除资产保持原占位。

- Skill 草稿和消息保存双语标题元数据；应用语言变化、历史缓存及排队轮次恢复时通过 getChatMessageLabel 重新投影标签，不修改 Skill ID、消息正文或执行参数。

- 附件限制/上传失败提示复用公共 yb-notice-capsule，customContent+alert 模式在默认slot保留 text-err-l1 文案，suffix slot保留 bg-l2/cradius 关闭按钮；完全显示后使用默认2000ms停留时间。showUploadFailure/hideUploadFailure仅更新文案并调用公共show/hide，动画、定位与计时器都由公共组件负责；不修改任何附件校验规则。

- moreAction.readAloud 将当前回复ID交给 yb-read-aloud；leaveConversation（新聊、切会话、账号切换、卸载）统一stop，离页由播放器自身停止。朗读错误本地化提示，不转交首页的未实现操作分支。

- 语音听写由yb-chat-input调用request/transcription.js；voiceError复用showUploadFailure/顶部提醒胶囊。leftIcon=stop的左侧按钮显示黑色icon-x并取消语音；停止/加载按钮移入输入组件，位于发送箭头左侧，加载状态不再镜像到宿主。sendTranscription复用startChat/acceptSend，并在finally按版本恢复未被接受的草稿；leaveConversation先取消录音与识别，再保存/恢复草稿，防止串会话回填。朗读仍使用原readAloud路径。

prefillMcp(item) 按当前语言选择 exampleMessage，清理原有 feature/selectedSkill，仅通过输入组件 setCopytext 预填草稿；不选择 Skill、不发送消息。

- 深度思考在模型/思考程度目录请求成功且当前选择有效前保持关闭；加载成功后按各模式偏好恢复，手动开启先等待目录就绪。加载期间切换模式不覆盖原有偏好。
