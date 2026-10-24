<!-- Parent: ../AGENTS.md -->
# yb-trending-search

聊天空会话的三条纵向搜索推荐；第一条末尾提供刷新图标。组件不发请求或直接发送内容。
宿主控制显示条件和输入框上方定位；组件拥有列表排版，复用主题变量 `--text-l1`。

- 宿主显示时挂载，通过 `visible` 控制动画；使用 `shared + applyAnimatedStyle + timing` 以左下角为基准仅缩放高度（scaleY，宽度不变）并淡入，隐藏反向收回后发出 `exitcomplete` 供宿主卸载。初始透明，在 ready 绑定后播放；不能以 visible 直接控制 wx:if，否则收回动画会被销毁打断。
- ready 前已转为隐藏时，ready 必须通过 finishHide 通知宿主卸载，不等待未启动的动画。宿主隐藏时立即设置 pointer-events: none，退场期间及卸载通知尚未到达时都不得遮挡聊天点击。

- `items` 接收三条 `{id,text,sources}`，通过 `select` 只回传 id，通过 `refresh` 请求宿主刷新；`loading=true` 时按真实三行高度展示骨架并禁止选择/重复刷新。数据生成与缓存归 request/dailyRecommendations 管理，组件不发请求。
