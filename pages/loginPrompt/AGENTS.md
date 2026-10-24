<!-- Parent: ../AGENTS.md -->

# pages/loginPrompt

## Purpose

通用手机号授权登录提示页。当前由分享卡片导入遇到服务端 `SHARE_LOGIN_REQUIRED` 时打开；其他需要登录的功能也可复用。

## Interaction

- 复用 `static_router/tryItRouter.js` 的 45vh 底部浮层、遮罩关闭和下拉退场；两页相同的静态布局显式导入 `static_wxss/try-it.wxss`，本页保留按钮和登录专属样式。头图来自云存储 `app_static/login-prompt-hero.webp`，中央 Logo 使用本地 `/static/logs/glog.png`。
- 按钮用行内透明样式的 `getPhoneNumber` 覆盖可见操作容器，不给原生 button 添加 WXSS 规则。授权成功后按设置页规则重置账号相关聊天状态，刷新远端账号数据，通过 `loginSuccess` EventChannel 通知打开方，然后返回。
- 页面不保存调用方业务状态。用户取消授权或关闭弹窗时，由打开方决定后续行为。
