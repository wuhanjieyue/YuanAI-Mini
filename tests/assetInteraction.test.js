const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { calculatePosition } = require('../components/yb-flyout/position')
const templates = require('./fixtures/backend-contracts/create_templates.json')
const popular = templates.filter(item => item.popular).sort((a, b) => a.popularOrder - b.popularOrder)
const { presentAsset } = require('../static_utils/assetPresentation')
const { messages } = require('../static_utils/i18n')
const assetActionsWxml = fs.readFileSync(require.resolve('../components/_self/yb-asset-actions/index.wxml'), 'utf8')
const assetActionsWxss = fs.readFileSync(require.resolve('../components/_self/yb-asset-actions/index.wxss'), 'utf8')
const createViewSource = fs.readFileSync(require.resolve('../components/_self/yb-create-view/index.js'), 'utf8')
const createViewWxml = fs.readFileSync(require.resolve('../components/_self/yb-create-view/index.wxml'), 'utf8')
const createViewWxss = fs.readFileSync(require.resolve('../components/_self/yb-create-view/index.wxss'), 'utf8')
const libraryViewWxml = fs.readFileSync(require.resolve('../components/_self/yb-library-view/index.wxml'), 'utf8')
const skeletonWxss = fs.readFileSync(require.resolve('../static_wxss/skeleton.wxss'), 'utf8')
const assetCardsWxss = fs.readFileSync(require.resolve('../static_wxss/asset-cards.wxss'), 'utf8')
const assetActionsJs = fs.readFileSync(require.resolve('../components/_self/yb-asset-actions/index.js'), 'utf8')

