<!-- Parent: ../../AGENTS.md -->

# filePreview

库内及聊天交付的 Markdown/TXT/JSON/CSV 及 text/* MIME 文件只读预览页；文本 MIME 不按后缀限制，源码和无后缀文本复用预览与下载。

- `page-meta` 的 root-background-color 使用十六进制透明色 `#ffffff00`，兼容 Skyline 原生背景参数校验。

- 使用 `settingRouterBuilder` 及设置页相同的纵向手势、滚动边界和关闭交互。
- Markdown 复用 `towxmlstream.static` 与 `towxml openTyper=false`；TXT 使用原生 `text`。
- 入口先导航，通过 EventChannel 传入附件元数据；页面 onReady 后调用共享 `resolvePreviewFile` 下载当前有效 HTTPS 地址；地址缺失或过期才进行所有权校验和续签，再读取 UTF-8 内容。兼容已准备好的本地临时路径。
- 请求、下载和内容读取期间使用 `yb-dot-matrix-loading`，显式传入最终画布尺寸；页面隐藏或卸载时移除 Canvas，关闭后迟到结果不得更新页面。
- 页头左侧关闭，右侧 `icon-download`；内容就绪后复用同一个临时路径，Windows/Mac 使用 `wx.saveFileToDisk`，手机使用 `wx.shareFileMessage` 打开文件转发面板供用户转存，不报告为已保存系统磁盘。加载/失败/操作中禁用重复点击，取消不报错，其他失败沿用 i18n。

- JSON/CSV 也使用原生 text 只读展示，只有 Markdown 进入 Markdown 解析器。
