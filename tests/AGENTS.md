<!-- Parent: ../AGENTS.md -->

# tests

## Purpose

使用 Node.js 内置 assert 验证小程序的公共工具、组件边界、设置与聊天交互。默认入口为根目录 `npm test`；服务端的数据、权限、执行与事务契约由 `backend/tests/` 和 Agent 测试验证。

## Key Files

| File | Description |
|------|-------------|
| `componentNaming.test.js` / `componentIsolation.test.js` | 组件名称、注册入口、样式资源内聚与业务依赖边界 |
| `sharedStyles.test.js` | 公共样式在隔离作用域内可用，原生 button 保留行内样式与原生功能 |
| `searchCloseAnimation.test.js` | 五处底部搜索按原生键盘帧同步退场，覆盖重复回调、失焦、途中关闭与重新聚焦 |
| `composerComponentBoundary.test.js` | 附件/功能栏动画状态和宿主高度镜像 |
| `accentColor.test.js` / `darkMode.test.js` | 色板、外观优先级、绑定清理与渲染主题接线 |
| `i18n.test.js` | 中英文映射、插值和词典 key 一致性 |
| `homeFeature.test.js` / `chatFeature.test.js` | 常驻功能、feature 枚举与消息参数恢复 |
| `knowledgeView.test.js` | 知识库 mock、筛选/搜索、固定加号与关闭按钮几何、添加菜单时序及选择器账号/卸载保护 |
| `knowledgeChunks.test.js` | 分块分页、设置叠层路由、完整 Markdown、失败重试及账号/卸载保护 |
| `pluginsView.test.js` / `skillRequests.test.js` / `skillDetail.test.js` | Skill HTTP 数据、账号/游客隔离、不透明游标分页、原始文案、更新时间、原生详情与搜索键盘避让 |
| `drawerHandoff.test.js` | 布局交接、互斥显隐、重复导航和失败回位 |
| `conversationPreview.test.js` | 长按聊天预览的五条消息、缓存/网络、账号与关闭竞态及点击进入聊天 |
| `assetInteraction.test.js` / `assetCache.test.js` | 文件预览先导航后请求、Canvas 页面生命周期、平台文件转存、请求竞态、身份校验、缓存容量/游标及 URL 续签 |
| `ybFlyoutPosition.test.js` / `cascader.test.js` | 原生弹出菜单定位及多级选择的交互边界 |
| `chatMessageCache.test.js` | LRU、容量裁剪和持久化失败处理 |
| `chatRuntime.test.js` / `chatViewRecovery.test.js` | 账号、视图、订阅与网络生命周期 |
| `chatStreamTransport.test.js` / `httpTransport.test.js` | SSE/UTF-8、微信登录、票据续签、取消和迟到回调 |
| `chatContentContract.test.js` / `chatFallback.test.js` | 正文身份/用途/偏移、逐前缀恢复、终态、停止与重新生成投影 |
| `chatProcessTimeline.test.js` | 累积请求顺序、无token思考、公开投影、Unicode/来源窗口、计时、动画收起和停止/回滚迟到回调 |
| 同上图片时间线用例 | 真实调用关联、摘要放行后加载、图片先于下一轮思考、恢复/停止后保留、收起不卸载图片和最终正文接管去重 |
| `processTrace.test.js` | 当前活动过程、工具状态、公开名称、思考终态/交接标题和正常/停止耗时格式 |
| `reasoningControls.test.js` / `reasoningDetails.test.js` | 档位选择、详情展开测量、滚动上限、流式更新和卸载 |
| `generatedImagesGeometry.test.js` | 图片比例、尺寸边界和历史首帧几何 |
| `chatArtifactLinks.test.js` | Markdown 产物引用、当前消息/交付状态、所有权续签和文件/图片预览 |
| `fileDeliveryList.test.js` | 完成后正文尾部交付列表、流式隐藏、失效提示和文件点击元数据 |
| `conversationFiles.test.js` | 当前聊天文件库收集上传附件与已完成交付产物、去重与失效过滤，完整分页后的名称/标签更新及账号/卸载保护 |
| `sourceIcons.test.js` | 来源 hostLogo 透传、安全地址、域名去重及加载失败本地图标回退 |
| `archivedChatView.test.js` | 只读消息渲染与路由进入/返回 |

## Working In This Directory

