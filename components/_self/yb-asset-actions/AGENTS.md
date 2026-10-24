<!-- Parent: ../AGENTS.md -->
# yb-asset-actions

创作、文件库与当前聊天文件库、知识库 mock 共用的单实例操作菜单。`open(item, viewportRect, source)`，source 为 sample/creation/library/knowledge。

- knowledge 来源只使用本地 previewPath 进行原生分享、图片保存与聊天附件回传；重命名/删除经原有确认框发 localchange（action/item/name），由知识库更新本地列表，禁止写真实库接口。
- knowledge 菜单在分享之后插入 icon-document「查看原文」；original 操作在 afterclose 后复用 previewStorageFile 的全文/Office/PDF/图片预览，不进入分块列表。其余来源菜单顺序不变。

- yb-flyout 负责长按菜单 portal、预览副本、定位和 Worklet 开合；分享在原始 tap 中直接发起，其余操作在 afterclose 后执行。分享发起后仍调用原有 close，保留全部 Worklet 退场动画。statechange.open 覆盖菜单与确认弹窗，lifted 仅通知列表隐藏长按原卡片；关闭/销毁释放首页手势锁。
- creation/library 图片提供分享、保存到照片、聊聊这个、重命名、删除；普通文件无保存项。分享入口沿用详情页的平台选择：Windows/Mac 的文件和图片均用 wx.saveFileToDisk，手机文件用 wx.shareFileMessage、图片用 wx.showShareImageMenu；PC 下载失败使用 downloadFailed，手机分享失败使用通用 shareFailed。两种来源均不提供移动，sample 保留暂未开放提示。
- 图片复用 renewAssetUrls + downloadStorageFile + wx.showShareImageMenu / wx.saveImageToPhotosAlbum；普通文件复用 resolvePreviewFile 校验 library id/fileID 并下载后分享。文件名按原扩展名提供，不改 COS key。
- open 时后台准备分享文件，不阻塞弹窗入场；菜单文案始终为「分享」，准备期间点击静默无效且不关闭菜单，失败提示 downloadFailed 并允许下次点击重试。准备完成后必须由新一次真实 tap 同步调用原生 API，禁止从 Promise、afterclose 或下载回调自动分享。准备结果受 epoch、操作版本及当前菜单对象保护；原生回调前拦截重复操作，取消静默，分享失败使用不含“图片”的通用提示。
- 聊聊这个先保留已有支持格式校验，再以本地副本发 chatAsset（epoch/files）；不传原 fileID，避免删除附件草稿时销毁原文件。宿主负责切新会话，聊天文件弹窗必须先退场再回填，不自动发送。
- 重命名与永久删除复用 yb-confirm-dialog，横排取消/保存或删除；creation 调 renameCreatedImage，library 调 renameStorageFile。后台使 mine/library 列表失效，聊天范围列表沿现有 refreshscopedfiles 重新读取。
- 菜单打开时捕获账号 epoch，操作与确认核对 epoch、组件销毁和页面操作版本；hide 立即使迟到下载、分享和确认失效。
- 结果提醒使用公共 yb-notice-capsule，只调用show(message)/hide；样式、root-portal定位、250ms入场/150ms退场动画和完全显示后默认2000ms停留计时器统一在公共组件。asset-operation-origin仅用于确认弹窗宿主偏移，不再参与结果提醒布局。
- 隔离样式复用 skyfontline/asset-cards/skyother/skycolor；本组件仅保留菜单和确认弹窗原点样式，胶囊样式由公共组件管理，触觉复用 haptic。

- library 来源在分享后第二项插入 icon-tag_line（\ue7db）收藏/移除收藏，调用 setStorageFileFavorite(id,favorite)。收藏只改文件状态，保留原栏目记录；收藏/取消收藏及删除成功或失败均通过现有 assetNotice 顶部胶囊提示，并沿用账号 epoch/操作版本保护。
- library 来源在收藏项之后提供 icon-package_2_line（\ue7dc）「添加到知识库」，菜单退场后调用 importKnowledge([item.id]) 复用原资产，不重新上传；沿用后台幂等导入、knowledge 列表失效广播、操作互斥及账号/卸载保护，结果使用 assetNotice 提示。
- 每次打开 library 菜单通过 getKnowledgeMembership 查询当前资产；查询中/失败时禁用添加项，已有记录显示「已添加到知识库」并禁用，添加成功立即更新。复用 text-l2 表示禁用且关闭 hover，chooseAction 与执行入口双重拦截；迟到查询按账号、操作版本、卸载及菜单开关丢弃。
- viewMode 默认 grid；文件库传入 list 时，preview slot 渲染同款缩略图、名称、类型/日期行，复用 asset-cards.wxss 的 asset-list-* 几何与字体截断，不把列表锚点渲染成网格卡片。preview 外框 height:100% 与行 padding 共用 border-box，保持原行尺寸及既有 flyout 放大动画；网格图片保持原 aspectFit（sample 继续 aspectFill）。
