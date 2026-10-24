<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-11 | Updated: 2026-04-12 -->

# static_wxss

## Purpose
集中管理全局共享样式资源，包括颜色、图标字体和公共样式片段。

## Assets

| File | Purpose |
|------|---------|
| `skycolor.wxss` | 颜色变量 / 色板 |
| `skyfontline.wxss` | 图标字体类定义 |
| `skyother.wxss` | 其他公共样式，含设置页与个性化共用的选项弹窗内容样式 |
| `asset-cards.wxss` | 创作、库及浮起卡片共用 32rpx 圆角、主题底色与居中空状态；瀑布流图片高度由 assetPresentation 计算 |
| `skeleton.wxss` | 项目业务组件共用的主题骨架底色、裁剪和超尺寸斜向 shimmer |
| `try-it.wxss` | 创作 Try it 与手机号登录弹窗共用的静态布局；按钮和各页差异留在页面内 |
| `iconImg.png` | 图标字体对照示意图 |

## Working Notes
- 页面和组件优先 `@import` 这里的基础样式，不要在局部重复定义同类 token
- `skyother.wxss` / `skycolor.wxss` 按原值复用，不能用相近字号、间距、圆角替代；数值和状态层叠以实际消费者为准。原生 `button` 不使用这些工具类，其项目样式只写行内 `style`。
- `skyother.wxss` 还提供首页空功能占位布局、帮助/条款/隐私页面的共用标题栏，以及库/归档聊天的搜索条静态样式；隔离组件必须显式导入，页面由 `app.wxss` 或显式导入获取。搜索条保留原业务类作为 `applyAnimatedStyle` 的选择器。
- 变更 `skyfontline.wxss` 时，需确认现有 `iconfont icon-*` 类名是否仍兼容
- `skyfontline.wxss` 使用内嵌 TTF，保留 `.iconfont` 的字体与字号约定；2026-10-17 字体新增朗读用 `icon-play_circle_line/pause_circle_line/fast_rewind_line/fast_forward_line`（U+E7D7–E7DA），116个原有图标类及码点保持不变（含icon-thinking U+E7D6），字体完整性由 componentIsolation.test.js 校验。
- 文件类型字形使用 `icon-pdf/word/spreadsheet/presentation/text/markdown/code/archive1/video/other`；音频与视频共用 `icon-video`，`icon-archive` 继续保留给归档操作。
- asset-cards.wxss 的 asset-list-* 共用于文件库原行与长按副本，保留插件行的30rpx内边距、90rpx缩略图、20rpx圆角和文字行高；border-box 防止预览100%高度再叠加 padding 导致变形。

## For AI Agents

### Working In This Directory
- 样式 token 变更会影响全局页面，优先小步修改并做视觉回查
- 新增公共样式前先确认是否能复用 `skycolor.wxss` / `skyother.wxss`
- Flyout 可见面板统一使用 `--glass-72` 背景与模糊；普通菜单复用 `setting-option-pop-surface`，模型/级联的透明动画留白保持透明，玻璃仅施加在内部可见卡片。
- `skyother.wxss` 的 chat-unread-dot 提供共用的14rpx尺寸与 --accent-action-bg 背景色，圆角复用 cradius；顶部入口局部增大为22rpx，定位与间距保留在各组件。
- 重点色公共变量统一定义在 `skycolor.wxss`；组件使用 `--accent-*` 语义变量，不直接复制具体色值

- DarkMode 色值集中在 skycolor.wxss 的 --palette-light-* / --palette-dark-*；theme.js 只选择变量名。媒体查询提供系统默认，页面内容根 themeStyle 覆盖固定选择。新增可变 token 需同步两套槽位与 THEME_VARIABLES，由 darkMode.test.js 校验。glass-* 保留浅色透明度，ink-* 用于细边框/交互底；遮罩及黑色投影不机械反色。

- skeleton.wxss 统一使用 bg-l1/bg-l2/glass-56 主题变量和 1.8 秒 transform 扫光；亮带横纵超出裁剪区。asset-cards 及业务组件只保留各自内容几何。
