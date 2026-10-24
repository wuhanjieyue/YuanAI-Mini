<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-01 | Updated: 2026-08-02 -->

# towxmlstream

## Purpose
统一 Markdown 渲染入口：`openTyper=true` 时按帧消费字符预算并增量更新节点，缓存已完成一级块；`openTyper=false` 时一次性渲染完成态节点树。

## Key Files

| File | Description |
|------|-------------|
| `index.js` | 流式 Markdown/HTML 解析入口 |
| `towxml.js` | 流式打字、静态节点渲染、批次组件和完成事件协调 |
| `citation.js` | 流式与静态渲染共用的引用角标校验、来源页导航和失败提示 |
| `render-context.js` | 按 `context-id` 隔离流式文本与 batch 回调 |
| `typable-text/` | 可复用文本实例与增量文本回调 |
| `batch/` | 批次节点渲染回调 |
| `config.js` | Markdown、代码高亮和自定义组件配置 |

## For AI Agents

### Working In This Directory
- `towxml.js` 的字符边界、换行刷新、batch 分配和 `finish` 事件共同决定流式稳定性，改动前先确认性能与收尾顺序。
- 流结束时必须把最后一次完整 Markdown 解析结果提交到实际显示的 `batchNodes`，并等待对应 `setData` 回调后才能触发 `finish`。
- 打字启动时初始化实例节点缓存；空正文终态（首字前取消、纯图片回复）也必须完成收尾，不依赖占位字符触发初始化。
- `speed` 仍表示单字符间隔；内部约按 16ms 一帧累计消费预算，单帧有 64 字符上限。`finishIndex` 之前的一级块视为稳定缓存，只重新解析尾部未完成内容。
- `openTyper=false` 使用 `nodes` 直接走 `decode`，避免完成态创建流式 batch 实例；解析器的静态入口保留原 `towxml` 的一次性解析行为。
- Skyline 下内联节点使用原生 `span`，普通文本使用 `text`，代码块、表格和富文本的横向滚动使用 `scroll-view`；代码块视觉类 `h2w__pre` 必须挂在外层 `scroll-view`，内部 `h2w__preContent` 只承载滚动内容；不要依赖 `view { display: inline }` 或 `overflow-x`。
- 代码块和表格横向 `scroll-view` 必须显式设置 `clip=false`；它们嵌套在聊天页的 `type="list"` 纵向容器中，Skyline 默认裁剪会出现布局宽度完整但只绘制部分内容、触摸后才刷新的问题，不能靠拉伸列宽修复。表格的可视边界由普通外壳 `h2w__tableParent` 的 `overflow:hidden` 负责，流式与完成态共用。
- `type="list"` 只用于聊天消息长列表；代码块、表格、富文本和 YUML 的横向容器只有单个包装子节点，使用普通 `scroll-view`。代码块保持块级布局，不启用 WebView 专用的 `enable-flex`，避免 Skyline 开发工具无法回传自动高度。
- `decode` 与 `typable-text` 保持 `virtualHost: true`；纯行内段落、标题和列表项通过 `inlineContent` 放入原生 `span` 混排上下文。流式 `batch`/`typable-text` 通过 `context-id` 绑定所属渲染实例，不得恢复模块级回调单例。
- 静态 `wx.towxml(..., { events })` 通过根节点 `eventContextId` 绑定事件上下文；事件组件不得恢复 `global._events` 全局回调表。
- 代码块和表格根据解析出的行数提供 `scroll-view` 最小高度，以兼容开发工具无法自动测高的情况；真机仍可在 `enableScrollViewAutoSize` 下继续撑高，`sdkVersionBegin` 不低于 3.7.2。
- 批次、定时器和展示文本只通过 `setData` 更新组件状态；LaTeX/YUML 外部服务参数必须使用 `encodeURIComponent`，服务域名需满足小程序业务域名和 HTTPS 要求。
- ECharts 使用 `canvas type="2d"` 和节点查询接口；Skyline 开发工具不作为图表真机效果证据，发布前需用 Nightly/真机验证。
- 解析层会移除块级节点之间的格式化空白，但保留内联节点之间的有效空格及代码块空白；主题随自定义节点传递，不依赖全局主题变量。
- parser、语言包和自定义渲染子目录是 bundled 实现，不逐层扩展文档；结构问题优先查询父级 CodeGraph。
- 代码块复制通过 batch/decode 的 codecopy 冒泡事件交给 towxml 宿主；Markdown fence/code_block 在高亮前保留 token 原文，parse 转为 codeText 后移除编码副本，复制保留空格、Tab、空行与末尾换行，不包含语言标题、行号或高亮标签。成功时隐藏剪贴板 API 自带 toast，复用 yb-notice-capsule，入场后停留500ms，suffix 关闭按钮可提前 hide；失败也用胶囊提示。颜色和布局复用 bg-l2/cradius/dc/ac/jc/ft24/icon-x，只有关闭按钮46rpx尺寸保留局部样式，theme 通过 getThemeStyle 传入胶囊。
- 原生 `button` 分支只透传 `attrs.style`，不把 HTML 的 `attrs.class` 绑定到按钮；普通 Markdown 节点仍保留动态语义类和主题上下文规则。

