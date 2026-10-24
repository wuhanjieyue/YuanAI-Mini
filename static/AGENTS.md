<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-11 | Updated: 2026-04-12 -->

# static

## Purpose
存放小程序静态素材，如文档图标、加载图与品牌 Logo。

## Assets

| Path | Purpose |
|------|---------|
| `images/create/*.jpg` | 六张随项目交付的 AI 生成模版样例图，配置入口 `static_utils/createCatalog.js` |
| `images/doc.png` | 文档类素材图标 |
| `images/loading.svg` / `images/loading-dark.svg` | 浅色与深色加载态图片 |
| `logs/glog.png` | 灰色 Logo |
| `logs/blog.png` | 黑色 Logo |
| `logs/wlog.png` | 白色 Logo |

## Working Notes
- 替换 Logo 时保留原命名，避免页面引用失效
- 大图资源需关注小程序包体积
- 应用运行时云素材地址集中定义在 `app_config.js`；这里的同名文件保留为开发与开源替换源。

## For AI Agents

### Working In This Directory
- 替换静态资源前先搜索全局引用，避免只改文件不改路径
- 优先复用现有素材命名与目录分层，不要为近似用途重复建目录

- images/loading-dark.svg 保留 loading.svg 的几何和透明度，仅将深蓝改为浅蓝，供深色界面加载态使用。
