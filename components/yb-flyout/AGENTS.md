<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-19 | Updated: 2026-08-19 -->

# components/yb-flyout

## Purpose
Skyline-only 的通用锚点弹窗。调用方通过 `trigger`、可选 `anchor`、`preview` 和 `popup` slots 提供内容，组件统一处理 `root-portal`、测量、定位、命中层和 Worklet 动画。

## Contract
- Properties、external classes、methods 与示例见 `README.md`。
- `position.js` 是无项目依赖的纯定位模块，组件目录不得依赖 `static_utils`、Store 或业务接口。静态布局显式导入 `static_wxss/skyother.wxss`；定位、测量与状态覆盖规则仍留在组件内。
- `open(anchorRect?)` 支持内部测量或外部 viewport 矩形。
- `reposition(anchorRect?)` 只在打开状态重新定位，不改变开合动画。
- `close` 在关闭开始时触发，`afterclose` 在动画完成且命中层归零后触发。
- `masktap` 总会派发；`closeOnMaskTap=false` 时由调用方决定先收起内部层还是关闭整个弹窗。
- 组件先用不可见的定高 `scroll-view` 实测唯一 `popup` slot，再固定可视高度；`scrollable` 只决定是否开启纵向滚动。每个具名 slot 在模板中只能声明一次。

## For AI Agents
- 保持 Skyline-only，不在此组件加入 WebView 回退或 YuanAI 选项样式。
- 定位必须扣除实测 portal 原点，不要恢复设置 Sheet 的固定像素偏移。
- 可用范围由调用方通过可选 `boundaryRect` 提供；组件不得读取业务页面的键盘或布局状态。
- 默认 Worklet transform 绑定 panel；开启 `previewEnabled` 后另行绑定卡片副本；测量阶段必须用同步 flush 保持 `scale(1)`。通过两个透明、绝对定位的原生 text 标记测量 portal 原点与 panel 外框，唯一 content 节点测量 slot 高度，scroll 高度使用组件实际设置的 `_scrollHeight`；不要恢复对 mask/panel/scroll 容器的 boundingClientRect 查询，Nightly 重复打开时这些查询会不返回。
- `popup-class` 不得接管定位、尺寸、transform 或 opacity。

- `anchorCentered` 为可选的记录长按模式：水平居中、上下择向，缩放原点跟随锚点中心；默认调用方继续沿用原定位与 `popupTransformOrigin`。

- themeStyle 为可选 CSS 变量/文字样式字符串，显式应用到 root-portal 内的遮罩根节点，解决 portal 不继承内容根变量的问题；由调用方透传，组件不读取 store 或生成业务色板。
- `root-portal` 持续启用，保留原生节点及其 Worklet 绑定；`maskMounted` 只控制遮罩从 0×0 恢复至视口尺寸。关闭动画结束后遮罩归零，不切换 portal 的原生父节点。
- 测量阶段遮罩通过 opacity=0 保持不可见，不用 visibility:hidden 跳过布局；原生布局标记不参与排版、触摸或无障碍内容。
- 模块只保留一个活动实例（包括定位/测量/关闭中）；新实例打开先立即关闭旧实例，关闭/卸载立即结束旧打开流程的布局等待。原生查询迟到只能返回旧结果，不能重新显示已取消的弹窗。测量缺失/失败同样走 close/afterclose，恢复内部及宿主触发项。
- `close(reason?, immediate?)` 默认保留 180ms Worklet 动画；替换弹窗时传 `immediate=true` 清理旧命中层。正常完成回调与 360ms 单次清理兜底均检查关闭 token，取消或迟到回调不得结束新弹窗；兜底仅完成生命周期，不驱动动画帧。

- `previewEnabled` 默认 false，只有启用时测量/联合定位 `preview` slot 的卡片副本；同一 portal 中先遮罩、后卡片、再菜单。调用方隐藏原卡片但保留占位，并持有背景滚动锁直到 `afterclose`。默认设置/侧栏弹窗不改变。
- `previewHeightRatio > 0` 时，preview 改为独立定尺寸面板（宽由 `previewWidthRpx` 指定），和菜单联合夹在可用视口内；预览固定上方、菜单固定下方，空间不足共同压缩高度。该面板直接共享 panelScale/panelOpacity 的开合动画和弹性回弹，不单独截断 scale；点击派发 `previewtap`。默认 ratio=0 的卡片副本继续沿用回落动画和遮罩点击行为。
