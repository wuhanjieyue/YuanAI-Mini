const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

function deferred() {
  let resolve
  let reject
  const promise = new Promise((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

const source = fs.readFileSync(path.join(__dirname, '../static_utils/appDataInit.js'), 'utf8')
  .replace(/^import .*$/gm, '')
  .replace(/^const \{ normalizeModeSelection \}.*$/m, '')
  .replace(/export function /g, 'function ')
  .concat('\nmodule.exports = { initAppData, loadModelCatalog, buildUserFromAccountSummary }\n')

const accountRequests = []
const settingsRequests = []
const modelRequests = []
const resets = { history: 0, cache: 0, assets: 0, events: 0 }
const DEFAULT_USER = { login: false, nickName: '登录', avatarUrl: 'default-avatar' }
const store = {
  user: { ...DEFAULT_USER },
  applicationSettings: { language: '中文' },
  chatAbout: {},
  suggest: {},
  personalization: { traits: { gentle: '默认', warm: '默认' } },
  notification: {},
  dataControl: {},
  modelCatalog: { accessPlan: 'guest', defaults: {}, models: [] },
  workModelSelection: { modelId: '', effortId: '' },
  setUser(value) { this.user = value },
  setApplicationSettings(value) { this.applicationSettings = value },
  setChatAbout(value) { this.chatAbout = value },
  setSuggest(value) { this.suggest = value },
  setPersonalization(value) { this.personalization = value },
  setNotification(value) { this.notification = value },
  setDataControl(value) { this.dataControl = value },
  setModelCatalog(value) { this.modelCatalog = value },
  setWorkModelSelection(value) { this.workModelSelection = value },
  resetAssetListCache() { resets.assets += 1 },
  resetChatHistory() { resets.history += 1 },
  resetChatMessageCache() { resets.cache += 1 }
}

const sandbox = {
  module: { exports: {} },
  exports: {},
  Promise,
  store,
  DEFAULT_USER,
  CHAT_SESSION_RESET: 'chatSessionReset',
  eventBus: { listeners:[], on(_event,fn){this.listeners.push(fn)}, emit(_event,data) { resets.events += 1;this.listeners.forEach(fn=>fn(data)) } },
  hasAccountSessionChanged(current, next) { return !!current.login !== !!next.login },
  fetchAccountSummary() {
    const request = deferred()
    accountRequests.push(request)
    return request.promise
  },
  fetchSettingsBootstrap() {
    const request = deferred()
    settingsRequests.push(request)
    return request.promise
  },
  fetchModelCatalog() {
    const request = deferred()
    modelRequests.push(request)
    return request.promise
  },
  normalizeModeSelection(catalog, modeId, selection) {
    if (!catalog.models.length) return { modelId: '', effortId: '' }
    return selection && selection.modelId
      ? selection
      : { modelId: 'yuan-go', effortId: catalog.accessPlan === 'guest' ? 'light' : 'high' }
  }
}

vm.runInNewContext(source, sandbox)
const { initAppData, loadModelCatalog, buildUserFromAccountSummary } = sandbox.module.exports

const settle = async () => { for(let index=0;index<10;index++) await Promise.resolve() }
async function run() {
  store.user = { login: true, userId: 'old-user', subscription: 'pro', avatarFileID: 'old-avatar', avatarUrlExpiresAt: 123 }
  const freshUser = buildUserFromAccountSummary({ login: true, userId: 'new-user', subscription: 'basic', avatarUrl: '' })
  assert.equal(freshUser.userId, 'new-user')
  assert.equal(freshUser.subscription, 'basic')
  assert.equal(freshUser.avatarUrl, '')
  assert.equal(freshUser.avatarFileID, undefined, 'account summaries must not inherit the previous avatar')
  assert.equal(freshUser.avatarUrlExpiresAt, undefined)
  assert.equal(buildUserFromAccountSummary({ login: false }).login, false)
  store.user = { ...DEFAULT_USER }
  const first = initAppData()
  assert.strictEqual(initAppData(), first, '并发启动应复用同一个 Promise')
  const modelReady = loadModelCatalog()
  assert.strictEqual(modelRequests.length, 1, '聊天模型就绪应复用启动阶段的目录请求')
  modelRequests[0].resolve({ accessPlan: 'guest', defaults: { work: 'yuan-go' }, models: [{ id: 'yuan-go' }] })
  await modelReady
  assert.equal(store.modelCatalog.models[0].id, 'yuan-go', '模型目录不应等待账号和设置请求')

  const forced = initAppData({ force: true })
  accountRequests[1].resolve({ login: true, userId: 'new-user', nickName: '新用户' })
  await settle()
  settingsRequests[0].resolve({ settings: { personalization: { traits: { gentle: '增强' } }, dataControl: { improve_model: false } } })
  modelRequests[1].resolve({ accessPlan: 'user', defaults: { work: 'yuan-go' }, models: [{ id: 'yuan-go' }] })
  await forced

  accountRequests[0].resolve({ login: false })
  await first

  assert.strictEqual(store.user.userId, 'new-user', '过期请求不能覆盖强制刷新结果')
  assert.strictEqual(store.personalization.traits.gentle, '增强')
  assert.strictEqual(store.personalization.traits.warm, '默认', '嵌套设置应保留未返回字段')
  assert.equal(store.dataControl.improve_model, false, 'bootstrap uses the current flat dataControl contract')
  assert.strictEqual(store.modelCatalog.accessPlan, 'user')
  assert.deepStrictEqual(store.workModelSelection, { modelId: 'yuan-go', effortId: 'high' })
  assert.deepStrictEqual(resets, { history: 1, cache: 1, assets: 1, events: 1 })

  await initAppData()
  assert.strictEqual(accountRequests.length, 2, '成功同步后普通调用不应再次请求')
  assert.strictEqual(modelRequests.length, 2, '成功同步后模型目录不应再次请求')

  const failedRefresh = initAppData({ force: true })
  accountRequests[2].resolve({ login: true, userId: 'new-user' })
  await settle()
  settingsRequests[1].resolve({ settings: {} })
  modelRequests[2].reject(new Error('目录失败'))
  await failedRefresh
  assert.strictEqual(store.modelCatalog.accessPlan, 'user', '目录失败时应保留最近一次成功缓存')

  const retry = initAppData()
  accountRequests[3].resolve({ login: true, userId: 'new-user' })
  await settle()
  assert.strictEqual(modelRequests.length, 4, '账号确认后重新拉取目录')
  settingsRequests[2].resolve({ settings: {} })
  modelRequests[3].resolve(store.modelCatalog)
  await retry
  console.log('appDataInit tests passed')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
