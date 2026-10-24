<!-- Parent: ../AGENTS.md -->

# components/_shared

## Purpose

根目录组件包内部的公共依赖，只承载根目录组件独立整理所需且不含业务状态的工具、WXSS 和静态资源。

## Contents

- `utils.js`：根目录组件使用的 rpx 换算
- `iconfont.wxss`：隔离组件共用的 `.iconfont` 基类，不包含字体数据或码点
- `flex.wxss`：导入项目 `static_wxss/skyother.wxss`，兼容已有行列 flex 引用，避免重复定义
- `assets/`：根目录组件共用 loading

## Boundaries

- 不导入 `store/`、`request/`、`static_router/` 或业务领域工具。
- `_self/` 项目组件直接复用项目级工具、WXSS 和静态资源，不依赖本目录。
- Worklet 函数、`applyAnimatedStyle` 选择器和单组件规则继续留在所属组件。
- `@font-face` 只由 `static_wxss/skyfontline.wxss` 注册；图标码点继续留在使用它的组件。
- 单独复制组件时必须同时复制其引用的 `_shared` 文件，以及导入的 `static_wxss/skyother.wxss` / `skycolor.wxss`。

- assets/loading-dark.svg 为现有加载图的深色版本，由根组件 theme 属性选用；不依赖应用状态。
