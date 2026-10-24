# 猿本 AI · YuanAI

微信原生 AI 对话小程序，使用 Skyline、Worklet 和 MobX 构建，提供聊天、流式 Markdown、文件与知识库、图片创作及个性化设置界面。

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)

**本仓库仅开源小程序客户端。** 后端、模型服务、数据库、存储凭据与线上服务权限不包含在内。聊天、登录、上传、知识库、创作、记忆、计划任务等完整业务需要配套服务；本项目没有离线模型或无需后端的聊天演示模式。

**如果需要进行后端联调，请联系作者开通请求权限。** 请通过 [GitHub Issues](https://github.com/wuhanjieyue/YuanAI-Mini/issues) 说明用途与所需功能，不要在公开 Issue 中发送密钥、Token、手机号或用户数据。

## 功能

| 模块 | 客户端提供的能力 |
| --- | --- |
| 聊天 | 多模型与思考程度选择、流式回复、处理过程与来源、停止生成、重新生成及聊天分支 |
| 内容展示 | 基于 Towxml 改编的 Markdown 渲染、代码高亮、表格、公式、图表与图片 |
| 聊天管理 | 历史聊天、搜索、重命名、置顶、归档与临时聊天入口 |
| 文件与知识库 | 附件选择、文件库搜索与筛选、预览、知识库资料与分块展示 |
| 图片创作 | 提示词入口、作品列表与详情、保存和分享交互 |
| 计划任务 | 新建、编辑、暂停、恢复及执行结果入口 |
| 个性化 | 自定义指令、记忆管理、深浅外观、重点色、语言、朗读音色与触觉反馈 |
| 帮助 | 使用指南、开源许可与第三方声明、隐私政策、使用条款和错误反馈入口 |

实际可用性取决于服务端授权、模型、账户权限和微信平台能力。界面标注“暂未开放”的功能仍未开放；计划任务通知目前不提供。

## 开始开发

### 1. 准备环境

- Git、Node.js 与 npm。建议使用 Node.js 22 LTS，供依赖安装使用。
- 支持 Skyline、Worklet 的微信开发者工具，建议使用当前稳定版。
- 自己的微信小程序 AppID 和开发者权限。项目基础库配置为 `3.15.3`，Skyline 版本范围以 `app.json` 为准。

### 2. 获取代码与安装依赖

```bash
git clone --branch main https://github.com/wuhanjieyue/YuanAI-Mini.git
cd YuanAI-Mini
npm ci
cp app_config.private.example.js app_config.private.js
cp project.private.config.example.json project.private.config.json
```

编辑本地 `app_config.private.js`：

```js
module.exports = {
  apiBaseUrl: 'http://127.0.0.1:9000',
  markdownRenderHost: 'http://127.0.0.1:9000/markdown-render',
  appStaticRoot: 'https://your-cos-domain.example/your-project-prefix/your-app-id/app_static'
}
```

| 字段 | 用途 |
| --- | --- |
| `apiBaseUrl` | 获授权的后端地址；真机及正式环境应配置合法域名和 HTTPS |
| `markdownRenderHost` | 公式、流程图等内容的渲染服务地址 |
| `appStaticRoot` | 由你管理的 HTTPS 静态资源目录，用于界面图片和品牌素材 |

示例仅提供占位地址，不提供实际业务。云素材文件名请按源码中 `appStaticRoot` 的引用准备；仓库内 `static/` 提供部分 Logo 和图片，并非全部云素材的镜像。缺少资源时，对应图片不能显示。

私有配置、环境文件与开发者工具私有设置已加入忽略规则，勿强制提交。小程序代码会分发到设备，不能在其中保存模型 API Key、微信 AppSecret 或服务端密钥。

### 3. 导入微信开发者工具

1. 导入仓库根目录，填写自己的 AppID。公开配置使用 `touristappid` 占位，游客模式不能替代真实 AppID 的全部能力。
2. 开启 npm 模块支持，执行“工具 → 构建 npm”。项目已配置手动 npm 构建关系。
3. 确认 Skyline 和 Worklet 编译可用；项目使用 `glass-easel` 组件框架。
4. 配置请求、上传与下载的合法域名。模拟器临时关闭域名校验不等于真机或正式版本可用。
5. 修改后手动编译。Skyline 热重载存在限制，本地 `project.private.config.json` 的 `compileHotReLoad` 请保持 `false`。

不启动后端也可以阅读源码并进行部分界面调试。完整业务需要获授权的后端和可用静态资源；后端搭建与接口协议不属于本次开源范围。

## 使用

- **开始聊天**：输入问题，按需选择模型、思考程度或附件后发送；生成时可停止，完成后可复制、重新生成、查看来源或创建分支。
- **管理聊天**：从左侧菜单打开历史聊天，通过更多菜单重命名、置顶、归档或删除。
- **使用资料**：在文件库或知识库添加和查找资料，处理就绪后用于聊天；预览、保存取决于文件格式和权限。
- **安排任务**：进入计划任务，填写说明、周期和模型，保存后查看执行状态与结果。
- **调整偏好**：进入设置修改外观、重点色、语言、个性化和记忆；需要保存的页面请等待保存成功。
- **完整指南**：打开“设置 → 帮助中心”，页面末尾提供开源许可、第三方软件来源及许可证全文。

AI 输出可能有误，重要信息和引用请自行核实。上传资料前确认你有权处理这些内容。

## 目录

```text
├── app.js / app.json / app.wxss  应用入口、路由与全局样式
├── app_config.js                读取本地私有配置
├── pages/                       首页、设置、文件及帮助等页面
├── components/                  基础组件与 _self 业务组件
├── mdPackage/                   Markdown 渲染、流式服务与分包页面
├── request/                     HTTP、SSE 与业务请求封装
├── store/                       MobX 状态与本地偏好
├── static_router/               Skyline 自定义转场
├── static_utils/                主题、国际化与工具函数
└── static_wxss/ / static/        样式与静态素材
```

客户端通过 HTTP/SSE 等接口通信，不依赖后端源码目录。

## 常见问题

| 问题 | 处理方式 |
| --- | --- |
| 找不到 `app_config.private` | 从示例复制本地配置，核对文件名 |
| 找不到 MobX 模块 | 执行 `npm ci`，再在开发者工具中“构建 npm” |
| 请求失败或未授权 | 核对服务地址、合法域名和账户权限；后端联调请联系作者 |
| 图片、公式或流程图不显示 | 核对静态资源与渲染服务地址及其权限 |
| 模拟器正常、真机失败 | 检查 HTTPS、证书、合法域名、基础库及微信权限；真机不能访问电脑的 `127.0.0.1` |
| 页面修改未生效 | 手动重新编译，核对 Skyline 与 Worklet 设置 |

## 部署前配置

使用条款与隐私政策是已脱敏的部署模板，保留页面结构和示例条款。正式提供服务前，请按实际数据处理方式审核内容，填写运营方、联系邮箱、地点和日期；示例邮箱不接收用户请求。开源许可证不替代面向终端用户的服务条款。

## 贡献与反馈

欢迎通过 [Issues](https://github.com/wuhanjieyue/YuanAI-Mini/issues) 提交问题或建议，也欢迎提交聚焦单一问题的 Pull Request。请提供复现步骤、预期与实际结果、基础库和设备版本，以及验证结果；截图与日志请先移除个人信息。

贡献应保持微信原生 Skyline/Worklet 结构，复用已有请求、路由、主题及样式，不引入后端私有文件。提交贡献表示你有权提供这些内容，并按 Apache-2.0 许可提交；第三方内容请保留原许可和来源。

## 许可与致谢

Copyright 2026 YuanAI contributors.

YuanAI 自有代码采用 [Apache License 2.0](LICENSE)，按“原样”提供，不附带担保。第三方部分继续适用各自许可证，详见 [第三方来源与修改说明](THIRD_PARTY_NOTICES.md)、[许可证全文](THIRD_PARTY_LICENSES.md)和 [NOTICE](NOTICE)。

感谢 Towxml、MobX 小程序生态、markdown-it、highlight.js、ECharts 及相关依赖。项目独立开发，第三方名称用于标识来源，不表示其作者或微信平台对本项目的认可。

Apache-2.0 不授予项目名称、Logo 或第三方商标的使用权。二次发布请使用自己的 AppID、服务配置及可合法使用的品牌素材，并按适用条款保留声明。
