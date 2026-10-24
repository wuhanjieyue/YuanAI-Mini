<!-- Parent: ../AGENTS.md -->
# yb-plugins-view

插件首页展示服务端返回的已安装与推荐 Skill。标题、描述、logoUrl 与安装状态均来自 API；所有 Logo 使用图片 URL，不保留字体 Logo 或静态样例兜底。

- 已安装使用横向 scroll-view 展示全部图标，无数量折叠，调用 request/skills.listInstalledSkills 全量加载；推荐调用 listRecommendedSkills，每页固定25条，触底原样续传不透明 nextCursor。加载/分页防重，搜索与卸载使旧请求版本失效。
- 搜索 query 仅交由服务端筛选推荐，搜索及清空不重载已安装；两组独立加载、失败重试。语言切换即时按 title/titleEn 投影 displayTitle，不重新请求，保留 query、分页游标、已加载页和服务端原始元数据，清空恢复推荐第一页。分页失败保留现有条目与游标。
- 已安装加载显示一个横向图标骨架，成功返回空列表时隐藏整个区域；推荐首次和分页加载显示四个 skill-item 行骨架，复用 skeleton.wxss 扫光。推荐成功无内容（含搜索无结果）时复用 asset-cards.wxss 的 Logo 空态，文案“暂无可用skill”，居中于导航、已安装及推荐标题下方至搜索避让区之间。
- 复用 store 的 login/userId 与 assetCacheEpoch 建立账号边界；已登录用户、登录/退出和游客 epoch 变化均立即清空列表及游标、重新请求，旧账号响应不得回填。detached 清理 MobX reaction。
- 已安装图标与推荐项通过 openSkill.detail.id 请求首页打开默认60vh、可上滑展开的详情页；推荐已安装的 icon-more 复用 yb-flyout，菜单为聊天/预览/分割线/红色删除。聊天调用 trySkill 后派发 trySkill.detail.item，首页复用新聊天和 exampleMessage 草稿；预览沿用 openSkill；删除调用 removeSkill，停用并移出个人列表。未安装 icon-plus 调用 enableSkill，成功后改为更多；请求期间用设置页同款 icon-loading_flow_iconfont 与1.5s旋转，按 id 防重。
- 操作不冒泡打开详情。pendingIds、状态覆盖与旧响应均受账号和组件生命周期隔离；已完成安装状态覆盖迟到的推荐页，保留当前搜索和分页游标，已安装区域静默读回完整有序列表。themeStyle 由首页透传给 portal；菜单复用 setting-option-pop-* 公共类，分割线、危险色及加载旋转尺寸保留在本组件。
- API 的 globalDefault 标识默认插件，更多菜单隐藏其删除行及分割线，操作方法同样拦截默认插件删除。updateSkill 共用于菜单操作和详情删除回传，保留搜索、分页及已加载推荐；迟到的已安装快照不能恢复已删除条目。
- 复用 skyother.wxss 的 floating-search* 与项目 iconfont、主题颜色变量。搜索位置、清空/键盘 Worklet、图标与行布局尺寸留在组件内。
- scroll-view type="list" 的标题、条目、横向滚动区和底部占位均为直接 list-item 子节点；行间视觉间隔使用 padding，不加 margin 或分割线。
- 顶部留白由 yb-title-nav.heightchange 更新滚动内容首个占位；底部保留 154rpx 搜索避让，键盘高度沿用 keyHeight 缓存。

页面默认 category=skills，顶部复用 yb-title-nav + yb-feature-popup(mode)，顺序 skills/tools/plugins。tools 使用 request/mcps，plugins 为空态且隐藏搜索；切换废弃请求和操作版本，重置搜索及分页。MCP 事件附 kind=mcp，Skill 事件维持兼容。标题菜单通过 actionschange 锁定首页抽屉，afterclose/detached 释放；搜索节点 hidden 保留 Worklet 绑定。
