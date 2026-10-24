<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-11 | Updated: 2026-04-12 -->

# request

## Purpose
集中放置HTTP 后端 API 封装，避免页面层直接散落请求细节。

## Entry Points

| File | Description |
|------|-------------|
| `request.js` | 封装HTTP 后端 `/user` 调用；文件/图片上传统一执行容量申请、云存储上传和服务端确认 |
| `chatRuntime.js` | 账号范围内的运行管理：提交、当前会话订阅、重连、取消、后台状态发现与内存视图状态 |
| `chatStream.js` | 封装HTTP 后端聊天接口；流式对话通过 RequestTask.onChunkReceived 接收 SSE chunk 并转换为 `{ eventStream }` |
| `http.js` | `wx.request` 的短期会话、JSON 请求，以及限定轮次的私有 SSE 票据 |
| `skills.js` | Skill HTTP 请求边界：已安装全量、推荐25条游标分页、完整Markdown正文详情与个人启用/移除 |

新轮次从 `/turns` 响应取得首次 SSE 票据，再用 `/turns/events` 按 `afterSeq` 有界订阅；断线重新领取票据并续订，不重复创建。首次票据只保存在运行记录内存中，不写入全局持久状态。

流式对话的 `contentParts` 由本层原样转发，服务端负责附件字段白名单校验。

创建轮次传入规范 locale，服务端按轮固定；SSE 订阅、历史读取与状态读取传入当前应用语言，仅用于固定文案展示。切换语言不会重建轮次或改变模型请求。

## Working Notes

- 同一 SSE delta 的原始过程/文本事件归约后，再应用 presentation_updates；仅处理身份、状态和内容偏移匹配的展示补丁，不改变原始文本偏移。停止展示后只随已允许的 process_event 更新节点展示，不接受迟到正文补丁；服务端恢复快照携带完整双语 presentation。
- 新增HTTP 后端调用时优先补在本目录，而不是直接塞回页面
- `getLongTermMemory({cursor,limit})` 调用 `/long-term-memory`；返回 schemaVersion=2、items、revision、publishedAt、snapshotKey、nextCursor 和 refresh。
- `refreshLongTermMemory()` 调用 `/long-term-memory/refresh` 创建后台刷新任务，由服务端确定 90 天窗口、身份和可用历史；页面不上传聊天内容。
- `deleteLongTermMemory()` 调用 `/long-term-memory/delete-all`，原子清空当前 owner 的发布版本并关闭保存记忆。
- 返回值保持 Promise 语义，便于页面统一 `await`
- `listInstalledSkills({query})` 调用 `/skills/installed` 全量返回 items；`listRecommendedSkills({query,cursor,limit})` 调用 `/skills/recommended` 返回 items/nextCursor/hasMore，固定 limit=25。`getSkillDetail({id})` 返回扁平详情、去 frontmatter 的 markdown、exampleMessage 与 canTry；`trySkill({id})` 调用 `/skills/try` 添加并启用当前所有者 Skill，复用 callHttp，仅传稳定 id。失败保持拒绝语义，不回退静态样例；保留服务端 title/titleEn 双语元数据，显示名由当前应用语言投影；不因语言切换重新请求或重置游标，不传客户端 owner。
- prepareChatTurn 对显式选择透传 skillIds 的数组快照；未提供时省略字段，让普通重新生成继承源轮次选择。标签预填不会提交轮次，点击发送仍走现有运行管理器。
- HTTP API，应继续把页面与请求细节隔离
- 单会话消息默认每页 30 条；`getConversationMessages` 可传整数 `limit`（1–30），长按预览使用 5；省略时不改变请求体。`messages` 合并活动轮次后仍受条数上限，`hasMore`/`nextCursor` 对齐实际返回页。带 `turnId` 的 `/messages` 返回该轮完整消息快照；缓存命中时先调用 `/messages/status` 校验 `messageVersion`，不允许页面自行拼装HTTP 后端请求

## Test Coverage

