<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-12 | Updated: 2026-04-12 -->

# components/_self/yb-fun-list

## Purpose
聊天输入区上方的功能标签条。展示当前启用的高级模式，如深度思考、网页搜索、图片生成。

## Entry Points

| File | Description |
|------|-------------|
| `index.js` | 根据 `feature` 控制标签显隐，并回传布局高度 |
| `index.wxml` | 功能标签的横向展示 |
| `index.json` | 小程序组件声明 |

## Properties
- `skill: Object | null`：当前显式 Skill 的 id/title/titleEn/logoUrl；标题通过 getSkillTitle 跟随 language 实时投影；使用原生图片与单行省略标题，关闭沿用 closeFun。
- `feature: String` (`thinking` / `searching` / `imging`)

## Events
- `closeFun`
- `heightchange`: 回传 `{ height, duration }`，宿主可同步底部布局动画

## Parent Coupling
组件自行持有功能栏高度 shared 值，不读取宿主实例；宿主仅按需消费 `heightchange`。

## Behaviors
- `showFun()`：展开功能标签区
- `closeFun()`：收起并通知父页面关闭模式
- `hideFun()`：静默收起
- `reshowFun()`：若仍有模式开启则恢复显示
- Skill 标签复用 feature-chip 的重点色背景和文字变量、原有高度动画；图片尺寸与标签溢出布局留在本组件。
- 原四种 feature 标签也使用 feature-logo 原生 image，资源路径通过 appStaticRoot 指向与插件页相同的 COS Logo；仅为固定模式的图片资源映射，不新增 Skill 列表或改变 feature/发送契约。与动态 Skill 共用36rpx尺寸、8rpx圆角及 --accent-soft-* 颜色。

## For AI Agents

### Working In This Directory
- 若新增功能模式，要同步：
  1. `feature` observer
  2. `data` 中的名称
  3. `index.wxml` 的展示块
