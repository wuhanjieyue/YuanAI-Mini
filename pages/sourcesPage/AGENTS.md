# sourcesPage

消息来源半屏页，通过 showSources EventChannel 接收 citations。使用与 reasoningPage 相同的 upRouterBuilder、draggable-sheet 吸附档位、worklet 尺寸变化和关闭手势；路由由首页发起。

`page-meta` 原生透明背景使用十六进制 `#ffffff00`，避免开发工具拒绝 `transparent`；不改变半屏路由和局部样式。

当前 Qwen Responses 来源由 Worker 补充网页元信息；域名从 URL 提取，不编造摘要。网页来源点击复制链接；知识库来源只提取严格证据 ID，通过本应用鉴权 API 解析，不向引用 host 发送 Token，也不复用关于页 WebView。

颜色复用 text-l0/text-l1/text-l2、bg-l0/bg-l2 和 iconfont；行间距、字号与拖拽条样式保持页面局部。验证入口、拖拽关闭、滚动、长标题及历史消息。

- 展示 siteName 或域名、网页标题与可选 description；标题和简介使用 Skyline text max-lines=2 overflow=ellipsis。图标仅使用来源 hostLogo，缺失或加载失败回退本地搜索图标。简介优先来自搜索原生摘要，缺失时使用网页元信息，不生成摘要；标题为域名或与站点名重复时隐藏标题行。
- 知识库来源通过 knowledgeCitationId 识别，隐藏站点整行（图标、IP／域名），保留文件标题、摘要与原有鉴权证据入口；普通网页来源继续显示站点行。

- 知识库证据先显示原文、章节/行号和历史版本说明，再通过现有 previewStorageFile 打开授权原文件。版本不同不打开当前文件；删除后不能重读。请求、弹窗完成及预览入口核对 assetCacheEpoch 与卸载状态，避免账号切换后的迟到证据。
