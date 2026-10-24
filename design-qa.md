# reasoningSlider 圆角与透明背景 QA

## 对照基准

- 问题截图：`/var/folders/3w/lldy9sq509x613fvh81v73dr0000gn/T/codex-clipboard-4119c351-ccea-4fab-b40d-9498dcd927fb.png`
- 截图尺寸：702 × 392 px
- 状态：聊天模式、推理等级“中”、reasoningSlider 展开

## 实现证据

- Skyline 模拟器截图：`/tmp/yuanai-reasoning-slider-no-glass-level-mid-clean.jpeg`
- 本次 Skyline 兼容背景复查：`/tmp/yuanai-reasoning-slider-skyline-gradient.png`
- 截图尺寸：1153 × 768 px；iPhone 12/13 (Pro) 74% 模拟器
- 聚焦对照：`/tmp/yuanai-reasoning-slider-rounded-mid-clean-comparison.jpeg`
- 环境：微信开发者工具 Stable 2.01.2510290、基础库 3.15.3、Skyline

## 比较结果

- P1 圆角被压扁：已修复。原实现对完整圆角填充层执行 `scaleX`，导致左端半圆被横向压缩；现改为固定 84rpx 圆形端帽，只有被滑块遮挡的矩形填充层缩放。
- P1 右端出现垂直切面：已修复。动态矩形填充层现在止于滑块圆心，由圆形滑块及其橙色边框完成右端轮廓；“高”和“超高”档位均已在 Skyline 模拟器复查。
- P1 满级左右留白不一致：已修复。轨道 padding、滑块尺寸和填充 inset 统一使用未取整的 `screenWidth / 750` 比例，避免 390px 等机型因逐项向下取整而把累计误差留在右侧；超高档已复查。
- 玻璃背景已与缩放主体拆为兄弟节点：只同步展开后的高度，并通过独立 `backdropOpacity` 淡入淡出；背景使用全屏宽度的单层纵向渐变，上方透明、底部半透明暖白，不再依赖 Skyline 真机未稳定绘制的 `filter: blur()`。
- 仪表盘由 `smartMode` 控制创建；`reasoningSliderOpen` 为真时通过宿主 `wx:if` 完整移除组件，避免 Skyline/glass-easel 下自定义组件 `hidden` 未真正退出显示层。
- 重新编译后已在 Skyline 展开态复查：输入框右侧不再残留仪表盘指针，纵向渐变背景正常显示且没有原先清晰的矩形分界线。
- 仪表盘槽位保留同级 `z-index: 2`，确保覆盖后渲染的 `yb-chat-input` 并能正常接收点击；该层级不是弹窗层级，只解决输入框内部兄弟节点的命中顺序。
- 白色滑块、五档位置、橙色填充终点保持同一轨道坐标，等级“中”和“超高”状态均在 Skyline 模拟器中检查。
- 字体与文案未变；颜色继续使用现有橙色与页面 token；本次没有图片或图标资产变化。
- 轨道阴影和边框保持原样，不属于本次玻璃背景范围。

## 交互检查

- 点击轨道切换“中 / 高 / 极高 / 超高”正常。
- 拖动白色滑块可以改变档位。
- 高频填充动画仍使用 UI 线程 `transform`，没有恢复逐帧 `width` 更新。

## 比较历史

1. 初始问题：整块圆角填充层缩放，左侧边角出现明显切面。
2. 修复：拆分固定圆形端帽和矩形动态填充层，并移除玻璃背景。
3. 复查：同为“中”档的聚焦对照中，左端恢复完整圆形，滑块为完整白色圆点，没有玻璃渐变遮罩。

final result: passed
## 创作 Try it 弹窗 QA

- ChatGPT H5 对照视口为 440 × 956；弹窗使用实际 3:1 图片素材、32px 顶部圆角、24/32px 标题、16/24px 正文和 54px 胶囊按钮。
- 路由固定为 `0.45 * screenHeight`，仅改变纵向位移，不缩放内容宽度。
- 初始上滑不响应；下滑至一半及以上退出，小于一半回弹。
- `tests/homeFeature.test.js` 已覆盖按需挂载、激活路由、45vh 和手势阈值。
- 微信开发者工具已重新编译且编辑器 Problems 为 0；弹窗运行态截图仍受 CLI 自动化授权阻塞。
