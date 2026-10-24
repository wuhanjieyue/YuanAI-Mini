<!-- Parent: ../AGENTS.md -->

# messageAttachments

- `attachments` 消费已归一化附件；`delivery` 默认 false，保持用户附件的文件卡片与图片网格。
- 助手传 `delivery=true`，在正文后、操作栏前展示一个圆角列表，每行保留完整文件名及扩展名，超长名称单行截断。流式宿主仅在 settled 后挂载。
- 所有行沿用 `previewFile` 事件的 `{ attachment, attachments }` 契约，不在组件内下载或拼装 URL。
- 交付列表复用公共 `dr`、`ac`、`wt4`、`iconfont`、`icon-text`、`icon-arrow-right`，颜色使用 `--bg-l0`、`--bg-l1`、`--text`、`--text-muted`、`--ink-5`；行高、圆角、分隔线与图标细节留在局部 WXSS。
- 已删除文件仍保留 unavailableReason，名称区和辅助标签标明文件不可用，点击继续由宿主处理。
- 文档附件的动态 `colorClass` 复用 `text-main-l1`，交付行 `hover-class` 复用 `bg-l1`；文本和其他附件的 `--warn-l2` / `--suc-l1` 暂无等价公共文字类，保留局部规则。

- 用户上传图片删除后仍保留 attachment-image 的80px×80px固定缩略图，复用 bg-l1/text-l2/ac/jc，仅显示 assets.deleted（“已删除”），无图标、预览或还原入口；生成图片的原比例/360rpx回退由 generatedImages 独立处理。
