const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { messages } = require('../static_utils/i18n')
const { formatDateTime, presentAsset } = require('../static_utils/assetPresentation')

const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'mdPackage/pages/skillDetail/index.js'), 'utf8')
const markdown = '# Complete Skill\n\nDescription\n\n```js\nconst value = 1\n```\n\nLast paragraph.'
const detail = { id: 'deep_research', title: 'deep-research', description: '后端原始描述', logoUrl: 'https://assets.example.test/yuanbytes_aimini/wx988b23423cfc4ec7/app_static/skills/deep-research-4f77b5c062f6.png', installed: true, enabled: true, updatedAt: new Date(2026, 0, 2, 3, 4).toISOString(), markdown }
detail.titleEn = 'Deep research'
const store = { applicationSettings: { language: 'English' }, user: { login: true, userId: 'account-A' }, assetCacheEpoch: 0 }
detail.canTry = true
detail.exampleMessage = '请研究AI编程工具，并提供可核查的资料来源。'
const requests = [], parses = [], backs = [], toasts = [], accountObservers = [], trialRequests = [], trialEvents = [], removeRequests = []
const settle = () => new Promise(resolve => setImmediate(resolve))
let definition, bound = 0, unbound = 0, navigations = 0

vm.runInNewContext(source, {
  Page: value => { definition = value },
  getApp: () => ({ globalData: { su_system: { screenHeight: 900 }, su_menu: { bottom: 90 } } }),
  require: name => {
    if (name.includes('themeBinding')) return {
      bindPageTheme: page => { bound++; page.setData({ effectiveTheme: 'light', themeStyle: '--bg-l0:white' }) },
      unbindPageTheme: () => { unbound++ },
      syncThemeNavigation: () => { navigations++ }
    }
    if (name.includes('i18n')) return { messages }
    if (name.includes('assetPresentation')) return { formatDateTime }
    if (name.includes('chatFeature')) return require('../static_utils/chatFeature')
    if (name.includes('mobx-miniprogram')) return { reaction: (read, callback) => {
      const observer = { read, callback, key: read(), active: true }
      accountObservers.push(observer)
      return () => { observer.active = false }
    } }
    if (name.includes('store/index')) return { store }
    if (name.includes('request/skills')) return {
      getSkillDetail: options => new Promise((resolve, reject) => requests.push({ options, resolve, reject })),
      removeSkill: options => new Promise((resolve, reject) => removeRequests.push({ options, resolve, reject })),
      trySkill: options => new Promise((resolve, reject) => trialRequests.push({ options, resolve, reject }))
    }
    if (name.includes('towxmlstream/index')) return { static: (content, type, options) => {
      parses.push({ content, type, options })
      return { content, type, options }
    } }
    if (name.includes('request/mcps')) return {
      getMcpDetail: options => new Promise((resolve, reject) => requests.push({ options, resolve, reject })),
      tryMcp: options => new Promise((resolve, reject) => trialRequests.push({ options, resolve, reject })),
      removeMcp: options => new Promise((resolve, reject) => removeRequests.push({ options, resolve, reject }))
    }
    throw new Error(`Unexpected dependency ${name}`)
  },
  wx: {
    worklet: { runOnJS: callback => callback },
    navigateBack: options => backs.push(options),
    showToast: options => toasts.push(options)
  }
})

function page() {
  return {
    ...definition,
    data: JSON.parse(JSON.stringify(definition.data)),
    updates: [],
    getOpenerEventChannel: () => ({ emit: (event, item) => trialEvents.push({ event, item }) }),
    setData(patch) { this.updates.push(patch); Object.assign(this.data, patch) }
  }
}

