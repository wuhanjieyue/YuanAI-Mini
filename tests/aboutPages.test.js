const assert = require('assert')
const fs = require('fs')
const vm = require('vm')

const app = JSON.parse(fs.readFileSync('app.json', 'utf8'))
const setting = fs.readFileSync('pages/setting/index.js', 'utf8')
const settingTemplate = fs.readFileSync('pages/setting/index.wxml', 'utf8')
const reportPage = fs.readFileSync('pages/reportError/index.js', 'utf8')
const reportTemplate = fs.readFileSync('pages/reportError/index.wxml', 'utf8')
const helpTemplate = fs.readFileSync('pages/helpCenter/index.wxml', 'utf8')
const privacyPage = fs.readFileSync('mdPackage/pages/privacy/index.js', 'utf8')
const privacyTemplate = fs.readFileSync('mdPackage/pages/privacy/index.wxml', 'utf8')
const privacyContent = fs.readFileSync('mdPackage/pages/privacy/content.js', 'utf8')

assert(app.pages.includes('pages/reportError/index'))
assert(app.pages.includes('pages/helpCenter/index'))
assert(app.subPackages.find(item => item.root === 'mdPackage').pages.includes('pages/privacy/index'))

for (const [key, url] of Object.entries({
  report_error: '/pages/reportError/index',
  help_center: '/pages/helpCenter/index',
  terms_of_use: '/mdPackage/pages/terms/index',
  privacy_policy: '/mdPackage/pages/privacy/index'
})) {
  assert.match(setting, new RegExp(`${key}: '${url.replaceAll('/', '\\/')}'`))
}
assert.match(setting, /openAboutPage\(key\)[\s\S]*routeType: SETTING_ROUTE_TYPE,[\s\S]*routeOptions: \{ stacked: true \}/)
assert.doesNotMatch(setting, /https:\/\/(?:help\.)?openai\.com/)
assert.doesNotMatch(settingTemplate, /activePanel === 'about'|about-info-url|aboutReportContent/)

assert.match(reportPage, /const AI_MODEL_NAME = 'YuanAI'/)
assert.doesNotMatch(reportPage, /aboutPageRouterBuilder|ChatGPT/)
for (const field of ['handleInput', 'toggleShake', 'handleSend']) assert(reportTemplate.includes(field))
assert.match(reportTemplate, /associative-container="\{\{stacked \? 'pop-gesture' : 'draggable-sheet'\}\}"/)

assert.doesNotMatch(helpTemplate, /i18n\.about\.helpPending/)
const helpConfig = JSON.parse(fs.readFileSync('pages/helpCenter/index.json', 'utf8'))
const helpPage = fs.readFileSync('pages/helpCenter/index.js', 'utf8')
const { HELP_MARKDOWN } = require('../pages/helpCenter/content')
assert.equal(helpConfig.usingComponents['assis-done'], '/mdPackage/components/assisDone/index')
assert.equal(helpConfig.componentPlaceholder['assis-done'], 'view')
assert.match(helpPage, /helpArticle: \{ role: 'assistant', content: HELP_MARKDOWN \}/)
assert.match(helpTemplate, /<assis-done item="\{\{helpArticle\}\}" theme="\{\{effectiveTheme\}\}" show-actions="\{\{false\}\}"/)
for (const topic of ['聊天', '计划任务', '个性化', '记忆', '重点色', '知识库', '报告错误']) {
  assert(HELP_MARKDOWN.includes(topic), `Missing help topic: ${topic}`)
}
const { OPEN_SOURCE_MARKDOWN } = require('../pages/helpCenter/openSource')
assert(HELP_MARKDOWN.endsWith(OPEN_SOURCE_MARKDOWN))
assert(HELP_MARKDOWN.indexOf('## 11. 开源许可') > HELP_MARKDOWN.indexOf('## 10. 常见问题'))
for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_LICENSES.md']) {
  const text = fs.readFileSync(file, 'utf8').trim()
  assert(OPEN_SOURCE_MARKDOWN.includes(text.replace(/^# /, '### ')), `Missing bundled license document: ${file}`)
}
assert(OPEN_SOURCE_MARKDOWN.includes('如果需要进行后端联调，请联系作者开通请求权限'))
assert.equal(JSON.parse(fs.readFileSync('package.json', 'utf8')).license, 'Apache-2.0')
assert.equal(JSON.parse(fs.readFileSync('mdPackage/components/towxmlstream/package.json', 'utf8')).license, 'SEE LICENSE IN NOTICE.md')
const renderMarkdown = require('../mdPackage/components/towxmlstream/parse/markdown/index')
const helpHtml = renderMarkdown(HELP_MARKDOWN)
assert(helpHtml.includes('<h1>猿本 AI 使用指南</h1>'))
assert(helpHtml.includes('<h2>3. 计划任务</h2>'))
assert(helpHtml.includes('<ol>') && helpHtml.includes('<ul>'))
assert.doesNotMatch(helpTemplate, /https?:\/\//)

assert.match(privacyPage, /bindPageTheme\(this\)[\s\S]*wx\.nextTick\(\(\) => \{[\s\S]*parseMarkdown/)
assert.match(privacyTemplate, /<towxml[^>]*openTyper="\{\{false\}\}"[^>]*theme="\{\{effectiveTheme\}\}"/)
assert.match(privacyContent, /猿本AI（YuanAI）隐私政策/)
assert.match(privacyContent, /生效日期：2026年9月16日/)

const webViewConfig = JSON.parse(fs.readFileSync('pages/aboutWebView/index.json', 'utf8'))
const webViewPage = fs.readFileSync('pages/aboutWebView/index.js', 'utf8')
assert.equal(app.renderer, 'skyline')
assert.equal(webViewConfig.renderer, 'webview')
assert.equal(webViewConfig.navigationStyle, 'default')
assert.doesNotMatch(webViewPage, /aboutPageRouterBuilder|closePage/)
let webViewDefinition
let navigationTitle
const themeCalls = []
vm.runInNewContext(webViewPage, {
  require: () => ({
    bindPageTheme: page => themeCalls.push(['bind', page]),
    unbindPageTheme: page => themeCalls.push(['unbind', page]),
    syncThemeNavigation: page => themeCalls.push(['sync', page])
  }),
  Page: definition => { webViewDefinition = definition },
  wx: { setNavigationBarTitle: options => { navigationTitle = options.title } }
})
const webViewContext = { data: {}, setData(patch) { Object.assign(this.data, patch) } }
const webUrl = 'https://example.com/help?topic=中文&source=about'
webViewDefinition.onLoad.call(webViewContext, { title: encodeURIComponent('帮助中心'), url: encodeURIComponent(webUrl) })
assert.equal(navigationTitle, '帮助中心')
assert.equal(webViewContext.data.url, webUrl)
webViewDefinition.onShow.call(webViewContext)
webViewDefinition.onUnload.call(webViewContext)
assert.deepEqual(themeCalls, [['bind', webViewContext], ['sync', webViewContext], ['unbind', webViewContext]])

console.log('aboutPages: stacked routes, forms, privacy Markdown and native WebView navigation passed')
