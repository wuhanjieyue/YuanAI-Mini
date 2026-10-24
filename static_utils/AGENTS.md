<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-11 | Updated: 2026-07-12 -->

# static_utils

## Purpose

处理过程新协议以服务端 `presentation.version=1` 为唯一文案来源：processPresentation 仅按语言选值，publicProcessText/localizeProcessNode 不重写后端标题、详情、摘要和错误。format 控制播放方式；applyProcessPresentations 按身份、状态和独立 UTF-16 内容偏移合并实时补丁。中英文缓存同时保留，空内容须清除旧文本。无 presentation 的本地旧缓存节点不展示；历史重新读取时由后端补齐，不保留前端文案兼容分支。

项目公共工具库。覆盖初始化、单位换算、节流防抖、事件总线、设置模块辅助、音色配置。

## Key Files

`billingView.js` 将服务端计费摘要派生为本周期展示；只做显示计算，不作为资金门禁或价格来源。套餐、购买及处理中额度分开显示。使用比例固定保留一位小数，文字、无障碍标签和进度条宽度共用该值。

| File | Description |
|------|-------------|
| `appInit.js` | 同步、幂等地初始化全局窗口与胶囊尺寸 |
| `appDataInit.js` | 启动时并发、去重同步账户、远端设置和模型目录，并写入全局 store |
| `initUtils.js` | 注册小程序版本更新事件 |
| `otherUtils.js` | 常用杂项工具，`rpx2px` 与 `formatFileSize` |
| `routerUtil.js` | route builder 基础曲线、动画状态、手势常量 |
| `searchAnimation.js` | 底部搜索关闭时捕获键盘高度与按钮进度，由原生键盘 Worklet 同步退场 |
| `voiceOptions.js` | 音色配置与显示名映射 |
| `accentColor.js` | 重点色色板、浅色/深色语义与运行时 CSS 变量映射 |
| `chatFeature.js` | 聊天特别参数枚举、消息展示文案与 `contentParts` 解析 |
| `chatAttachment.js` | 附件选择数据标准化、`contentParts` 构造与文件类型展示映射 |
| `chatMessageCache.js` | 单会话最近消息裁剪、10 会话 LRU 与存储配额淘汰策略 |
| `chatHistoryMessages.js` | 聊天历史与只读预览共用的单条消息显示投影 |
| `modelCatalog.js` | 前端模型目录清洗、权限比较、选择回退和展示数据派生 |
| `assetListBehavior.js` | 两类列表的分页、迟到响应保护、刷新与预览/长按状态 |
| `assetPresentation.js` | 文件卡片名称、类型和上传时间展示；formatDateTime 共用于库日期和 Skill 更新时间 |
| `homeFeature.js` | 首页功能稳定枚举、切换事件名与默认回退 |
| `i18n/` | 轻量中英文词典、语言值映射、文本插值与业务组件语言 behavior |
| `haptic.js` | 统一按开关和强度触发短震动 |
| `settingApi.js` | 设置模块页面适配 API，底层调用 `request/` 中的HTTP 封装 |

## Functional Groups

### Animation / Route
- `routerUtil.js`

### Settings Domain
- `appDataInit.js`
- `settingApi.js`
- `voiceOptions.js`
- `accentColor.js`
- `chatFeature.js`

### Async / Utility
- `debounce.js`
- `eventBus.js`
- `haptic.js`
- `otherUtils.js`

## Dependencies
- `wx.worklet`
- `wx.showToast`, `wx.hideLoading`
- 页面对 `su_system` / `su_menu` 的全局初始化

## Test Coverage
- `tests/appDataInit.test.js` 校验启动同步去重与过期响应保护
- `tests/accentColor.test.js` 校验重点色选项、默认回退和运行时 CSS 变量输出
- `tests/chatArtifactLinks.test.js`、`tests/fileDeliveryList.test.js` 与 `tests/conversationFiles.test.js` 校验附件展示、交付及预览边界
- 模型配置、权限矩阵和供应商参数映射由 `backend/tests/test_chat_api.py` 与 Agent 的 `test_runtime_context.py` 验证

## For AI Agents

