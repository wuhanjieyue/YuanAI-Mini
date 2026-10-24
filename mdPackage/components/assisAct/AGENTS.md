<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-01 | Updated: 2026-08-01 -->

# assisAct

## Purpose
助手消息完成后的操作区，承载复制、反馈、分享和更多消息操作入口。

## Key Files

| File | Description |
|------|-------------|
| `index.js` | 操作项状态与事件回传 |
| `index.wxml` | 操作按钮布局 |
| `index.wxss` | 操作区样式 |
| `index.json` | 组件注册配置 |

## For AI Agents

### Working In This Directory
- 组件只负责展示和向父级回传操作，不直接承担会话或云函数请求。
- 事件名和 payload 要与 `assisDone`、首页消息处理保持一致。
- 父级 CodeGraph 指引适用；修改事件协议前查询调用方。

### Testing Requirements
- 局部样式/文案改动做 diff 检查即可。
- 修改操作事件或按钮条件时手测完成态消息的每个入口。

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->

- 消息完成后有 citations 才显示来源入口；仅转发 openSources，由首页打开来源路由页。

- 来源 hostLogo 图标最多3个不同域名，不推导第三方图标地址；缺失或加载失败移除该图标，全部缺失/失败使用 icon-web-search。图片请求直接由前端加载。

- `compact=true` 用于归档查看页，只展示复制和来源；普通完成态常驻复制、反馈、分享、更多四个入口，重试/朗读/搜索等收纳在更多菜单。复制通过 `copy` 事件回传去除 Markdown 链接/图片目标地址、保留标题的正文，代码内容不变，由宿主处理剪贴板。
- `status=failed` 且无 `messageId` 的本地失败回复只展示复制与直接重试；`retryLocal` 事件由会话宿主重新提交原轮次，不打开更多菜单。
- 反馈入口复用 `yb-flyout`：未评价显示 `icon-goodorbad`，保存成功后按 like/dislike 显示对应图标；重复选择取消评价，请求失败保留原状态。
- 更多入口同样复用 `yb-flyout`，菜单沿用反馈弹窗的玻璃表面和左上角缩放原点；`retry` 复用 `regenerate` 事件，其余菜单项通过 `moreAction` 向父级转发。
- 创建聊天分支仍只通过 `moreAction` 回传；宿主请求期间用 `branchLoadingTurnId` 将触发轮次的更多图标替换为旋转图标。
- `animate-entrance=true` 仅由 `assisStream` 传入，操作栏挂载时用 Worklet 弹簧从左上角入场；完成态历史消息和归档页默认不播放。
