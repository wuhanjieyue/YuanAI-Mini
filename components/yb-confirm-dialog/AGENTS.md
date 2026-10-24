<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-11 | Updated: 2026-04-11 -->

# components/yb-confirm-dialog

## Purpose
通用确认弹窗。用于设置页危险操作或需要二次确认的场景。

## Entry Points

| File | Description |
|------|-------------|
| `index.js` | 浮层定位、显示/关闭动画、确认事件 |
| `index.wxml` | 覆层、气泡、箭头与确认按钮 |
| `index.json` | 小程序组件声明 |

## Properties
- `title`
- `message`
- `danger`
- `confirmTone`
- `messageAlign`
- `mutedText`
- `centered`
- `singleAction`
- `inputMode`
- `inputValue`
- `confirmText`
- `cancelText`

## Public Methods
- `show(anchorRect)`
- `close()`

## Events
- `confirm`
- `close`

## Working Notes
- 组件使用 `styleIsolation: isolated`，通用 Flex 基类复用 `components/_shared/flex.wxss`，弹窗布局、字号与语义色仍在目录内定义。
- 视口尺寸优先读取 `wx.getWindowInfo()`；旧测试/运行环境缺少该 API 时兼容读取 `App.globalData.su_system`。
- 若提供 `anchorRect`，会按触发器垂直中点贴近显示
- `anchorPlacement="below-start"` 用于聊天标题处的删除确认：弹窗显示在锚点下方，向上箭头与缩放基准位于左侧 30%。
- 否则退化为中部位置显示
- 全屏触摸层由 `dialogVisible` 控制；Worklet 复用 `yb-flyout` 的面板级 `opacity + scale` 关闭时序，缩放完成后才收缩遮罩并结束显示，避免玻璃底板被瞬间裁掉
- 有 `anchorRect` 时，先测量 `.dialog-panel`，按触发器中心点计算 px 级 `transform-origin`；没有锚点或测量失败时回退到 `50% 50%`
- 容器在全屏 fixed 遮罩内使用 `position: absolute`，不要嵌套 fixed 定位，否则 Skyline 可能将绘制层与命中树拆开
- 锚点弹窗先在 `0×0` 遮罩内提交 `bottom` / `left`；Worklet 只对 `.dialog-panel` 做 `yb-flyout` 同款 `opacity + scale`，不缩放 `.dialog-container`，保持定位稳定
- Skyline 的 `z-index` 只对兄弟节点生效；调用方必须在 `<yb-confirm-dialog>` 宿主节点上设置固定层级，不能依赖组件内部节点建立层叠上下文
- 遮罩使用 `bind:tap` 关闭，面板和按钮使用 `catch:tap` 阻止事件继续冒泡；输入框强制同层并在打开动画结束后聚焦

## For AI Agents

### Working In This Directory
- 若改定位算法，要同时保留越界保护
- `danger` 只影响文案样式，不自动改变行为

- themeStyle 为可选样式字符串，显式应用于 dialog-overlay，支持作为页面内容根的兄弟节点挂载时接收主题变量；不订阅宿主状态。

- inputMode 的重命名弹窗自动横排，其他居中双按钮弹窗可传 horizontalActions；取消在左、确认在右，视觉与访问顺序一致。重命名调用方传入本地化的“保存”。横排危险确认沿用中性按钮底色与危险色文字；默认竖排、单按钮和锚点模式不变。