- 测试可直接由 Node 执行，不引入测试框架或微信运行时模拟，除非需求明确要求。
- 修改共享工具、分页或缓存协议时使用最小且有意义的契约断言。
- assetInteraction 的瀑布流契约覆盖横/竖/长/方图比例、无效尺寸、图片迟到事件、URL 续签和文档固定几何；保留分页、预览、菜单与键盘避让回归。
- 测试只记录稳定契约，不替代父级要求的结构查询。
- 核对默认测试入口和当前实现的调用关系；不要通过跳过不存在的实现来制造通过结果。

## Validation

默认运行 `npm test`。单个纯函数改动可先运行对应 `node tests/<name>.test.js`；跨模块改动再运行完整入口。

聊天正文与过程合同联合验证 chatContentContract、processTrace、chatFallback、reasoningDetails、i18n：保留 UTF-16 偏移、真实父子调用、八态工具状态、停止后的正文冻结和迟到事件保护。脚本、原始参数、诊断证据与私密异常不得进入界面。processTrace 的公开文本只是显示投影，不能驱动执行。

文件/图片交付联合验证 chatArtifactLinks、generatedImagesGeometry、chatRuntime 和 chatFallback：稳定引用只解析当前消息的已交付附件；Markdown 图片保留解析元数据，卡片显示遵循 displayMode；重新生成、停止和历史恢复保持一致。

服务端回归：

```sh
后端测试在独立 `../YuanAI_backend` 工程运行，见其 backend/README.md。
后端测试在独立 `../YuanAI_backend` 工程运行，见其 backend/README.md。
```

其中 test_turns/test_sse/test_live_events 验证队列、取消、快照和事件持久化；test_memory_ops/test_memory_store/test_memory_refresh 验证记忆事务与发布；test_workspaces/test_image_delivery/test_agent_services 验证工作区、产物回执和可信运行授权。Agent 的 test_code_mode_contract 使用实际 Graph、SDK 事件适配、执行器与 Worker，只替换供应商传输；test_diagnostic_chain 和后端 test_diagnostics 验证私有证据批量写入。

Node、离线供应商传输与容器资源约束检查需分别记录。它们不替代真实模型、COS、线上服务或 Skyline 真机的动画、手势及流式验收。

聊天输入状态、重新生成布局、归档分组与消息反馈均纳入 npm test。可选图片渲染服务通过 在 ../YuanAI_backend/backend/render_js 执行 npm test 验证，需要该包依赖与 Chromium；缺少依赖会失败，不会伪报通过。HTTP、聊天运行时、内容、过程、归档分组与手势使用当前契约测试验证。

- readAloud.test.js 还校验15个现有设置ID与后端音色映射一致、每次请求读取最新chatVoice及默认回退；backend/tests/test_speech.py覆盖逐音色选择、非法显式ID拒绝、旧客户端owner设置回退及本地选择优先。
- readAloud.test.js 覆盖播放/暂停、整秒时长、倍速、15秒边界、结束自动退场、合成加载图标、临时文件清理、关闭/切页/重复播放/卸载竞态；httpTransport.test.js 还覆盖音频二进制鉴权/401续签、MIME拒绝、登录期及在途取消。backend/tests/test_speech.py覆盖owner/分支/状态、正文URL过滤、WebSocket真实任务帧合同、未完成与失败结果、断开取消和名额释放。

- transcription.test.js覆盖16kHz PCM参数、左侧回填/右侧直接发送、消息接收前持续禁用、提交被拦截及过期回执、现有草稿保留、取消/切聊天/离页/重复点击、最长时长自动识别、单例监听重挂载、系统中断、失败提示和文件读写/取消清理。httpTransport.test.js覆盖ASR原始二进制、401续签、错误/空结果拒绝、登录及在途取消；backend/tests/test_transcription.py覆盖认证、音频上限、真实供应商帧参数、响应边界、超时、并发和断开取消。

## 独立接口样本
前端离线测试仅使用 tests/fixtures/backend-contracts 下的公开接口样本，不读取后端源码。样本更新需核对实际 HTTP 契约；不包含服务凭据。渲染服务测试已归后端工程。

- billing.test.js 覆盖整数元验证、真实摘要展示、支付回调确认语义、重复点击和未知结果保留原订单键；不读取后端源码或发起真实支付。

- userDataSettings.test.js 覆盖启动只定位一次、拒绝回退、中国默认区域、导出中性行/确认/旋转/分享、轮询恢复及迟到账号隔离；服务端 user_data 测试覆盖真实 ZIP、FIFO、重启恢复、鉴权下载和可恢复注销。
