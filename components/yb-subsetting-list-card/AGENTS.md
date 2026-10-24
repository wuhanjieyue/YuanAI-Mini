<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-11 | Updated: 2026-04-11 -->

# components/yb-subsetting-list-card

## Purpose
设置页通用列表卡片容器。负责渲染行、分隔线、箭头、value 文案与 switch，并对外回传点击项和锚点位置。

## Entry Points

| File | Description |
|------|-------------|
| `index.js` | 行点击 / 开关变化事件桥接 |
| `index.wxml` | row 渲染模板 |
| `index.json` | 小程序组件声明 |

## Input Contract
`items` 中常见字段：
- `key`
- `label`
- `rowType` (`link` / `switch` / `value` / `action`)
- `checked`
- `value`
- `arrow`
- `navigable`
- `actionTone`

## Events
- `itemtap`
- `switchchange`

## For AI Agents

- 箭头图标类和码点保留在组件目录，字形数据复用应用级内嵌 TTF，不依赖运行时 CDN。

### Working In This Directory
- 新增 rowType 前先检查现有几种是否已足够表达
- `itemtap` 会返回对应行的 bounding rect，依赖它的父组件可用于锚点弹窗

- value 行支持 trailingIcon/loading，供数据导出等状态投影；使用组件公共 iconfont 基类和本地必要字形，旋转复用聊天 loadingRotate 的 WXSS 机制。不在列表组件发请求或维护业务任务状态。
