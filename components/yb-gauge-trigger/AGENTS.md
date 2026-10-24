<!-- Parent: ../AGENTS.md -->

# components/yb-gauge-trigger

## Purpose
聊天与临时模式的推理程度入口。Canvas 仅绘制圆环，指针由 Skyline sharedValue 驱动。

## Contract
- `progress: Number`：当前档位在目录列表中的 `0～1` 进度
- `accentColor: String`：当前重点色的深色操作色，用于 Canvas 圆环
- `popupOpen: Boolean`：宿主滑杆或模型弹窗打开时，以 shared + timing/sequence 执行缩小、淡出、上移；关闭恢复，不卸载 Canvas
- `open`：请求宿主展开推理程度悬浮岛

## Risks
- Canvas 2D 需按 DPR 设置实际尺寸；开发者工具表现不能替代真机验证
- `yb-gauge-trigger` 只在智能模式开启后创建，确保 Canvas 初始化时已有可见尺寸
- 推理滑杆与模型弹窗展开期间保持入口挂载并隐藏，hidden 状态禁止再次触发 open；页面覆盖时仍由宿主 pageHidden 卸载，避免 Canvas 穿透
- 属性变化代表已提交状态，不能直接绑定拖动中的草稿值

- theme（light/dark）控制 Canvas 轨道颜色，变化时按当前进度重绘；accentColor 仍由宿主决定，两者都不改变 worklet 进度。
