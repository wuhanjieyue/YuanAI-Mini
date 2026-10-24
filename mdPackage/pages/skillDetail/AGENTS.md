<!-- Parent: ../../AGENTS.md -->

# skillDetail

插件 Skill 的只读 HTTP 详情半屏页。

- 首页使用已有 `upRouterBuilder` 打开，不在详情页重新注册或复制路由。
- `draggable-sheet` 默认占屏幕60%，最小尺寸为0；最高点沿用文件页的胶囊底部加20px边界。原生 `scroll-view` 关联 sheet，上滑先展开再滚动正文；支持60%停靠，拖到底或点击遮罩/关闭按钮返回。
- 详情经 `request/skills.js` 的 `getSkillDetail` 调用 `/skills/detail` 获取，title/titleEn/description 保持后端原值，标题按应用语言即时投影，缺少译名时回退已有名称；切换语言不重读或重渲染正文；请求失败提供重试，无静态兜底。关闭、卸载和账号/游客 epoch 变更后丢弃迟到结果；身份变更关闭当前详情，onUnload 清理身份与语言 MobX reaction。
- Logo 与文案左右排列，全部使用服务端 `logoUrl`；描述用原生 `max-lines=3` / `overflow=ellipsis`。更新时间通过 `assetPresentation.formatDateTime` 按库的 `YYYY/MM/DD HH:mm` 格式显示，正文复用 `towxmlstream.static` 与 `towxml openTyper=false`，前端不重复解析或删除 frontmatter。
- 更新时间行与 Markdown 框外侧均保留24rpx；正文框使用2rpx `--border-subtle` 边框、20rpx圆角和24rpx内边距。
- 试用按钮独立悬浮在 sheet 底部，按钮容器透明，滚动区铺满 sheet。正文末尾的20vh占位在 scroll-view 内容中随正文滚动；其后另加144rpx与底部安全区的按钮避让占位，保证滚到底时20vh留白完整显示在按钮上方。
- 详情返回 exampleMessage/canTry；未发布或缺少有效场景消息时禁用试用。试用经 request/skills.trySkill 请求服务端添加并启用当前所有者关联，成功后通过 trySkill EventChannel 回传元数据并关闭；首页返回后创建新聊天并预填，不自动发送。trying 防重复提交，失败可重试，账号/游客 epoch 变化后丢弃响应；导航失败通过 cancelSkillTrial 清空首页待处理动作。
- 关闭按钮沿用设置页关闭状态的22rpx内边距、48rpx图标及胶囊圆角，复用 `glass-view`、图标字体、主题与重点色变量；内容几何、操作按钮尺寸和固定按钮布局保留在本页。
- 已安装且非 globalDefault 的插件在关闭按钮左侧显示同款删除按钮；标题区同步避让。删除经 request/skills.removeSkill，只改变个人安装关联；removing 防重复并与 trying 互斥，失败保留详情供重试，账号变化/关闭/卸载丢弃迟到结果。成功通过 skillRemoved EventChannel 同步首页列表后关闭；返回失败时保留已删除状态，避免重复删除。

同一详情路由支持 kind=mcp，缺省为 skill；MCP 通过 request/mcps 读取和操作，详情有双语 description/markdown/exampleMessage，语言切换仅重渲染 MCP 正文。首页根据 kind 分派试用，MCP 仅预填草稿，不调用 selectSkill、不创建输入标签、不自动发送。
