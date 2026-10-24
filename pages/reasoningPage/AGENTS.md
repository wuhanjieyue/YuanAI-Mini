<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-15 | Updated: 2026-08-15 -->

# pages/reasoningPage

## Purpose

以 Skyline `draggable-sheet` 半屏页展示单条助手消息的结构化处理过程。

## Input Contract

来源页通过 `EventChannel` 的 `showReasoning` 事件传入 `{ processTrace, processDurationMs, durationText, stopped }`；长文本不得放入路由 URL。

## Working Notes

- presentation v1 为唯一节点文案来源：标题、详情、摘要、说明、错误和状态文案均直接采用服务端对应语言字段，hasDetails 由服务端决定；不再拼接工具状态、操作计数或替换内部名称。onShow 从保留的双语投影选语言，保留展开状态和测量动画。无 presentation 的旧缓存节点不展示，由后端历史读取补齐。

- 路由固定复用 `upRouterBuilder`。
- Sheet 交互与 `pages/filePage` 保持一致，滚动区域通过 `associative-container="draggable-sheet"` 关联。
- 阶段与 Tool 是同级时间线节点；标题取 detailTitle，正文取 content，摘要、说明、错误、状态标签、hasDetails 和 visible 均取后端 presentation。页面不执行名称翻译、错误码映射、状态计数或文案拼接。




- 输入新增 status/turnKey；活动消息通过既有 wx.yuanAI.chatRuntime.observe 订阅并保留同一轮 SSE 可见所有权，不新增请求/轮询，onUnload 清理订阅。保持用户已展开的 callId，工具仅展示公开字段白名单，pending/commentary 展示原段；终态与工具结果独立。
- 以stopped:true打开的本地停止记录保持点击截止时的停止文案和durationText；后台running/cancelling/completed/failed不能重开活动状态或替换该时长。既有订阅仍可更新完整工具结果，但不改变用户停止的展示门禁。
- 实时快照含 textSegments 数组时复用 streamProcessTimeline 按主请求顺序展示思考、公开摘要、工具；用真实顶层 model_request 生命周期补入未收到 token 的思考行，同请求真实思考到达后替换，不复制或修改原快照。旧无 textSegments 快照继续使用原 processTrace。

- 所有有可见详情的节点由标题行承载展开/收起，箭头使用 icon-arr-up / icon-arr-down，与标题同为36rpx且由 dr/ac 居中；原始 error.message/diagnostic 不进入界面，失败说明仅用后端安全投影。

- public_commentary 使用后端 detailTitle 展示完整摘要，使用 icon-app-control-created，详情不重复摘要；不读取 responseContent/public.result 作为显示回退。
- 除 public_commentary 外，后端正文、摘要、公开参数、来源和错误位于同一详情 scroll-view。详情默认收起并保持挂载测量；视口取 min(实测内容高度, rpx2px(360, windowWidth))，超出可独立滚动。
- JS只在展开、合并后的内容变化或sheet宽度稳定边界测量内容节点；外层裁剪高度由每节点独立 shared / applyAnimatedStyle / timing 驱动，展开收起均为250ms，不用逐帧setData。布局版本保护迟到查询；快速连点从当前高度反向，卸载取消定时测量、动画和订阅。节点按id保留展开状态，列表位置不作为身份。
- 外层仍为 draggable-sheet 关联的type=list，内部详情采用独立滚动，不承诺边界自动接管外层。真机验证内层上下边界、外层滚动和sheet拖拽，不把此多详情结构直接改成只有一个body的nested模式。
- 2026-10-02 本地验证：Nightly 2.02.2609292 / 基础库3.15.3 / Skyline，用新建本地短长样本检查标题箭头、展开收起及内层滚动；390px视口短详情实测约41.6px，长详情封顶187px（现有rpx2px向下取整）。定向Node合同通过；模拟器结果不替代真机的sheet与内层滚动手势验收，未上传发布。
