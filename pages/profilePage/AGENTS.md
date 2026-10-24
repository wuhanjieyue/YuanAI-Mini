<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-01 | Updated: 2026-08-01 -->

# profilePage

## Purpose
用户资料半屏编辑页，绑定 MobX 用户状态，支持头像选择/上传、名字和昵称修改，并通过事件通道通知打开它的页面。

## Key Files

| File | Description |
|------|-------------|
| `index.js` | 表单构造、头像选择、资料保存、云文件清理和返回事件 |
| `index.json` | 页面组件注册配置 |
| `index.wxml` | 资料编辑表单与半屏布局 |
| `index.wxss` | 页面样式与动画布局 |

## For AI Agents

### Working In This Directory
- 表单默认值要与 `store/index.js` 的 `DEFAULT_USER` 保持一致。
- 保存流程先上传临时头像，再调用 `updateProfile`，成功后更新 store、通知来源页并删除旧头像；不要打乱顺序。
- 页面关闭依赖 `wx.worklet` shared 值和 `eventChannel`，不要按普通 Web 路由重写。
- 父级 CodeGraph 指引适用；修改保存流程前查询 `request/request.js` 与来源页调用关系。

### Testing Requirements
- 表单文案或局部样式改动做 diff 检查即可。
- 修改头像、保存或返回事件时至少手测空表单、成功保存和上传失败路径。

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->

- 头像选择的本地路径通过 request.uploadUserAvatar 取得后端 COS 上传 policy；保存 avatarFileID Object Key，展示仅采用服务器返回的 avatarUrl，不以 Key 覆盖 URL。
- 表单直接使用真实名字，不按“登录”“欢迎您”或星号猜测旧占位值。保存成功后以完整服务端用户摘要替换资料，不合并旧用户字段；空头像仅在模板显示应用 Logo。