- knowledge.js 的 listKnowledgeChunks(id,{cursor,limit}) / getKnowledgeChunk(id,chunkId,revision) 分别调用 /knowledge/chunks 与 /knowledge/chunk；只传应用内资料/映射 ID，不传 owner、Source 或 SAG 凭据。列表提供文档当前版本，详情严格按版本读取完整 Markdown。
- `enableSkill({id})`、`removeSkill({id})` 分别调用 `/skills/enable`、`/skills/remove`，仅传稳定 id，保留 HTTP 拒绝语义；所有者由服务端推导。移除可重新启用，不删除共享技能包。
- `tests/chatRuntime.test.js`、`tests/chatStreamTransport.test.js` 覆盖请求生命周期与传输；组件恢复由 `tests/chatViewRecovery.test.js` 覆盖。

## For AI Agents

### Working In This Directory
- 新增接口时保持 Promise 返回形式，避免页面层混入回调式分支
- `deleteCloudFile()` 通过统一存储响应校验，只在云存储实体与业务记录同步删除成功后 resolve
- HTTP 后端服务名和参数结构应集中维护在这里，而不是散落到页面/组件
- 若后续扩展 HTTP 请求，优先新增统一封装，再让页面迁移调用
- HTTP 后端目标配置放在未提交的 `app_config.private.js`；请求层统一使用 HTTP。


- `listStorageFiles({ category, query, origin, cursor, limit })` 返回 `{ files, nextCursor, hasMore }`；origin 为空/uploaded/generated，与分类、搜索组合后在服务端分页。`listCreatedImages({ query, cursor, limit })` 返回 `{ images, nextCursor, hasMore }`。调用者不传 owner，不保存临时 URL；默认每页 20 条。assetContext 按 origin 分隔缓存与并发请求，空来源保留旧缓存 key；元数据续签保留 origin。

- `listCreateTemplates({category,query,cursor,limit})` 支持 templates/popular，默认每页 20 条，返回 items/hasMore/nextCursor。`downloadCreationImage(url)` 和 `downloadStorageFile(url)` 使用后端返回的 HTTPS CDN URL 下载并校验 HTTP 200，分别供原生分享和库文件预览；无须开放客户端云存储权限。

- assetCache.js 管理一次运行内的身份确认、60 秒校验合并和 URL 续签；列表请求与续签均防重。列表接口增加可选 cacheOwnerKey/ifUpdateTime，notModified 不代表空列表。上传/取消/删除/清理请求结束时广播 ASSET_LIST_INVALIDATED，失败也可能已有部分数据变更。
- `refreshAssetMetadata` 使用现有 resolveAssetUrls 每批最多 20 个 library id，按 ownerKey/epoch 和 id/fileID 校验后补最新 name/tags 与受控 URL；不引入聊天范围外文件，不修改消息快照。聊天文件库打开/刷新时读取；临时聊天沿用本地快照。


- `chatRuntime` 是任务生命周期的唯一入口；渲染组件通过只读订阅获取投影，不创建请求、不因卸载停止普通聊天。
- 未读由后端完成事务持久化，前台每5秒通过 /turns/status 同步完整未读标识，不依赖本机是否见过活动轮次；后台/离线暂停。markConversationRead 将实际看见的 completedRunId 发送至 /conversations/read；失败保留回执重试，账号 epoch、状态查询版本及运行标识防止迟到响应清除或重新点亮新回复。失败、取消及临时聊天不产生新提醒。
- `chatRuntime` 按会话保存内存待发送队列；同会话仅提交队首，前一轮完成、失败或取消后继续下一项。服务端 `TURN_IN_PROGRESS` 冲突保留原请求及 `clientMessageId`，发现占用轮次终态后重试。账号重置清空队列，临时聊天离开时丢弃未发送项。
- 选择附件时只保存本地草稿；点击发送后 `submitTurnWhenReady` 将上传中的轮次留在队首。上传中的队首同样登记为当前可见轮次，取得全部 fileID 后生成请求并按当前可见状态订阅；上传期间切换会话不抢回订阅，返回时可恢复待上传队首。失败则保留本地原轮次供显式重试。同会话后续轮次等待，账号重置丢弃待上传任务的提交资格。
- 无服务端 turnId 的失败轮次可由用户显式 `retryLocalTurn`，在原记录上生成新请求并追加到当前待发送队列；已有服务端轮次仍走重新生成路径。
- 账号事件递增 epoch 并清空运行和视图内存；`new-chat` 只切换当前视图。创建、目录、历史和订阅响应均核对 epoch；云响应携带 ownerKey。
- `/turns/events` 每45秒续订，客户端50秒传输截止；断线只续订，不重复提交。幂等创建重试保留完整请求及 clientMessageId。
- 只为当前可见轮次保持 SSE；当前进度仍由 SSE 提供，前台每5秒统一查询活动状态和跨设备未读变化，即使没有本机活动轮次也继续同步；离线和后台暂停订阅/发现。停止请求在云端终态确认前不释放输入状态。
- 草稿、附件、滚动与展开状态只保存在10个会话的内存 LRU；临时聊天不进入目录与持久缓存，离开时即使尚未收到创建响应也要请求取消。

