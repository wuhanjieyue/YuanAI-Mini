# 第三方软件来源与许可证说明

本版本 YuanAI 自有代码采用 [PolyForm Noncommercial 1.0.0](LICENSE)。此前以 Apache-2.0 发布的版本保留其已授予的许可。以下第三方代码仍适用各自许可证；修改名称、包元数据或界面不改变第三方许可。第三方许可证全文（包括 Apache-2.0）见 [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)，上游归属声明见 [NOTICE](NOTICE)。

## 随客户端交付的直接依赖

| 项目 | 版本 | 许可证 | 使用位置与来源 |
| --- | --- | --- | --- |
| mobx-miniprogram | 6.12.3（根 lockfile） | MIT | 状态管理；[wechat-miniprogram/mobx](https://github.com/wechat-miniprogram/mobx)，安装后由微信工具构建到 miniprogram_npm/ |
| mobx-miniprogram-bindings | 5.0.0（根 lockfile） | MIT | 页面及组件状态绑定；[wechat-miniprogram/mobx-miniprogram-bindings](https://github.com/wechat-miniprogram/mobx-miniprogram-bindings) |

这两个直接依赖的锁定版本以 package-lock.json 为准；仓库包含已构建的 npm 代码，原许可同样适用。

## Towxml 及其内嵌代码

来源：[sbfkcel/towxml](https://github.com/sbfkcel/towxml)，作者 sbfkcel（上游作者信息：sbfkcel@163.com），上游 README 声明 MIT。

范围：mdPackage/components/towxmlstream/ 的 Markdown/HTML 解析、渲染组件、样式与构建支持。本地历史来源记录标为 Towxml 3.3.1，但没有可验证的原始提交锁定记录，故不将该标签视为已核实的上游发布版本。上游当前 master 和检查的 npm 3.0.6 包未提供独立 LICENSE；下方保留作者归属、MIT 声明与许可全文，不推定版权年份。

YuanAI contributors 已对渲染器进行修改，包括流式输出、主题切换、事件隔离、引用来源、代码复制、文件/图片展示与生命周期处理；并非未经修改的上游发行包。文件中可见的 FWS 等原作者标记应继续保留。

内嵌依赖不能只用 Towxml 的 MIT 一项覆盖：

| 项目 | 许可证 | 范围 / 来源 |
| --- | --- | --- |
| markdown-it | MIT | parse/markdown/markdown.js；[markdown-it](https://github.com/markdown-it/markdown-it) |
| markdown-it-emoji | MIT | parse/markdown/plugins/emoji.js；[markdown-it-emoji](https://github.com/markdown-it/markdown-it-emoji) |
| markdown-it-sub / sup / mark / ins | MIT | parse/markdown/plugins/ 对应文件；[markdown-it 组织](https://github.com/markdown-it) |
| markdown-it-task-lists | ISC | parse/markdown/plugins/todo.js；[revin/markdown-it-task-lists](https://github.com/revin/markdown-it-task-lists) |
| mdurl / linkify-it / uc.micro / punycode | MIT | markdown.js 内嵌的 URL、链接及 Unicode 处理；[mdurl](https://github.com/markdown-it/mdurl)、[linkify-it](https://github.com/markdown-it/linkify-it)、[uc.micro](https://github.com/markdown-it/uc.micro)、[punycode.js](https://github.com/mathiasbynens/punycode.js) |
| htmlparser2 | MIT | parse/parse2/ 的 Parser、Tokenizer；[htmlparser2](https://github.com/fb55/htmlparser2) |
| domhandler / domelementtype / entities | BSD-2-Clause | parse/parse2/ 对应子目录，另含 markdown.js 内嵌实体处理；[domhandler](https://github.com/fb55/domhandler)、[domelementtype](https://github.com/fb55/domelementtype)、[entities](https://github.com/fb55/entities) |
| he（部分转义实现来源） | MIT | parse/parse2/entities/escape.js 的来源注释；[he](https://github.com/mathiasbynens/he) |
| highlight.js | BSD-3-Clause | parse/highlight/，源码标识 10.0.0，含语言定义和主题；[highlight.js](https://github.com/highlightjs/highlight.js) |
| Apache ECharts | Apache-2.0 | echarts/wx-echarts.js，源码标识 4.6.0；[ECharts](https://github.com/apache/echarts)；保留上游 NOTICE |
| d3.js（ECharts 内嵌片段） | BSD-3-Clause | ECharts 4.6.0 LICENSE 列出的树图、力导向、数值和时间处理片段；[d3](https://github.com/d3/d3) |
| ZRender | BSD-3-Clause | ECharts 内嵌绘图引擎，源码标识 4.2.0；[ZRender](https://github.com/ecomfe/zrender) |
| ECharts for Weixin | BSD-3-Clause | echarts/ 的小程序 Canvas 适配；[echarts-for-weixin](https://github.com/ecomfe/echarts-for-weixin) |

Monokai 高亮主题中的原始注释注明 Luigi Maselli 移植，保留该归属。未标注版本的手工内嵌代码缺少完整版本锁定，不能用新下载的包版本冒充本地实际版本。

## 可选构建工具

渲染器子目录 package.json 声明 fs-extra ^8.1.0（MIT），仅用于其 build 脚本。相关依赖为 graceful-fs（ISC）、jsonfile 与 universalify（MIT）。这些工具不是根 npm ci 的业务运行依赖；重建渲染器时需保留实际安装版本的许可。此仓库不提供该可选构建树的锁定版本承诺。

## 平台、服务与素材

微信小程序、Skyline、Worklet 和开发者工具是平台能力，适用微信平台条款；本仓库的代码许可不覆盖它们。后端、模型 API、COS 等服务未作为源码包含，不因客户端源码公开而授予服务访问权限。

项目维护者确认仓库中的图标字体、Logo 和创作示例图片为自制或已获允许开源再分发的授权。项目名称、Logo 和第三方商标不因代码许可而授予商标权；二次发布应使用自己的品牌与服务配置。

## 保留声明

分发源码或小程序包时，应按适用条款保留版权、许可和 NOTICE。帮助中心末尾随客户端提供这些声明。新增、升级或替换内嵌依赖时，应同步更新本文件及许可证全文；不要删除第三方文件内已有的版权和许可注释。
