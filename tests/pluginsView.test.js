const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { messages } = require('../static_utils/i18n')
const i18nBehavior = require('../static_utils/i18n/behavior')

const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'components/_self/yb-plugins-view/index.js'), 'utf8').replace(/^import .*$/gm, '')
const flush = () => new Promise(resolve => setImmediate(resolve))
const ids = items => Array.from(items, item => item.id)
const installedIds = ['image_generation', 'deep_research', 'web_search', 'study']
const item = id => ({ id, title: id, titleEn:`English ${id}`, description: `Server description for ${id}`, logoUrl: `https://example.test/${id}.png`, installed: false, enabled: true, globalDefault: installedIds.includes(id) })
const sampleItems = [...installedIds.map(id => ({ ...item(id), installed: true })), item('test_travel'), item('test_meeting')]
const matchingItems = query => sampleItems.filter(item => [item.id, item.title, item.description].some(value => value.toLowerCase().includes(query.trim().toLowerCase())))
const skillRequests = {
  listInstalledSkills: async () => ({ items: sampleItems.filter(item => item.installed) }),
  listRecommendedSkills: async ({ query }) => ({ items: matchingItems(query), nextCursor: '', hasMore: false })
}

function createInstance(transport = skillRequests, mcpTransport = {}) {
  const styles = {}, saved = [], events = [], requests = [], toasts = [], closed = []
  const store = { user: { login: true, userId: 'account-A' }, assetCacheEpoch: 0 }
  let definition, hiddenKeyboards = 0, accountObserver, lastAccountKey, disposed = false
  const reaction = (read, callback, options = {}) => {
    accountObserver = { read, callback }
    lastAccountKey = read()
    if (options.fireImmediately) callback(lastAccountKey)
    return () => { disposed = true; accountObserver = null }
  }
  const api = Object.fromEntries(['listInstalledSkills', 'listRecommendedSkills', 'enableSkill', 'removeSkill', 'trySkill'].map(name => [name, options => {
    requests.push({ name, options: { ...options } })
    return transport[name](options)
  }]))
  vm.runInNewContext(source, {
    Component: value => { definition = value },
    require: name => name.includes('request/skills') ? api
      : name.includes('request/mcps') ? mcpTransport
      : name.includes('mobx-miniprogram') ? { reaction }
      : name.includes('store/index') ? { store }
      : name.includes('i18n/behavior') ? i18nBehavior
      : name.includes('chatFeature') ? require('../static_utils/chatFeature')
      : name.includes('searchAnimation') ? require('../static_utils/searchAnimation') : {},
    rpx2px: (value, width) => value * width / 750,
    wx: {
      getWindowInfo: () => ({ windowHeight: 844, screenHeight: 844, screenWidth: 375 }),
      getStorageSync: () => 260,
      setStorage: value => saved.push(value),
      hideKeyboard: () => { hiddenKeyboards++ },
      showToast: value => toasts.push(value),
      nextTick: callback => callback(),
      worklet: { shared: value => ({ value }), timing: value => value, Easing: {} }
    }
  })
  const instance = {
    ...definition.methods,
    properties: { language: '中文' },
    data: { ...i18nBehavior.data, ...JSON.parse(JSON.stringify(definition.data)) },
    dataChanges: 0,
    setData(patch, callback) { this.dataChanges++; Object.assign(this.data, patch); callback?.() },
    applyAnimatedStyle(selector, callback) { styles[selector] = callback },
    triggerEvent: (name, detail) => events.push({ name, detail }),
    selectComponent: selector => ({ close:() => closed.push(selector) })
  }
  i18nBehavior.observers.language.call(instance, '中文')
  assert.equal(requests.length, 0, 'language observation before attachment does not request data')
  definition.lifetimes.attached.call(instance)
  return {
    instance, definition, styles, saved, events, requests, store, toasts, closed,
    changeAccount(user, resetEpoch = true) {
      store.user = user
      if (resetEpoch) store.assetCacheEpoch++
      if (!accountObserver) return
      const key = accountObserver.read()
      if (key !== lastAccountKey) { lastAccountKey = key; accountObserver.callback(key) }
    },
    get hiddenKeyboards() { return hiddenKeyboards },
    get disposed() { return disposed }
  }
}

