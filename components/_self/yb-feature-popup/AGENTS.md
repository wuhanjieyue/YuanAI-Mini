<!-- Parent: ../AGENTS.md -->

# components/_self/yb-feature-popup

## Purpose

顶部功能切换、已开始会话的操作菜单与输入框左侧更多功能弹窗。

## Properties

- `modeOptions`
- `moreOptions`
- `modeId`
- `smartMode`
- `conversationTitle`
- `conversationActions`

## Events

- `selectMode`
- `selectMoreFeature`
- `close`
- `afterclose`

## Resources

- `index.wxss` 的 `.feature-icon` 只声明本菜单使用的字体载体和码点，字形数据复用应用级单份 TTF。

## Working Notes

- 组件使用 `styleIsolation: isolated`，布局、字号、语义色和当前菜单图标映射均在目录内定义；字体数据由 `static_wxss/skyfontline.wxss` 统一注册。
- 顶部两个菜单通过 `yb-flyout.open(anchorRect)` 定位；锚点矩形由 `yb-title-nav` 的 `.model-name-anchor` 测量并经 `yb-chat-view` 传入。
- `show(mode/conversation)` 返回底层 flyout.open 的 Promise<Boolean>，宿主处理拒绝打开时的标题恢复；close/afterclose 继续转发。
- 输入区“更多”弹窗保留原有 `keyHeight` 与 Worklet 动画，不迁移为锚点弹窗。
- 切换菜单前立即关闭旧弹层，再修改 `popupType`；测量/数据回调通过请求序号取消。顶部 close/afterclose 使用实际打开的菜单类型，避免“更多”清空旧菜单内容后留下空白玻璃面板。
- `popupType` 只决定渲染内容，`_activeType` 记录已请求打开但尚未开始关闭的菜单，`_closingType` 保留 afterclose 对应类型；不要为每种菜单再维护一组可见布尔值。
- 宿主没有 `keyHeight` shared value 时，更多弹窗使用原始收起值 `36px`；当前聊天宿主仍共享该值以保持键盘联动。
