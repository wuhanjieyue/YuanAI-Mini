<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-11 | Updated: 2026-04-12 -->

# store

## Purpose
使用 `mobx-miniprogram` 管理全局状态，并通过 `wx.setStorageSync` 持久化用户资料、应用设置、聊天偏好和设置页数据。

## Entry Points

| File | Description |
|------|-------------|
| `index.js` | 导出 `DEFAULT_PERSONALIZATION` 与全局 `store` |

## State Slices
- `user`
- `appInfo`
- `applicationSettings`
- `modelCatalog`
- `workModelSelection`
- `chatAbout`
- `suggest`
- `settings`
- `personalization`
- `dataControl`
- `notification`
- `chatHistory`
- `pinnedChatHistory`
- `chatMessageCache`
- `unreadConversations`：服务端返回的 `{conversationId: completedRunId}` 运行态投影；hasUnreadConversations 驱动顶部提醒，不从旧 chatReadState 本机快照恢复。
- `createIntroSeen`：本机首次创作介绍页标记，默认 false；`setCreateIntroSeen` 写同名存储 key，仅导航成功后置 true，不同步服务端。

## Dependencies
- `mobx-miniprogram`
- `wx.getStorageSync`
- `wx.setStorageSync`

## Working Notes
- 默认值与 setter 始终成对维护
- 通知渠道统一使用 `sms`；本地初始化和 setter 兼容旧 `email` 布尔值，显式 `sms` 优先，保存时移除旧字段。
- 存储 key 已被页面直接依赖：`user`、`appInfo`、`account`、`chat`、`settings` 等
- `chatMessageCache` 是单 key 的 10 会话 LRU；账号切换时与 `chatHistory` 一起清空
- `chatRuns` 仅保存按 conversationId 索引的运行态投影，不持久化请求句柄、计时器或事件迭代器；退出/换号时清空。
- `setChatOwnerKey` 换归属时清空未读投影，setUnreadConversations 只接收已校验 ownerKey/epoch 的后端结果；removeUnreadConversation 用于已确认删除/归档后的局部清理。resetChatRuns 同时清空运行态提醒，不修改服务端已读状态。
- `modelCatalog` 仅在内存保存本次启动请求成功的目录，不从磁盘恢复旧目录；`workModelSelection` 只保存稳定的模型和档位 ID
- 设置页通过 `createStoreBindings` 订阅多个 slice，改字段名要同步页面

## Test Coverage
- `tests/chatMessageCache.test.js` 覆盖条目裁剪、LRU 淘汰和存储失败降级

## For AI Agents

### Working In This Directory
- 修改 store 字段时，优先检查是否被 `createStoreBindings` 直接订阅
- 新增设置项必须同时补默认值、setter 和存储 key
- 不要轻易改已有持久化 key 名称，否则会影响已保存数据的兼容性

- 外观仍持久化 applicationSettings.appearance（系统/深色/浅色）；systemTheme 仅为运行态，effectiveTheme 为派生 getter。系统事件、远端设置恢复和本地选择共用该状态链路，不新增存储键。

- assetListCache 使用 assetListCache_v2 持久化；该键标识实际缓存格式，不能为清理命名而变更。assetCacheEpoch 仅运行态。账号重置入口显式调用 resetAssetListCache 清理私有列表缓存并递增 epoch，阻断退出/换号后的迟到请求；公共模版缓存可保留。写入空间不足时保留内存数据并移除过期磁盘快照。

- subscription 仅使用 basic/pro；默认 basic。会员展示由词典映射，不在状态中保存展示文案。
- 默认用户资料的 avatarUrl、nickName、userName 为空；登录/欢迎文案和无头像时的应用 Logo 由界面展示，不作为资料发送给后端。

- dailyRecommendations_v1 保存最近一次 `{ownerKey,accountId,day,items}` 候选池（9至30条）；recommendationItems 是其中三条的运行态展示投影，账号切换清空，缓存恢复须先确认归属。

- shakeToReport 默认 true，通过 setShakeToReport 保存同名本机 key；设备交互偏好不随远端应用设置覆盖。
