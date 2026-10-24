const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

const homeSource = fs.readFileSync('pages/index/index.js', 'utf8')
const promptSource = fs.readFileSync('pages/loginPrompt/index.js', 'utf8')
const promptWxml = fs.readFileSync('pages/loginPrompt/index.wxml', 'utf8')
const appPages = JSON.parse(fs.readFileSync('app.json', 'utf8')).pages
assert.ok(appPages.includes('pages/loginPrompt/index'))
assert.match(promptWxml, /一起探索\{\{appName\}\}/)
assert.match(promptWxml, /通过小程序授权登录即可解锁\{\{appName\}\}全部能力/)
assert.match(promptWxml, /open-type="getPhoneNumber" bindgetphonenumber="handleGetPhoneNumber"/)
assert.match(promptWxml, /appStaticRoot \+ '\/login-prompt-hero\.webp'/)
assert.match(promptWxml, /src="\/static\/logs\/glog\.png"/)

async function check() {
  const calls = []
  const store = {
    appInfo: { appName: 'YuanAI' }, user: { login: false },
    resetAssetListCache() { calls.push('assets') },
    resetChatHistory() { calls.push('history') },
    resetChatMessageCache() { calls.push('messages') },
    resetChatRuns() { calls.push('runs') },
    setUser(user) { this.user = user; calls.push('user') }
  }
  let importResult, navigation, home, prompt
  const wx = {
    worklet: { shared: value => ({ value }), timing: value => value, runOnJS: fn => fn },
    navigateTo(options) { navigation = options; options.complete?.() },
    navigateBack() { calls.push('back') },
    nextTick(fn) { fn() },
    showLoading() { calls.push('loading') },
    hideLoading() { calls.push('hideLoading') },
    showToast() { calls.push('toast') }
  }
  const features = { CHAT: 'chat' }
  vm.runInNewContext(homeSource.slice(homeSource.indexOf('const GestureState')), {
    Page: definition => { home = definition }, wx, store,
    importConversationShare: () => importResult,
    HOME_FEATURES: features, CHAT_MODE_IDS: { TEMPORARY: 'temporary' },
    DEFAULT_POINT_COLOR: '#000', getAccentStyle: () => '',
    getApp: () => ({ globalData: { su_system: { screenWidth: 400 } } }),
    runOnJS: fn => fn, TRY_IT_ROUTE_TYPE: 'tryItRouterBuilder'
  })
  const page = {
    data: { currentFeature: 'chat' },
    setData(patch) { Object.assign(this.data, patch) },
    getLeftCenter() { return { refreshConversations: () => calls.push('refresh') } },
    loadConversation(id) { calls.push(`open:${id}`) },
    switchHomeFeature(value) { calls.push(`feature:${value}`) },
    openLoginPrompt: home.openLoginPrompt
  }
  page._pendingShare = { shareId: 'share', conversationId: 'source' }
  importResult = Promise.resolve({ data: { conversationId: 'copy' } })
  await home.resumeSharedConversation.call(page)
  assert.ok(calls.includes('open:copy'))
  assert.equal(page._pendingShare, null)

  calls.length = 0
  page._pendingShare = { shareId: 'share', conversationId: 'source' }
  importResult = Promise.reject({ data: { errorCode: 'SHARE_LOGIN_REQUIRED' } })
  await home.resumeSharedConversation.call(page)
  assert.equal(navigation.url, '/pages/loginPrompt/index')
  assert.equal(navigation.routeType, 'tryItRouterBuilder')
  assert.equal(page._shareAwaitingLogin, true)
  assert.equal(calls.includes('toast'), false)
  navigation.events.loginSuccess()
  assert.equal(page._shareAwaitingLogin, false)

  calls.length = 0
  page._pendingShare = { shareId: 'share', conversationId: 'source' }
  importResult = Promise.reject({ errCode: 403, errMsg: 'cloud.callHttpFunction:fail system error. code: 403' })
  await home.resumeSharedConversation.call(page)
  assert.equal(page._pendingShare, null)
  assert.deepEqual(calls, ['feature:chat'])

  vm.runInNewContext(promptSource.slice(promptSource.indexOf('const { shared')), {
    Page: definition => { prompt = definition }, wx, store, appStaticRoot: '',
    loginWithPhoneCode: async () => ({ user: { login: true, userId: 'recipient' } }),
    buildUserFromAccountSummary: user => user,
    initAppData: async () => calls.push('sync'),
    eventBus: { emit: (_, value) => calls.push(value.reason) },
    CHAT_SESSION_RESET: 'chatSessionReset',
    GestureState: { BEGIN: 1, ACTIVE: 2, END: 3, CANCELLED: 4 },
    Curves: {}, bottomSheetSuspendedCurve: () => () => {},
    clamp: (value, lower, upper) => Math.max(lower, Math.min(value, upper)),
    TRY_IT_ROUTE_DURATION: 250
  })
  let emitted = false
  const loginPage = {
    data: { loginPending: false },
    setData(patch) { Object.assign(this.data, patch) },
    getOpenerEventChannel() { return { emit(name) { assert.equal(name, 'loginSuccess'); emitted = true } } }
  }
  calls.length = 0
  await prompt.handleGetPhoneNumber.call(loginPage, { detail: { errMsg: 'getPhoneNumber:fail user deny' } })
  assert.deepEqual(calls, [])
  await prompt.handleGetPhoneNumber.call(loginPage, { detail: { errMsg: 'getPhoneNumber:ok', code: 'phone-code' } })
  assert.deepEqual(calls, ['loading', 'assets', 'history', 'messages', 'runs', 'login', 'user', 'sync', 'back', 'hideLoading'])
  assert.equal(emitted, true)
  assert.equal(store.user.login, true)
  assert.equal(loginPage.data.loginPending, false)
  console.log('loginPrompt: share landing and phone login passed')
}

check().catch(error => { console.error(error); process.exitCode = 1 })
