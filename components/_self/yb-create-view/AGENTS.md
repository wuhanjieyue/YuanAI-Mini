<!-- Parent: ../AGENTS.md -->
# yb-create-view

创作的模版/热门/我创作的列表，默认模版。模版/热门保持两列 4:5，我创作的使用双列原图比例瀑布流；数据都通过 request 层读取。

- 复用 `assetListBehavior` 与一个 `yb-asset-actions`；仅「我创作的」保留长按分享/保存菜单。
- 模版/热门缩略图 aspectFill，点击打开独立 60% 半屏详情；「我创作的」以 aspectFit 完整显示图片，点击复用文件库原生图片预览。搜索输入仅筛选列表，不添加提示词创作输入或模版生成操作。
- 进入创作页不自动打开 Try it；`pages/createTryIt/index` 页面保留。
- 复用 `asset-cards.wxss` 的圆角、主题底色、图片和文档展示；`scroll-view type="custom"` 的直接子节点 grid-view 在 mine 模式使用 masonry，其余 aligned。模版 4:5 与骨架高度留在本组件，作品高度由 assetPresentation 的 cardHeight 决定；移除/切换时释放菜单与迟到响应。

- 模版/热门改从 `listCreateTemplates` 读取云端 `create_templates`，`createCatalog.js` 仅为部署种子。点击通过 openCreation 交给首页打开详情路由，不绑定长按操作。

- 三个分类均每页 20 条，fetchAssetPage 必须透传 cursor；触底由 assetListBehavior 防重并在 hasMore=false 时停止。

- 模版/热门/我的分别缓存，公共两类共享云端更新时间；缓存命中不清空，图片加载未完成时显示扫光骨架，失败停止动画。点击详情前只续签过期 URL，不重新取列表。

- 列表高度使用 `wx.getWindowInfo().windowHeight` 的布局视口，避免首页抽屉/路由变换下 `100vh` 与屏幕可用高度不一致。
- 顶部导航留白使用滚动内容首个 `navHeight` 占位节点，不设 `scroll-view` 顶部 padding；内容滚动时须能经过玻璃顶部栏后方。
- 三个 Tab 通过 `tabs/activeTab/tabsDisabled` 交给 `yb-title-nav` 固定展示，与标题共用一层毛玻璃背景；`tabchange.detail.id` 回调继续由 selectTab 筛选列表，`heightchange.detail.height` 更新 navHeight 占位，Tab 名称随语言更新。
- 「我创作的」无内容时复用 `asset-cards.wxss` 的居中 Logo 空状态；其他分类空态仍按原列表提示。所有分类首次加载失败复用居中 Logo 占位，分页失败保留列表与重试。

- 底部搜索复用 `skyother.wxss` 的 `floating-search*` 类与图标字体；搜索位置、清空按钮与键盘避让 Worklet 选择器保留局部。Tab 切换保留 query、取消防抖并从第一页按激活 Tab 查询；缓存按 source/category/query 区分。模版/热门匹配中英文标题，我创作的由后端匹配图片名称或任一标签；后台命名完成使列表版本失效，下次刷新获取新元数据。无匹配时显示搜索空态。

- 「我创作的」操作由共用 yb-asset-actions 执行，菜单与确认弹窗的 statechange 锁住列表/首页手势；chatAsset 回传本地 files/epoch，由首页切换新聊天并调用 addSelectedFiles，不自动发送。
