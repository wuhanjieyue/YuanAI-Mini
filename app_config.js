// 本文件可公开提交；真实环境配置只保存在被忽略的 app_config.private.js。
const privateConfig = require('./app_config.private')

const apiBaseUrl = String(privateConfig.apiBaseUrl || "").replace(/\/+$/, "")
if (!/^https?:\/\/[^/?#]+(?:\/[^?#]*)?$/.test(apiBaseUrl)) throw new Error("请配置后端 HTTP 地址")
const markdownRenderHost = `${apiBaseUrl}/markdown-render`
const appStaticRoot = String(privateConfig.appStaticRoot || '').replace(/\/$/, '')
if (!/^https:\/\//.test(appStaticRoot)) throw new Error('请配置 COS 静态资源 HTTPS 地址')
module.exports = {
  apiBaseUrl,
  appStaticRoot,
  markdownRenderHost
}