async function main() {
  const mcpPage = page()
  mcpPage.onLoad({ id:'dashscope', kind:'mcp' })
  const mcp = { ...detail, id:'dashscope', descriptionEn:'English quotes', markdownEn:'# Stocks', exampleMessageEn:'Use the stock MCP' }
  requests.at(-1).resolve(mcp)
  await settle()
  assert.equal(mcpPage.data.description, 'English quotes')
  assert.equal(mcpPage.data.article.content, '# Stocks')
  const mcpLanguage = accountObservers.at(-1)
  mcpLanguage.callback('中文')
  assert.equal(mcpPage.data.article.content, markdown)
  assert.equal(mcpPage.data.description, detail.description)
  mcpPage.onUnload()
  requests.length = 0; parses.length = 0; accountObservers.length = 0
  bound = 0; unbound = 0

  const instance = page()
  instance.onLoad({ id: 'deep_research' })
  assert.equal(requests[0].options.id, 'deep_research')
  assert.equal('language' in requests[0].options, false, 'raw Skill copy does not request localization')
  assert.equal(instance.data.screenHeight, 900)
  assert.equal(instance.data.maxSheetSize, (900 - 90 - 20) / 900)
  assert.equal(instance.data.screenHeight * instance.data.maxSheetSize, 790, 'expanded sheet stops 20px below the capsule')
  assert.equal(instance.data.i18n, messages('English'))
  instance.trySkill()
  assert.equal(toasts.length, 0, 'loading cannot try a Skill')
  requests[0].resolve(detail)
  await settle()
  assert.equal(instance.data.loading, false)
  assert.equal(instance.data.failed, false)
  assert.equal(instance.data.item, detail)
  assert.equal(parses[0].content, markdown, 'pass the complete backend Markdown body to the parser unchanged')
  assert.equal(parses[0].type, 'markdown')
  assert.equal(parses[0].options.theme, 'light')
  assert.equal(instance.data.article.content, markdown)
  assert.equal(instance.data.updatedAtLabel, '2026/01/02 03:04')
  assert.equal(instance.data.updatedAtLabel, presentAsset({ uploadedAt: detail.updatedAt }, messages('English'), 'English').dateLabel, 'detail and library share the date formatter')
  assert.equal(formatDateTime('invalid'), '')
  assert.equal(formatDateTime(''), '')
  assert.equal(instance.data.item.title, 'deep-research', 'English UI preserves the backend title')
  assert.equal(instance.data.item.description, '后端原始描述')
  assert.equal(instance.data.skillTitle, detail.titleEn)
  const languageObserver = accountObservers.at(-1)
  const readCount = requests.length, parseCount = parses.length
  store.applicationSettings.language = '中文'
  languageObserver.callback('中文')
  assert.equal(instance.data.skillTitle, detail.title)
  assert.equal(instance.data.i18n, messages('中文'))
  store.applicationSettings.language = 'English'
  languageObserver.callback('English')
  assert.equal(instance.data.skillTitle, detail.titleEn)
  assert.equal(requests.length, readCount, 'switching language does not reload the package')
  assert.equal(parses.length, parseCount, 'switching title preserves Markdown and scroll state')
  instance.onShow()
  assert.equal(navigations, 1)
  instance.data.item = { ...detail, canTry: false }
  await instance.trySkill()
  assert.equal(trialRequests.length, 0, 'unpublished or unavailable Skills cannot start a trial')
  instance.data.item = detail

  for (const size of [0.6, instance.data.maxSheetSize, 0.011]) {
    instance.onSizeUpdate({ size })
    assert.equal(backs.length, 0, 'default, expanded and above-threshold sheet sizes stay open')
  }
  instance.onSizeUpdate({ size: 0.01 })
  instance.closePage()
  assert.equal(backs.length, 1, 'drag-close and button-close are deduplicated')
  instance.trySkill()
  assert.equal(toasts.length, 0, 'closing cannot try a Skill')
  backs[0].fail()
  assert.equal(instance._closing, false, 'a failed navigation permits closing again')
  instance.closePage()
  assert.equal(backs.length, 2)
  instance.onUnload()
  instance.closePage()
  assert.equal(backs.length, 2, 'an unloaded page cannot navigate again')

  const closing = page()
  closing.onLoad({ id: 'web_search' })
  closing.closePage()
  const closingUpdates = closing.updates.length
  const beforeParse = parses.length
  requests.at(-1).resolve({ ...detail, id: 'web_search' })
  await settle()
  assert.equal(closing.updates.length, closingUpdates, 'closing drops late detail responses')
  assert.equal(parses.length, beforeParse, 'closing skips Markdown parsing')

  const unloaded = page()
  unloaded.onLoad({ id: 'study' })
  unloaded.onUnload()
  const unloadedUpdates = unloaded.updates.length
  requests.at(-1).reject(new Error('late failure'))
  await settle()
  assert.equal(unloaded.updates.length, unloadedUpdates, 'unloading drops late errors')
  unloaded.trySkill()
  assert.equal(toasts.length, 0)

  const failed = page()
  failed.onLoad({ id: 'unknown' })
  requests.at(-1).reject(new Error('not found'))
  await settle()
  assert.equal(failed.data.loading, false)
  assert.equal(failed.data.failed, true)
  const retry = failed.loadSkill()
  requests.at(-1).resolve(detail)
  await retry
  assert.equal(failed.data.loading, false)
  assert.equal(failed.data.failed, false)
  assert.equal(bound, 4)
  assert.equal(unbound, 2)

  const foreign = page()
  foreign.onLoad({ id: 'image_generation' })
  const foreignRequest = requests.at(-1)
  store.user = { login: false, userId: '' }
  store.assetCacheEpoch++
  for (const observer of accountObservers) {
    const key = observer.read()
    if (observer.active && key !== observer.key) { observer.key = key; observer.callback(key) }
  }
  assert.equal(foreign._closing, true, 'an account switch closes the previous owner detail')
  const foreignChanges = foreign.updates.length
  foreignRequest.resolve(detail)
  await settle()
  assert.equal(foreign.updates.length, foreignChanges, 'previous-owner responses cannot render in a guest session')
  const guest = page()
  guest.onLoad({ id: 'web_search' })
  const guestRequest = requests.at(-1)
  store.assetCacheEpoch++
  for (const observer of accountObservers) {
    const key = observer.read()
    if (observer.active && key !== observer.key) { observer.key = key; observer.callback(key) }
  }
  const guestChanges = guest.updates.length
  guestRequest.reject(new Error('old guest response'))
  await settle()
  assert.equal(guest._closing, true, 'guest epoch changes also invalidate owner details')
  assert.equal(guest.updates.length, guestChanges)
  guest.onUnload()
  assert.equal(accountObservers.at(-1).active, false, 'unload disposes the identity observer')

  const trial = page()
  trial.onLoad({ id: detail.id })
  requests.at(-1).resolve(detail)
  await settle()
  const trialRequest = trial.trySkill()
  trial.trySkill()
  assert.equal(trialRequests.length, 1, 'repeated taps share the pending enable request')
  assert.equal(trialRequests[0].options.id, detail.id)
  assert.equal(trial.data.trying, true)
  trialRequests[0].resolve(detail)
  await trialRequest
  assert.equal(trialEvents.at(-1).event, 'trySkill')
  assert.equal(trialEvents.at(-1).item.exampleMessage, detail.exampleMessage)
  assert.equal(trial._closing, true, 'success closes the sheet after handing the draft to its opener')
  backs.at(-1).fail()
  assert.equal(trialEvents.at(-1).event, 'cancelSkillTrial', 'a failed return cancels the pending new-chat action')
  assert.equal(trial.data.trying, false)
  const failedTrial = trial.trySkill()
  trialRequests.at(-1).reject(new Error('请稍后重试'))
  await failedTrial
  assert.equal(toasts.at(-1).title, '请稍后重试')
  assert.equal(trial.data.trying, false, 'failed enable preserves the detail for retry')
  const staleTrial = trial.trySkill()
  const previousTrialEvents = trialEvents.length
  store.assetCacheEpoch++
  trialRequests.at(-1).resolve(detail)
  await staleTrial
  assert.equal(trialEvents.length, previousTrialEvents, 'an old owner enable response cannot prefill the new owner chat')
  trial.onUnload()

  const removal = page()
  removal.onLoad({ id: 'user_added' })
  await removal.removeSkill()
  assert.equal(removeRequests.length, 0, 'loading details cannot remove a plugin')
  requests.at(-1).resolve({ ...detail, id:'user_added', installed:false, globalDefault:false })
  await settle()
  await removal.removeSkill()
  assert.equal(removeRequests.length, 0, 'uninstalled plugins cannot be removed')
  for (const id of ['image_generation', 'deep_research', 'web_search', 'study']) {
    removal.data.item = { ...detail, id, globalDefault:true }
    await removal.removeSkill()
  }
  assert.equal(removeRequests.length, 0, 'all four default plugins reject removal')
  removal.data.item = { ...detail, id:'user_added', globalDefault:false }
  removal.setData({ trying:true })
  await removal.removeSkill()
  assert.equal(removeRequests.length, 0, 'trial and deletion cannot run together')
  removal.setData({ trying:false })
  const beforeDeleteTrials = trialRequests.length
  const failedRemoval = removal.removeSkill()
  await removal.removeSkill()
  await removal.trySkill()
  assert.equal(removeRequests.length, 1, 'repeated delete taps share one pending request')
  assert.equal(removeRequests[0].options.id, 'user_added')
  assert.equal(removal.data.removing, true)
  assert.equal(trialRequests.length, beforeDeleteTrials, 'deleting blocks trial requests')
  removeRequests[0].reject(new Error('删除失败'))
  await failedRemoval
  assert.equal(removal.data.removing, false)
  assert.equal(removal.data.item.installed, true, 'a failed delete preserves installation state for retry')
  assert.equal(toasts.at(-1).title, '删除失败')
  const successRemoval = removal.removeSkill()
  const removedItem = { ...removal.data.item, installed:false, enabled:false }
  removeRequests.at(-1).resolve(removedItem)
  await successRemoval
  assert.equal(trialEvents.at(-1).event, 'skillRemoved')
  assert.equal(trialEvents.at(-1).item, removedItem)
  assert.equal(removal.data.item.installed, false)
  assert.equal(removal.data.removing, false)
  assert.equal(removal._closing, true)
  backs.at(-1).fail()
  await removal.removeSkill()
  assert.equal(removeRequests.length, 2, 'navigation failure cannot delete an already removed plugin again')
  removal.data.item = { ...detail, id:'user_added', globalDefault:false }
  const staleRemoval = removal.removeSkill()
  const beforeRemovalEvents = trialEvents.length
  const beforeRemovalUpdates = removal.updates.length
  store.assetCacheEpoch++
  removeRequests.at(-1).resolve(removedItem)
  await staleRemoval
  assert.equal(trialEvents.length, beforeRemovalEvents, 'old-owner deletes cannot update the new owner list')
  assert.equal(removal.updates.length, beforeRemovalUpdates)
  removal.onUnload()

  const unloadedRemoval = page()
  unloadedRemoval.onLoad({ id:'user_added' })
  requests.at(-1).resolve({ ...detail, id:'user_added', globalDefault:false })
  await settle()
  const lateRemoval = unloadedRemoval.removeSkill()
  unloadedRemoval.onUnload()
  const beforeLateUpdates = unloadedRemoval.updates.length
  removeRequests.at(-1).reject(new Error('late failure'))
  await lateRemoval
  assert.equal(unloadedRemoval.updates.length, beforeLateUpdates, 'unloaded details ignore late delete failures')

  const template = fs.readFileSync(path.join(root, 'mdPackage/pages/skillDetail/index.wxml'), 'utf8')
  const style = fs.readFileSync(path.join(root, 'mdPackage/pages/skillDetail/index.wxss'), 'utf8')
  const config = JSON.parse(fs.readFileSync(path.join(root, 'mdPackage/pages/skillDetail/index.json'), 'utf8'))
  assert.match(template, /root-background-color="transparent"/)
  assert.match(template, /initial-child-size="\{\{0\.6\}\}" min-child-size="\{\{0\}\}" max-child-size="\{\{maxSheetSize\}\}"/)
  assert.match(template, /snap="\{\{true\}\}" snap-sizes="\{\{\[0\.6\]\}\}"/)
  assert.match(template, /associative-container="draggable-sheet"/)
  assert.match(template, /class="skill-description\b[^\"]*text-l2\b[^\"]*" max-lines="3" overflow="ellipsis"/)
  assert.match(template, /<towxml[^>]*openTyper="{{false}}"[^>]*theme="{{effectiveTheme}}"/)
  assert.match(template, /<\/scroll-view>[\s\S]*class="skill-footer\b[^\"]*"[\s\S]*bind:tap="trySkill"/)
  assert.match(template, /class="skill-bottom-space\b[^\"]*" style="height:{{screenHeight \* 0\.2}}px;"/)
  assert.match(style, /page\s*\{\s*background-color: transparent;/)
  assert.match(style, /\.skill-header\s*\{[^}]*flex-direction: row;/)
  assert.match(template, /class="skill-update-time\b[^\"]*text-l2\b[^\"]*"[^>]*><text>\{\{updatedAtLabel\}\}<\/text>/)
  assert.match(template, /class="skill-article\b[^\"]*"[\s\S]*?class="skill-markdown-frame\b[^\"]*"[\s\S]*?<towxml/)
  assert.match(template, /class="skill-update-time\b[^"]*\bplr24\b/)
  assert.match(template, /class="skill-article\b[^"]*\bplr24\b[^"]*\bpt24\b/)
  assert.match(template, /class="skill-markdown-frame\b[^"]*\bptb24\b[^"]*\bplr24\b/)
  assert.match(style, /\.skill-markdown-frame\s*\{[^}]*border: 2rpx solid var\(--border-subtle\);[^}]*border-radius: 20rpx;/)
  assert.doesNotMatch(template, /item\.iconClass|skill-logo-glyph|plugins\.skillContent/)
  assert.match(template, /class="skill-bottom-space\b[^"]*\bsafe-holder\b/)
  assert.match(style, /\.skill-footer\s*\{[^}]*position: absolute;[^}]*bottom: 0;[^}]*env\(safe-area-inset-bottom\)/)
  const closeStyle = style.match(/\.skill-close\s*\{([^}]*)\}/)?.[1] || ''
  assert.match(closeStyle, /position: absolute;/)
  assert.match(closeStyle, /top: 24rpx;/)
  assert.match(closeStyle, /right: 24rpx;/)
  assert.match(closeStyle, /padding: 22rpx;/)
  assert.match(closeStyle, /border-radius: 999rpx;/)
  const closeTemplate = template.match(/<view class="skill-close\b[^>]*>[\s\S]*?<\/view>/)?.[0] || ''
  assert.match(closeTemplate, /glass-view/)
  assert.match(closeTemplate, /<text[^>]*class="[^"]*\bicon-x\b[^"]*\bft48\b/)
  assert.match(template, /wx:if="\{\{!loading && !failed && item.installed && !item.globalDefault\}\}" class="skill-delete skill-close dr ac jc glass-view"[\s\S]*?bind:tap="removeSkill"/)
  assert.match(style, /\.skill-delete\s*\{ right: 132rpx; \}/)
  assert.match(style, /\.skill-copy-deletable\s*\{ padding-right: 212rpx; \}/)
  assert.equal(config.backgroundColorContent, '#ffffff00')
  assert.equal(config.usingComponents.towxml, '../../components/towxmlstream/towxml')
  assert.doesNotMatch(source, /addRouteBuilder|removeRouteBuilder|wx\.request|wx\.cloud/)
  console.log('skillDetail: API Markdown, shared update date, identity guards, sheet geometry and trial handoff passed')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
