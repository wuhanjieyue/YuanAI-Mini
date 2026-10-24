<!-- Parent: ../AGENTS.md -->
# pages/reportError

手动报告恢复 settingRouterBuilder + stacked 的叠层路由，上推缩小设置页，使用普通 sheet 与 pop-gesture；摇动提示继续使用 upRouterBuilder + draggable-sheet。
- source=shake 先显示确认提示；手动入口直接显示表单。route 仅保留不含查询参数的页面路径。
- 请求统一走 request/errorReports.js 的 /user submitErrorReport。成功回执后关闭；发送中防重复；失败保留正文和相同 requestId/payload，重试不重复落库。
- shakeToReport 由 store 管理，默认开启并按同名本机存储键持久化；App 前后台控制加速度监听。
- 当前不显示截图开关：开发者工具 Skyline Snapshot.takeSnapshot 实测未返回文件，不能据此认定真机不支持。
- 不附带聊天正文、Token、页面参数；文案如实说明提交范围。
- 复用 glass、text-*、间距与 lradius 公共类；本页 WXSS 仅保留表单尺寸及半屏布局。
- tests/errorReports.test.js 验证力度、连续反向峰值、冷却、开关/前后台、请求失败与幂等重试。

- 表单发送按钮为滚动区之外的底部固定区域，保留安全区；摇动提示在 onReady 测量自然内容高度（含安全区）并加边框高度，最高屏幕85%，超长内容滚动，不再以最小高度撑出空白。复用 plr36、glass 与公共文字色，flex 及安全区尺寸保留页面局部样式。
