<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-12 | Updated: 2026-07-12 -->

# pages/filePage

## Purpose
文件/媒体入口页。以 `draggable-sheet` 半屏形式提供拍照、图片、文件和已启用插件选择，并把结果回传给聊天页。

`page-meta` 原生透明背景使用 `#ffffff00`；保持不设置不透明 background-color，WXSS 与半屏路由继续透明。

## Entry Points

| File | Description |
|------|-------------|
| `index.js` | sheet 高度动画、媒体选择、eventChannel 回传 |
| `index.wxml` | 半屏面板、媒体入口与功能列表 |
| `index.json` | 页面配置 |

## Output Contract
通过 `this.eventChannel.emit('addFile', { files: res.tempFiles })` 向来源页回传文件。

插件选择沿用 `selectFeature` EventChannel：原四个插件仍回传 feature/tip；其他 Skill 回传 `{feature:'', tip, skill}`，首页调用聊天视图 selectSkill，只设置标签并保留草稿。`@` 入口仅清除完整的单个 `@`。

## Main Actions
- `openCamera()`
- `openImages()`
- `openFiles()`

首页更多功能弹窗可通过 `action=camera|photo|file` 进入本页并自动执行对应媒体选择；原有手动打开半屏页的路径保持不变。

## Dependencies
- `wx.chooseMedia`
- `wx.chooseMessageFile`
- `wx.editImage`
- `wx.navigateBack`
- `wx.worklet`

## Working Notes
- 通过 request/skills.listInstalledSkills 全量读取已安装 Skill，只展示 enabled 条目；包含试用已启用的关联，停用项与内部隐藏 Skill 不展示。加载、失败重试和空态与成功列表分开，不回退静态数组。
- `onLoad(options)` 优先使用 skillId 作为高亮项，也接受原 feature、imging/thinking/searching/studying 参数并映射到稳定 Skill ID。四种 feature 映射仅用于保留既有模式行为，不保存静态插件元数据。
- Logo 全部使用接口 logoUrl 的原生 image。名称通过 getSkillTitle 随应用语言即时投影；语言切换不重新请求。原四个插件保留原提示词文案键，其余使用服务端 description。
- 请求版本、账号/游客 epoch、关闭和卸载阻止旧响应与旧选择；身份切换关闭旧选择面板，onUnload 释放身份和语言 reaction。
- `onSizeUpdate` 根据 sheet size 调整内容容器宽度，并在极小值时关闭页面；不要使用父容器 `scaleX` 压缩内部元素
- 该页既是文件入口，也是“功能模式选择”的视觉入口

## For AI Agents

### Working In This Directory
- 如果调整 `addFile` 回传结构，要同步首页文件处理逻辑
- 若新增功能入口，保持与 `utils` 列表一致，避免把静态配置分散到 WXML
- 条目是 scroll-view type=list 的直接 list-item。复用 glass、公共文字色和间距类；Logo 尺寸、圆角及文本 flex 限宽保留在本页。
- tests/filePageSkills.test.js 覆盖启用过滤、Logo、原四模式与新增 Skill 回传、国际化、失败重试、身份/卸载竞态及原媒体选择入口。
