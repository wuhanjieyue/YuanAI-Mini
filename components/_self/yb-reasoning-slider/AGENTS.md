<!-- Parent: ../AGENTS.md -->

# components/_self/yb-reasoning-slider

## Purpose
聊天与临时模式的模型/推理程度玻璃悬浮岛。拖动值为草稿，岛外点击在收起动画完成后提交；点击顶部模型文字时立即交接草稿给模型弹窗。

## Contract
- `efforts: Array`：宿主提供当前模型的完整五档（轻度/中/高/极高/超高），含唯一 `id`、`modelId`、`modelName`、`effortId`、`label`；不可用档位由 `locked: true` 标记。模型切换后整组更新，滑杆不承担模型切换。
- `currentModelId: String`：已提交模型 ID
- `currentEffortId: String`：已提交档位 ID
- `currentEffortLabel: String`：已提交实际档位文案；打开/关闭/交接时保留实际选择，仅用户编辑后提交五档值
- `commit`：收起完成后返回 `{ index, modelId, effortId, label }`
- `openModels`：顶部文字点击返回 `{ anchorRect, modelId, effortId }`；同时开始原收起动画，完成时不再提交旧草稿，避免覆盖弹窗的新选择
- `locked`：用户尝试选择无权限档位
- `close`：悬浮岛完成收起
- `closing: { handoff }`：开始收起时立即通知宿主；普通收起立即启动 Canvas 入口恢复，交接模型弹窗时保持入口隐藏。`close` 与 `commit` 继续在 220ms 收起完成后派发。

## Animation
- 滑块、填充条、悬浮岛主体尺寸及显隐均由 sharedValue 驱动
- 毛玻璃背景与主体是兄弟节点，只同步最终高度并独立做透明度动画，不跟随主体缩放；背景使用 Skyline 支持的单层纵向渐变并铺满视口宽度，不使用 `filter: blur()` 或 `backdrop-filter`
- 拖动中只在跨越等级锚点时回到 JS 线程更新文字，不持续 `setData`
- 关闭动画与模型标题测量使用同一轮打开序号；dismiss、重新打开或销毁后，旧回调不可提交草稿或交接模型弹窗。
- rpx 换算复用 `static_utils/otherUtils.js`，全部布局与 Worklet 函数仍由组件维护；宿主只提供档位及最终锁态。
- 悬浮层高度仍读取所属 `yb-chat-view` 的 `keyHeight` / `inputHeight` shared 值，以保持键盘与输入区逐帧同步。
- 顶部文字复用 `skyother.wxss` 的 `ft40/wt6`，箭头复用 `skyfontline.wxss` 的 `icon-arrow-right`；局部只维护文字/滑杆间距和悬浮岛几何，原上透明下渐深背景保留。
