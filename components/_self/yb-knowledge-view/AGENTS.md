<!-- Parent: ../AGENTS.md -->
# yb-knowledge-view

个人知识库平铺页面，使用 request/knowledge.js 的真实服务端分页、分类、名称搜索与阶段状态；没有示例数据、建库或切库界面。

- 卡片单击打开 knowledgeChunks 分块列表，使用 settingRouterBuilder stacked；长按菜单第二项为 icon-document「查看原文」，继续通过共享预览读取全文、原生图片或 Office/PDF。切换路由前保留原有菜单/长按点击抑制。

- 文件和图片沿 uploadCloudFiles 的账号保护、COS 上传和存储配额，得到 assetId 后提交导入。待导入/处理中的资料每5秒刷新，隐藏/卸载停轮询，账号 epoch 与请求版本阻止迟到结果。
- 保留 assetListBehavior 原生预览、卡片/长按和首页 actionschange 手势锁。重命名/移除走知识库接口，移除不删除 COS 原文件；失败可重试。聊聊这个沿原生预览下载原文件，放入聊天输入框附件区；不要求索引 ready，不自动发送、不触发知识库。
- 搜索复用 floating-search/floating-search-clear 与 Worklet 动画。右侧112rpx槽位和96rpx加号保持；菜单复用 yb-flyout、setting-option-pop-* 和 animateTrigger，afterclose 后打开原生选择器，关闭/卸载恢复手势锁。
- 图片用 wx.chooseMedia，文件用 wx.chooseMessageFile 与已有扩展名；笔记提示暂未开放。上传过程中避免重复选取；导入失败保留本次 assetId 以重试，不能重新占用 COS 配额。
- 状态、阶段、分块数和 MinerU 回退来自后端，不推算整体百分比。局部状态遮罩保留在组件 WXSS；文字/背景复用 text-l1/bg-l0 等现有公共类，不改变卡片布局和菜单动画。
- 网格文档及长按副本不显示文件类型文字和左下角类型图标，高度复用297rpx；图片保留原比例且不显示底部状态/分块容器，文档继续显示该容器，但 ready 时仅显示分块等详情，不显示“可检索”标签及其分隔符。
- tests/knowledgeView.test.js 覆盖上传/导入、分页筛选、失败重试、菜单时序、账号隔离及引用 URL 识别；共享操作由 creationActions.test.js 覆盖。
