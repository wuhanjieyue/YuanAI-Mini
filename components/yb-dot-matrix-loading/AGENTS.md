<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-01 | Updated: 2026-08-01 -->

# dotMatrixLoading

## Purpose
基于 Canvas 2D 的点阵 loading 组件，用于生成态或初始化态的动态视觉反馈。

## Key Files

| File | Description |
|------|-------------|
| `index.js` | active 属性、Canvas 初始化、帧调度和停止清理 |
| `index.wxml` | Canvas 容器 |
| `index.wxss` | 组件尺寸与布局 |
| `index.json` | 组件注册配置 |

## For AI Agents

### Working In This Directory
- 动画生命周期由 `active`、`ready` 和 `detached` 共同控制；修改时保留停止时的 RAF/timer 清理。
- 这是 Skyline/小程序 Canvas 组件，不要改成 Web DOM 或 CSS keyframes 实现。
- 父级 CodeGraph 指引适用；组件调用关系优先查询 CodeGraph。

### Testing Requirements
- 纯样式或文案改动做 diff 检查即可。
- 修改 Canvas 初始化、帧调度或 active 切换时做一次真机/开发者工具启停验证。

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->

- `contained=true` 将 Canvas 容器限制在父级高度内；默认仍为整页高度，图片卡片卸载时沿用原有动画清理。
- Canvas 在 ready 后初始化；节点或尺寸未就绪时等待重试，stop/detached 必须清理等待定时器。宿主显式填满父级，避免隔离样式下 contained 高度失效。

- color 由宿主通过 getAccentTheme 的 loadingColor 显式传入并随用户重点色、深浅主题更新；未传入时沿用 theme（light/dark）灰色回退。Canvas 不订阅 store，逐帧读取 color 并保留点阵 alpha 层次。
- 点阵焦点沿原轨迹移动，统一时间因子为 `0.00195`；突出点通过更高 alpha 增强对比，不拆分额外动画状态。
- 缩放入场的调用方传入 canvasWidthRpx/canvasHeightRpx（扣除内边距后的最终画布尺寸），初始化不使用缩放中的测量尺寸；未传入时保留节点测量。

- fitCanvas=true 时使用调用方给出的等比内接宽高并清零容器内边距；普通contained及整页调用保持原布局和动画清理。
