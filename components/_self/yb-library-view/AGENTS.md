<!-- Parent: ../AGENTS.md -->
# yb-library-view

展示当前会话 owner 的有效上传与生成文件台账；默认双列原生瀑布流，可切换插件式缩略图列表，两个布局继续复用预览与长按操作。图片网格按原图比例，文档卡片宽329rpx、高297rpx并包含全部非图片，网格及长按副本不显示文件类型。名称与生成图片 tags 搜索走 request 层，保留现有搜索栏与键盘 Worklet 动画，不增加上传入口。

- 复用 `assetListBehavior` 的分页、刷新、迟到响应保护、原生图片预览和长按状态；分类/搜索变化立即作废旧请求。
- 每个列表仅一个 `yb-asset-actions`，`actionschange` 通知首页锁定抽屉；菜单期间禁用背景滚动，关闭/销毁释放。
- `asset-cards.wxss` 复用主题变量、32rpx 圆角与图片/文档展示；`scroll-view type="custom"` 下直接使用 `grid-view type="masonry"`，28rpx 列/行间距、32rpx 侧边距由共享 Behavior 提供。卡片高度由 assetPresentation 的 cardHeight 决定；骨架高度、搜索栏尺寸和键盘动画保留本地。
- 文件单击按扩展名预览：图片使用原生图片预览，Office/PDF 使用 `wx.openDocument`，Markdown/TXT 进入设置同款路由的只读页；其他类型提示不支持。菜单操作复用 yb-asset-actions 的分享、图片保存、聊聊这个、重命名与永久删除；普通文件无保存项，不提供移动。

- 滚动区高度使用 windowHeight，不取侧栏缩放动画中的 boundingClientRect；搜索栏避让放在滚动内容末尾，不用 scroll-view 底部 padding 缩小可视区。
- 顶部导航留白使用滚动内容首个 `navHeight` 占位节点，不设 `scroll-view` 顶部 padding；内容滚动时须能经过玻璃顶部栏后方。
- 全局文件库分类 Tab 通过 `tabs/activeTab/tabsDisabled` 交给 `yb-title-nav` 固定展示，与标题共用一层毛玻璃背景；`tabchange.detail.id` 回调筛选列表，`heightchange.detail.height` 更新 navHeight 占位。聊天文件库保留独立设置页式标题、`sticky-header` Tab 与 dataset.id 回调。

- 分类与搜索结果通过共享列表缓存保留；首次无缓存和触底各只追加一个骨架卡，缓存校验不替换已有内容。搜索变更立即使迟到响应失效。

- storageCategory/storageNavigationId 接收设置分类导航，清空搜索并强制校验列表；temporary 台账由服务端排除。
- conversationScope 模式由聊天文件页传入当前会话附件，复用网格、分类、搜索和预览；顶部操作栏沿用设置页布局、渐变与右侧玻璃关闭按钮，页面负责读取完整消息分页，再按附件 id/fileID 获取最新 name/tags。本地搜索逐项匹配名称或任意标签，保持聊天和分类范围。
- 全局文件库与当前聊天文件库无内容且未搜索时共用居中 Logo 空状态；搜索无结果仍显示原提示。

- chatAsset 仅转发给宿主：全局库由首页切新聊天，conversationScope 则由 conversationFiles 通过 EventChannel 回传并退场；账号隔离、文件所有权续签与本地副本逻辑统一在 yb-asset-actions。菜单及确认弹窗的 statechange 共同禁止背景滚动/Tab 切换，主题继续透传 themeStyle。

- 全局文件库在最后提供「收藏」Tab（favorites），沿用服务端分页、搜索和缓存；收藏与原栏目使用相同 id/fileID/source，不复制文件。conversationScope 保持原有三个分类。

- 底部搜索/关闭按钮放在 right:112rpx 的独立容器内，右侧固定96rpx的 icon-menus 入口不参与原搜索 Worklet。两层筛选菜单使用同一个 yb-flyout，内部父卡收窄、子卡高度/透明度和 spring 沿用模型选择器；遮罩先收子层再关闭整体，退场完成才释放滚动与首页手势锁。透明动画留白保持透明，可见卡复用 setting-option-pop-surface。
- 网格/列表只切换展示，不重查分页。来源 origin 默认空（全部），uploaded/generated 与分类、名称/tags 查询共同生效；再次点中同一来源取消筛选。全局走服务端过滤和独立缓存，会话内在完整附件集合过滤；来源不改写原有 source/id/fileID。tests/libraryFilters.test.js 覆盖菜单反向/迟到动画与查询接线。
- 菜单勾选占位统一置于标签末尾；底部入口按 viewMode 显示 icon-menus/icon-list_check_line，筛选或模式切换均不改图标颜色。列表行与长按副本通过 viewMode 复用 asset-cards.wxss 的 asset-list-* 样式，局部只保留搜索/菜单 Worklet 选择器和骨架尺寸。