### Working In This Directory
- 优先保持工具函数纯净，除非文件职责本身就是 wx API 包装
- 界面语言以 `applicationSettings.language` 为唯一状态源；翻译词典不保存状态
- 新增设置相关辅助时，先检查能否并入现有 `settingApi` / `voiceOptions`
- 重点色选项和深浅色映射统一维护在 `accentColor.js`，页面与组件只消费 CSS 变量
- 聊天参数只保存稳定枚举；展示文案和历史 `contentParts` 解析统一走 `chatFeature.js`
- `modelCatalog.normalizeModeSelection` 在全部模式校验显式模型、模式支持与权限；`getReasoningChoices(models, modelId)` 派生当前模型的完整五档，模型弹窗消费完整目录。`getReasoningIndex` 按模型与档位精确匹配位置，缺失时回退到该模型高档或首位；组合 ID 不作为后端 effortId 发送。
- `getSkillTitle` 按 toLocale 选择双语标题并回退；`getChatMessageLabel` 将 feature 和显式 Skill contentPart 投影为用户气泡的同一标签；Skill 标题不作为 feature 枚举或图片占位依据。
- 聊天附件元数据和展示映射统一走 `chatAttachment.js`，原始 `size` 保持数字
- 文件库的 origin（uploaded/generated/空）通过 assetListBehavior 进入请求缓存分区，assetListCache 保留 origin；conversationFiles 用消息 role 提供本地来源，非临时会话由 owner 校验后的元数据更新，不改写消息快照。
- 聊天消息缓存统一走 `chatMessageCache.js`；每会话最多 30 条、全局最多 10 个会话，不要在页面重复实现淘汰规则
- `chatHistoryMessages.normalizeHistoryMessage(message, language)` 保留历史消息正文、停止前缀、处理过程、来源和附件的既有投影；仅 user/assistant 返回显示对象，其他角色返回 null。不修改原消息，不请求、不缓存；聊天与只读预览复用同一函数。
- 缓存助手 feature=imging 与后端图片 displayMode=markdown 同时出现时，拒绝该矛盾缓存并重新读取服务端；不从图片产物补造插件选择。
- `routerUtil.js` 是多个 route builder 的共享底座，改动会影响多个页面
- 触觉反馈唯一开关为 `applicationSettings.hapticFeedback`；业务代码统一调用 `triggerHaptic`，由该开关控制

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->

- `processTrace.js` preserves server-sent titles/tool icons and selects the current node. Main `main_reasoning` / `public_commentary` stages normalize to the local icon-thinking for live/history consistency, including older server icon values. Python `backend/chat_api/serialize.py` validates registered-tool presentation and supplies title/icon fallbacks for saved records.

- `localizeProcessNode` 仅为显示投影：按当前应用语言和稳定 name/stage 翻译词典中的固定标题、exec 工具列表及固定错误消息，保留自定义标题和模型正文/说明/结果。不改缓存、调用身份、状态或执行；实时 thinkItem 与完整过程页共用它，旧历史可凭精确固定标题回显。词典与后端 presentation 的固定文案保持一致。
- `bash` 使用 reasoning.commandStates 显示“正在运行命令／已运行命令”及非成功终态；publicProcessText 仅在 running 返回服务端脱敏的 public.command，保持命令原有标点与路径。终态沿用结果正文，不重播命令；不解析 exec 脚本预测命令。

- `publicProcessText` 只返回后端当前语言的 content 和 responseItems，不替换内部名称；publicMainTextProjection 保留主模型正文原文。原始缓存、UTF-16 偏移和真实工具身份保持不变。

- 实际函数 running 优先并保留并行锁定；没有 running 时优先显示已校验 ready 的实际函数，再选择 exec 或文本阶段。显式插件的 host exec 到真实函数执行之间不得回退显示“正在思考”；仅按服务端调用证据显示，不从用户插件标签构造节点。

- `chatSources.js` 校验来源 URL、限制数量和标题长度并提取展示域名；保留来源 hostLogo 的安全 HTTP(S) 域名地址，由 sourceIcons.test.js 校验来源及图标合同。
- `chatSources.knowledgeCitationId` 只解析严格的证据 ID，供请求层与 Markdown 解析共用；不授予访问权、不向 URL host 请求。来源页仍通过本应用鉴权接口读取证据。

- sourceIcons.js 仅使用来源 hostLogo，不推导网站图标请求；缺失或不安全时由来源页/操作栏已有本地搜索图标回退。按有图标的来源域名去重取最多3个，保留 siteName/description。

- `generatedImages.js` 合并结构化图片状态，按 artifactId 固定初始宽高；完成图片不被迟到的生成/失败事件覆盖。

- `theme.js` 解析系统/固定外观并选择 skycolor 色板变量；`themeBinding.js` 在页面 onLoad/onUnload 绑定/清理 MobX reaction，onShow 同步当前页面导航前景。原生背景的 JS 值与 theme.json 由 darkMode.test.js 核对。

