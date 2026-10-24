<!-- Parent: ../AGENTS.md -->
# generatedImages

流式与历史消息共用的 Skyline 生图卡片。

- 按过滤后的可见卡片数量选择容器：单张在普通 view 中直接展示，多张使用横向 scroll-view；两者复用同一卡片模板。外层 view 保持稳定，承载入场动画和页面显隐。

- 正常卡片固定 75vw 宽，按首次收到的宽高计算高度；已删除图片保留相同几何，缺失有效宽高时回退为 360rpx 方形；image 使用 aspectFit，加载后不重算布局。
- 图片 bindload 前复用 yb-dot-matrix-loading contained 模式，binderror 显示同尺寸失败状态。
- 宿主通过 MobX reaction 将当前重点色和深浅主题映射为 loadingColor，传入 Canvas 的 color；卸载时解除订阅，基础 Canvas 不依赖 store。
- 点阵画布按卡片扣除两侧共56rpx后的可用区域等比内接，保持图片原始比例；传入 fitCanvas 及明确宽高，避免内边距二次扣除和入场scale污染Canvas分辨率。
- 布局复用 --bg-l1、--text-l2；仅加载占位卡片背景透明，完成图与失败状态保留原背景。圆角、间距和卡片尺寸仅用于本组件，保留局部 WXSS。
- 状态归并由 static_utils/generatedImages.js 负责；chatArtifactLinks 与 generatedImagesGeometry 覆盖显示模式、页面覆盖和历史几何。
- 显式与自主生图的进度均复用卡片。displayMode=inline 或旧缺省值沿用卡片；旧 markdown 产物仍在 settled 后补显示正文未引用的已完成图片。referencedIds 仅来自打字器已渲染节点，实时隐藏被正文接管的卡片；完成态用同一 towxml 解析器识别图片及受控产物 ID，代码块和普通文件链接不算已展示。嵌入正文的 img 也复用本组件，不复制加载、预览、主题和页面显隐逻辑。
- pageLifetimes.hide 隐藏卡片绘制并卸载加载 Canvas，show 恢复；保留列表高度、卡片数据和 loaded 状态。透明半屏路由不能仅暂停 Canvas 帧而保留原生图层；隐藏期间交付仍正常更新，返回后显示当前状态，不重新执行工具或重播入场动画。
- turnStatus=completed 且 settled 后，正文已有真实生成图片引用时收起补显示卡片，只保留正文选择的最终版本；实时槽使用当前 Markdown key 已渲染的 referencedIds，历史/归档使用同一解析器识别。生成中、失败、停止、无状态旧消息及没有最终图片引用的回复保持补显示；不删改 images 元数据，正文内嵌卡片不传此消息终态。

- unavailableReason 的图片仍保留正文原位置或无正文引用时的补显示卡片；复用 bg-l1、text-l2、dc/ac/jc，内容仅 icon-image1 和 assets.imageDeleted，无点击预览或还原入口。图标大小与间距为本组件专用，保留局部样式。