function deferredTransport() {
  const pending = []
  const api = Object.fromEntries(['listInstalledSkills', 'listRecommendedSkills'].map(name => [name, () => new Promise((resolve, reject) => {
    pending.push({ name, resolve, reject })
  })]))
  return { api, pending }
}

async function main() {
  const tool = { ...item('dashscope'), title:'股票 MCP', titleEn:'Stock MCP', descriptionEn:'Stock quotes' }
  let mcpReads = 0
  const categories = createInstance(skillRequests, {
    listInstalledMcps: async () => { mcpReads++; return { items:[] } },
    listRecommendedMcps: async () => { mcpReads++; return { items:[tool], nextCursor:'', hasMore:false } },
    tryMcp: async () => ({ ...tool, installed:true, enabled:true, exampleMessage:'使用股票 MCP 查询上证指数' }),
    enableMcp: async () => ({ ...tool, installed:true, enabled:true }),
    removeMcp: async () => ({ ...tool, installed:false, enabled:false })
  })
  await flush()
  assert.equal(categories.instance.data.category, 'skills')
  assert.deepEqual(Array.from(categories.instance.data.categoryOptions, x => x.id), ['skills','tools','plugins'])
  categories.instance.selectCategory({ detail:{ id:'tools' } })
  await flush()
  assert.equal(mcpReads, 2)
  assert.equal(categories.instance.data.recommendedItems[0].id, 'dashscope')
  categories.instance.openSkill({ currentTarget:{ dataset:{ id:'dashscope' } } })
  assert.equal(categories.events.at(-1).detail.kind, 'mcp')
  await categories.instance.handleSkillAction({ currentTarget:{ dataset:{ id:'dashscope', action:'enable' } } })
  await flush()
  await categories.instance.handleSkillAction({ currentTarget:{ dataset:{ id:'dashscope', action:'chat' } } })
  assert.equal(categories.events.at(-1).detail.kind, 'mcp')
  categories.instance.data.query = 'old search'
  categories.instance.selectCategory({ detail:{ id:'plugins' } })
  await flush()
  assert.equal(categories.instance.data.query, '')
  assert.equal(categories.instance.data.loading, false)
  assert.equal(categories.instance.data.installedItems.length, 0)
  const readsAtEmpty = mcpReads
  categories.instance.selectCategory({ detail:{ id:'skills' } })
  await flush()
  assert.equal(mcpReads, readsAtEmpty)
  categories.definition.lifetimes.detached.call(categories.instance)

  const harness = createInstance()
  const { instance, definition, styles, saved, events, requests } = harness
  const search = async value => { instance.handleSearch({ detail: { value } }); await flush() }
  await flush()
  assert.deepEqual(ids(instance.data.installedItems), installedIds)
  assert.equal(instance.data.recommendedItems.length, 6)
  assert.deepEqual(ids(instance.data.recommendedItems.filter(item => item.installed)), installedIds)
  assert.equal(instance.data.recommendedItems.filter(item => !item.installed).length, 2)
  assert.deepEqual(requests[0], { name: 'listInstalledSkills', options: {} }, 'installed list requests all items without search or pagination')
  assert.deepEqual(requests[1], { name: 'listRecommendedSkills', options: { query: '', cursor: '', limit: 25 } })
  assert.equal(instance.data.loading, false)
  assert.equal(instance.data.installedLoading, false)
  assert.equal(instance.data.hasMore, false)
  for (const entry of instance.data.recommendedItems) assert.ok(entry.title && entry.description && entry.logoUrl)
  const rawWebSearch = sampleItems.find(item => item.id === 'web_search')
  for (const query of [' WEB_SEARCH ', rawWebSearch.title, rawWebSearch.description]) {
    await search(query)
    assert.deepEqual(ids(instance.data.installedItems), installedIds, 'recommendation searches leave installed Skills visible')
    assert.deepEqual(ids(instance.data.recommendedItems), ['web_search'])
    assert.equal(requests.at(-1).options.cursor, '', 'search restarts recommendations from the first page')
  }
  await search(sampleItems.find(item => item.id === 'test_travel').description)
  assert.deepEqual(ids(instance.data.installedItems), installedIds)
  assert.deepEqual(ids(instance.data.recommendedItems), ['test_travel'], 'descriptions are searchable')
  await search('no-plugin-can-match-this')
  assert.deepEqual(ids(instance.data.installedItems), installedIds)
  assert.equal(instance.data.recommendedItems.length, 0)
  await search(' WEB_SEARCH ')
  const beforeLanguage = requests.length
  instance.properties.language = 'English'
  i18nBehavior.observers.language.call(instance, 'English')
  definition.observers.language.call(instance, 'English')
  await flush()
  assert.equal(instance.data.query, ' WEB_SEARCH ', 'language changes preserve the active query')
  assert.deepEqual(ids(instance.data.recommendedItems), ['web_search'])
  assert.equal(instance.data.recommendedItems[0].title, rawWebSearch.title, 'backend copy remains unchanged after a UI language change')
  assert.equal(instance.data.recommendedItems[0].displayTitle, rawWebSearch.titleEn)
  assert.equal(instance.data.installedItems[0].displayTitle, sampleItems[0].titleEn)
  assert.equal(instance.data.i18n.plugins.recommended, messages('English').plugins.recommended)
  assert.equal(requests.length, beforeLanguage, 'a label-only language change does not refetch raw server content')
  instance.properties.language = '中文'
  definition.observers.language.call(instance, '中文')
  assert.equal(instance.data.recommendedItems[0].displayTitle, rawWebSearch.title)
  for (const [query, id] of [
    [sampleItems[0].title.toUpperCase(), 'image_generation'],
    [sampleItems.find(item => item.id === 'test_meeting').description.toUpperCase(), 'test_meeting']
  ]) {
    await search(query)
    assert.deepEqual(ids(instance.data.recommendedItems), [id], 'backend search responses are displayed without local filtering')
  }

  assert.equal(styles['.plugins-scroll']().height, '844px')
  instance.handleSearchFocus()
  assert.equal(instance._keyboardOffset.value, 272)
  assert.equal(styles['.plugins-search-row']().transform, 'translateY(-272px)')
  assert.equal(styles['.plugins-scroll']().height, '572px')
  instance.handleSearchKeyboardHeightChange({ detail: { height: 320 } })
  assert.equal(instance._keyboardOffset.value, 332)
  assert.equal(styles['.plugins-scroll']().height, '512px')
  assert.equal(saved.at(-1).key, 'keyHeight')
  assert.equal(saved.at(-1).data, 320)
  for (const height of [0, -5, 'invalid']) {
    instance.handleSearchKeyboardHeightChange({ detail: { height } })
    assert.equal(instance._keyboardOffset.value, 0)
    assert.equal(styles['.plugins-scroll']().height, '844px')
  }
  instance.handleSearchFocus()
  instance.data.inputFocus = true
  instance.handleSearchBlur()
  assert.equal(instance.data.inputFocus, false)
  assert.equal(instance._keyboardOffset.value, 0)
  instance.handleSearchFocus()
  instance.data.inputFocus = true
  instance.clearSearch()
  instance.handleSearchKeyboardUpdate({ detail: { height: 0 } })
  await flush()
  assert.equal(instance.data.query, '')
  assert.equal(instance.data.inputFocus, false)
  assert.equal(harness.hiddenKeyboards, 1)
  assert.deepEqual(ids(instance.data.installedItems), installedIds)
  assert.equal(instance.data.recommendedItems.length, 6)
  assert.equal(requests.filter(request => request.name === 'listInstalledSkills').length, 1, 'search and clear never refetch installed Skills')
  assert.equal(styles['.plugins-scroll']().height, '844px')
  assert.equal(styles['.plugins-search']().right, '0px')
  assert.equal(Number(styles['.plugins-clear']().opacity), 0)
  instance.handleNavHeightChange({ detail: { height: 144 } })
  for (const height of [0, -1, NaN]) instance.handleNavHeightChange({ detail: { height } })
  assert.equal(instance.data.navHeight, 144)
  for (const id of ['image_generation', 'test_travel']) instance.openSkill({ currentTarget: { dataset: { id } } })
  assert.deepEqual(events.map(event => ({ name: event.name, detail: { ...event.detail } })), [
    { name: 'openSkill', detail: { id: 'image_generation' } },
    { name: 'openSkill', detail: { id: 'test_travel' } }
  ], 'installed and recommended items open details')
  instance.openSkill({ currentTarget: { dataset: { id: 'unknown-skill' } } })
  instance.ignoreAction()
  assert.equal(events.length, 2, 'invalid IDs and management icons do not open details')
  const beforeDefaultRemoval = requests.length
  for (const id of installedIds) await instance.handleSkillAction({ currentTarget: { dataset: { id, action: 'remove' } } })
  assert.equal(requests.length, beforeDefaultRemoval, 'all four default plugins reject removal actions')
  instance.openLeft()
  assert.equal(events.at(-1).name, 'openLeft')

  const pages = deferredTransport()
  const paged = createInstance(pages.api)
  assert.equal(pages.pending.length, 2, 'installed and recommended requests start in parallel')
  assert.equal(paged.instance.data.installedLoading, true)
  assert.equal(paged.instance.data.loading, true)
  await paged.instance.loadMoreSkills()
  assert.equal(pages.pending.length, 2, 'pagination waits for the first page')
  pages.pending[0].resolve({ items: [{ ...item('installed'), installed: true }] })
  await flush()
  assert.equal(paged.instance.data.installedLoading, false, 'installed skeleton stops independently of recommendation loading')
  assert.equal(paged.instance.data.loading, true)
  pages.pending[1].resolve({ items: [item('first')], nextCursor: '25', hasMore: true })
  await flush()
  const nextPage = paged.instance.loadMoreSkills()
  await paged.instance.loadMoreSkills()
  assert.equal(pages.pending.length, 3, 'repeated scroll events share the active next-page request')
  paged.instance.properties.language = 'English'
  paged.definition.observers.language.call(paged.instance, 'English')
  assert.equal(paged.instance.data.nextCursor, '25', 'language changes preserve pagination position')
  assert.deepEqual(paged.requests.at(-1), { name: 'listRecommendedSkills', options: { query: '', cursor: '25', limit: 25 } })
  pages.pending[2].reject(new Error('temporary next-page failure'))
  await nextPage
  assert.deepEqual(ids(paged.instance.data.recommendedItems), ['first'], 'pagination errors preserve existing recommendations')
  assert.equal(paged.instance.data.loadingMore, false)
  assert.equal(paged.instance.data.recommendedFailed, true)
  assert.equal(paged.instance.data.nextCursor, '25')
  paged.instance.retrySkills()
  assert.equal(pages.pending.length, 4)
  assert.equal(paged.requests.at(-1).options.cursor, '25', 'retry resumes the failed page')
  pages.pending[3].resolve({ items: [item('second')], nextCursor: '', hasMore: false })
  await flush()
  assert.deepEqual(ids(paged.instance.data.recommendedItems), ['first', 'second'])
  assert.equal(paged.instance.data.recommendedItems[1].displayTitle, 'English second', 'late page responses use the current language')
  assert.deepEqual(ids(paged.instance.data.installedItems), ['installed'], 'recommendation pagination does not refetch installed Skills')
  assert.equal(paged.instance.data.recommendedFailed, false)
  await paged.instance.loadMoreSkills()
  assert.equal(pages.pending.length, 4, 'the final page prevents further requests')

  const failures = deferredTransport()
  const partial = createInstance(failures.api)
  failures.pending[0].reject(new Error('installed unavailable'))
  failures.pending[1].resolve({ items: [item('recommended')], nextCursor: '', hasMore: false })
  await flush()
  assert.equal(partial.instance.data.installedFailed, true)
  assert.equal(partial.instance.data.recommendedFailed, false)
  assert.deepEqual(ids(partial.instance.data.recommendedItems), ['recommended'], 'one list failure does not discard the other list')
  partial.instance.loadInstalledSkills()
  assert.equal(partial.requests.at(-1).name, 'listInstalledSkills', 'installed retry only reloads installed Skills')
  assert.deepEqual(ids(partial.instance.data.recommendedItems), ['recommended'])
  failures.pending[2].resolve({ items: [] })
  await flush()
  assert.equal(partial.instance.data.installedFailed, false)
  assert.equal(partial.instance.data.installedLoading, false)
  assert.equal(partial.instance.data.installedItems.length, 0)

  const independent = deferredTransport()
  const independentHarness = createInstance(independent.api)
  independent.pending[1].resolve({ items: [], nextCursor: '', hasMore: false })
  await flush()
  assert.equal(independentHarness.instance.data.loading, false, 'recommendation empty state can settle before installed Skills')
  assert.equal(independentHarness.instance.data.installedLoading, true)
  independent.pending[0].resolve({ items: [] })
  await flush()
  assert.equal(independentHarness.instance.data.installedLoading, false)
  assert.equal(independentHarness.instance.data.installedItems.length, 0)

  const firstFailure = deferredTransport()
  const failedRecommendations = createInstance(firstFailure.api)
  firstFailure.pending[0].resolve({ items: [{ ...item('installed'), installed: true }] })
  firstFailure.pending[1].reject(new Error('recommendations unavailable'))
  await flush()
  assert.equal(failedRecommendations.instance.data.loading, false)
  assert.equal(failedRecommendations.instance.data.recommendedFailed, true)
  failedRecommendations.instance.retrySkills()
  assert.equal(firstFailure.pending.length, 3, 'recommendation retry does not reset installed Skills')
  assert.deepEqual(ids(failedRecommendations.instance.data.installedItems), ['installed'])
  firstFailure.pending[2].resolve({ items: [], nextCursor: '', hasMore: false })
  await flush()
  assert.equal(failedRecommendations.instance.data.recommendedFailed, false)

  const race = deferredTransport()
  const racing = createInstance(race.api)
  racing.instance.handleSearch({ detail: { value: 'web_search' } })
  assert.equal(race.pending.length, 3, 'search only starts another recommendation request')
  race.pending[0].resolve({ items: [{ ...item('old-installed'), installed: true }] })
  race.pending[1].resolve({ items: [item('old-recommended')], nextCursor: '25', hasMore: true })
  await flush()
  assert.equal(racing.instance.data.loading, true, 'old requests cannot clear a newer search loading state')
  assert.equal(racing.instance.data.recommendedItems.length, 0)
  assert.deepEqual(ids(racing.instance.data.installedItems), ['old-installed'], 'search does not invalidate the same account installation request')
  racing.changeAccount({ login: true, userId: 'account-B' })
  assert.deepEqual(racing.requests.at(-1).options, { query: 'web_search', cursor: '', limit: 25 })
  assert.equal(racing.instance.data.installedItems.length, 0, 'account changes immediately clear installed data')
  assert.equal(racing.instance.data.nextCursor, '', 'account changes reset pagination')
  race.pending[2].resolve({ items: [item('old-account')] })
  await flush()
  assert.equal(racing.instance.data.loading, true)
  race.pending[3].resolve({ items: [item('current')] })
  race.pending[4].resolve({ items: [item('current')], nextCursor: '25', hasMore: true })
  await flush()
  assert.deepEqual(ids(racing.instance.data.recommendedItems), ['current'])
  const stalePage = racing.instance.loadMoreSkills()
  racing.instance.handleSearch({ detail: { value: 'study' } })
  race.pending[5].resolve({ items: [item('stale-page')], nextCursor: '', hasMore: false })
  await stalePage
  assert.equal(racing.instance.data.recommendedItems.length, 0, 'a page from the previous search cannot append to the new search')
  assert.equal(racing.instance.data.loading, true)
  racing.definition.lifetimes.detached.call(racing.instance)
  const detachedChanges = racing.instance.dataChanges
  race.pending[6].resolve({ items: [item('detached')], nextCursor: '', hasMore: false })
  await flush()
  await racing.instance.loadSkills()
  racing.changeAccount({ login: false, userId: '' })
  assert.equal(racing.disposed, true, 'detach disposes the account reaction')
  racing.instance.openSkill({ currentTarget: { dataset: { id: 'current' } } })
  assert.equal(racing.instance.dataChanges, detachedChanges, 'unloaded components ignore late results and new requests')
  assert.equal(race.pending.length, 7)
  assert.equal(racing.events.filter(event => event.name !== 'actionschange').length, 0)

  const accountPages = deferredTransport()
  const accountHarness = createInstance(accountPages.api)
  accountPages.pending[0].resolve({ items: [item('account-A-installed')] })
  accountPages.pending[1].resolve({ items: [item('account-A-recommended')], nextCursor: 'opaque-account-A', hasMore: true })
  await flush()
  const accountPage = accountHarness.instance.loadMoreSkills()
  accountHarness.changeAccount({ login: false, userId: '' })
  assert.equal(accountHarness.instance.data.installedItems.length, 0, 'logout clears signed-in installation state before the guest response')
  assert.equal(accountHarness.instance.data.recommendedItems.length, 0)
  assert.equal(accountHarness.instance.data.hasMore, false)
  accountPages.pending[2].resolve({ items: [item('account-A-late')], nextCursor: '', hasMore: false })
  await accountPage
  assert.equal(accountHarness.instance.data.recommendedItems.length, 0, 'signed-in pagination cannot append to the guest list')
  accountPages.pending[3].resolve({ items: [] })
  accountPages.pending[4].resolve({ items: [item('guest-public')], nextCursor: '', hasMore: false })
  await flush()
  assert.deepEqual(ids(accountHarness.instance.data.recommendedItems), ['guest-public'])
  accountHarness.changeAccount({ login: false, userId: '' })
  assert.equal(accountHarness.instance.data.recommendedItems.length, 0, 'a guest epoch change invalidates the previous guest owner too')
  assert.equal(accountPages.pending.length, 7)
  const beforeProfile = accountPages.pending.length
  accountHarness.changeAccount({ login: false, userId: '', nickName: 'refreshed' }, false)
  assert.equal(accountPages.pending.length, beforeProfile, 'profile-only changes do not count as an identity switch')
  accountPages.pending[5].resolve({ items: [] })
  accountPages.pending[6].resolve({ items: [item('new-guest')], nextCursor: '', hasMore: false })
  await flush()
  assert.deepEqual(ids(accountHarness.instance.data.recommendedItems), ['new-guest'])

  const pendingActions = []
  let installedState = false
  const extra = item('new_skill')
  const actions = createInstance({
    listInstalledSkills: async () => ({items:installedState ? [{...extra,installed:true}] : []}),
    listRecommendedSkills: async () => ({items:[extra],hasMore:false,nextCursor:''}),
    ...Object.fromEntries(['enableSkill','removeSkill','trySkill'].map(name => [name, () => new Promise((resolve,reject) => pendingActions.push({name,resolve,reject}))]))
  })
  await flush()
  const tap = action => ({currentTarget:{dataset:{id:'new_skill',action}}})
  const add = actions.instance.handleSkillAction(tap('enable'))
  assert.equal(actions.instance.data.pendingIds.new_skill,true)
  await actions.instance.handleSkillAction(tap('enable'))
  assert.equal(pendingActions.length,1,'repeated taps share one enable request')
  installedState = true
  pendingActions[0].resolve({...extra,installed:true,enabled:true})
  await add; await flush()
  assert.equal(actions.instance.data.pendingIds.new_skill,undefined)
  assert.equal(actions.instance.data.recommendedItems[0].installed,true)
  assert.deepEqual(ids(actions.instance.data.installedItems),['new_skill'])
  // A page already in flight must not overwrite a completed mutation.
  assert.equal(actions.instance.presentSkills([extra])[0].installed,true)
  await actions.instance.handleSkillAction(tap('preview'))
  assert.equal(actions.events.at(-1).name,'openSkill')
  const remove = actions.instance.handleSkillAction(tap('remove'))
  installedState = false
  pendingActions[1].resolve({...extra,installed:false,enabled:false})
  await remove; await flush()
  assert.equal(actions.instance.data.installedItems.length,0)
  assert.equal(actions.instance.data.recommendedItems[0].installed,false)
  const failure = actions.instance.handleSkillAction(tap('enable'))
  pendingActions[2].reject(new Error('offline')); await failure
  assert.equal(actions.instance.data.recommendedItems[0].installed,false)
  assert.equal(actions.instance.data.pendingIds.new_skill,undefined)
  assert.equal(actions.toasts.at(-1).title,'offline')
  const restore = actions.instance.handleSkillAction(tap('enable'))
  installedState = true
  pendingActions[3].resolve({...extra,installed:true,enabled:true});await restore;await flush()
  const chat = actions.instance.handleSkillAction(tap('chat'))
  const trial = {...extra,installed:true,enabled:true,exampleMessage:'请帮我润色这段产品介绍。'}
  pendingActions[4].resolve(trial);await chat
  assert.equal(actions.events.at(-1).name,'trySkill')
  assert.equal(actions.events.at(-1).detail.item.exampleMessage,trial.exampleMessage)
  assert.equal(actions.closed.at(-1),'#skill-menu-new_skill')
  const late = actions.instance.handleSkillAction(tap('remove'))
  actions.changeAccount({login:true,userId:'account-B'})
  await flush()
  pendingActions[5].resolve({...extra,installed:false,enabled:false});await late
  assert.equal(actions.instance.data.recommendedItems[0].installed,false,'old account mutation cannot override new identity')
  assert.equal(actions.toasts.length,1)
  const detaching = actions.instance.handleSkillAction(tap('enable'))
  actions.definition.lifetimes.detached.call(actions.instance)
  const changes = actions.instance.dataChanges
  pendingActions[6].resolve(trial);await detaching
  assert.equal(actions.instance.dataChanges,changes)

  const userInstalled = { ...item('user_added'), installed:true }
  const detailRemoval = createInstance({
    listInstalledSkills: async () => ({ items:[userInstalled] }),
    listRecommendedSkills: async () => ({ items:[userInstalled], nextCursor:'', hasMore:false })
  })
  await flush()
  detailRemoval.instance.data.query = 'current query'
  detailRemoval.instance.data.nextCursor = 'keep-cursor'
  detailRemoval.instance.updateSkill({ ...userInstalled, installed:false, enabled:false })
  assert.equal(detailRemoval.instance.data.installedItems.length, 0)
  assert.equal(detailRemoval.instance.data.recommendedItems[0].installed, false)
  assert.equal(detailRemoval.instance.data.query, 'current query')
  assert.equal(detailRemoval.instance.data.nextCursor, 'keep-cursor')
  await detailRemoval.instance.loadInstalledSkills({ silent:true })
  assert.equal(detailRemoval.instance.data.installedItems.length, 0, 'late installed snapshots cannot restore a removed plugin')

  const wxml = fs.readFileSync(path.join(root, 'components/_self/yb-plugins-view/index.wxml'), 'utf8')
  const horizontal = wxml.match(/<scroll-view(?=[^>]*\bscroll-x\b)[^>]*>[\s\S]*?<\/scroll-view>/)?.[0]
  assert.ok(horizontal, 'installed Skills use a horizontal scroll-view')
  assert.match(horizontal, /wx:for="\{\{installedItems\}\}"/)
  assert.match(horizontal, /data-id="\{\{item.id\}\}"[^>]*bind:tap="openSkill"/)
  assert.match(wxml, /<scroll-view[^>]*bind:scrolltolower="loadMoreSkills"/)
  assert.match(wxml, /wx:for="\{\{recommendedItems\}\}"[^>]*data-id="\{\{item.id\}\}"[^>]*bind:tap="openSkill"/)
  assert.match(wxml, /catch:tap="ignoreAction"/, 'management icons do not bubble into detail navigation')
  assert.match(wxml, /<view class="plugin-action-host"[^>]*hover-stop-propagation="\{\{true\}\}"/, 'management buttons do not trigger the plugin row press feedback')
  assert.match(wxml, /<yb-flyout[^>]*id="skill-menu-\{\{item.id\}\}"/)
  assert.match(wxml, /<block wx:if="\{\{!item.globalDefault\}\}">\s*<view class="plugin-menu-divider[\s\S]*?data-action="remove"[\s\S]*?<\/block>/, 'default plugins hide both the delete row and its divider')
  for (const icon of ['icon-chat_3_line','icon-classify','icon-delete','icon-loading_flow_iconfont']) assert.ok(wxml.includes(icon))
  assert.match(wxml, /<image[^>]*class="plugin-logo\b[^\"]*"[^>]*src="\{\{item.logoUrl\}\}"/)
  assert.doesNotMatch(wxml, /item\.iconClass|plugin-icon-glyph/)
  assert.match(wxml, /wx:if="\{\{installedLoading \|\| installedItems.length \|\| installedFailed\}\}"[^>]*class="plugins-heading\b[^\"]*"/, 'a successful empty installed list hides its entire section')
  assert.match(horizontal, /wx:if="\{\{installedLoading\}\}"[^>]*class="plugin-installed-item\b[^\"]*"/, 'installed loading uses one icon skeleton')
  assert.match(wxml, /wx:if="\{\{loading \|\| loadingMore\}\}" wx:for="\{\{\[0, 1, 2, 3\]\}\}"[^>]*class="plugin-row\b[^\"]*plugin-skeleton\b[^\"]*"/, 'recommendation loading uses four Skill-shaped rows')
  assert.match(wxml, /wx:if="\{\{!loading && !loadingMore && !recommendedItems.length\}\}"[^>]*class="asset-empty-overlay\b[^\"]*plugins-empty-overlay\b[^\"]*"/, 'empty and failed recommendation results share the centered Logo placeholder')
  assert.match(wxml, /class="asset-empty-logo\b[^\"]*" src="\/static\/logs\/glog.png"/)
  assert.ok(wxml.includes('recommendedFailed ? i18n.common.loadFailed : categoryCopy.empty'), 'failed recommendations show failure copy instead of an empty result')
  assert.match(wxml, /wx:if="\{\{recommendedFailed\}\}" class="asset-retry asset-error-action" bind:tap="retrySkills"/, 'the centered failure placeholder keeps its retry action')
  assert.equal(messages('中文').plugins.empty, '暂无可用skill')
  console.log('pluginsView: independent loading, recommendation-only search, skeleton/empty states, pagination, account isolation, details and keyboard avoidance passed')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
