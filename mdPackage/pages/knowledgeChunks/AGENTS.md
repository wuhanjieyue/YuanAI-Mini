<!-- Parent: ../../AGENTS.md -->
# knowledgeChunks

知识库单份资料的分块列表。通过 request/knowledge 的只读分页接口获取当前 owner、当前 revision 的分块映射，不接收上游 Source 或分块 ID。

- 复用 settingRouterBuilder stacked 路由及帮助中心的 info-page/toolbar/scroll、原生 pop-gesture；打开 knowledgeChunk 时上一页上推并缩放，返回恢复列表及滚动位置。
- 单个圆角卡片沿用设置组的 ptb36/plr36/lradius 和主题色，行内显示真实分块正文开头并单行省略，缺内容时回退标题/序号，右侧使用设置项同款 icon-arrow-right；无设置分组大标题。分割线几何保留页面本地。
- 账号 epoch、卸载状态、重复请求和路由锁保护分页、标题和详情导航；版本失效展示服务端错误，重试重新获取列表。
