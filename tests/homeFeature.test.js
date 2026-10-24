const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const {
  HOME_FEATURES,
  normalizeHomeFeature
} = require('../static_utils/homeFeature')
const { t } = require('../static_utils/i18n')

assert.deepEqual(HOME_FEATURES, {
  CHAT: 'chat',
  LIBRARY: 'library',
  TASKS: 'tasks',
  KNOWLEDGE: 'knowledge',
  PLUGINS: 'plugins',
  CREATE: 'create'
})
assert.equal(normalizeHomeFeature('library'), 'library')
assert.equal(normalizeHomeFeature('tasks'), 'tasks')
assert.equal(normalizeHomeFeature('knowledge'), 'knowledge')
assert.equal(normalizeHomeFeature('plugins'), 'plugins')
assert.equal(normalizeHomeFeature('create'), 'create')
assert.equal(normalizeHomeFeature('unknown'), 'chat')

const indexWxml = fs.readFileSync(path.join(__dirname, '../pages/index/index.wxml'), 'utf8')
const indexJs = fs.readFileSync(path.join(__dirname, '../pages/index/index.js'), 'utf8')
const indexWxss = fs.readFileSync(path.join(__dirname, '../pages/index/index.wxss'), 'utf8')
const tryItPageJs = fs.readFileSync(path.join(__dirname, '../pages/createTryIt/index.js'), 'utf8')
const tryItPageWxml = fs.readFileSync(path.join(__dirname, '../pages/createTryIt/index.wxml'), 'utf8')
const tryItRouterJs = fs.readFileSync(path.join(__dirname, '../static_router/tryItRouter.js'), 'utf8')
const appConfigJs = fs.readFileSync(path.join(__dirname, '../app_config.js'), 'utf8')
const appConfigExampleJs = fs.readFileSync(path.join(__dirname, '../app_config.private.example.js'), 'utf8')
const appJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../app.json'), 'utf8'))
const chatViewJs = fs.readFileSync(path.join(__dirname, '../components/_self/yb-chat-view/index.js'), 'utf8')
assert.match(chatViewJs, /openSet\(\)\{\s*triggerHaptic\(this\.data\.applicationSettings\?\.hapticFeedback, 'light'\)\s*this\.triggerEvent\('openSettings'\)/)
assert.match(indexWxml, /<yb-chat-view/)
assert.match(indexWxml, /<yb-library-view/)
for (const feature of ['tasks', 'knowledge', 'plugins', 'create']) {
  assert.match(indexWxml, new RegExp(`wx:if="{{currentFeature === '${feature}'}}"[\\s\\S]*?<yb-${feature}-view`))
  const base = path.join(__dirname, `../components/_self/yb-${feature}-view`)
  assert.equal(JSON.parse(fs.readFileSync(`${base}/index.json`, 'utf8')).styleIsolation, 'isolated')
  assert.match(fs.readFileSync(`${base}/index.js`, 'utf8'), /triggerEvent\('openLeft'\)/)
  assert.match(fs.readFileSync(`${base}/index.wxml`, 'utf8'), /<yb-title-nav[^>]*class="z99\b[^\"]*"/)
  if (feature === 'create') {
    assert.match(fs.readFileSync(`${base}/index.wxml`, 'utf8'), /class="create-page\b[^"]*\bbg-gray\b/)
  } else if (feature === 'plugins') {
    assert.match(fs.readFileSync(`${base}/index.wxml`, 'utf8'), /class="plugins-page\b[^\"]*"/)
    assert.doesNotMatch(fs.readFileSync(`${base}/index.wxml`, 'utf8'), /feature-placeholder|comingSoon/)
  } else if (feature === 'tasks') {
    assert.match(fs.readFileSync(`${base}/index.wxml`, 'utf8'), /class="tasks-page/)
    assert.doesNotMatch(fs.readFileSync(`${base}/index.wxml`, 'utf8'), /feature-placeholder|comingSoon|longpress/)
  } else if (feature === 'knowledge') {
    assert.match(fs.readFileSync(`${base}/index.wxml`, 'utf8'), /class="knowledge-page\b[^\"]*\bbg-gray\b/)
    assert.doesNotMatch(fs.readFileSync(`${base}/index.wxml`, 'utf8'), /feature-placeholder|comingSoon/)
  } else {
    assert.match(fs.readFileSync(`${base}/index.wxss`, 'utf8'), /@import "\/static_wxss\/skyother\.wxss"/)
    assert.match(fs.readFileSync(`${base}/index.wxml`, 'utf8'), /class="feature-placeholder-page\b[^\"]*"/)
  }
}
assert.match(fs.readFileSync(path.join(__dirname, '../static_wxss/skyother.wxss'), 'utf8'), /\.feature-placeholder-page\s*\{[^}]*background-color:\s*var\(--bg-gray, #F8F7F5\)/)
for (const feature of ['chat', 'library']) {
  assert.match(indexWxml, new RegExp(`wx:if="{{currentFeature === '${feature}'}}"[\\s\\S]*?<yb-${feature}-view`))
}
assert.doesNotMatch(indexJs, /featureProgress|chat-feature-view|library-feature-view/)
assert.doesNotMatch(indexWxss, /feature-active|feature-inactive/)
assert.doesNotMatch(indexJs, /isEdgeSwipe|velocity >= 1\.5/)
assert.doesNotMatch(indexWxml, /bind:openTryIt="openCreateTryIt"/)
assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '../components/_self/yb-create-view/index.js'), 'utf8'), /triggerEvent\('openTryIt'\)/)
assert.match(indexJs, /pages\[pages\.length - 1\] !== this[\s\S]*?_openTryItOnShow = true/)
assert.match(indexJs, /url: '\/pages\/createTryIt\/index'[\s\S]*?routeType: TRY_IT_ROUTE_TYPE/)
assert.match(indexJs, /tryCreationPrompt: \(\{ prompt, files \}\) => \{ this\._pendingCreationTurn = \{ prompt, files \} \}/)
assert.match(indexJs, /finishCreationTurn\(\)[\s\S]*?resetChatSession\(\)[\s\S]*?sendCreationPrompt\(action\.prompt, action\.files \|\| \[\]\)/)
assert.match(chatViewJs, /sendCreationPrompt\(prompt, files = \[\]\)[\s\S]*?selectFeature\(IMG,[\s\S]*?startChat\(/)
assert.ok(appJson.pages.includes('pages/createTryIt/index'))
assert.match(tryItRouterJs, /TRY_IT_SHEET_HEIGHT_RATIO = 0\.45/)
assert.match(tryItRouterJs, /height: `\$\{sheetHeight\}px`/)
assert.doesNotMatch(tryItRouterJs, /scale\(|width:/)
assert.match(tryItPageWxml, /src="\{\{appStaticRoot \+ '\/try-it-image-creation\.png'\}\}"/)
assert.doesNotMatch(tryItPageWxml, /persistent\.oaistatic\.com/)
assert.match(appConfigExampleJs, /appStaticRoot:\s*'https:\/\/your-cos-domain\.example\/your-project-prefix\/your-app-id\/app_static'/)
assert.doesNotMatch(appConfigExampleJs, /loading\.svg|doc\.png|try-it-image-creation\.png/)
assert.match(appConfigJs, /require\('\.\/app_config\.private'\)/)
assert.match(appConfigJs, /const appStaticRoot =/)
assert.match(tryItPageWxml, /\{\{i18n\.tryIt\.title\}\}/)
assert.match(tryItPageWxml, /\{\{i18n\.tryIt\.description\}\}/)
assert.match(tryItPageWxml, /\{\{i18n\.tryIt\.action\}\}/)
assert.match(tryItPageJs, /createStoreBindings\(this,[\s\S]*i18n: \(state\) => messages\(state\.applicationSettings\?\.language\)/)
assert.equal(t('中文', 'tryIt.action'), '试试看')
assert.equal(t('English', 'tryIt.action'), 'Try it')
assert.equal((chatViewJs.match(/\bobservers\s*:/g) || []).length, 1)
assert.match(chatViewJs, /language\(language\)[\s\S]*'modelCatalog,workModelSelection'/)
assert.match(chatViewJs, /reasoning\.efforts\.\$\{effort\.id\}/)

let indexDefinition
const trialStore = { assetCacheEpoch: 0 }
const gestureWx = {
  nextTick: callback => callback(),
  homePressFlag: { value: false },
  homeContentShow: { value: 0 },
  pageTrans: { value: 0 },
  worklet: {
    shared: (value) => ({ value }),
    timing: (value) => value,
    runOnJS: (fn) => fn
  }
}
vm.runInNewContext(indexJs.slice(indexJs.indexOf('const GestureState')), {
  DEFAULT_POINT_COLOR: '#000000',
  HOME_FEATURES,
  normalizeHomeFeature,
  CHAT_MODE_IDS: { TEMPORARY: 'temporary' },
  Page: (definition) => { indexDefinition = definition },
  getAccentStyle: () => '',
  getApp: () => ({ globalData: { durationTime: 160, su_system: { screenWidth: 400 } } }),
  runOnJS: (fn) => fn,
  t,
  store: trialStore,
  wx: gestureWx
})

const skillNavigations = []
const skillToasts = []
gestureWx.navigateTo = options => skillNavigations.push(options)
gestureWx.showToast = options => skillToasts.push(options)
const skillHome = { data: { language: '中文' } }
indexDefinition.openSkill.call(skillHome, { detail: { id: 'web_search' } })
indexDefinition.openSkill.call(skillHome, { detail: { id: 'study' } })
assert.equal(skillNavigations.length, 1, 'repeated taps do not stack details')
assert.equal(skillNavigations[0].url, '/mdPackage/pages/skillDetail/index?id=web_search')
assert.equal(skillNavigations[0].routeType, 'upRouterBuilder')
skillNavigations[0].fail()
assert.equal(skillToasts[0].title, t('中文', 'common.loadFailed'))
skillNavigations[0].complete()
assert.equal(skillHome._openingSkill, false)
const skillDraft = { id: 'web_search', title: 'web-search', logoUrl: 'https://example.test/logo.png', exampleMessage: '请查找官方开放时间。' }
skillNavigations[0].events.trySkill(skillDraft)
const skillCalls = []
const skillChat = { resetChatSession: () => skillCalls.push('new-chat'), prefillSkill: item => skillCalls.push(item) }
skillHome.getChatView = () => skillChat
skillHome.setData = (patch, callback) => { Object.assign(skillHome.data, patch); callback?.() }
indexDefinition.finishSkillTrial.call(skillHome)
assert.equal(skillHome.data.currentFeature, HOME_FEATURES.CHAT)
assert.equal(skillCalls[0], 'new-chat')
assert.equal(skillCalls[1], skillDraft, 'trial prepares a draft and does not send it')
assert.equal(skillHome._pendingSkillTrial, null)
skillNavigations[0].events.trySkill(skillDraft)
skillNavigations[0].events.cancelSkillTrial()
assert.equal(skillHome._pendingSkillTrial, null)
trialStore.assetCacheEpoch++
skillNavigations[0].events.trySkill(skillDraft)
assert.equal(skillHome._pendingSkillTrial, null, 'a previous owner cannot queue a trial')
const removedSkills = []
skillHome.selectComponent = selector => { assert.equal(selector, '#pluginsView'); return { updateSkill:item => removedSkills.push(item) } }
skillNavigations[0].events.skillRemoved({ id:'old-owner-skill' })
assert.equal(removedSkills.length, 0, 'a previous owner cannot change plugin installation state')
indexDefinition.openSkill.call(skillHome, { detail:{ id:'user_added' } })
const removedSkill = { id:'user_added', installed:false, enabled:false }
skillNavigations.at(-1).events.skillRemoved(removedSkill)
assert.equal(removedSkills[0], removedSkill, 'detail removal updates the mounted plugin list')
skillHome.selectComponent = () => null
skillNavigations.at(-1).events.skillRemoved(removedSkill)
skillHome.finishSkillTrial = () => indexDefinition.finishSkillTrial.call(skillHome)
indexDefinition.startSkillTrial.call(skillHome, {detail:{item:skillDraft}})
assert.deepEqual(skillCalls.slice(-2), ['new-chat', skillDraft], 'plugin menu chat reuses the new-chat trial draft flow')
const beforeInvalidTrial = skillCalls.length
indexDefinition.startSkillTrial.call(skillHome, {detail:{item:{id:'invalid'}}})
assert.equal(skillCalls.length,beforeInvalidTrial)
assert.match(indexWxml, /<yb-plugins-view[^>]*bind:openSkill="openSkill"/)
assert.match(indexWxml, /<yb-plugins-view[^>]*bind:trySkill="startSkillTrial"/)
assert.ok(appJson.subPackages.find(item => item.root === 'mdPackage').pages.includes('pages/skillDetail/index'))

const creationCalls = []
const creationChat = {
  resetChatSession: () => creationCalls.push('new-chat'),
  sendCreationPrompt: (prompt, files) => creationCalls.push([prompt, files.length])
}
const creationHome = {
  _pendingCreationTurn: { prompt:'复古照片', files:[{ tempFilePath:'/tmp/photo.jpg' }] },
  setData(patch, callback) { this.currentFeature = patch.currentFeature; callback() },
  getChatView: () => creationChat
}
indexDefinition.finishCreationTurn.call(creationHome)
assert.equal(creationHome.currentFeature, HOME_FEATURES.CHAT)
assert.deepEqual(creationCalls, ['new-chat', ['复古照片', 1]])
assert.equal(creationHome._pendingCreationTurn, null)

const gestureContext = {
  reasoningSliderOpen: { value: false },
  drawerGestureActive: { value: false }
}
assert.equal(indexDefinition.shouldHorResponse.call(gestureContext, { clientX: 390, deltaX: 4, deltaY: 8 }), false)
assert.equal(indexDefinition.shouldHorResponse.call(gestureContext, { clientX: 390, deltaX: -8, deltaY: 1 }), false)
assert.equal(indexDefinition.shouldHorResponse.call(gestureContext, { clientX: 390, deltaX: 9, deltaY: 6 }), true)
assert.equal(indexDefinition.shouldHorResponse.call(gestureContext, { clientX: 390, deltaX: 9, deltaY: 1 }), true)
assert.equal(indexDefinition.shouldHorResponse.call(gestureContext, { clientX: 80, deltaX: 9, deltaY: 1 }), true)
gestureContext.drawerGestureActive.value = true
assert.equal(indexDefinition.shouldHorResponse.call(gestureContext, { clientX: 390, deltaX: -4, deltaY: 8 }), true)
gestureContext.reasoningSliderOpen.value = true
assert.equal(indexDefinition.shouldHorResponse.call(gestureContext, { clientX: 80, deltaX: 9, deltaY: 1 }), false)

let tryItDefinition
const tryItWx = {
  worklet: {
    shared: (value) => ({ value }),
    timing: (value, options, callback) => {
      if (callback) callback()
      return value
    }
  }
}
vm.runInNewContext(tryItPageJs.slice(tryItPageJs.indexOf('const { shared')), {
  appStaticRoot: '',
  messages: () => ({}),
  GestureState: { BEGIN: 1, ACTIVE: 2, END: 3, CANCELLED: 4 },
  Page: (definition) => { tryItDefinition = definition },
  Curves: { decelerateEasing: () => {}, easeOutCubic: () => {} },
  TRY_IT_ROUTE_DURATION: 250,
  bottomSheetSuspendedCurve: () => () => {},
  clamp: (value, lower, upper) => Math.max(lower, Math.min(value, upper)),
  wx: tryItWx
})
const tryItEvents = []
const tryItGestureContext = {
  routeContext: {
    primaryAnimation: { value: 1 },
    userGestureInProgress: { value: true },
    stopUserGesture: () => tryItEvents.push('stop'),
    didPop: () => tryItEvents.push('pop')
  }
}
assert.equal(tryItDefinition.shouldPanResponse.call(tryItGestureContext, { deltaX: 1, deltaY: -10 }), true)
tryItGestureContext.routeContext.userGestureInProgress.value = false
assert.equal(tryItDefinition.shouldPanResponse.call(tryItGestureContext, { deltaX: 1, deltaY: -10 }), false)
assert.equal(tryItDefinition.shouldPanResponse.call(tryItGestureContext, { deltaX: 1, deltaY: 10 }), true)
tryItGestureContext.routeContext.primaryAnimation.value = 1
tryItDefinition.handleDragUpdate.call(tryItGestureContext, -0.25)
assert.equal(tryItGestureContext.routeContext.primaryAnimation.value, 1)
tryItDefinition.handleDragUpdate.call(tryItGestureContext, 0.49)
assert.equal(tryItGestureContext.routeContext.primaryAnimation.value, 0.51)
tryItGestureContext.routeContext.userGestureInProgress.value = true
tryItDefinition.handleDragEnd.call(tryItGestureContext, false)
assert.deepEqual(tryItEvents, ['stop'])
tryItEvents.length = 0
tryItGestureContext.routeContext.primaryAnimation.value = 0.5
tryItGestureContext.routeContext.userGestureInProgress.value = true
tryItDefinition.handleDragEnd.call(tryItGestureContext, false)
assert.deepEqual(tryItEvents, ['stop', 'pop'])

const releaseCalls = []
const releaseContext = {
  widthActual: { value: 280 },
  pageNavFun: (forward) => releaseCalls.push(forward),
  dyNavigate: () => releaseCalls.push('navigate')
}
gestureWx.pageTrans.value = 28
indexDefinition.lrhandleDragEnd.call(releaseContext, 1.5)
assert.deepEqual(releaseCalls, [false])
releaseCalls.length = 0
gestureWx.pageTrans.value = 34
indexDefinition.lrhandleDragEnd.call(releaseContext, 1)
assert.deepEqual(releaseCalls, [true, 'navigate'])
releaseCalls.length = 0
gestureWx.pageTrans.value = 150
indexDefinition.lrhandleDragEnd.call(releaseContext, 0)
assert.deepEqual(releaseCalls, [true, 'navigate'])
releaseCalls.length = 0
gestureWx.pageTrans.value = 224
indexDefinition.lrhandleDragEnd.call(releaseContext, -1)
assert.deepEqual(releaseCalls, [false])

const libraryWxml = fs.readFileSync(path.join(__dirname, '../components/_self/yb-library-view/index.wxml'), 'utf8')
assert.match(libraryWxml, /i18n\.library\.search/)
assert.match(libraryWxml, /<yb-title-nav/)
assert.match(libraryWxml, /<yb-title-nav[\s\S]*?class="z99\b[^\"]*"/)
assert.match(libraryWxml, /feature-name="{{i18n\.library\.title}}"/)
assert.match(libraryWxml, /feature-menu-enabled="{{false}}"/)
const libraryJs = fs.readFileSync(path.join(__dirname, '../components/_self/yb-library-view/index.js'), 'utf8')
assert.match(libraryJs, /copy\.all/)
assert.match(libraryJs, /copy\.images/)
assert.match(libraryJs, /copy\.documents/)

const leftCenterWxml = fs.readFileSync(path.join(__dirname, '../components/_self/yb-left-center/index.wxml'), 'utf8')
assert.equal((leftCenterWxml.match(/catch:tap="openFeature"/g) || []).length, 5)
assert.match(leftCenterWxml, /home-action[^\n]*mradius[^\n]*currentFeature === 'library'/)
assert.doesNotMatch(leftCenterWxml, /home-action[^\n]*ptb16/)
assert.match(leftCenterWxml, /<scroll-view[\s\S]*?enable-passive[\s\S]*?class="chat-view/)
assert.match(leftCenterWxml, /wx:if="{{pinnedConversations\.length}}"[\s\S]*?i18n\.sidebar\.pinned/)
assert.match(leftCenterWxml, /wx:for="{{pinnedConversations}}"[\s\S]*?list-item/)
assert.match(leftCenterWxml, /class="pinned-section\b[^\"]*search-collapsible\b[^\"]*"[\s\S]*?pinnedHasMore[\s\S]*?i18n\.sidebar\.expand/)
assert.match(leftCenterWxml, /catch:tap="loadMorePinnedConversations"/)
assert.match(leftCenterWxml, /class="recent-title\b[^\"]*search-collapsible\b[^\"]*"[\s\S]*?i18n\.sidebar\.recent/)
assert.match(leftCenterWxml, /wx:for="{{recentConversations}}"[\s\S]*?list-item/)
assert.doesNotMatch(leftCenterWxml.match(/<view catch:tap="startNewConversation"[^>]+>/)[0], /currentFeature/)
const leftCenterWxss = fs.readFileSync(path.join(__dirname, '../components/_self/yb-left-center/index.wxss'), 'utf8')
assert.match(leftCenterWxml, /class="home-action\b[^\"]*dr\b[^\"]*ac\b[^\"]*mradius/)
assert.doesNotMatch(leftCenterWxss, /\.home-action\s*{[\s\S]*?display:\s*flex;/)
const leftCenterJs = fs.readFileSync(path.join(__dirname, '../components/_self/yb-left-center/index.js'), 'utf8')
assert.match(leftCenterJs, /const shouldReset = this\.data\.currentFeature === HOME_FEATURES\.CHAT/)
assert.match(leftCenterJs, /if\(shouldReset\)/)
assert.match(leftCenterJs, /const PINNED_PAGE_SIZE = 5/)
assert.match(leftCenterJs, /pinnedChatHistory/)
assert.match(leftCenterJs, /setPinnedChatHistory/)
assert.match(leftCenterJs, /pinnedHistory\.latestModifiedAt/)
assert.match(leftCenterJs, /listConversations\(\{ pageSize: PINNED_PAGE_SIZE, offset: 0, pinned: true \}\)/)
assert.match(leftCenterJs, /listConversations\(\{ pageSize: PAGE_SIZE, offset: 0, pinned: false \}\)/)
assert.match(leftCenterJs, /const requestVersion = \+\+this\._pinnedRequestVersion[\s\S]*requestVersion !== this\._pinnedRequestVersion/)
assert.match(leftCenterJs, /const requestVersion = \+\+this\._recentRequestVersion[\s\S]*requestVersion !== this\._recentRequestVersion/)
assert.match(leftCenterJs, /loadMoreConversations\(\)[\s\S]*this\._loadingFirstPage[\s\S]*requestVersion !== this\._recentRequestVersion/)
assert.match(leftCenterJs, /await Promise\.all\(\[[\s\S]*recentChanged \? this\.loadFirstPage\(false\)[\s\S]*pinnedChanged \? this\.loadPinnedFirstPage\(\)/)
assert.match(leftCenterJs, /listConversations\(\{ pageSize: PAGE_SIZE, offset: 0, keyword \}\)/)
assert.doesNotMatch(leftCenterJs, /syncConversationGroups/)
assert.doesNotMatch(leftCenterJs, /allConversations\.filter\(\(item\) => String\(item\?\.title/)
assert.match(leftCenterJs, /conversation\?\.pinnedAt \? t\(this\.properties\.language, 'chat\.unpin'\)/)
assert.match(leftCenterJs, /const pinned = !current\.pinnedAt[\s\S]*updateConversationPin\(\{ conversationId, pinned \}\)/)
assert.match(leftCenterJs, /replaceConversationInViews\(conversationId, conversation\)/)
assert.match(leftCenterJs, /removeConversationFromViews\(conversationId\)/)
assert.match(leftCenterJs, /historyController:\s*\{[\s\S]*?type:\s*Boolean[\s\S]*?value:\s*true/)
assert.match(leftCenterJs, /pinnedConversations:\s*\(state\) => filterVisibleConversations\(state\.pinnedChatHistory\?\.conversations\)/)
assert.match(leftCenterJs, /const historyController = this\.data\.historyController/)
assert.match(leftCenterJs, /if\(!historyController\)\s*\{\s*this\.triggerEvent\('refreshconversations'\)/)
const refreshConversationsBlock = leftCenterJs.slice(leftCenterJs.indexOf('refreshConversations(){'), leftCenterJs.indexOf('openConversationActions(e)'))
assert.doesNotMatch(refreshConversationsBlock, /setPinnedChatHistory\(\{\}\)|pinnedConversations:\s*\[\]/)
assert.match(refreshConversationsBlock, /loadFirstPage\(!this\.getCachedConversations\(\)\.length && !this\.getCachedPinnedConversations\(\)\.length\)/)
for (const method of ['openFeature', 'startNewConversation', 'closePage']) {
  const start = leftCenterJs.indexOf(method)
  const end = leftCenterJs.indexOf('\n    },', start)
  assert.match(leftCenterJs.slice(start, end), /triggerEvent\('requestclose'\)/)
  assert.doesNotMatch(leftCenterJs.slice(start, end), /wx\.navigateBack/)
}
const leftPageWxml = fs.readFileSync(path.join(__dirname, '../pages/leftpage/index.wxml'), 'utf8')
assert.match(indexWxml, /<yb-left-center[\s\S]*?history-controller="\{\{true\}\}"[\s\S]*?bind:requestclose="closeLeftPage"/)
assert.match(leftPageWxml, /<yb-left-center[\s\S]*?history-controller="\{\{false\}\}"/)
assert.match(leftPageWxml, /bind:refreshconversations="refreshConversations"/)
assert.match(leftPageWxml, /bind:loadmoreconversations="loadMoreConversations"/)
assert.match(leftPageWxml, /bind:loadmorepinnedconversations="loadMorePinnedConversations"/)
assert.match(leftPageWxml, /bind:requestclose="closePage"/)
assert.match(leftPageWxml, /<yb-flyout[\s\S]*id="conversationActions"/)
assert.doesNotMatch(leftPageWxml, /close-on-popup-tap/)
assert.match(leftPageWxml, /bind:tap="changeConversationAction"/)
assert.match(leftPageWxml, /<yb-confirm-dialog[\s\S]*centered="\{\{conversationDialog\.centered\}\}"[\s\S]*input-mode="\{\{conversationDialog\.inputMode\}\}"/)
assert.match(leftPageWxml, /<yb-confirm-dialog[\s\S]*style="position: relative; z-index: 999;"/)
assert.match(leftPageWxml, /bind:afterclose="conversationActionsHidden"/)
assert.match(leftPageWxml, /bind:conversationrenamed="conversationRenamed"/)
assert.match(leftPageWxml, /bind:conversationdeleted="conversationDeleted"/)
assert.match(leftPageWxml, /bind:conversationarchived="conversationArchived"/)
const leftPageJs = fs.readFileSync(path.join(__dirname, '../pages/leftpage/index.js'), 'utf8')
assert.match(leftPageJs, /refreshConversations\(\)[\s\S]*eventChannel\.emit\('refreshConversations'\)/)
assert.doesNotMatch(leftPageJs, /eventBus\.emit\(CHAT_SESSION_RESET/)
assert.match(leftPageJs, /function conversationDialog\(language, action = ''\)[\s\S]*sidebar\.archiveChat[\s\S]*sidebar\.renameChat[\s\S]*sidebar\.deleteChat/)
assert.match(leftPageJs, /const CONVERSATION_ACTION_METHODS = \{[\s\S]*archive: 'archiveConversation'[\s\S]*rename: 'renameConversation'[\s\S]*delete: 'deleteConversation'/)
assert.match(leftPageJs, /const ANCHORED_CONVERSATION_DIALOGS = new Set\(\['archive', 'delete'\]\)/)
assert.doesNotMatch(leftPageJs, /conversationDialog(?:Title|Message|InputMode|InputValue|Danger|ConfirmText|Centered|MessageAlign|MutedText|ConfirmTone)/)
assert.match(leftPageJs, /const conversationActions = \(options \|\| \[\]\)\.map\(item => \(\{ \.\.\.item \}\)\)/)
assert.match(leftPageJs, /conversationDialog: action === 'rename'[\s\S]*inputValue: conversation\.title \|\| ''/)
assert.match(leftPageJs, /const method = CONVERSATION_ACTION_METHODS\[action\][\s\S]*leftCenter\[method\]\(\.\.\.args\)/)
assert.match(leftPageJs, /ANCHORED_CONVERSATION_DIALOGS\.has\(action\) \? this\._activeConversationRect : undefined/)
assert.match(leftPageJs, /clearConversationActionContext\(\)[\s\S]*this\._activeConversationId = ''[\s\S]*this\._activeConversationRect = null/)
const leftRouteJs = fs.readFileSync(path.join(__dirname, '../pages/leftpage/router.js'), 'utf8')
assert.doesNotMatch(leftRouteJs, /opacity\s*:\s*primaryAnimationStatus/)
assert.match(leftRouteJs, /allowEnterRouteSnapshotting:\s*false/)
assert.match(leftRouteJs, /allowExitRouteSnapshotting:\s*false/)
const actionChangeBlock = leftPageJs.slice(leftPageJs.indexOf('changeConversationAction(e)'), leftPageJs.indexOf('confirmConversationAction(e)'))
assert.doesNotMatch(actionChangeBlock, /conversationDialog'\)\.show/)

let leftPageDefinition
vm.runInNewContext(leftPageJs.slice(leftPageJs.indexOf('const GestureState')), {
  t,
  Page: (definition) => { leftPageDefinition = definition }
})
const dialogState = {}
let actionMenuCloseCount = 0
leftPageDefinition.changeConversationAction.call({
  data: { applicationSettings: { language:'中文' } },
  _activeConversationId: 'conversation-1',
  selectComponent: (selector) => selector === '#leftCenter'
    ? { getConversation: () => ({ title: '原名称' }) }
    : { close: () => { actionMenuCloseCount += 1 } },
  setData: (updates) => Object.assign(dialogState, updates)
}, { currentTarget: { dataset: { value: 'rename' } } })
assert.equal(actionMenuCloseCount, 1)
assert.deepEqual(JSON.parse(JSON.stringify(dialogState.conversationDialog)), {
  title: '重命名聊天',
  message: '',
  inputMode: true,
  inputValue: '原名称',
  danger: false,
  confirmText: '保存',
  centered: true,
  messageAlign: 'center',
  mutedText: false,
  confirmTone: ''
})

const renameCalls = []
const actionContext = {
  setData: updates => Object.assign(dialogState, updates),
  _pendingConversationAction: 'rename',
  _activeConversationId: 'conversation-1',
  _activeConversationRect: { top: 100 },
  selectComponent: () => ({
    renameConversation: (...args) => renameCalls.push(args)
  }),
  clearConversationActionContext: leftPageDefinition.clearConversationActionContext
}
leftPageDefinition.confirmConversationAction.call(actionContext, { detail: { value: '新名称' } })
assert.deepEqual(renameCalls, [['conversation-1', '新名称']])
assert.deepEqual({
  action: actionContext._pendingConversationAction,
  id: actionContext._activeConversationId,
  rect: actionContext._activeConversationRect
}, { action: '', id: '', rect: null })

const anchorRect = { top: 200 }
const shownAnchors = []
leftPageDefinition.conversationActionsHidden.call({
  _pendingConversationAction: 'archive',
  _activeConversationRect: anchorRect,
  selectComponent: () => ({ show: (anchor) => shownAnchors.push(anchor) }),
  clearConversationActionContext: leftPageDefinition.clearConversationActionContext
})
leftPageDefinition.conversationActionsHidden.call({
  _pendingConversationAction: 'rename',
  _activeConversationRect: anchorRect,
  selectComponent: () => ({ show: (anchor) => shownAnchors.push(anchor) }),
  clearConversationActionContext: leftPageDefinition.clearConversationActionContext
})
assert.deepEqual(shownAnchors, [anchorRect, undefined])
const confirmDialogWxml = fs.readFileSync(path.join(__dirname, '../components/yb-confirm-dialog/index.wxml'), 'utf8')
const confirmDialogJs = fs.readFileSync(path.join(__dirname, '../components/yb-confirm-dialog/index.js'), 'utf8')
const confirmDialogWxss = fs.readFileSync(path.join(__dirname, '../components/yb-confirm-dialog/index.wxss'), 'utf8')
assert.match(confirmDialogWxml, /wx:if="\{\{inputMode\}\}"[\s\S]*maxlength="50"/)
assert.doesNotMatch(confirmDialogWxml, /root-portal/)
assert.match(confirmDialogWxml, /wx:if="\{\{centered\}\}" class="dialog-actions/)
assert.match(confirmDialogWxml, /class="dialog-btn[^\"]*" catch:tap="close"/)
assert.equal((confirmDialogWxml.match(/catch:tap="handleConfirm"/g) || []).length, 2)
assert.doesNotMatch(confirmDialogWxml, /dialog-overlay-centered/)
assert.match(confirmDialogWxml, /always-embed="\{\{true\}\}"[\s\S]*adjust-position="\{\{false\}\}"/)
assert.match(confirmDialogWxml, /bind:keyboardheightchange="handleKeyboardHeightChange"/)
assert.match(confirmDialogWxml, /<view class="dialog-overlay\b[^\"]*" bind:tap="close"/)
assert.doesNotMatch(confirmDialogWxml, /hidden="\{\{!dialogVisible\}\}"/)
assert.doesNotMatch(confirmDialogWxml, /dialog-dismiss-layer/)
assert.doesNotMatch(confirmDialogWxml, /class="dialog-container[^\"]*" (?:bind|catch|mark):/)
assert.match(confirmDialogWxml, /class="dialog-panel[^\"]*"[^>]*catch:tap="ignoreTap"/)
assert.match(confirmDialogWxml, /style="transform-origin: \{\{dialogTransformOrigin\}\};"/)
assert.match(confirmDialogWxml, /dialogVisible \? 'dialog-panel-visible'/)
assert.match(confirmDialogWxml, /class="dialog-content\b[^\"]*dc\b[^\"]*"/)
assert.doesNotMatch(confirmDialogWxml, /mark:inside/)
assert.doesNotMatch(confirmDialogWxml, /bind:touchstart="close"|catch:touchstart="catchClose"/)
assert.doesNotMatch(confirmDialogWxml, /mut-bind:tap=/)
assert.match(confirmDialogWxml, /class="dialog-title\b[^\"]*ft36\b[^\"]*text-strong/)
assert.match(confirmDialogWxml, /danger \|\| confirmTone === 'danger' \? 'danger(?: [^']*)?'/)
assert.match(confirmDialogWxml, /top: \{\{anchorPlacement === 'below-start' \? dialogTop \+ 'px' : 'auto'\}\}/)
assert.match(confirmDialogWxml, /bottom: \{\{anchorPlacement === 'below-start' \? 'auto' : dialogBottom \+ 'px'\}\}/)
assert.match(confirmDialogWxml, /left: \{\{dialogLeft\}\}px;/)
assert.match(confirmDialogWxss, /\.dialog-bubble\s*\{[^}]*width:\s*76vw;/)
assert.match(confirmDialogWxss, /\.dialog-bubble\s*\{[^}]*position:\s*relative;/)
assert.doesNotMatch(confirmDialogWxss, /\.dialog-bubble-centered\s*\{[^}]*width:/)
const dialogContainerStyle = confirmDialogWxss.match(/\.dialog-container\s*\{([^}]*)\}/)[1]
assert.match(dialogContainerStyle, /position:\s*absolute/)
assert.doesNotMatch(dialogContainerStyle, /position:\s*fixed/)
assert.doesNotMatch(dialogContainerStyle, /transform|opacity/)
assert.match(confirmDialogJs, /mutedText:\s*\{[\s\S]*?type: Boolean,[\s\S]*?value: false/)
assert.match(confirmDialogJs, /dialogVisible: false/)
assert.match(confirmDialogJs, /finishClose\(\)[\s\S]*dialogVisible: false/)
assert.match(confirmDialogJs, /const viewportHeight = windowHeight \|\| screenHeight/)
assert.match(confirmDialogJs, /const anchorCenter = Number\(anchorRect\.top\) \+ \(Number\(anchorRect\.height\) \|\| 0\) \/ 2/)
assert.match(confirmDialogJs, /const bottom = viewportHeight - anchorCenter \+ anchorGap/)
assert.match(confirmDialogJs, /applyAnimatedStyle\('\.dialog-overlay'[\s\S]*width: `\$\{this\.overlaySize\.value\}vw`/)
assert.match(confirmDialogJs, /applyAnimatedStyle\('\.dialog-panel'/)
assert.match(confirmDialogJs, /transform: `scale\(\$\{this\.dialogScale\.value\}\)`[\s\S]*opacity: `\$\{this\.dialogOpacity\.value\}`/)
assert.doesNotMatch(confirmDialogJs, /applyAnimatedStyle\('\.dialog-container'/)
assert.match(confirmDialogJs, /dialogScale/)
assert.match(confirmDialogJs, /\bspring\(/)
assert.match(confirmDialogJs, /calculateDialogTransformOrigin[\s\S]*boundingClientRect/)
assert.match(confirmDialogJs, /dialogTransformOrigin: CENTER_DIALOG_ORIGIN/)
assert.match(confirmDialogJs, /this\.dialogScale\.value = timing\(0, \{ duration: HIDE_DURATION \}/)
assert.match(confirmDialogJs, /this\.overlaySize\.value = 0[\s\S]*runOnJS\(finishClose\)\(\)/)
assert.match(confirmDialogWxss, /\.dialog-panel\s*\{[^}]*visibility:\s*hidden;/)
assert.match(confirmDialogWxss, /\.dialog-panel-visible\s*\{[^}]*visibility:\s*visible;/)
assert.match(confirmDialogWxss, /\.dialog-panel\s*\{[^}]*transform-origin:\s*50% 50%;/)
assert.doesNotMatch(confirmDialogWxss, /\.dialog-bubble::after/)
assert.match(confirmDialogJs, /inputFocused: false[\s\S]*runOnJS\(focusInput\)\(\)/)
assert.doesNotMatch(confirmDialogJs, /handleOverlayTap/)
assert.match(confirmDialogJs, /this\.data\.inputText\.trim\(\)[\s\S]*this\.data\.validationText/)
assert.match(confirmDialogJs, /close\(\) \{\s*this\.hide\(true\)/)
const confirmHandlerBlock = confirmDialogJs.slice(confirmDialogJs.indexOf('handleConfirm()'), confirmDialogJs.indexOf('\n    }\n  }\n})', confirmDialogJs.indexOf('handleConfirm()')))
assert.match(confirmHandlerBlock, /if \(this\._closing\) return/)
assert.match(confirmHandlerBlock, /this\.triggerEvent\('confirm'/)
assert.match(confirmHandlerBlock, /this\.hide\(false\)/)
assert.doesNotMatch(confirmHandlerBlock, /this\.close\(\)/)

let confirmDialogDefinition
vm.runInNewContext(confirmDialogJs, {
  getApp: () => ({ globalData: { su_system: { screenWidth: 400, screenHeight: 1000, windowHeight: 800 } } }),
  wx: {
    nextTick: (fn) => fn(),
    worklet: {
      shared: (value) => ({ value }),
      timing: (value) => value,
      spring: (value) => value,
      runOnJS: (fn) => fn
    }
  },
  Component: (definition) => { confirmDialogDefinition = definition }
})
const confirmCalls = []
confirmDialogDefinition.methods.handleConfirm.call({
  data: { inputMode: true, inputText: ' 新名称 ' },
  triggerEvent: (name, detail) => confirmCalls.push({ name, detail: { ...detail } }),
  hide: (notifyClose) => confirmCalls.push({ hide: notifyClose })
})
assert.deepEqual(confirmCalls, [
  { name: 'confirm', detail: { value: '新名称' } },
  { hide: false }
])

const keyboardPosition = {}
confirmDialogDefinition.methods.handleKeyboardHeightChange.call({
  data: { centered: true, inputMode: true },
  _closing: false,
  _keyboardHeight: 0,
  setData: (updates) => Object.assign(keyboardPosition, updates)
}, { detail: { height: 320 } })
assert.equal(keyboardPosition.dialogBottom, 160)

const anchoredDialogState = {}
confirmDialogDefinition.methods.show.call({
  data: { centered: false, inputMode: false, inputText: '', dialogVisible: true },
  dialogOpacity: { value: 0 },
  dialogScale: { value: 1 },
  overlaySize: { value: 0 },
  createSelectorQuery: () => ({
    select: () => ({
      boundingClientRect: (callback) => ({
        exec: () => callback({ left: 100, top: 300, width: 272, height: 300 })
      })
    })
  }),
  setData: (updates, callback) => {
    Object.assign(anchoredDialogState, updates)
    if (callback) callback()
  }
}, { top: 500, left: 40, width: 200, height: 56 })
assert.equal(anchoredDialogState.dialogBottom, 280)
assert.equal(800 - anchoredDialogState.dialogBottom, 520)
assert.equal(anchoredDialogState.dialogTransformOrigin, '40px 228px')

const dataControlJs = fs.readFileSync(path.join(__dirname, '../components/_self/yb-subsetting-data-control/index.js'), 'utf8').replace(/^import .*\n/gm, '')
assert.match(dataControlJs, /triggerEvent\('confirmrequest', \{[\s\S]*rect,[\s\S]*message:/)
assert.match(dataControlJs, /dataControl:\s*\{[\s\S]*type: Object/)
assert.match(dataControlJs, /triggerEvent\('change', \{[\s\S]*dataControl:dc/)
assert.match(dataControlJs, /triggerEvent\('action', \{ action \}\)/)
assert.doesNotMatch(dataControlJs, /createStoreBindings|settingApi|ACTION_API_MAP/)
const dataControlWxml = fs.readFileSync(path.join(__dirname, '../components/_self/yb-subsetting-data-control/index.wxml'), 'utf8')
assert.doesNotMatch(dataControlWxml, /<yb-confirm-dialog/)
const notificationJs = fs.readFileSync(path.join(__dirname, '../components/_self/yb-subsetting-notification/index.js'), 'utf8')
assert.match(notificationJs, /notification:\s*\{[\s\S]*type: Object/)
assert.match(notificationJs, /language:\s*\{[\s\S]*value: '中文'/)
assert.match(notificationJs, /triggerEvent\('change', \{[\s\S]*category,[\s\S]*channel:item\.key,[\s\S]*notification:notif/)
assert.doesNotMatch(notificationJs, /createStoreBindings|settingApi|\.\.\/\.\.\/store/)

let notificationDefinition
const notificationStorePath = path.join(__dirname, '../store/index.js')
const notificationStorage = { notification: {
  task: { wechat: false, email: false },
  recommend: { email: false, sms: true },
  usage: { email: 'invalid' }
} }
const notificationStoreContext = {
  require: createRequire(notificationStorePath), module: { exports: {} },
  wx: {
    getStorageSync: key => notificationStorage[key],
    setStorageSync: (key, value) => { notificationStorage[key] = value }
  }
}
vm.runInNewContext(fs.readFileSync(notificationStorePath, 'utf8')
  .replace(/import \{ observable, action \} from 'mobx-miniprogram'/, "const { observable, action } = require('mobx-miniprogram')")
  .replace(/export const /g, 'const ') + '\nmodule.exports = store', notificationStoreContext)
const notificationStore = notificationStoreContext.module.exports
assert.equal(notificationStore.notification.task.sms, false)
assert.equal(notificationStore.notification.task.wechat, false)
assert.equal(notificationStore.notification.recommend.sms, true)
assert.equal(notificationStore.notification.usage.sms, true)
notificationStore.setNotification({ task: { email: false } })
assert.equal(notificationStorage.notification.task.sms, false)
assert.ok(!('email' in notificationStorage.notification.task))
notificationStore.setNotification({ task: { sms: true } })
assert.equal(notificationStorage.notification.task.sms, true)
const notificationPath = path.join(__dirname, '../components/_self/yb-subsetting-notification/index.js')
vm.runInNewContext(notificationJs, {
  require: createRequire(notificationPath),
  Component: (definition) => { notificationDefinition = definition }
})
const notificationEvents = []
const notificationContext = {
  properties: { pageKey: 'notification_task', language: 'English' },
  data: {
    pageKey: 'notification_task',
    language: 'English',
    notification: { task: { wechat: true, sms: true } }
  },
  setData(updates) { Object.assign(this.data, updates) },
  triggerEvent(name, detail) { notificationEvents.push({ name, detail }) }
}
notificationContext.syncPage = (...args) => notificationDefinition.methods.syncPage.call(notificationContext, ...args)
notificationDefinition.methods.syncPage.call(notificationContext, 'notification', {
  reply: { wechat: false },
  task: { wechat: true, sms: true }
}, 'English')
assert.equal(notificationContext.data.summaryItems.find((item) => item.key === 'reply').value, 'Off')
assert.equal(notificationContext.data.summaryItems.find((item) => item.key === 'task').value, 'WeChat & SMS')
notificationDefinition.methods.syncPage.call(notificationContext, 'notification_task', notificationContext.data.notification, 'English')
assert.equal(notificationContext.data.locationsTitle, 'Where notified')
assert.deepEqual(
  JSON.parse(JSON.stringify(notificationContext.data.detailItems.map((item) => item.label))),
  ['WeChat', 'SMS']
)
assert.equal(notificationContext.data.detailHint, 'When your task changes.')
notificationDefinition.methods.handleSwitchChange.call(notificationContext, {
  detail: { item: { key: 'sms' }, checked: false }
})
assert.deepEqual(JSON.parse(JSON.stringify(notificationEvents)), [{
  name: 'change',
  detail: {
    category: 'task',
    channel: 'sms',
    enabled: false,
    notification: { task: { wechat: true, sms: false } }
  }
}])

let dataControlDefinition
vm.runInNewContext(dataControlJs, {
  wx: {},
  require: createRequire(path.join(__dirname, '../components/_self/yb-subsetting-data-control/index.js')),
  Component: (definition) => { dataControlDefinition = definition }
})
const dataControlEvents = []
const dataControlContext = {
  data: {
    dataControl: { improve_model: false, voice_record: false, voice_camera: true },
    pendingAction: 'archive_all'
  },
  setData(updates) { Object.assign(this.data, updates) },
  triggerEvent(name, detail) { dataControlEvents.push({ name, detail }) }
}
dataControlDefinition.methods.syncSwitchItems.call(dataControlContext, dataControlContext.data.dataControl)
dataControlDefinition.methods.handleSwitchChange.call(dataControlContext, {
  detail: { item: { key: 'voice_record' }, checked: true }
})
dataControlDefinition.methods.handleConfirmAction.call(dataControlContext)
assert.deepEqual(JSON.parse(JSON.stringify(dataControlEvents)), [
  {
    name: 'change',
    detail: {
      key: 'voice_record',
      checked: true,
      dataControl: { improve_model: false, voice_record: true, voice_camera: true }
    }
  },
  { name: 'action', detail: { action: 'archive_all' } }
])
assert.equal(dataControlContext.data.pendingAction, '')
const settingWxml = fs.readFileSync(path.join(__dirname, '../pages/setting/index.wxml'), 'utf8')
assert.match(settingWxml, /<yb-subsetting-data-control[\s\S]*id="dataControlSection"[\s\S]*bind:confirmrequest="handleDataControlConfirmRequest"/)
assert.match(settingWxml, /<yb-subsetting-data-control[\s\S]*data-control="\{\{dataControl\}\}"[\s\S]*bind:change="handleDataControlChange"[\s\S]*bind:action="handleDataControlAction"/)
assert.equal((settingWxml.match(/notification="\{\{notification\}\}"/g) || []).length, 2)
assert.equal((settingWxml.match(/language="\{\{applicationSettings\.language\}\}"/g) || []).length, 6)
assert.equal((settingWxml.match(/bind:change="handleNotificationChange"/g) || []).length, 2)
assert.match(settingWxml, /<yb-confirm-dialog[\s\S]*id="dataControlConfirmDialog"[\s\S]*style="position: relative; z-index: 999;"[\s\S]*message="\{\{dataControlConfirm\.message\}\}"[\s\S]*bind:confirm="handleDataControlConfirm"/)
const settingJs = fs.readFileSync(path.join(__dirname, '../pages/setting/index.js'), 'utf8')
assert.equal(require('../static_utils/longTermMemoryView').memorySections([{ id: 'test', content: '偏好', sourceMessageIds: [] }], 'zh-CN')[0].title, '记忆 1')
assert.match(settingJs, /async savePanel\(\)[\s\S]*await savePersonalization\(draft\)[\s\S]*this\.setPersonalization\(draft\)[\s\S]*i18n\.common\.saved/)
assert.doesNotMatch(settingJs, /savePersonalization\(draft\)\.catch\(\(\) => \{\}\)/)
assert.match(settingJs, /handleDataControlConfirmRequest\(e\)[\s\S]*if \(!rect\) return[\s\S]*dialog\.show\(rect\)/)
assert.match(settingJs, /handleDataControlConfirm\(\)[\s\S]*selectComponent\('#dataControlSection'\)/)
assert.match(settingJs, /handleNotificationChange\(e\)[\s\S]*this\.setNotification\(notification\)[\s\S]*updateNotification\(category, channel, enabled\)/)
assert.match(settingJs, /handleDataControlChange\(e\)[\s\S]*this\.setDataControl\(dataControl\)[\s\S]*updateDataControlSwitch\(key, checked\)/)
assert.match(settingJs, /handleDataControlAction\(e\)[\s\S]*DATA_CONTROL_ACTION_API_MAP\[action\][\s\S]*this\.resetChatForAccount\(action\)/)

const titleNavJs = fs.readFileSync(path.join(__dirname, '../components/_self/yb-title-nav/index.js'), 'utf8')
assert.match(titleNavJs, /featureMenuEnabled/)
assert.match(titleNavJs, /if\(!this\.data\.featureMenuEnabled\) return/)
const titleNavWxml = fs.readFileSync(path.join(__dirname, '../components/_self/yb-title-nav/index.wxml'), 'utf8')
assert.match(titleNavWxml, /wx:if="{{featureMenuEnabled}}"/)

const privateConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../project.private.config.json'), 'utf8'))
assert.equal(privateConfig.setting.compileHotReLoad, false)

console.log('homeFeature: ok')

// Create the native scroll handler together with its scroll-view after loading.
{
  const template = fs.readFileSync(path.join(__dirname, '../pages/setting/index.wxml'), 'utf8')
  const summary = template.match(/<view class="long-term-memory-panel\b[^\"]*">([\s\S]*?)<\/vertical-drag-gesture-handler>/)[1]
  assert.match(summary, /<yb-dot-matrix-loading\s+wx:if="{{longTermMemoryLoading}}"[^>]*\/>\s*<vertical-drag-gesture-handler\s+wx:else/)
  assert.match(summary, /<vertical-drag-gesture-handler[^>]*tag="longTermMemoryScroll"[^>]*native-view="scroll-view"[^>]*>\s*<scroll-view\s+class="long-term-memory-scroll\b[^\"]*"/)
  assert.match(summary, /worklet:onscrollupdate="handleLongTermMemoryScrollUpdate"/)
}

// Settings opened by the drawer must forward its category through both hosts.
{
  const sidebar = fs.readFileSync(path.join(__dirname, '../components/_self/yb-left-center/index.js'), 'utf8')
  const drawer = fs.readFileSync(path.join(__dirname, '../pages/leftpage/index.js'), 'utf8')
  let navigation
  const open = vm.runInNewContext('({' + sidebar.slice(sidebar.indexOf('    openSet(){'), sidebar.indexOf('    getCachedConversations(){')) + '})', {
    wx: { navigateTo: value => { navigation = value } }, triggerHaptic() {}
  }).openSet
  const home = { closeLeftPage() { closed++ }, data: { storageNavigationId: 0 }, setData(patch) { Object.assign(this.data, patch) } }
  const homeHandler = vm.runInNewContext('({' + indexJs.slice(indexJs.indexOf('  openStorageCategory(e)'), indexJs.indexOf('  openSet()')) + '})', { HOME_FEATURES }).openStorageCategory
  let closed = 0
  const drawerHandler = vm.runInNewContext('({' + drawer.slice(drawer.indexOf('  openStorageCategory(e)'), drawer.indexOf('  selectFeature(e)')) + '})').openStorageCategory
  const host = { eventChannel: { emit(name, data) { assert.equal(name, 'openStorageCategory'); homeHandler.call(home, data) } }, closePage() { closed++ } }
  open.call({ data: {}, triggerEvent(name, detail) { assert.equal(name, 'openstoragecategory'); drawerHandler.call(host, { detail }) } })
  for (const category of ['document', 'image']) {
    navigation.events.openStorageCategory({ category })
    assert.equal(home.data.currentFeature, 'library')
    assert.equal(home.data.storageCategory, category)
  }
  assert.equal(closed, 2)
  assert.equal(home.data.storageNavigationId, 2)
  assert.match(indexWxml, /bind:openstoragecategory="openStorageCategory"/)
  assert.match(fs.readFileSync(path.join(__dirname, '../pages/leftpage/index.wxml'), 'utf8'), /bind:openstoragecategory="openStorageCategory"/)
}

// The settings plugin entry returns home and activates the existing plugin view.
{
  const buildSets = vm.runInNewContext(settingJs.slice(settingJs.indexOf('function buildStaticSets('), settingJs.indexOf('function normalizeLanguageValue(')) + '; buildStaticSets', {
    t, PERSONALIZATION_TRAITS: []
  })
  const initialSetsStart = settingJs.indexOf('    customSets: [', settingJs.indexOf('// Setting data'))
  const initialSets = vm.runInNewContext('({' + settingJs.slice(initialSetsStart, settingJs.indexOf('    accountSets: [', initialSetsStart)) + '})', { t, DEFAULT_LANGUAGE: '中文' }).customSets
  for (const items of [initialSets, buildSets('中文').customSets, buildSets('English').customSets]) {
    const plugin = items.find(item => item.key === 'plugins')
    assert.equal(plugin.rightText, undefined)
    assert.equal(plugin.rightSet, true)
  }

  let back
  const tap = vm.runInNewContext('({' + settingJs.slice(settingJs.indexOf('  tapSetItem(e)'), settingJs.indexOf('  handleApplicationOptionChange(e)')) + '})', {
    wx: { navigateBack(options) { back = options } }
  }).tapSetItem
  const home = { data: { currentFeature: 'chat' }, setData(patch) { Object.assign(this.data, patch) }, switchHomeFeature: indexDefinition.switchHomeFeature }
  indexDefinition.openSet.call(home)
  const directNavigation = skillNavigations.at(-1)
  const page = { getOpenerEventChannel: () => ({ emit(name, data) { directNavigation.events[name](data) } }) }
  const event = { currentTarget: { dataset: { key: 'plugins', rightSet: true } } }
  tap.call(page, event)
  const pending = back
  tap.call(page, event)
  assert.equal(back, pending, 'repeated taps do not stack navigation')
  assert.equal(home.data.currentFeature, 'chat', 'wait for successful settings dismissal')
  back.complete()
  assert.equal(page._openingPlugins, false, 'failed navigation permits retry')
  tap.call(page, event)
  back.success()
  back.complete()
  assert.equal(home.data.currentFeature, 'plugins')

  const sidebar = fs.readFileSync(path.join(__dirname, '../components/_self/yb-left-center/index.js'), 'utf8')
  let drawerNavigation
  let closed = 0
  const open = vm.runInNewContext('({' + sidebar.slice(sidebar.indexOf('    openSet(){'), sidebar.indexOf('    getCachedConversations(){')) + '})', {
    wx: { navigateTo(options) { drawerNavigation = options } }, triggerHaptic() {}
  }).openSet
  home.data.currentFeature = 'chat'
  open.call({ data: {}, triggerEvent(name, data) {
    if (name === 'selectfeature') home.switchHomeFeature(data)
    else { assert.equal(name, 'requestclose'); closed++ }
  } })
  page.getOpenerEventChannel = () => ({ emit(name, data) { drawerNavigation.events[name](data) } })
  tap.call(page, event)
  back.success()
  back.complete()
  assert.equal(home.data.currentFeature, 'plugins')
  assert.equal(closed, 1, 'the sidebar uses its existing host close event')
}

const mcpCalls = []
const mcpChat = { resetChatSession:() => mcpCalls.push('reset'), prefillMcp:item => mcpCalls.push(item),
  prefillSkill:() => { throw new Error('MCP must not select a Skill') } }
skillHome.getChatView = () => mcpChat
skillHome._pendingSkillTrial = { item:skillDraft, kind:'mcp', epoch:trialStore.assetCacheEpoch }
indexDefinition.finishSkillTrial.call(skillHome)
assert.deepEqual(mcpCalls, ['reset', skillDraft])
const chatSource = fs.readFileSync(path.join(__dirname, '../components/_self/yb-chat-view/index.js'), 'utf8')
const prefill = chatSource.slice(chatSource.indexOf('    prefillMcp(item){'), chatSource.indexOf('    prefillSkill(item){')).trim().replace(/,$/, '')
const draftApi = vm.runInNewContext(`({${prefill}})`)
const drafts = []
const draftState = { properties:{ language:'English' }, data:{ selectedSkill:{ id:'old' } },
  clearSelectedFeature() { this.data.selectedSkill = null }, selectComponent:() => ({ setCopytext:text => drafts.push(text) }) }
draftApi.prefillMcp.call(draftState, { exampleMessage:'中文示例', exampleMessageEn:'English example' })
assert.equal(draftState.data.selectedSkill, null)
assert.deepEqual(drafts, ['English example'])
