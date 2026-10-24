<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-11 | Updated: 2026-04-11 -->

# components/_self/yb-subsetting-personalization

## Purpose
设置页个性化/记忆面板。通过 `mode` 切换编辑语调、特征、自定义指令，或编辑记忆开关、昵称、职业、详情。

## Entry Points

| File | Description |
|------|-------------|
| `index.js` | 语调/特征选项与输入、开关事件派发 |
| `index.wxml` | 用 `yb-flyout` 渲染五个 selector，并按 `mode` 渲染个性化或记忆内容 |
| `index.json` | 小程序组件声明与 `yb-flyout` 注册 |

## Properties
- `aiName`
- `mode`
- `draft`
- `traits`

## Events
- `optionchange`（`{ field, value }`）
- `input`
- `switch`

## Dependencies
- `../../yb-flyout`
- 阿里 Iconfont Project 5082489（通用字体基类显式导入 `static_wxss/skyfontline.wxss`，本目录仅声明当前使用的 3 个字形）

## For AI Agents

### Working In This Directory
- selector 的测量、触发器动画和开合交给 `yb-flyout`
- 组件只维护草稿编辑 UI，不直接写 store
- 输入字段名要与设置页中的 draft 结构保持一致
- 组件使用 `styleIsolation: isolated`；rpx 换算复用 `static_utils/otherUtils.js`，Flex、设置区块、卡片、弹窗内容和字体基类显式导入 `static_wxss/`，个性化业务布局和图标码点保留在本目录

- 长期记忆入口只发送 `longtermmemory` 事件，由设置页加载用户全局管理列表；不保留旧 summary 事件或请求逻辑。
