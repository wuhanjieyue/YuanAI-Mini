<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-11 | Updated: 2026-04-11 -->

# components/_self/yb-subsetting-data-control

## Purpose
设置页数据控制面板。管理模型训练开关、语音数据开关、位置授权，以及聊天/账户操作确认。

## Entry Points

| File | Description |
|------|-------------|
| `index.js` | 开关展示与事件回传、确认请求、位置权限授权 |
| `index.wxml` | 分组列表卡片与确认请求 |
| `index.json` | 注册 `yb-subsetting-list-card` |

## Dependencies
- `../../yb-subsetting-list-card`

## Properties / Events
- `dataControl`：宿主提供的数据控制状态
- `change`：返回 `{ key, checked, dataControl }`
- `action`：确认完成后返回 `{ action }`，由宿主调用业务 API

## Actions
- `archived_chats`（进入设置内下级页面，不弹确认框）
- `archive_all`
- `delete_all`
- `export_data`
- `delete_account`
- `allow_location`

## Risks / Hotspots
- 危险操作通过事件请求页面层的 `yb-confirm-dialog`
- 位置权限流程依赖 `wx.authorize` / `wx.openSetting`
- action key 驱动 UI 和提示文案；API 映射由宿主维护

## For AI Agents

### Working In This Directory
- 新增 action 时要同步：
  1. 列表项数组
  2. `CONFIRM_MESSAGES`
- 同时在宿主页面登记对应业务处理
- 危险操作记得放进 `DANGER_KEYS`
- 组件使用 `styleIsolation: isolated`；区块标题与提示显式导入 `static_wxss/skyother.wxss`，业务动作样式留在本目录，列表行由 `yb-subsetting-list-card` 负责

- exportStatus/deletionStatus 为服务端任务状态投影；export_data 使用中性 value 行及 trailingIcon。queued/running/starting 点击回传 exporttap，completed 同事件请求分享；其他状态展示导出确认。位置授权使用 scope.userFuzzyLocation，设备定位只由应用启动的 request/location.js 获取一次。