- chatRuntime 在普通轮次终态后统一检查标题，pending 每2秒检查、最多19次；按会话去重并隔离账号 epoch，离线/后台暂停、恢复后继续。活动轮次状态请求只发送完整有效的 conversationId/turnId/runId，忽略并清理缺少 runId 的旧 active 记录；遇到不可重试的 4xx 后停止定时查询，仅在下次进入前台时再检查一次。仅更新最近/置顶缓存已有项的标题字段，不改顺序和分页，手动改名或新列表响应优先于在途旧响应。

- getStorageUsage 返回 quotaBytes/usedBytes/fileCount/imageBytes/documentBytes；文件写操作使 library 和 mine 两类缓存同时失效。

- dailyRecommendations.js 在身份/设置初始化后按北京时间日请求推荐一次；queued/running 不定时查询，结果在下次进入前台时读取。账号 epoch 阻断迟到结果；冷启动仅为经 bootstrap 确认的同 userId 恢复本地缓存，游客等待服务端 ownerKey 确认。开关持久化成功后触发普通刷新。

- `textSegments` 按 messageId/UTF-16 offset 幂等归约；content 保持 final-only 存档，displayContent/displayModelRequestId 投影最新已有正文的主请求 pending/commentary/final 段，同请求多 item 按顺序拼接，缺 parentCallId 的旧主文本保持兼容。新主请求仅开始时不清空旧正文，首正文增量才替换；专项或工具文本不进入主正文。snapshotSeq 之后续放，内层 runId 同样隔离迟到事件。模型响应结束不结束 Turn，停止冻结正文但继续接收服务端工具结果。

- file_delivery 事件将已持久化的受控文件合并为助手附件，按 assetId 去重；快照、重放和旧 run 的隔离规则与其他事件一致。

- `/turns` 成功响应确立 turnId/runId 后才解除发送三点加载，切到无图标“正在处理”；model_request.responseStarted 只表示真实上游 chunk，与请求开始及轮次创建不同。模型请求终态不可被同 ID 的迟到事件重开或重复追加。过程文字校验 run/model/parent 身份，不能让旧轮增量进入当前“正在思考”；停止后继续接收工具结果，不恢复过程打字。

- 文件和头像经后端精确 Key/大小约束的 COS POST policy，再由原生 wx.uploadFile 上传；仅 HTTP 200 成功，异常/超时取消并释放申请。fileID 是 Object Key，不能用作 src；访问/下载只使用后端按 COS_DOMAIN 返回的 CDN URL。附件上传统一使用 uploadCloudFiles；deleteCloudFile 是当前服务端接口名，不代表 wx.cloud 存储调用。

- `http.js` 是唯一业务 HTTP 传输；apiBaseUrl 规范化后作为缓存范围。SSE 用 enableChunked/onHeadersReceived/onChunkReceived，最多刷新一次过期票据；不保留云开发回退。断开订阅不取消任务，50 秒截止/异常/终态均移除监听、计时器并屏蔽迟到回调。

- 服务重启后，SSE 的 `resetCursor:true` 权威快照可在 owner、conversationId、turnId、runId 与内外 snapshotSeq 校验通过后回退游标；普通旧快照不得回退。后台状态发现后的 `/messages` 终态读回，同样必须核对 owner、轮次/运行身份、终态及持久化水位后恢复快照。恢复标记不进入 run 元数据，取消后的正文冻结保持。