- 文件卡与聊天附件的语义图标集中于 `chatAttachment.FILE_ICON_TYPES` / `FILE_ICON_CLASSES`；音频与视频共用 `icon-video`，压缩包使用 `icon-archive1` 以避开聊天归档操作的 `icon-archive`。`assetListBehavior` 的请求版本号在搜索变更与 detached 时立即失效，防抖取消不能替代迟到响应保护。

- 随包创作样例不能直接用包路径交给原生预览；点击时复制到 `USER_DATA_PATH/yuanai-create-preview-<sampleKey>.jpg` 固定六个文件，云图片保持原 URL。异步复制后仍检查列表版本/销毁/菜单状态。


- assetListCache.js 只负责列表元数据规范化、30 天 TTL、10 查询/5 页/2 MiB 限额；裁剪完整尾页并保留对应游标，不缓存短期 URL。assetListBehavior 通过 request/assetCache 管理身份、条件校验和续签；缓存切换不闪空，强制刷新保留旧内容至成功。

- storageView.js 只格式化服务端容量统计，校验分类合计并限制进度条不超过100%；不推算或覆盖服务端套餐。

- settingApi.updateSuggest 在服务端保存成功后广播 dailyRecommendationSettingsSaved，避免开启推荐时先于后台设置写入发起生成。

- longTermMemoryView.js 只把长期记忆 items 转成记忆摘要的 id/title/body；不引入分组、来源标签或状态文案。

- `chatSegments.js` 归约文本身份、用途和偏移；mainTextProjection 返回最新已有正文的主请求 displayContent/displayModelRequestId，包含 pending/commentary/final，同请求多 item 拼接，工具文本不混入。`processTrace.js` 保留含 partial 的工具八态、parentCallId 与公开详情；currentProcessNode 可锁定实际 running 函数，并在终态后选择同 exec 下最早 active 函数。正文出现不能完成工具，已确认结果不可被后续事件覆盖，缺少旧工具结果时保留 unknown。工具状态文案由后端 presentation 返回，页面停止提示使用 i18n.reasoning.stopping。

- code_mode 的 `exec` 及嵌套函数以真实调用形成独立节点，调用身份不能中途换 run/model/parent/name，终态不能被迟到成功覆盖。直播投影与历史 trace 上限统一 512，文本段上限 128；为最高档64次模型请求（每次可有两条输出）、128次实际操作及独立的主推理/正文/exec节点留出余量，不能因记录上限裁掉最终回复。exec 公开字段仅保留合法标识的 public.toolNames，旧名称词典仅作历史标题回退；活跃 exec 不依赖能力名即可显示通用“正在使用工具”。无名称的已完成探测隐藏，failed/unknown 仍可见并允许展开固定安全错误。实际 DB/HTTP 节点使用服务端 title/activityIcon 和原始 name，Skill 与任务说明不得替换真实执行身份；完成汇总从真实子节点标题投影，不新增公开字段。exec 标题上限512，其他标题64；summary、脚本、参数、脚本输出及原始 error.message/diagnostic 不进入详情页。exec 错误码只接受词典 execErrors 白名单，未知码回退通用编排失败说明。

- 文件交付的 JSON/CSV 沿用只读文本预览；TEXT_EXTENSIONS 与 filePreview 页保持一致，不执行文件内容。

- chatSegments 只归约身份、用途、状态和文本偏移，不生成节点标题。main_reasoning/public_commentary 的标题、详情和交接标题均由后端 presentation 提供；localizeProcessNode 只选择语言和 title/endedTitle。

- generatedImages.js 对加载Canvas使用等比内接几何，历史卡片仍锁定首次收到的宽高；不要分别扣除宽高后改变原比例。

- COS Object Key 不是图片 src。chatAttachment 仅选择 URL/本地 previewPath；账号头像仅 avatarUrl。消息缓存须携带 urlExpiresAt，到期/旧 fileID 缓存重新读取；initAppData 在头像 URL 到期时重新同步账号。
- buildUserFromAccountSummary 只接收当前服务端 summary，不合并上次用户资料；设置启动同步使用当前平铺 dataControl 协议，不解包旧 preferences。