### Testing Requirements
- 配置或样式改动做 diff 检查即可。
- 修改增量渲染、批次或完成事件时手测短文本、长文本、代码块、换行和流结束；Skyline 真机还需验证列表、表格、富文本横向滚动及消息高度变化。

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->

- 动态主题由 theme 属性驱动：batch/decode 递归透传，公式/YUML 更新 URL，ECharts 保留原始配置与缩放/图例选择后重建并释放旧 chart。不得为换肤重新解析全部消息或重启打字。

- 搜索正文的 [ref_n] 由共享 Markdown 解析器按本消息 citations.reference_id 映射为 sup/a[data-citation=true]；只转换带有效 HTTP(S) URL 的已确认引用，不猜测缺失来源，不转换普通 [1]、转义文字、Markdown 链接内文字或代码里的标记。流式消息通过 mdText.citations 传入来源，结束时重新解析完整已显示正文，使迟到来源覆盖先前缓存；完成态/归档通过解析选项 citations 复用同一规则。旧 sup/a 引用继续兼容，引用 a 转为原生内联 span，禁止套 navigator/view；点击沿用 upRouterBuilder 打开 sourcesPage，通过 showSources 传递已校验 URL。复用 h2w__sup、h2w__a 和 h2w__citation 局部样式及现有链接颜色。

- 引用角标 h2w__citation 仅保留局部小字号、间距和圆角；颜色复用 h2w__a 主题规则，sup 复用既有上标偏移。
- 正文普通 Markdown 链接若具有合法知识库证据路径，也转换为内联 citation 并复用来源页；ID 识别复用 chatSources.knowledgeCitationId，不向链接 host 发起携带凭据的请求，最终权限仍由本应用 API 校验。

- 已完成产物的 HTTPS Markdown 链接与当前消息元数据精确匹配后，使用现有内联 span 和 h2w__a 链接颜色；历史 artifact:// 引用沿用同一事件。decode 发出 bubbles/composed 的 artifactlink，由消息宿主校验当前 contentParts 并打开预览。无效 artifact 引用也不交给 navigator；普通链接保持原处理。流式、完成态和归档页共用该协议，不把稳定引用直接用作 image src。

- `stopTyping()` 的截止前缀排除末尾尚未组成完整 Unicode 字符的高代理项；停止回调和返回值使用同一个前缀，供上层保存可重现的 Markdown 位置。

- images 携带当前消息的图片元数据（静态入口也可传完整 contentParts）；流式 files 单独携带文件元数据，参与解析缓存失效与最终渲染。Markdown 未完整的 ![图片](链接 前缀生成占位节点，不把 URL 追加到 typable-text 或发起图片请求；链接完整后按 artifactType=image 与已交付 URL/ID 复用 generatedImages 卡片。当前消息已确认文件的未闭合 Markdown 链接只显示标题并沿用 h2w__a 样式，pendingLink 禁止打字器追加目标 URL；完整后才按精确元数据匹配启用原有点击。停止后的不完整文件链接仍只显示标题，不猜补 URL。普通链接、转义和代码保持原解析。图片尺寸与所有权来自元数据，不猜链接扩展名；静态/停止后的不完整已知引用仍显示已确认图片。imagecards 报告已渲染节点的产物 ID，用于宿主去重；不得用尚未打印的全文代替打字边界。img 的 data observer 负责占位与完成图片切换，theme 和 unavailable 事件沿 decode/batch 透传。
