<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-11 | Updated: 2026-07-12 -->

# pages/setting

## Purpose
设置主页面。以半屏 sheet 形式承载自定义 YuanAI、账户、应用设置、建议、个性化、记忆、数据控制、通知与关于信息。

## Entry Points

| File | Description |
|------|-------------|
| `index.js` | 设置页核心逻辑：配置选项、弹层、拖拽关闭、内嵌二级面板 |
| `index.wxml` | 头部悬浮栏、主面板、二级面板与 4 个应用设置 `yb-flyout` |
| `index.json` | 注册 `yb-flyout` 与各个 `subsetting-*` 组件 |
| `index.wxss` | 设置页视觉样式 |

## State Model

### Store Bindings
- `user`
- `appInfo`
- `applicationSettings`
- `chatAbout`
- `suggest`
- `personalization`
- `notification`
- `dataControl`

### Local Derived State
- `applicationSets`
- `customSets`
- `suggestSets`
- `aboutSets`
- `activePanel`
- `panelTitle`
- `personalizationDraft`
- `longTermMemoryLoading`
- `longTermMemorySections`

## Subsystems

### Popup Selectors
应用区四项直接使用 `components/yb-flyout`，个性化组件内部再使用五个实例：
- `language`
- `appearance`
- `pointColor`
- `chatVoice`
- `basicTone`
- `gentle` / `warm` / `headings` / `emoji`

### Secondary Panels
- `personalization`
- `memory`
- `notification`
- `data_control`
- `storage`：数据控制下方的同级入口，真实容量与文档/图片分类，复用通用二级面板与滚动手势；分类通过 EventChannel 返回首页库对应 tab，清空搜索。
- `usage_limits`：通过 request/billing 读取免费一次性／PRO本周期额度、套餐与额外额度、冻结及待结算数量；免费不展示下次发放日期；加载和完成态共用布局，文字隐藏后覆盖等尺寸骨架；底部“购买额度”复用现有购买半屏页。
- `about`

### Route / Gesture
- 页面对外使用 `settingRouter`
- 关于区四个入口均复用设置叠层路由打开独立页面；使用条款和隐私政策由 Markdown 页面承载，长期记忆的“关于记忆”使用 30vh 的 `upRouterBuilder` 半屏页
- 主 sheet 与二级 panel 都带手势关闭逻辑

## Dependencies
- `../../store/index`
- `../../static_utils/routerUtil.js`
- `../../static_utils/voiceOptions`
- `../../static_utils/settingApi`
- `../../static_router/settingRouter`
- `components/yb-flyout`
- `components/yb-confirm-dialog`
- `components/_self/yb-subsetting-personalization`
- `components/_self/yb-subsetting-notification`
- `components/_self/yb-subsetting-data-control`
- `components/yb-dot-matrix-loading`

## Risks / Hotspots
- `index.js` 同时承载配置常量、状态归一化、拖拽动画和业务保存逻辑
- selector 内容与保存逻辑在页面；通知和数据控制子组件只通过 properties/events 传递状态与意图，定位和动画统一由 `yb-flyout` 管理
- 个性化草稿与 store 正式值并存，修改字段时要同步两端

## For AI Agents

### Working In This Directory
- 修改设置项前，先检查对应值是否在 `store/index.js` 有默认值和 setter
- 新增 selector 类型设置时，要同步：
  1. 配置常量
  2. `applicationSets` 的 `selectedValue` / `options`
  3. 对应 option change 业务处理器
  4. `yb-flyout` slots 中的展示内容
- 修改手势关闭阈值时，要同时看主 sheet 和 secondary panel 两套逻辑
- 登录、退出或远端登录态变化时，必须同时重置 `store.chatHistory` 并通知首页清理当前聊天轮次
- 账户与远端设置由 `static_utils/appDataInit.js` 在应用启动时同步；设置页仅在下拉刷新、登录和退出后强制重取
- 记忆摘要面板从 `/long-term-memory` 分页读取用户记忆和有效长期事项；会话/turn 只作为来源，不限制管理列表到当前会话。刷新调用 `/long-term-memory/refresh`，每 10 秒查询后台状态；前端保持原名称、生成中/刚刚更新提示、摘要正文和空状态，不展示整理失败/积压、分组或来源标签；publishedAt 仅保留在接口数据中。关闭、隐藏或卸载时阻断迟到查询。删除与关闭记忆由服务端同事务完成。
- 触觉反馈以 `applicationSettings.hapticFeedback` 为唯一状态源，设置开关切换后应立即影响所有已绑定页面和组件
- 登录态与未登录态头像在图片加载完成前复用 `/static_wxss/skeleton.wxss` 的扫光；头像 URL 变化时重置状态，加载失败时停止动画。

- 记忆摘要的加载分支放在原生滚动手势处理器外，加载结束后同时挂载处理器与直接子节点 `scroll-view`，避免代理节点在加载组件和滚动列表之间切换。

- 归档列表的 `viewconversation` 打开 `/mdPackage/pages/archivedChat/index`，使用设置路由的 stacked 选项。查看页取消归档通过 EventChannel 回传，刷新原归档组件并通知首页刷新历史列表。
- “升级”入口仅免费会员显示，PRO不挂载该行及分隔线；导航也校验当前store会员。打开 `/pages/upgrade/index` 复用设置路由的 stacked 选项，让设置页上移缩小。每次onShow单独获取账户会员状态，按请求序号、账户和卸载状态拒绝迟到响应，不覆盖其他设置。
- “使用情况和限制”在打开和恢复时读取真实统计，请求序号、账号和卸载状态阻止迟到结果；购买额度经已注册的upRouterBuilder打开 `/pages/usageLimits/purchase/index`，加载中及重复导航不响应，返回后重新获取余额；入口与完成态等尺寸骨架共用布局。
- “使用条款”入口打开 `/mdPackage/pages/terms/index`，不再进入设置页内嵌 `about` 二级面板。
- “帮助中心”“隐私政策”使用设置路由的 stacked 选项；“报告错误”通过 errorReporting.openErrorReport 使用 settingRouterBuilder 的 stacked 选项。

- 设置 sheet 在 themeStyle 就绪前使用 visibility:hidden，保留节点供动画绑定；主题与可见性在同次 setData 生效，避免固定深色的浅色首帧。

- 存储统计每次打开/恢复时读取；请求序号阻止关闭、卸载或重开后的迟到响应。分类占用包含生成和临时文件，临时内容不列入库。

- 账号头像展示及 loading 只使用 avatarUrl；avatarFileID 为 COS Object Key，不是 src。

- 数据控制导出使用原有确认弹窗的居中竖排双按钮：中性标题、开始导出/取消；队列和运行中右侧旋转，重复点击顶部胶囊提醒，完成后点击下载图标复用原生分享/桌面保存。页面打开与恢复读取服务端状态，进行中每3秒轮询；隐藏和卸载清理计时，迟到响应校验账号和请求版本。注销状态在 store 用户字段保留，服务端确认完成后清理账号缓存与聊天运行态并退出；服务端未完成不得显示删除成功。
