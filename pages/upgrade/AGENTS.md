<!-- Parent: ../AGENTS.md -->

# pages/upgrade

升级订阅展示页。由设置页使用 `settingRouterBuilder` 的 `stacked` 选项打开，保留现有右上角关闭按钮。

- 展示 YuanAI Logo、Pro 标题、六项权益和底部操作，不展示副标题或 Plus 套餐。
- 文案复用 `static_utils/i18n/locales/` 的 `upgrade` 字段；主题和重点色沿用 `themeBinding`。
- 正文使用关联 `pop-gesture` 的原生列表滚动，顶部关闭栏与底部操作固定。
- 关闭及免费体验均返回设置页；“获取 Pro”通过 request/billing 发起36元月订阅，防重复点击并保留订单键；只按服务端核验的权益刷新会员，支付未配置时保留未开放提示。
- 已有PRO在显示此页时返回设置页，不再触发开通支付；本页仅用于免费会员开通，续费管理未在本页提供。
- 非按钮布局优先复用公共类，特有尺寸留在本页 WXSS；原生按钮尺寸、颜色与间距全部写行内 `style`，外层 `view` 负责按压透明度。图标复用 `icon-check`。
