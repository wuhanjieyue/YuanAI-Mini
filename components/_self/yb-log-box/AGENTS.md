<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-12 | Updated: 2026-08-23 -->

# components/_self/yb-log-box

## Purpose
首页聊天空状态组件。根据 `temporaryMode` 展示临时聊天说明；其余模式复用 Logo 与 Yuan Bot 标题，根据 `workMode` 切换专属说明。

## Entry Points

| File | Description |
|------|-------------|
| `index.js` | 使用原生窗口高度和父组件键盘 shared 值设置满屏高度 |
| `index.wxml` | 临时聊天说明或 Logo 引导内容 |
| `index.wxss` | 组件隔离样式与项目公共工具类的显式导入 |
| `index.json` | 小程序组件声明 |
| `/static/logs/glog.png` | 普通模式项目 Logo 资源 |

## Properties
- `temporaryMode: Boolean`
- `workMode: Boolean`

## Parent Coupling
依赖父页面 shared 值：
- `keyHeight`

该 shared 值驱动 Skyline UI 线程上的高度动画，属于当前宿主协议；组件不再依赖应用级窗口信息或全局 WXSS。

## For AI Agents

### Working In This Directory
- 临时分支负责标题、说明文案和 `showTemporaryInfo` 点击事件；其余模式保持现有 Logo 引导与 Yuan Bot 标题，`workMode` 只切换说明文案
- `<yb-log-box>` 宿主由首页显式覆盖聊天空白区域；内部绝对定位空态不得脱离该布局范围
- 页面仅在无消息时挂载 `<yb-log-box>`；不要改成 `hidden` 常驻宿主，消息列表与空态保持独立生命周期
- 普通与临时空态统一使用 `.log-empty-state`，高度动画依赖首页输入区高度，不要直接改成固定高度
- 保持 `styleIsolation: isolated`；Logo 与 Flex 基类复用项目 `static/` 和 `static_wxss/`，空态布局、字号和颜色样式保留在组件内
