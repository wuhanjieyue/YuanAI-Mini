<!-- Parent: ../AGENTS.md -->
# createDetail

创作详情独立半屏路由。首页通过 `showCreation` EventChannel 传入云列表条目。

- 复用 `upRouterBuilder` 和 `draggable-sheet`，父级尺寸为 screenHeight；普通模板高度为屏幕 60% 加 36rpx，支持图片的模板再增加 116rpx，上限 90%，min=0。内容用 scroll-view 适配小屏。
- 头图 aspectFill 裁剪填满；标题、三行省略提示词来自云列表。旧作品无 prompt 时显示缺失提示，不猜测历史内容。
- 分享/关闭复用设置页 92rpx、ft48 和 glass-view/cradius；局部 CSS 只管详情布局与尺寸。
- 图片下载走 request 层，showShareImageMenu 只在用户点击后打开；页面销毁后不弹出迟到分享菜单。

- 分享前通过 request/assetCache 续签过期图片 URL；持有进入时的 assetCacheEpoch，账号变化后关闭并禁止迟到分享。
- `supportsImageInput` 仅为 true 时显示拍照/相册单图选择；取消保持弹层，成功通过 `tryCreationPrompt` EventChannel 回传提示词和本地图片。普通模板直接回传提示词。
