<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-12 | Updated: 2026-04-12 -->

# components/yb-file-list

## Purpose
聊天输入区上方的文件附件列表。展示已选图片/文件，并支持删除。

## Entry Points

| File | Description |
|------|-------------|
| `index.js` | 列表显隐动画与删除事件 |
| `index.wxml` | 横向文件/图片滚动区 |
| `index.json` | 小程序组件声明 |

## Properties
- `files: Array`

## Events
- `deleteFile`
- `heightchange`: 回传 `{ height, duration }`，宿主可同步底部布局动画

## Parent Coupling
组件自行持有附件栏高度 shared 值，不读取宿主实例；宿主仅按需消费 `heightchange`。

## Behaviors
- `showFun()` / `hideFun()`：控制附件栏高度；收起时仅裁切内容，不删除附件数据
- `reshowFun()`：当仍有文件时恢复高度
- 上传或删除中在现有图片/文件图标遮罩内使用组件局部 shimmer，保留文件名和大小；文件图标消费归一化附件的语义 Iconfont 类名。`selected` 本地附件可立即清除。
- `deleteFile()`：通知父组件移除本地未发送附件；已上传文件仍由父组件确认云存储删除后移除。若删除后为空则收起栏位。
- 展开高度由组件内 `expandedHeight` 统一维护；父页面通过 `showFun()` 恢复显示，不直接写 `fileHeight`

## For AI Agents

### Working In This Directory
- 文件对象目前兼容两类字段：
  - 图片：`fileType === 'image'`，显示 `tempFilePath`
  - 普通文件：显示 `name` / `size`
- 若扩展更多文件类型，先保持现有删除与横向滚动结构不变
