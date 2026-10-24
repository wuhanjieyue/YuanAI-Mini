<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-11 | Updated: 2026-04-11 -->

# components/_self/yb-subsetting-notification

## Purpose
设置页通知偏好组件。支持总览页与通知明细页两种模式。

## Entry Points

| File | Description |
|------|-------------|
| `index.js` | 总览/详情切换、通知开关展示与事件回传 |
| `index.wxml` | 概览列表或详情列表 |
| `index.json` | 注册 `yb-subsetting-list-card` |

## Modes
- `pageKey === 'notification'`：总览
- `pageKey === 'notification_*'`：详情

## Dependencies
- `../../yb-subsetting-list-card`

## Properties
- `pageKey`
- `notification`
- `language`

## Events
- `navigate`
- `change`：返回 `{ category, channel, enabled, notification }`

## Working Notes
- 总览页会把通知渠道组合成人类可读文本
- 短信渠道字段为 `sms`，任务、推荐和用量通知共用；仅保存偏好，尚未接入短信发送。
- 详情页 switch 仅更新本地派生视图并发出 `change`；store 写入与远端保存由设置页宿主负责

## For AI Agents

### Working In This Directory
- 新增通知分类时，要同步 `NOTIFICATION_SUMMARY_ITEMS` 与 `DETAIL_MAP`
- `pageKey` 命名格式是 `notification_<category>`，不要破坏这个约定
- 组件使用 `styleIsolation: isolated`；区块标题与提示显式导入 `static_wxss/skyother.wxss`，通知业务样式留在本目录，列表行由 `yb-subsetting-list-card` 负责
