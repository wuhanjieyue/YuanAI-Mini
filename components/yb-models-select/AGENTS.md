<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-11 | Updated: 2026-08-04 -->

# components/yb-models-select

## Purpose
工作模式的模型与思考程度选择弹窗，选项由服务端模型目录提供。

## Entry Points

| File | Description |
|------|-------------|
| `index.js` | 外层锚点弹窗、其他模型展开/收起、模型选择事件 |
| `index.wxml` | 思考程度层、顶部其他模型层与模型列表 |
| `index.wxss` | 隔离后的弹层布局、动画目标样式和图标码点 |
| `index.json` | 小程序组件声明 |

## Properties
- `models: Array`
- `modelId: String`
- `effortId: String`

## Events
- `changeModel`
- `locked`
- `close`

## State
- `effortOptions`
- `modelOptions`
- `otherOpen`
- `modelsStackHeight`
- `otherHeight`
- `otherModelHeight`
- `otherModelOpacity`
- `otherPanelScale`
- `modelsBaseInset`

## Working Notes
- 组件使用 `styleIsolation: isolated`；布局、阴影、语义色和固定图标映射在目录内定义，字体数据由 `static_wxss/skyfontline.wxss` 统一注册。
- `rpx` 换算复用 `components/_shared/utils.js`；视口读取和 `160ms` 交互时长留在组件内，模型与档位权限由宿主写入各 option 的 `locked` 字段。
- “其他模型”是位于思考程度层顶部的独立浮层，折叠时仅显示入口；展开高度超过思考程度层时，外层以底部为锚点向上增高
- 折叠入口展示当前选中模型名称，模型列表项继续复用 `changeModel`
- 模型列表展开高度最多为 3 个 item；超过 3 个时仅在模型列表内部纵向滚动
- 思考程度层固定在弹层底部，模型层展开时覆盖它，收起后恢复原始高度和位置
- 外层由 `yb-flyout.open(anchorRect)` 定位；锚点矩形由 `yb-chat-view` 的 `.model-summary` 实测提供
- `yb-flyout` 是 `560rpx` 的透明安全容器，内部 `.models-stack` 固定为 `400rpx`；高度在最大卡片高度上增加 `160rpx`，底部仍留 `36rpx`，顶部留 `124rpx` 容纳 spring 中途超出 `1.05` 的放大峰值
- 整体开合动画通过 `yb-flyout` 的 `popup-transform-origin="100% 100%"` 固定在右下角；不要用 `popup-class` 接管 transform origin
- 根据触发项中心判断左右后，透明容器贴对应 viewport 边缘；内部卡片以 `36rpx` 保持可见边距
- 主卡片阴影复用全局 `bshadow`，不要恢复超出 flyout 留白的重阴影
- 顶部模型层折叠时透明且不单独模糊；仅在展开态使用 `is-open + bshadow` 恢复独立玻璃卡片
- `changeModel` 返回 `{ modelId, effortId }`；无权限项仅触发 `locked`
- 二级模型项选择后仅通过 `closeOther` 收起模型列表，保留思考程度层；选择思考程度仍关闭整个弹层。
- 透明安全留白由 `models-flyout-content` 的 catch:tap 转给现有 `handleMaskTap`：先收起展开的模型层，再关闭整个弹层。两个可见卡片通过 catch:tap 截断冒泡，空白卡片区域不关闭；不缩减动画安全尺寸，也不改变通用 flyout 命中规则。
- `show` 返回 flyout.open 的 Promise<Boolean>；失败或正在关闭时宿主恢复触发项，不留下隐藏的模型摘要。

## Risks / Hotspots
- `yb-flyout` 负责遮罩、定位和整体开合；`.models-stack` 仅负责高度动画，`.models-base` 固定在弹层底部并负责底层卡片收窄，`.other-model-panel` 与 `.model-options` 负责上层模型列表高度、透明度和弹性缩放动画

## For AI Agents

### Working In This Directory
- 模型名称、档位名称和锁态只消费宿主传入的序列化 options，不在组件内维护套餐策略
- 修改展开逻辑时，同时检查 `openOther` / `closeOther` 与关闭主弹层的交互

- themeStyle 从宿主透传至 yb-flyout，包含实际外观和重点色；组件不读取业务主题状态。
