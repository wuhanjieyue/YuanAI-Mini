# yb-flyout

`yb-flyout` 是仅面向微信小程序 Skyline 的锚点弹窗组件。它负责 `root-portal` 挂载、锚点测量、可视区定位、遮罩命中和 Worklet 开合动画；弹窗内容、玻璃视觉与业务事件由调用方提供。组件目录不依赖项目的工具、Store、公共样式或业务接口，可独立复制使用。

## 运行要求

- Skyline 渲染器与 `glass-easel`。
- 基础库 `2.29.0+`：`root-portal` 本身从 `2.25.2` 起可用，但组件使用的 `applyAnimatedStyle` 要求更高版本；本项目当前为 `sdkVersionBegin: 3.7.2`。
- 开发者工具需使用支持 Skyline `root-portal` 的最新 Nightly，关闭热重载后手动编译。
- 发布前必须真机检查位置、滚动、动画、点击穿透和关闭后的页面手势。

组件不提供 WebView 回退。

## Slots

- `trigger`：完整点击内容。
- `anchor`：可选；开启 `separate-anchor` 后由它负责测量和缩小动画。
- `popup`：任意弹窗内容。
- `preview`：可选卡片副本；仅在 `preview-enabled` 模式下进入同一个 portal。

```xml
<yb-flyout
  separate-anchor="{{true}}"
  scrollable="{{true}}"
  close-on-popup-tap="{{true}}"
  trigger-class="setting-row"
  popup-class="glass-popup"
  bind:open="handleOpen"
  bind:close="handleClose"
  bind:afterclose="handleAfterClose"
>
  <view slot="trigger">应用语言</view>
  <view slot="anchor">中文 ›</view>
  <view slot="popup">
    <view wx:for="{{options}}" data-value="{{item.value}}" bind:tap="chooseOption">
      {{item.label}}
    </view>
  </view>
</yb-flyout>
```

普通入口只需要 `trigger` 和 `popup`，不传 `separate-anchor` 时会测量并动画整个 `trigger`。

## Properties

| Property | Default | Description |
|---|---:|---|
| `preview-enabled` | `false` | 外部卡片预览模式；`open(rect)` 以卡片矩形定位副本和菜单，自动上下择向、避开重叠；关闭时副本回落 |
| `preview-width-rpx` | `0` | 定尺寸预览宽度，0 沿用弹窗宽度 |
| `preview-height-ratio` | `0` | 大于 0 时使用视口高度比例的独立预览，与下方菜单联合定位/缩减高度；点击派发 `previewtap`。0 保留卡片副本模式 |
| `anchor-centered` | `false` | 从锚点中心按上下可用空间展开，并自动设置缩放原点；不影响默认定位 |
| `separate-anchor` | `false` | 是否单独使用 `anchor` slot |
| `popup-width-rpx` | `450` | 弹窗宽度 |
| `popup-transform-origin` | `50% 0` | 整体开合缩放的基准点 |
| `max-height-ratio` | `0.6` | 弹窗相对可视高度上限 |
| `safe-gap-rpx` | `36` | 上下安全间距 |
| `edge-gap-rpx` | `24` | 左右安全间距 |
| `close-on-mask-tap` | `true` | 点击遮罩时是否直接关闭；关闭后仍会触发 `masktap` |
| `close-on-popup-tap` | `false` | 点击弹窗内容后是否关闭 |
| `animate-trigger` | `true` | 是否执行锚点缩入/恢复动画 |
| `scrollable` | `false` | 内容超高时是否启用内部纵向滚动 |
| `disabled` | `false` | 禁止点击和命令式打开 |
| `open-on-trigger-tap` | `true` | 点击 trigger 时自动打开；设为 `false` 可用于纯命令式或长按场景 |

External classes：`trigger-class`、`anchor-class`、`popup-class`、`mask-class`。

`popup-class` 只应设置背景、边框、圆角、内边距、模糊和阴影；不要覆盖 `position`、`top`、`left`、宽高、`margin`、`transform` 或 `opacity`。`anchor-class` 不要覆盖 `transform` 或 `opacity`。组件会先在不可见阶段测量唯一 `popup` slot 的内容高度，再固定内部 `scroll-view`；开启 `scrollable` 时才启用纵向滚动。

## Methods and events

- `open(anchorRect?, boundaryRect?)`：无参数时测量内部 anchor；可传入 viewport 锚点矩形和可用边界矩形。
- 多个实例互斥，定位/测量中也计为活动实例；打开另一个实例会取消旧请求并恢复旧触发项。`open` 成功返回 `true`，失败/关闭/被替换返回 `false`；测量失败仍触发 `close`、`afterclose`。
- `reposition(anchorRect?, boundaryRect?)`：打开状态下重新测量并定位，不执行开合动画；未传边界时沿用打开时的边界。
- `close(reason = 'api', immediate = false)`：命令式关闭；替换菜单时可立即清理旧弹层。默认保留 180ms 动画，原生完成回调缺失时由 360ms 单次清理兜底结束生命周期。
- Events：`open`、`masktap`、`close`、`afterclose`。`close` 的 `detail.reason` 为 `mask`、`popup` 或 `api`。

```js
handleLongPress(e) {
  this.selectComponent('#contextPop').open(e.detail.anchorRect)
}
```

水平位置按 anchor 所在可用范围的左/右半区对齐，再执行边界保护；垂直位置使用弹窗实测高度、可选 `boundaryRect`、safe area 和 `root-portal` 实测坐标原点计算。组件不监听键盘；页面可将已经扣除键盘或路由遮挡后的实测可用矩形传入。

`root-portal` 持续挂载以保持原生节点和 Worklet 绑定稳定；内部 `maskMounted` 仅决定遮罩是否占用视口，关闭后尺寸归零并隐藏。迟到查询及关闭回调不会重新显示旧弹窗或结束新弹窗。

尺寸查询使用透明且不参与排版的原生 text 标记与唯一内容节点，避免 Skyline 重复打开时容器 boundingClientRect 不返回。面板边框、内边距和 portal 偏移仍按实测几何处理，不复制 popup slot 或调用方的玻璃样式。

全宽贴底、拖拽滑块、键盘联动确认框和多层展开状态机不属于锚点弹窗，继续使用专用组件。