assert.match(assetActionsWxml, /class="asset-iconfont \{\{item\.iconClass\}\} asset-file-icon"/)
assert.match(assetActionsWxss, /@import ["']\/static_wxss\/skyfontline\.wxss["'];/)
assert.match(createViewSource, /viewportHeight: `\$\{wx\.getWindowInfo\(\)\.windowHeight\}px`/)
assert.match(createViewWxml, /style="height: \{\{viewportHeight\}\};"/)
for (const template of [createViewWxml, libraryViewWxml]) {
  // Navigation clearance scrolls away so assets can pass behind the glass toolbar.
  assert.doesNotMatch(template, /<scroll-view\b[^>]*padding-top/)
  assert.match(template, /<scroll-view\b[^>]*>\s*<view style="height: \{\{navHeight\}\}px;" aria-hidden="true"><\/view>/)
  assert.match(template, /asset-skeleton[^"\n]*skeleton-clip/)
  assert.match(template, /class="skeleton-shimmer"/)
}
assert.match(skeletonWxss, /\.skeleton-clip[\s\S]*var\(--bg-l1/)
assert.match(skeletonWxss, /\.skeleton-block[\s\S]*var\(--bg-l2/)
assert.match(skeletonWxss, /\.skeleton-shimmer[\s\S]*top:\s*-100%;[\s\S]*left:\s*-200%;[\s\S]*width:\s*200%;[\s\S]*height:\s*300%;[\s\S]*var\(--glass-56[\s\S]*1\.8s linear infinite/)
assert.match(assetCardsWxss, /^@import '\.\/skeleton\.wxss';/)
assert.doesNotMatch(createViewWxss, /\.create-scroll[^}]*padding-bottom/)
assert.match(assetActionsJs, /id: 'save'[\s\S]*glyph: '\\ue7d2'/)

assert.equal(presentAsset({ id: 'pending', attachmentType: 'image', url: '' }, messages('中文'), '中文').loadFailed, false,
  'an unsigned cached image stays loading until URL renewal actually fails')
for (const [width, height] of [[576, 768], [1600, 900], [100, 400], [800, 800]]) {
  const item = presentAsset({ attachmentType:'image', width, height }, messages('中文'), '中文')
  assert.ok(Math.abs(item.cardHeight - 329 * height / width) < 1e-6, 'masonry cards preserve portrait, landscape, tall and square images')
}
for (const [width, height] of [[0, 100], [100, -1], [NaN, 100], [100, Infinity], [undefined, undefined]]) {
  assert.equal(presentAsset({ attachmentType:'image', width, height }, messages('中文'), '中文').cardHeight, 329)
}
assert.equal(presentAsset({ attachmentType:'file', width:100, height:400 }, messages('中文'), '中文').cardHeight, 329 - 32)
assert.match(libraryViewWxml, /<grid-view type="masonry" cross-axis-count="2"/)
assert.match(createViewWxml, /<grid-view type="\{\{activeTab === 'mine' \? 'masonry' : 'aligned'\}\}"/)

for (const [width, height] of [[390, 844], [320, 568], [844, 390]]) {
  for (const [left, top] of [[16, 90], [width - 170, 90], [16, height - 130], [width - 170, height - 130]]) {
    const layout = calculatePosition({ previewEnabled: true, anchorRect: { left, top, width: 150, height: 187.5 },
      windowInfo: { windowWidth: width, windowHeight: height, safeArea: { top: 44, bottom: height - 30 } }, measuredHeight: 420 })
    const p = layout.preview
    assert.ok(p.left >= 0 && p.top >= 44 && p.left + p.width <= width + 0.01 && p.top + p.height <= height - 30 + 0.01)
    assert.ok(layout.panelTopPx >= 44 && layout.panelTopPx + layout.panelHeightPx <= height - 30 + 0.01)
    assert.ok(p.top + p.height <= layout.panelTopPx || layout.panelTopPx + layout.panelHeightPx <= p.top)
    assert.ok(Math.abs(p.width / p.height - 0.8) < 0.001)
  }
}
assert.equal(templates.length, 7)
assert.equal(popular.length, 5)
assert.equal(popular.filter(item => item.supportsImageInput).length, 1)
for (const item of templates) assert.ok(fs.existsSync(`${__dirname}/..${item.url}`))

const moduleObject = { exports: {} }
let previews = 0
let lastPreview
let openedDocument
let navigatedPreview
let resolvedIds = []
const toasts = []
const copied = []
let finishCopy = null
const previewSource = fs.readFileSync(require.resolve('../static_utils/filePreview'), 'utf8')
const previewWx = { previewImage: options => { previews++; lastPreview = options; options.success?.() }, showToast: options => toasts.push(options), hideKeyboard() {},
  showLoading() {}, hideLoading() {}, openDocument: options => { openedDocument = options; options.success() },
  navigateTo: options => { navigatedPreview = options; options.success({ eventChannel: { emit(name, data) { navigatedPreview.event = { name, data } } } }) },
  env: { USER_DATA_PATH: 'wxfile://usr' }, getFileSystemManager: () => ({ copyFile: options => {
    copied.push(options)
    if (finishCopy) finishCopy = options.success
    else options.success()
  } }) }
const loadPreviewModule = (requestOverrides = {}) => {
  const previewModule = { exports: {} }
  vm.runInNewContext(previewSource, {
    module: previewModule,
    exports: previewModule.exports,
    require: name => name === '../request/request' ? {
      resolveAssetUrls: async ({ ids }) => {
        resolvedIds = ids
        return { items: [{ id: ids[0], fileID: `cloud://${ids[0]}`, url: `https://files.example/${ids[0]}` }] }
      },
      downloadStorageFile: async () => 'wxfile://tmp/preview',
      ...requestOverrides
    } : name === './chatAttachment' ? require('../static_utils/chatAttachment')
      : name === './i18n/index' ? require('../static_utils/i18n')
        : require(`../static_utils/${name.slice(2)}`),
    wx: previewWx
  })
  return previewModule.exports
}
vm.runInNewContext(fs.readFileSync(require.resolve('../static_utils/assetListBehavior'), 'utf8'), {
  module: moduleObject, Behavior: definition => definition, Date, Set,
  require: name => name === '../request/assetCache' ? {
    assetContext: async () => ({ ownerKey: 'test' }), assetContextCurrent: () => true,
    cachedAssetEntry: () => null, assetRecentlyChecked: () => false, saveAssetEntry() {},
    requestAssetPage: (_context, fetch, options) => fetch(options), renewAssetUrls: async items => items
  } : name === './eventBus' ? { default: { on() {}, off() {} } } : name === './filePreview' ? loadPreviewModule() : require(`../static_utils/${name.slice(2)}`),
  wx: previewWx
})
const definition = moduleObject.exports
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const context = {
  ...definition.methods, _assetVersion: 0, properties: { language: '中文' },
  data: { ...definition.data },
  setData(patch) {
    for (const [key, value] of Object.entries(patch)) {
      const index = key.match(/^items\[(\d+)\]$/)
      if (index) this.data.items[Number(index[1])] = value
      else this.data[key] = value
    }
  }
}
const image = id => ({ id, attachmentType: 'image', url: `https://example.test/${id}.png` })

context.data.items = [presentAsset({ ...image('ratio'), fileID:'owned/ratio' }, messages('中文'), '中文')]
const load = { currentTarget:{ dataset:{ id:'ratio', url:image('ratio').url } }, detail:{ width:576, height:768 } }
context.assetImageLoaded(load)
assert.equal(context.data.items[0].cardHeight, 329 * (4 / 3))
assert.equal(context.data.items[0].loaded, true)
context.assetImageLoaded({ ...load, detail:{ width:0, height:NaN } })
assert.equal(context.data.items[0].cardHeight, 329 * (4 / 3), 'bad dimensions retain known geometry')
context.assetImageLoaded({ ...load, currentTarget:{ dataset:{ id:'ratio', url:'stale.png' } }, detail:{ width:1, height:9 } })
assert.equal(context.data.items[0].cardHeight, 329 * (4 / 3), 'stale image loads cannot alter masonry geometry')
const renewed = context.mergeAssetImageState([{ ...image('ratio'), fileID:'owned/ratio', url:'renewed.png' }])[0]
assert.equal(renewed.cardHeight, 329 * (4 / 3), 'URL renewal retains measured dimensions')
assert.equal(renewed.loaded, undefined, 'a new URL still waits for its own image load')
context.data.items = []

;(async () => {
  // Exercise the request defaults and cursor forwarding used by every creation tab.
  const requests = []
  const api = { callHttp: async (_path, data) => {
    requests.push(data)
    return { result: { code: 200, data: { items: [], images: [] } } }
  }, wx: {}, eventBus: { on() {}, emit() {} }, CHAT_SESSION_RESET:'chatSessionReset', ASSET_LIST_INVALIDATED:'assetListInvalidated' }
  vm.runInNewContext(fs.readFileSync(require.resolve('../request/request'), 'utf8').replace(/^import .*$/gm, '').replace(/^export /gm, ''), api)
  await api.listStorageFiles({ cursor: 'library-next' })
  assert.equal(requests.pop().limit, 20)
  api.wx.downloadFile = options => options.success({ statusCode: 200, tempFilePath: 'wxfile://tmp/report.pdf' })
  assert.equal(await api.downloadStorageFile('https://files.example/report.pdf'), 'wxfile://tmp/report.pdf')
  await assert.rejects(api.downloadStorageFile('http://files.example/report.pdf'))
  let createDefinition
  vm.runInNewContext(fs.readFileSync(require.resolve('../components/_self/yb-create-view/index'), 'utf8').replace(/^import .*$/gm, ''), {
    Component: value => { createDefinition = value }, require: name => name.endsWith('i18n/index') ? { messages }
      : name.endsWith('searchAnimation') ? require('../static_utils/searchAnimation') : ({}),
    getApp: () => ({ globalData: { su_menu: { top: 68, left: 280, width: 100, height: 32, bottom: 100 } } }),
    clearTimeout,
    wx: { worklet: { shared: value => ({ value }), timing: value => value, Easing: { ease: 'ease' } },
      getWindowInfo: () => ({ screenWidth: 390, windowWidth: 390, screenHeight: 844, windowHeight: 800 }),
      getMenuButtonBoundingClientRect: () => ({ bottom: 100 }), getStorageSync: () => 300,
      nextTick: callback => callback(), setStorage() {}, hideKeyboard() {} },
    rpx2px: (value, width) => value * width / 750, debounce: callback => { callback.cancel = () => {}; return callback },
    listCreatedImages: api.listCreatedImages, listCreateTemplates: api.listCreateTemplates
  })
  for (const activeTab of ['templates', 'popular', 'mine']) {
    await createDefinition.methods.fetchAssetPage.call({ data: { activeTab, query: '海报' } }, { cursor: 'next-page' })
    const request = requests.pop()
    assert.equal(request.limit, 20)
    assert.equal(request.cursor, 'next-page')
    assert.equal(request.query, '海报')
    const descriptor = definition.methods.assetDescriptor.call({ data: { assetSource: 'creation', activeTab, query: '海报' } })
    assert.equal(descriptor.category, activeTab)
    assert.equal(descriptor.query, '海报')
    assert.equal(descriptor.source, activeTab === 'mine' ? 'mine' : 'templates')
    assert.equal(request.funName, activeTab === 'mine' ? 'listCreatedImages' : 'listCreateTemplates')
    if (activeTab !== 'mine') assert.equal(request.category, activeTab)
  }
  const loads = [], styles = {}
  let invalidations = 0, canceled = 0
  const creation = {
    ...createDefinition.methods, data: { ...createDefinition.data }, properties: { language: '中文' },
    setData(patch, callback) { Object.assign(this.data, patch); callback?.() },
    loadAssetPage(reset) { loads.push({ tab: this.data.activeTab, query: this.data.query, reset }) },
    invalidateAssets() { invalidations++ },
    applyAnimatedStyle(selector, callback) { styles[selector] = callback }
  }
  createDefinition.lifetimes.attached.call(creation)
  assert.equal(styles['.create-scroll']().height, '800px')
  creation.handleSearch({ detail: { value: '海报' } })
  assert.equal(invalidations, 1, 'input immediately invalidates outstanding pages')
  assert.equal(loads.at(-1).query, '海报')
  creation._searchAssets.cancel = () => canceled++
  let titleNav
  vm.runInNewContext(fs.readFileSync(require.resolve('../components/_self/yb-title-nav/index'), 'utf8').replace(/^import .*$/gm, ''), {
    Component: value => { titleNav = value },
    rpx2px: (value, width) => Math.floor(value * width / 750),
    wx: { getMenuButtonBoundingClientRect: () => ({ bottom: 100 }), getWindowInfo: () => ({ windowWidth: 390 }), worklet: {} }
  })
  const nav = { ...titleNav.methods,
    data: { ...titleNav.data, ...Object.fromEntries(Object.entries(titleNav.properties).map(([key, value]) => [key, value.value])) },
    setData(patch, callback) { Object.assign(this.data, patch); callback?.() },
    triggerEvent(name, detail) {
      if (name === 'heightchange') creation.handleNavHeightChange({ detail })
      if (name === 'tabchange') creation.selectTab({ detail })
    }
  }
  nav.updateHeight()
  assert.equal(nav.data.navHeight, 108, 'chat keeps its original capsule-based height without tabs')
  assert.equal(nav.data.titleHeight, 107, 'chat retains the one-pixel bottom border inside its height')
  nav.data.tabs = creation.data.tabs
  nav.updateHeight()
  assert.equal(creation.data.navHeight, 170, 'the page clears the complete title and tab container')
  assert.equal(nav.data.titleHeight, 107, 'the unified bottom border fits inside the complete navigation height')
  for (const tab of ['popular', 'mine', 'templates']) {
    nav.data.activeTab = creation.data.activeTab
    nav.selectTab({ currentTarget: { dataset: { id: tab } } })
    assert.equal(loads.at(-1).tab, tab)
    assert.equal(loads.at(-1).query, '海报', 'tab changes preserve the search term')
    assert.equal(loads.at(-1).reset, true)
  }
  assert.equal(canceled, 3, 'tab changes cancel pending debounced searches')
  nav.data.activeTab = creation.data.activeTab
  nav.selectTab({ currentTarget: { dataset: { id: 'templates' } } })
  nav.selectTab({ currentTarget: { dataset: { id: 'unknown' } } })
  nav.data.tabsDisabled = true
  nav.selectTab({ currentTarget: { dataset: { id: 'popular' } } })
  assert.equal(canceled, 3, 'active, invalid and disabled tabs never invoke page filtering')
  creation.handleSearchFocus()
  assert.equal(styles['.create-scroll']().height, '488px')
  creation.handleSearchKeyboardHeightChange({ detail: { height: 260 } })
  assert.equal(styles['.create-search-row']().transform, 'translateY(-272px)')
  creation.clearSearch()
  creation.handleSearchKeyboardUpdate({ detail: { height: 0 } })
  assert.equal(loads.at(-1).query, '')
  assert.equal(loads.at(-1).tab, 'templates')
  assert.equal(styles['.create-scroll']().height, '800px')
  createDefinition.lifetimes.detached.call(creation)
  assert.equal(canceled, 5)
  assert.match(createViewWxml, /create-search floating-search/)
  assert.match(createViewWxml, /bind:input="handleSearch"/)
  assert.match(createViewWxml, /create-bottom-space/)
  assert.match(createViewWxml, /i18n.create.noMatches/)
  const old = deferred(), latest = deferred()
  context.fetchAssetPage = () => old.promise
  const first = context.loadAssetPage(true)
  await Promise.resolve()
  context.fetchAssetPage = () => latest.promise
  const second = context.loadAssetPage(true)
  latest.resolve({ items: [image('new')], hasMore: true, nextCursor: 'next' })
  await second
  old.resolve({ items: [image('stale')], hasMore: false })
  await first
  assert.equal(context.data.items[0].id, 'new')
  assert.equal(context.data.nextCursor, 'next')
  context.fetchAssetPage = async () => { throw Error('offline') }
  await context.loadAssetPage()
  assert.equal(context.data.failed, true)
  assert.equal(context.data.items.length, 1)
  const more = deferred()
  let calls = 0
  context.fetchAssetPage = ({ cursor }) => { calls++; assert.equal(cursor, 'next'); return more.promise }
  const loadingMore = context.loadAssetPage()
  context.loadMoreAssets()
  context.loadMoreAssets()
  await new Promise(setImmediate)
  assert.equal(calls, 1, 'repeated bottom events share the in-flight request')
  more.resolve({ items: [image('new'), image('next')], hasMore: false })
  await loadingMore
  context.loadMoreAssets()
  assert.equal(calls, 1, 'the last page stops automatic loading')
  assert.equal(context.data.items.length, 2)
  context.data.items[0].loaded = true
  assert.equal(context.mergeAssetImageState([{ ...image('new'), loaded: false }])[0].loaded, true, 'late URL renewal must retain a completed image load')
  assert.equal(context.mergeAssetImageState([{ ...image('new'), url: 'https://example.test/changed.png', loaded: false }])[0].loaded, false)
  context.data.actionsOpen = true
  await context.previewAsset({ currentTarget: { dataset: { id: 'new' } } })
  assert.equal(previews, 0)
  context.data.actionsOpen = false
  context._suppressAssetTapUntil = Date.now() + 500
  await context.previewAsset({ currentTarget: { dataset: { id: 'new' } } })
  assert.equal(previews, 0)
  context._suppressAssetTapUntil = 0
  await context.previewAsset({ currentTarget: { dataset: { id: 'new' } } })
  assert.equal(previews, 1)
  assert.equal(lastPreview.current, image('new').url)
  assert.equal(lastPreview.urls.length, 2)
  assert.equal(copied.length, 0, 'cloud images keep original URLs')
  context.data.items = [{ ...image('sample'), sampleKey: 'poster', isImage: true, url: templates[0].url }]
  await context.previewAsset({ currentTarget: { dataset: { id: 'sample' } } })
  assert.equal(lastPreview.current, 'wxfile://usr/yuanai-create-preview-poster.jpg')
  assert.equal(copied[0].srcPath, templates[0].url)
  finishCopy = true
  const copying = context.previewAsset({ currentTarget: { dataset: { id: 'sample' } } })
  await new Promise(setImmediate)
  context.invalidateAssets()
  finishCopy()
  await copying
  assert.equal(previews, 2, 'late file preparation must not open a preview after switching tabs')
  context.data.items = [{ id: 'office', fileID: 'cloud://office', extension: 'pdf', displayName: 'report.pdf', isImage: false }]
  await context.previewAsset({ currentTarget: { dataset: { id: 'office' } } })
  assert.equal(openedDocument.filePath, 'wxfile://tmp/preview')
  assert.equal(openedDocument.fileType, 'pdf')
  assert.equal(openedDocument.showMenu, true)
  const beforeTextIds = resolvedIds
  context.data.items = [{ id: 'markdown', fileID: 'cloud://markdown', extension: 'md', displayName: 'notes.md', isImage: false }]
  await context.previewAsset({ currentTarget: { dataset: { id: 'markdown' } } })
  assert.equal(navigatedPreview.routeType, 'settingRouterBuilder')
  assert.equal(navigatedPreview.event.name, 'previewFile')
  assert.equal(navigatedPreview.event.data.name, 'notes.md')
  assert.equal(resolvedIds, beforeTextIds, 'text navigation does not renew URLs in the Library')
  context.data.items = [{ id: 'session', assetId: 'session-record', fileID: 'cloud://session-record', extension: 'md', displayName: 'session.md', isImage: false }]
  await context.previewAsset({ currentTarget: { dataset: { id: 'session' } } })
  assert.equal(resolvedIds, beforeTextIds, 'message attachments navigate before their storage request')
  const { previewStorageFile, resolvePreviewFile } = loadPreviewModule()
  for (const [extension, mimeType] of [['py', 'text/x-python'], ['java', 'text/x-java-source'],
                                     ['unlisted-format', 'text/plain'], ['', 'text/plain']]) {
    const name = extension ? 'source.' + extension : 'README'
    assert.equal(await previewStorageFile({ assetId: 'source', fileID: 'cloud://source',
      attachmentType: 'file', name, extension, mimeType }), true)
    assert.equal(navigatedPreview.event.data.attachment.mimeType, mimeType)
    assert.equal(navigatedPreview.event.data.name, name)
  }
  // Restore the selected message attachment for the ownership check below.
  await previewStorageFile(context.data.items[0])
  await resolvePreviewFile(navigatedPreview.event.data.attachment)
  assert.equal(Array.from(resolvedIds).join(','), 'session-record', 'the preview page resolves attachments by storage record ID')
  const previousIds = resolvedIds
  assert.equal(await previewStorageFile({ attachmentType:'image', previewPath:'wxfile://tmp/new-photo.jpg', name:'new-photo.jpg' }), true)
  assert.equal(lastPreview.current, 'wxfile://tmp/new-photo.jpg', 'a newly sent image previews from its local path')
  assert.equal(resolvedIds, previousIds, 'local preview does not request a storage record before upload')
  assert.equal(await previewStorageFile({ id:'picker-item', attachmentType:'image', previewPath:'http://tmp/new-photo.jpg', name:'new-photo.jpg' }), true)
  assert.equal(lastPreview.current, 'http://tmp/new-photo.jpg', 'DevTools temporary image URLs are local previews')
  assert.equal(resolvedIds, previousIds, 'a picker id is not a cloud storage record')
  assert.equal(await previewStorageFile({ attachmentType:'file', previewPath:'wxfile://tmp/new-report.pdf', name:'new-report.pdf' }), true)
  assert.equal(openedDocument.filePath, 'wxfile://tmp/new-report.pdf', 'a newly sent document opens from its local path')
  assert.equal(await previewStorageFile({ attachmentType:'file', previewPath:'wxfile://tmp/new-notes.md', name:'new-notes.md' }), true)
  assert.equal(await resolvePreviewFile(navigatedPreview.event.data.attachment), 'wxfile://tmp/new-notes.md')
  assert.equal(resolvedIds, previousIds, 'local Markdown resolution does not request a storage record')
  assert.equal(toasts.length, 0, 'local attachment previews must not report a cloud lookup failure')
  context.data.items = [{ id: 'archive', fileID: 'cloud://archive', extension: 'zip', displayName: 'files.zip', isImage: false }]
  await context.previewAsset({ currentTarget: { dataset: { id: 'archive' } } })
  assert.equal(toasts.at(-1).title, messages('中文').assets.previewUnsupported)
  context.data.items = []
  const pending = deferred()
  context.fetchAssetPage = () => pending.promise
  const request = context.loadAssetPage(true)
  context._assetDetached = true
  pending.resolve({ items: [image('detached')] })
  await request
  assert.equal(context.data.items.length, 0)

  // First-entry flag is written only after successful navigation.
  const pageSource = fs.readFileSync(require.resolve('../pages/index/index'), 'utf8')
  const openSource = pageSource.match(/openCreateTryIt(\(\) \{[\s\S]*?\n  })/)[1]
  const store = { createIntroSeen: false, setCreateIntroSeen() { this.createIntroSeen = true } }
  let navigation
  const page = {}
  const openIntro = new Function('store', 'wx', 'getCurrentPages', 'TRY_IT_ROUTE_TYPE', `return function${openSource}`)(
    store, { navigateTo: options => { navigation = options } }, () => [page], 'tryIt')
  openIntro.call(page)
  assert.equal(store.createIntroSeen, false)
  navigation.complete()
  openIntro.call(page)
  navigation.success(); navigation.complete(); navigation = null
  openIntro.call(page)
  assert.equal(navigation, null)
  console.log('assetInteraction: overlay bounds, request races, retry, tap suppression and first-entry intro passed')
})().catch(error => { console.error(error); process.exitCode = 1 })

// Text previews own renewal/download after the page is ready, with lifecycle-safe results.
;(async () => {
  let pageDefinition, parsed, resolveGate, pendingRead
  let holdRead = false, platform = 'ios'
  const requests = [], downloads = [], reads = [], saves = [], failures = []
  const helper = loadPreviewModule({
    resolveAssetUrls: async request => { requests.push(request); return resolveGate.promise },
    downloadStorageFile: async url => { downloads.push(url); return 'wxfile://tmp/page-notes.md' }
  })
  const source = fs.readFileSync(require.resolve('../mdPackage/pages/filePreview/index'), 'utf8')
  vm.runInNewContext(source, {
    Page: value => { pageDefinition = value },
    require: name => name.endsWith('themeBinding') ? { bindPageTheme() {}, unbindPageTheme() {}, syncThemeNavigation() {} }
      : name.endsWith('i18n/index') ? require('../static_utils/i18n')
        : name.endsWith('store/index') ? { store: { applicationSettings: { language: '中文' } } }
          : name.endsWith('routerUtil') ? { GestureState: {}, clamp() {}, Curves: {}, bottomSheetSuspendedCurve() {} }
            : name.endsWith('settingRouter') ? { default() {}, getSettingSheetMetrics: () => ({ sheetHeight: 800 }), SETTING_ROUTE_DURATION: 250 }
              : name.endsWith('towxmlstream/index') ? { static: content => { parsed = content; return { parsed: content } } }
                : name.endsWith('filePreview') ? helper : {},
    wx: {
      getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, screenWidth: 390 }),
      router: { getRouteContext: () => ({}) }, worklet: { shared: value => ({ value }) },
      getDeviceInfo: () => ({ platform }),
      shareFileMessage: options => saves.push({ api: 'shareFileMessage', options }),
      saveFileToDisk: options => saves.push({ api: 'saveFileToDisk', options }),
      showToast: options => failures.push(options),
      getFileSystemManager: () => ({ readFile: options => {
        reads.push(options)
        if (holdRead) pendingRead = options
        else options.success({ data: '\uFEFF# heading' })
      } })
    }
  })
  const makePage = () => ({ ...pageDefinition, _alive: true,
    data: { ...pageDefinition.data, effectiveTheme: 'light' }, patches: [],
    setData(patch) { this.patches.push(patch); Object.assign(this.data, patch) },
    getOpenerEventChannel() { return { on: (name, callback) => { assert.equal(name, 'previewFile'); this.receiveFile = callback } } }
  })
  const attachment = { assetId: 'owned-notes', fileID: 'cloud://owned-notes', name: 'notes.md' }
  const input = { attachment, name: attachment.name, extension: 'md' }
  const signed = { items: [{ id: attachment.assetId, fileID: attachment.fileID, url: 'https://files.example/owned-notes' }] }
  const page = makePage()
  resolveGate = deferred()
  holdRead = true
  page.onLoad()
  page.onShow()
  page.receiveFile(input)
  assert.equal(page.data.title, attachment.name, 'the sheet title appears before any network request')
  assert.equal(requests.length, 0, 'the opener event only stores input until page readiness')
  page.onReady()
  assert.equal(requests.length, 1, 'page readiness starts owned renewal')
  assert.equal(page.data.loading, true)
  assert.equal(reads.length, 0)
  await page.downloadFile()
  assert.equal(saves.length, 0, 'download is unavailable before the preview file is ready')
  page.onHide()
  assert.equal(page.data.pageVisible, false, 'covering the sheet unmounts its loading Canvas')
  page.onShow()
  assert.equal(page.data.pageVisible, true)
  resolveGate.resolve(signed)
  await new Promise(setImmediate)
  assert.equal(downloads[0], signed.items[0].url)
  assert.equal(page.data.loading, true, 'loading stays visible while UTF-8 is read')
  assert.equal(pendingRead.encoding, 'utf8')
  pendingRead.success({ data: '\uFEFF# heading' })
  await new Promise(setImmediate)
  assert.equal(page.data.content, '# heading')
  assert.equal(parsed, '# heading')
  assert.equal(page.data.kind, 'markdown')
  assert.equal(page.data.loading, false)
  assert.equal(page._filePath, 'wxfile://tmp/page-notes.md')

  // Native download reuses the ready local file and rejects duplicate taps.
  const mobileSave = page.downloadFile()
  await page.downloadFile()
  assert.equal(saves.length, 1)
  assert.equal(saves[0].api, 'shareFileMessage')
  assert.equal(saves[0].options.filePath, page._filePath)
  assert.equal(saves[0].options.fileName, attachment.name)
  assert.equal(requests.length, 1, 'download does not renew or fetch the already loaded file again')
  saves[0].options.success({})
  await mobileSave
  assert.equal(page.data.downloading, false)
  platform = 'mac'
  const pcSave = page.downloadFile()
  assert.equal(saves[1].api, 'saveFileToDisk')
  saves[1].options.fail({ errMsg: 'saveFileToDisk:fail cancel' })
  await pcSave
  assert.equal(failures.length, 0, 'canceling native download does not show an error')
  const failedSave = page.downloadFile()
  saves[2].options.fail({ errMsg: 'saveFileToDisk:fail permission denied' })
  await failedSave
  assert.equal(failures[0].title, messages('中文').assets.downloadFailed)

  // Local Markdown and structured text keep their read-only rendering behavior.
  holdRead = false
  for (const extension of ['md', 'json', 'csv', 'py', 'java', 'unlisted-format', '']) {
    parsed = null
    const local = makePage()
    await local.loadFile({ filePath: 'wxfile://tmp/report.' + extension, name: 'report.' + extension, extension,
      attachment: { mimeType: 'text/plain' } })
    assert.equal(local.data.kind, extension === 'md' ? 'markdown' : 'text')
    assert.equal(local.data.failed, false)
    assert.equal(local.data.content, '# heading')
    assert.equal(parsed, extension === 'md' ? '# heading' : null, 'JSON and CSV are plain text without execution')
  }
  assert.equal(requests.length, 1, 'existing local files never renew URLs')
  resolveGate = deferred()
  const forged = makePage()
  const forgedLoad = forged.loadFile(input)
  const downloadsBefore = downloads.length
  resolveGate.resolve({ items: [{ ...signed.items[0], fileID: 'cloud://another-owner' }] })
  await forgedLoad
  assert.equal(forged.data.loading, false)
  assert.equal(forged.data.failed, true, 'a failed owned lookup leaves a visible preview failure state')
  assert.equal(downloads.length, downloadsBefore, 'mismatched owned records never download')
  await forged.downloadFile()
  const noFile = makePage()
  noFile.data.loading = false
  await noFile.downloadFile()
  assert.equal(saves.length, 3, 'failed and missing-file states cannot invoke a native download')

  // Closing during request/read/download cannot update an unloaded page or show a stale toast.
  resolveGate = deferred()
  const late = makePage()
  const lateLoad = late.loadFile(input)
  late.onUnload()
  const patchesBefore = late.patches.length
  const readsBefore = reads.length
  resolveGate.resolve(signed)
  await lateLoad
  assert.equal(late.patches.length, patchesBefore)
  assert.equal(reads.length, readsBefore, 'a late renewal cannot begin reading after close')
  resolveGate = deferred()
  const rejected = makePage()
  const rejectedLoad = rejected.loadFile(input)
  rejected.onUnload()
  const rejectedPatches = rejected.patches.length
  resolveGate.reject(new Error('network unavailable'))
  await rejectedLoad
  assert.equal(rejected.patches.length, rejectedPatches)
  holdRead = true
  const lateRead = makePage()
  const reading = lateRead.loadFile({ filePath: 'wxfile://tmp/local.md', extension: 'md' })
  await new Promise(setImmediate)
  lateRead.onUnload()
  const readPatches = lateRead.patches.length
  pendingRead.success({ data: 'late content' })
  await reading
  assert.equal(lateRead.patches.length, readPatches)
  const closingSave = page.downloadFile()
  page.onUnload()
  const savePatches = page.patches.length
  const failureCount = failures.length
  saves[3].options.fail({ errMsg: 'saveFileToDisk:fail late error' })
  await closingSave
  assert.equal(page.patches.length, savePatches)
  assert.equal(failures.length, failureCount)

  const wxml = fs.readFileSync(require.resolve('../mdPackage/pages/filePreview/index.wxml'), 'utf8')
  assert.match(wxml, /<towxml[^>]+openTyper="\{\{false\}\}"/)
  assert.match(wxml, /<text wx:elif="\{\{kind === 'text'\}\}"[^>]+user-select="\{\{true\}\}"/)
  assert.match(wxml, /<yb-dot-matrix-loading\s+wx:if="\{\{pageVisible\}\}"/)
  assert.match(wxml, /bind:tap="downloadFile"[\s\S]*?icon-download/)
  assert.ok(wxml.indexOf('bind:tap="closePage"') < wxml.indexOf('{{title ||'), 'close is before the title, download is after it')
  const appConfig = JSON.parse(fs.readFileSync(require.resolve('../app.json'), 'utf8'))
  assert.ok(appConfig.subPackages.find(item => item.root === 'mdPackage').pages.includes('pages/filePreview/index'))
  console.log('assetInteraction: preview ordering, Canvas lifecycle, owned renewal and native file download passed')
})().catch(error => { console.error(error); process.exitCode = 1 })

// The library fills the layout viewport even while its parent is scaled by the drawer route.
{
  let library
  const animated = {}
  vm.runInNewContext(fs.readFileSync(require.resolve('../components/_self/yb-library-view/index'), 'utf8').replace(/^import .*$/gm, ''), {
    Component: value => { library = value }, require: name => name.includes('i18n/index') ? require('../static_utils/i18n') : {},
    debounce: callback => callback, rpx2px: (value, width) => value * width / 750,
    wx: { getWindowInfo: () => ({ windowHeight: 844, screenHeight: 844, screenWidth: 390 }),
      getMenuButtonBoundingClientRect: () => ({ bottom: 83 }), getStorageSync: () => 0,
      nextTick: callback => callback(), worklet: { shared: value => ({ value }), timing: value => value, Easing: {} } }
  })
  const filtered = []
  const instance = { ...library.methods, properties: { language: '中文' }, data: { ...definition.data, ...library.data },
    mergeAssetImageState: definition.methods.mergeAssetImageState,
    setData(patch, callback) { Object.assign(this.data, patch); callback?.() },
    loadAssetPage() { filtered.push({ category:this.data.activeCategory, query:this.data.query }) },
    applyAnimatedStyle(selector, callback) { animated[selector] = callback },
    createSelectorQuery() { throw Error('Do not cache transformed page bounds') } }
  library.lifetimes.attached.call(instance)
  assert.equal(animated['.library-scroll']().height, '844px')
  assert.equal(instance.data.categories.at(-1).id, 'favorites')
  instance._searchAssets.cancel = () => {}
  instance.selectCategory({ detail: { id:'favorites' } })
  assert.equal(filtered.at(-1).category, 'favorites')
  instance.data.query = '海报'
  instance.handleNavHeightChange({ detail: { height:149 } })
  assert.equal(instance.data.navHeight, 149)
  instance.selectCategory({ detail: { id:'image' } })
  assert.equal(filtered.at(-1).category, 'image')
  assert.equal(filtered.at(-1).query, '海报')
  instance.properties.conversationScope = true
  instance.syncCopy()
  assert.equal(instance.data.categories.length, 3, 'conversation scope keeps its existing tabs')
  instance.properties.conversationFiles = []
  instance.selectCategory({ currentTarget: { dataset: { id:'document' } } })
  assert.equal(instance.data.activeCategory, 'document', 'the conversation sheet keeps its own header and tab callback')
  instance.ensureAssetImages = () => {}
  instance.properties.conversationFiles = [
    { id:'image', attachmentType:'image', name:'cat.png', tags:['WaterColor', '海报 [x]'] },
    { id:'document', attachmentType:'file', name:'report.pdf', tags:[] }
  ]
  instance.data.activeCategory = 'image'
  for (const query of [' watercolor ', '[x]', 'CAT']) {
    instance.data.query = query
    instance.loadScopedAssets()
    assert.deepEqual(Array.from(instance.data.items, item => item.id), ['image'])
  }
  instance.data.activeCategory = 'document'
  instance.data.query = 'WaterColor'
  instance.loadScopedAssets()
  assert.equal(instance.data.items.length, 0, 'tag search preserves the selected category')
  instance.animateKeyboardOffset(312)
  assert.equal(animated['.library-scroll']().height, '532px')
  instance.handleSearchBlur()
  assert.equal(animated['.library-scroll']().height, '844px')
  console.log('library viewport: window height and keyboard restoration passed')
}