- `chatArtifacts.js` 将 HTTPS 链接与当前消息已完成 contentParts 的精确 URL 匹配；已有历史 artifact:// 引用仍按当前消息的 artifactId 解析。预览必须具有真实 assetId/fileID，不得从正文拼接 URL 或选择本地 previewPath。助手复制仅保留正文链接/图片的标题，代码保持原样。generatedImages 保留图片元数据；visibleGeneratedImages 根据已渲染产物 ID 与完成正文的图片节点过滤重复卡片，inline/旧缺省及历史 markdown 模式继续兼容。普通文件链接和代码里的图片语法不占用图片卡片。
- `conversationFiles.js` 合并消息 attachments/contentParts 并按 fileID 去重；交付产物复用 `chatArtifacts.deliveredAttachment`，只有已完成且具有真实 assetId/fileID 的图片和文件进入当前聊天文件库，普通上传附件保持兼容。
- `assetListCache` 元数据白名单保留图片 tags；名称/标签不存临时 URL，沿用既有容量、游标和账号隔离规则。
- `assetPresentation.cardHeight` 与双列 grid 的 32rpx 侧边距、28rpx 间隔一致：图片按有效 width/height 计算，未知尺寸图片使用方形，文档高度为列宽329rpx减32rpx（297rpx）。assetListBehavior 在一次 bindload 中记录真实尺寸；按 id/fileID 保留尺寸，按 id/url 拒绝迟到图片事件，不在滚动帧中 setData。
- `filePreview` 对 Markdown/TXT/JSON/CSV 先导航并传附件元数据，续签、下载与等待由预览页负责；共享 `resolvePreviewFile` 优先下载元数据内未过期的 HTTPS 地址；缺失或过期时按 assetId/fileID 进行所有权校验和续签，保留本地待上传路径与失效拦截。图片与 Office/PDF 沿用原生预览，交付产物通过 artifactId 识别且不调用 showLoading/hideLoading。

- `assistantProcessTimeline` 统一聊天、过程详情与历史的消息展示判定：含文本段或空正文的文本段消息进入累积时间线，已有权威正文且文本段为空时使用正文通道。此边界不执行工具，不修改输入。`streamProcessTimeline` 复用 normalizeSegments/normalizeProcessTrace，将真实顶层模型请求、思考、公开摘要与工具按请求顺序投影为累积列表；顶层 modelRequests 可补空思考行，真实推理按同请求替换。工具子请求不生成主思考，exec 私有字段仍被过滤；只将确认 final 的主文本返回 finalContent。processTrace 返回值仅供聊天、详情及历史显示，不修改原快照。publicProcessText 可采集公开文字替换后的 responseItems 范围供打字窗口使用，原 UTF-16 范围不变。

- exec 的 EXEC_OUTPUT_LIMIT / EXEC_TOOL_RESULT_LIMIT 分别投影为“结果回传失败”/“工具结果接收失败”，优先于旧 toolNames 标题。安全文案区分结果传递与实际操作状态，历史/实时均按错误码重投影。
- exec 可见性、失败说明和子调用状态统计均由后端 presentation 提供；前端保留原始执行状态与身份，不推断业务成功，不展示原始脚本、参数和诊断。

- context_compaction 是独立过程节点，使用 icon-context-compaction；按状态显示“正在压缩上下文”或“上下文已压缩”，失败、取消和未知结果各有对应文案。没有主请求 ID 的多次压缩按原 trace 顺序放在相邻请求之间，不合并；摘要正文不进入公开过程或打字器。

- voiceOptions.js的15个value与默认ID保持现有持久化合同；实际朗读音色由backend/chat_api/speech_voices.json映射，request/speech.js在每次朗读时读取chatAbout.chatVoice。前后端映射一致性由tests/readAloud.test.js校验。

- Agent 工具过程名称使用 exec 的注册名：content、skill_read、result_read、sandbox_prepare、sandbox_dependencies、bash、persistence_file、web、attachment_analysis、image_generation、view_image。中英文 tools 词典与后端展示表一致；工具名不授予权限，真实执行状态和宿主验证标题保持权威。

- processTrace projects tool public.progress using fixed localized phase labels plus actual elapsed/remaining seconds. During install, the title remains localized and response text uses only the server-redacted public.command, with no repeated phase/time fallback. Backend stream/status/history apply one field allowlist. Never surface raw dependency logs, driver scripts, host paths or invented percentages. Terminal failures retain their identities and remain visible when a later attempt succeeds.

- errorReporting.js 管理应用前台加速度监听和统一报告路由；1秒内4次强反向变化、15秒冷却，报告页已打开时不重复导航。阈值仍需真机校准。