- 用户停止时 `cancelTurn(key, displayStop)` 接收 Markdown 实际已打印的 UTF-16 长度和点击耗时，首个边界随 `/turns/cancel` 重试，不因迟到快照或重复停止推进。已终态但正文尚在打印的轮次同样保存展示截止点；后台执行终态保持原值。

- renameCreatedImage(id,name) 通过 /user 的 renameCreatedImage 更新作品名，服务端验证 owner；完成后广播 mine/library 缓存失效。deleteCloudFile 还校验 fileList 的单文件状态，整体 code=200 但单项失败仍 reject。

- renameStorageFile(id,name) 使用 /user 的 renameStorageFile，仅接受服务端授权的 storage_files id；与作品重命名共用事务和名称校验。两者完成均广播 mine/library 失效；普通文件分享复用 resolvePreviewFile 的所有权续签与 downloadStorageFile，不为分享开放客户端存储权限。

- speech.js 的 synthesizeSpeech({conversationId,messageId}) 每次从store.chatAbout.chatVoice读取最新选择，按voiceOptions白名单规范化后将voiceId快照与消息ID一起交给 http.startHttpBinary 调 /speech；身份沿用session/单次401续签，返回{promise,abort}。二进制请求等待最多330秒，只接受HTTP200且audio/mpeg的非空ArrayBuffer；abort包括登录期间、在途请求与迟到响应，正文/URL/模型密钥不由客户端提供。

- transcription.js的transcribeSpeech({tempFilePath})独立处理录音，不改speech.js朗读入口。先验证文件为6400–1920000字节的偶数长度PCM，再经http.startHttpAudioUpload向/speech/transcriptions上传ArrayBuffer；共用session且最多一次401续签、120秒客户端等待、可取消登录/读文件/在途请求，最终清理临时录音。只返回识别文本，不上传聊天上下文或客户端owner，不把录音存入COS。

mcps.js 封装 /mcps 的 installed/recommended/detail/enable/remove/try；仅传稳定 id 或搜索/游标和当前 locale，不发送 owner、地址或凭据。目录来自服务端启动快照，操作错误保留拒绝语义。

- setStorageFileFavorite(id,favorite) 通过 /user 保存严格布尔收藏状态；服务端推导 owner，操作结束广播现有 library/mine 失效。列表与 resolveAssetUrls 返回 favorite，assetCache 刷新聊天范围元数据时一并同步。

- knowledge.js 封装 /knowledge 的 list/import/status/retry/rename/remove/citation；客户端只提交资料/资产 ID、分类、名称搜索及游标。聊聊这个仍通过普通附件流程，不增加知识库聊天参数。引用 URL 仅提取严格 kc_ 标识，始终经本项目鉴权 API 解析，不向链接 host 发送 Token；允许本机 canonical 地址与设备 LAN 地址不同。
- getKnowledgeMembership(assetId) 调用只读 /knowledge/membership 返回 added，供文件库每次打开菜单时确认成员状态，不缓存成跨账号全局标记。

- billing.js 统一封装 /billing/summary、订单和支付状态，复用 callHttp/可信身份；只接受整数元，不提交 owner 或可信价格。客户端支付成功不是到账证明，轮询服务端核验状态；保留订单键防重复支付。

- tasks.js 封装 /tasks/list、status、save、run、pause、resume、delete、chat；保存带稳定客户端任务 ID 和 revision，身份只由服务端推导。响应按 chatRuntime epoch 防跨账号写回；任务与模型选择独立于聊天草稿，通知和分享未开放。

- errorReports.submitErrorReport 通过 /user submitErrorReport 提交 requestId/content/context；仅后端 code=200 且有 reportId 时确认成功，不发送客户端 owner。

- userData.js 处理聊天导出提交/状态、注销提交/状态与原生文件分享；导出文件通过 http.downloadHttpFile 携带服务端 Token 下载，不生成公开 URL，401 续签一次。location.js 在应用进程内只调用一次 wx.getFuzzyLocation(type=gcj02)，后端逆解析后仅保留行政区与街道地址，失败回退中国，不持久化坐标；createChatTurn 携带当次地址快照。
