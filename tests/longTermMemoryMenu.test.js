const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const settingTemplate = fs.readFileSync(path.join(root, 'pages/setting/index.wxml'), 'utf8')
const settingSource = fs.readFileSync(path.join(root, 'pages/setting/index.js'), 'utf8')
const settingStyles = fs.readFileSync(path.join(root, 'pages/setting/index.wxss'), 'utf8')
const chatRequestSource = fs.readFileSync(path.join(root, 'request/chatStream.js'), 'utf8')
const aboutTemplate = fs.readFileSync(path.join(root, 'pages/memoryAbout/index.wxml'), 'utf8')
const aboutStyles = fs.readFileSync(path.join(root, 'pages/memoryAbout/index.wxss'), 'utf8')
const app = require('../app.json')

assert.match(settingTemplate, /id="longTermMemoryMore"/)
const memoryFlyout = settingTemplate.match(/<yb-flyout\s+id="longTermMemoryMore"[\s\S]*?<\/yb-flyout>/)?.[0] || ''
assert.match(settingTemplate, /class="header-action-btn\b[^\"]*dr\b[^\"]*ac\b[^\"]*jc\b[^\"]*glass-view\b[^\"]*" bind:tap="handleHeaderAction"/)
assert.match(memoryFlyout, /slot="trigger"/)
assert.match(memoryFlyout, /animate-trigger="\{\{true\}\}"/)
assert.match(memoryFlyout, /open-on-trigger-tap="\{\{false\}\}"/)
assert.match(settingSource, /setHeaderAction\('more'\)/)
assert.match(settingSource, /handleHeaderAction\(\)[\s\S]*selectComponent\('#longTermMemoryMore'\)\?\.open\(\)/)
for (const action of ['about', 'refresh', 'delete']) {
  assert.match(settingTemplate, new RegExp(`data-action="${action}"`))
}
assert.match(settingSource, /longTermMemoryLoading: true,[\s\S]*longTermMemorySections: \[\]/)
assert.match(settingSource, /await requestLongTermMemoryRefresh\(\)/)
assert.match(chatRequestSource, /callChatHTTP\('\/long-term-memory\/refresh', \{\}\)/)
assert.match(memoryFlyout, /long-term-memory-menu-disabled/)
assert.match(memoryFlyout, /aria-disabled="\{\{!longTermMemoryCanRefresh \|\| longTermMemoryRefreshing \|\| longTermMemoryDeleting\}\}"/)
assert.match(settingTemplate, /<view wx:if="\{\{!longTermMemorySections\.length\}\}" class="long-term-memory-empty\b[^\"]*dc\b[^\"]*ac\b[^\"]*jc\b[^\"]*text-l1\b[^\"]*">[\s\S]*<image class="long-term-memory-empty-logo\b[^\"]*" src="\/static\/logs\/glog\.png" mode="widthFix"><\/image>[\s\S]*i18n\.memory\.empty/)
assert.match(settingStyles, /\.long-term-memory-empty-logo\s*\{\s*width:\s*96rpx;/)
assert.doesNotMatch(settingSource, /refreshCooldown|3 天|3 days|429/)
assert.match(settingSource, /_longTermMemoryTimer = setTimeout\([\s\S]*?10000\)/)
assert.match(settingSource, /pollLongTermMemory\(pollingToken\)/)
assert.match(settingSource, /onHide\(\) \{[\s\S]*?clearLongTermMemoryTimer\(\)/)
assert.match(settingSource, /onUnload\(\) \{[\s\S]*?clearLongTermMemoryTimer\(\)/)
assert.match(settingSource, /onShow\(\) \{[\s\S]*?panelConfigKey === 'long_term_memory'[\s\S]*?loadLongTermMemory\(\)/)

// Closing memory removes its conditional nodes; reopening must bind the new nodes.
{
  const vm = require('node:vm')
  const animations = settingSource.slice(settingSource.indexOf('  initLongTermMemoryAnimations() {'), settingSource.indexOf('  initNotificationDetailAnimations() {'))
  const closePanel = settingSource.slice(settingSource.indexOf('  closePanel() {'), settingSource.indexOf('  goBackPanel() {'))
  let finishClose
  const page = vm.runInNewContext(`({${animations}${closePanel}})`, {
    timing: () => 0, Curves: { easeOutCubic: null }, PANEL_DURATION: 300,
    setTimeout: callback => { finishClose = callback }, clearTimeout: () => {}
  })
  let bindings = 0
  page.data = { activePanel: 'memory' }
  page._screenWidth = 375
  page.longTermMemoryProgress = { value: 0 }
  page.notificationDetailProgress = { value: 0 }
  page.archiveDetailProgress = { value: 0 }
  page.panelProgress = { value: 1 }
  page.isPanelOpen = { value: true }
  page._saveMorph = { value: 0 }
  page._hideBack = { value: 0 }
  page.applyAnimatedStyle = () => { bindings++ }
  page.setData = values => Object.assign(page.data, values)
  page.clearSaveButtonTimer = () => {}
  page.clearLongTermMemoryTimer = () => {}
  page.clearSubPanelCloseWatcher = () => {}
  page.setHeaderAction = () => {}
  page.initLongTermMemoryAnimations()
  assert.equal(bindings, 2)
  page.closePanel()
  finishClose()
  assert.equal(page.data.activePanel, '')
  page.initLongTermMemoryAnimations()
  assert.equal(bindings, 4)
}

assert.match(settingSource, /url: '\/pages\/memoryAbout\/index', routeType: 'upRouterBuilder'/)
assert.match(settingTemplate, /id="memoryDeleteConfirmDialog"/)
assert.ok(app.pages.includes('pages/memoryAbout/index'))
assert.match(aboutTemplate, /initial-child-size="\{\{0\.3\}\}"/)
assert.match(aboutTemplate, /<draggable-sheet[\s\S]*?<scroll-view[\s\S]*?associative-container="draggable-sheet"/)
assert.match(aboutTemplate, /\{\{i18n\.memory\.gotIt\}\}/)
assert.doesNotMatch(aboutTemplate, /ChatGPT|了解更多/)
assert.match(aboutStyles, /\.memory-about-description\s*\{[\s\S]*?width:\s*80%;/)

const { messages } = require('../static_utils/i18n')
assert.equal(messages('zh-CN').personalization.longTermMemory, '记忆摘要')
assert.equal(messages('zh-CN').memory.title, '记忆摘要')
assert.equal(messages('zh-CN').memory.refresh, '刷新摘要')
assert.equal(messages('zh-CN').memory.aboutDescription, 'YuanAI 会自动记住关于你的重要信息，并保持更新。此摘要页面仅简要概述已记住的内容，并非完整列表。')
assert.doesNotMatch(settingTemplate, /longTermMemoryStatus|longTermMemoryError|item\.groupTitle|item\.scopeLabel|item\.sourceLabel|i18n\.memory\.loadMore/)
assert.doesNotMatch(settingStyles, /\.long-term-memory-(?:status|group|meta)\s*\{/)
assert.match(settingTemplate, /bind:scrolltolower="loadMoreLongTermMemory"/)
assert.match(aboutTemplate, /min-height:\{\{screenHeight \* 0\.3\}\}px/)
const cardStyle = aboutStyles.match(/\.memory-about-card\s*\{([^}]+)\}/)[1]
assert.doesNotMatch(cardStyle, /height:\s*100%/)
for (const name of ['title', 'description', 'button']) {
  assert.match(aboutStyles, new RegExp(`\\.memory-about-${name}\\s*\\{[^}]*flex-shrink:\\s*0`))
}
assert.match(aboutTemplate, /class="memory-about-scroll\b[^"]*\bbg-l0\b[^"]*"/)
console.log('longTermMemoryMenu: original presentation and native about-sheet layout passed')
