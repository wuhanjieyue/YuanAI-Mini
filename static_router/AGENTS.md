<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-11 | Updated: 2026-04-12 -->

# static_router

## Purpose
封装 `wx.router.addRouteBuilder` 的自定义转场，服务于首页侧栏、设置页和底部浮层。

## Modules

| File | Purpose |
|------|---------|
| `upPageRouter.js` | 底部上滑页转场 |
| `settingRouter.js` | 设置页半屏 sheet 转场与尺寸计算 |
| `tryItRouter.js` | 创作 Try it 固定 45vh 底部弹窗转场 |

## Dependencies
- `../static_utils/routerUtil.js`
- `getApp().globalData.su_system`
- `getApp().globalData.su_menu`
- `wx.router`

## Working Notes
- 统一复用 `CurveAnimation` / `Curves`
- route builder 名称是页面跳转时的协议字段，改名要同步调用方

## Test Coverage
- 当前无 `static_router/` 级自动化测试文件

## For AI Agents

### Working In This Directory
- route builder 名称属于调用协议，改动前先搜索 `routeType`
- 手势过渡曲线优先复用 `routerUtil.js`，避免新增一套曲线常量

- `settingRouterBuilder` 的 `routeOptions.stacked=true` 用于归档查看页：沿用设置 sheet 的入场尺寸/曲线，以 `handlePreviousPageAnimation` 上移上一页 12px 并缩至 0.96，返回时还原；仅此选项启用原生横向及纵向全屏返回（`popGestureDirection: 'multi'`），两种手势均驱动向下退场动画。默认设置入口行为不变。

- settingRouter 禁用入场快照，避免首帧主题尚未注入时被快照冻结；退场快照保持原配置。

- 创作 createDetail 与聊天工具列表共用 upRouterBuilder；60% 上限由详情页原生 draggable-sheet 控制，不新增同构路由。

- `upRouterBuilder` 由文件、来源、思考、创作详情和资料页共用；注册必须幂等，并禁用入场快照，避免主题或 EventChannel 数据注入后的首帧被旧快照冻结。
