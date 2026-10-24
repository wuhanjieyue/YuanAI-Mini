const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')
const { HOME_FEATURES } = require('../static_utils/homeFeature')
const { filterVisibleConversations } = require('../static_utils/chatModes')
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
const shared = value => ({ value })
const styleCallbacks = []
const styles = new Map()
const navigations = []
const haptics = []
const eventBus = new EventEmitter()
let pops = 0
const wx = {
  worklet: { shared },
  navigateTo: options => navigations.push(options),
  navigateBack: () => { pops++ },
  getMenuButtonBoundingClientRect: () => ({ height: 32, bottom: 88 })
}
const context = {
  wx, shared, timing: value => value, runOnJS: fn => fn,
  HOME_FEATURES, DEFAULT_POINT_COLOR: '', DEFAULT_ACCENT_STYLE: '',
  getAccentStyle: () => '', t: () => '',
  store: { getChatMessageCacheEntry: () => ({ chats: [] }) },
  chatRuntime: { epoch: 0 },
  normalizeHistoryMessage: require('../static_utils/chatHistoryMessages').normalizeHistoryMessage,
  eventBus, CHAT_SESSION_RESET: 'reset',
  getApp: () => ({ globalData: { su_system: { screenWidth: 400 } } }),
  unbindPageTheme() {}, triggerHaptic: (enabled, type) => haptics.push({ enabled, type }),
  routeBuilder() {}, upRouterBuilder() {},
  settingRouterBuilder() {}, tryItRouterBuilder() {}
}
function bindStyle(owner) {
  return (selector, updater, config, callback) => {
    styles.set(owner + selector, { updater, config })
    if(callback) styleCallbacks.push(callback)
  }
}
let homeDefinition, drawerDefinition, componentDefinition
vm.runInNewContext(read('pages/index/index.js').split('const GestureState')[1].replace(/^/, 'const GestureState'), {
  ...context, Page: definition => { homeDefinition = definition }
})
vm.runInNewContext(read('pages/leftpage/index.js').split('const GestureState')[1].replace(/^/, 'const GestureState'), {
  ...context, Page: definition => { drawerDefinition = definition }
})
vm.runInNewContext(read('components/_self/yb-left-center/index.js').slice(read('components/_self/yb-left-center/index.js').indexOf('const PAGE_SIZE')), {
  ...context, appStaticRoot: '', i18nBehavior: {}, eventBus, CHAT_SESSION_RESET: 'reset', filterVisibleConversations,
  debounce: () => ({ cancel() {} }),
  createStoreBindings: target => ({
    updateStoreBindings() {
      target.data.chatHistory = { conversations: [{ conversationId: 'cached', title: 'Cached', status: 'active' }] }
    },
    destroyStoreBindings() {}
  }), store: {},
  Component: definition => { componentDefinition = definition }
})

async function main() {
  const actionRect = { top: 200, left: 20, width: 300, height: 40 }
  const actionEvents = []
  const actionItem = {
    ...componentDefinition.methods,
    properties: {}, data: { conversationActions: componentDefinition.data.conversationActions },
    getConversation: () => ({ conversationId: 'cached' }),
    setData(patch, callback) { Object.assign(this.data, patch); callback?.() },
    applyAnimatedStyle() { assert.fail('long press must not animate the conversation row') },
    createSelectorQuery() {
      return {
        select(selector) { assert.equal(selector, '#conversation-0'); return this },
        boundingClientRect(callback) { callback(actionRect); return this },
        exec() {}
      }
    },
    triggerEvent(name, detail) { actionEvents.push({ name, detail }) }
  }
  actionItem.openConversationActions({ currentTarget: { dataset: { id: 'cached', index: 0 } } })
  assert.equal(actionItem.data.activeConversationId, 'cached')
  assert.equal(actionEvents[0].name, 'openconversationactions')
  assert.equal(actionEvents[0].detail.rect, actionRect, 'menu must keep the measured viewport anchor')
  assert.equal(actionEvents[0].detail.conversationId, 'cached')
  const menuAnchors = []
  const actionDrawer = {
    ...drawerDefinition,
    data: { applicationSettings: { hapticFeedback: true } },
    setData(patch, callback) { Object.assign(this.data, patch); callback?.() },
    selectComponent: () => ({ open: rect => menuAnchors.push(rect) })
  }
  actionDrawer.openConversationActions({ detail: actionEvents[0].detail })
  assert.deepEqual(menuAnchors, [actionRect])
  assert.deepEqual(haptics, [{ enabled: true, type: 'heavy' }], 'long press must retain its haptic feedback')
  assert.deepEqual(Array.from(actionDrawer.data.conversationActions, item => item.value), ['pin', 'rename', 'archive', 'delete'])
  actionItem.closeConversationActions()
  assert.equal(actionItem.data.activeConversationId, '')

  const home = {
    ...homeDefinition, data: { currentFeature: 'chat', temporaryMode: true },
    applyAnimatedStyle: bindStyle('home'), getLeftCenter: () => ({ checkConversationStatus() {} }), setFoucs() {}
  }
  home.initContainer()
  home.lrhandleDragUpdate(168)
  home.dyNavigate()
  home.dyNavigate()
  assert.equal(navigations.length, 1, 'duplicate opens must not push another route')
  assert.match(navigations[0].url, /temporaryMode=true/)
  const preview = () => styles.get('home.leftview').updater()
  assert.equal(preview().zIndex, 199)
  assert.equal(preview().opacity, 0.6)
  assert.equal(styles.get('home.leftview').config.flush, 'sync')

  const routeContext = { primaryAnimation: shared(0), primaryAnimationStatus: shared(1), userGestureInProgress: shared(false) }
  const buildRoute = vm.runInNewContext(read('pages/leftpage/router.js').replace(/import[\s\S]*?from '[^']+'/, '').replace('export default function', 'function') + '\nRouteBuilder', {
    ...context, AnimationStatus: { reverse: 2, completed: 3 }, Curves: {}, CurveAnimation: ({ animation }) => animation
  })
  const route = buildRoute(routeContext)
  for(const t of [0, 0.5, 1]) {
    routeContext.primaryAnimation.value = t
    assert.equal(route.handlePrimaryAnimation().transform, undefined, 'route must not add a second translation')
    assert.equal(wx.leftOp.value, 0.6, 'push must preserve the in-flight gesture')
  }

  const drawer = {
    ...drawerDefinition, data: {}, customRouteContext: routeContext,
    _resetConversationPreviewHandler() {},
    applyAnimatedStyle: bindStyle('drawer'), storeBindings: { destroyStoreBindings() {} }
  }
  drawer.onReady()
  const real = () => styles.get('drawer.leftview').updater()
  assert.equal(real().opacity, 0)
  styleCallbacks.shift()()
  assert.equal(wx.drawerRouteVisible.value, false, 'route style readiness alone cannot hide the preview')

  function createList(historyController) {
    return {
      ...componentDefinition.methods,
      data: { ...structuredClone(componentDefinition.data), historyController },
      setData(patch) { Object.assign(this.data, patch) },
      applyAnimatedStyle: bindStyle(historyController ? 'controller' : 'list'),
      initConversations() {},
      createSelectorQuery() {
        let selector
        return {
          select(value) { selector = value; return this },
          boundingClientRect(callback) { callback({ height: selector === '.pinned-content' ? 0 : 100 }); return this },
          exec() {}
        }
      },
      triggerEvent(name) { if(name === 'contentready') drawer.drawerContentReady() }
    }
  }
  const controller = createList(true)
  componentDefinition.lifetimes.attached.call(controller)
  controller.data.initialLoadingConversations = true
  const list = createList(false)
  componentDefinition.lifetimes.attached.call(list)
  assert.equal(list.data.initialLoadingConversations, true, 'cold-load state must match the controller')
  assert.equal(list.data.recentConversations[0].conversationId, 'cached', 'cache must be present before ready')
  assert.equal(list.data.titleHeight, 96)
  assert.equal(list.data.searchHeight, 32)
  componentDefinition.lifetimes.ready.call(list)
  styleCallbacks.shift()() // padding binding; all section bindings must also complete
  assert.equal(styles.get('list.chat-view').updater().paddingTop, '96px')
  styleCallbacks.shift()()
  styleCallbacks.shift()()
  await Promise.resolve()
  assert.equal(wx.drawerRouteVisible.value, false, 'partial layout readiness must retain preview')
  styleCallbacks.shift()()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(wx.drawerRouteVisible.value, true)
  assert.equal(preview().opacity, 0)
  assert.equal(real().opacity, 0.6)
  assert.equal(real().transform, preview().transform)
  assert.equal(styles.get('drawer.leftview').config.flush, 'sync')
  controller.data.initialLoadingConversations = false
  controller.data.conversationLoadFailed = true
  controller.publishHistoryLoading()
  assert.equal(list.data.initialLoadingConversations, false)
  assert.equal(list.data.conversationLoadFailed, true, 'loading failures must propagate without clearing history')

  drawer.closePage()
  drawer.closePage()
  assert.equal(pops, 1)
  routeContext.primaryAnimationStatus.value = 2
  routeContext.primaryAnimation.value = 1
  route.handlePrimaryAnimation()
  assert.equal(wx.leftOp.value, 0.6, 'pop begins at the current partial-open position')
  routeContext.primaryAnimation.value = 0.5
  route.handlePrimaryAnimation()
  assert.equal(wx.leftOp.value, 0.3)
  assert.equal(preview().opacity, 0, 'real list keeps ownership throughout exit, including scrolled/search results')
  assert.equal(real().opacity, 0.3)
  routeContext.primaryAnimationStatus.value = 1
  routeContext.primaryAnimation.value = 1
  route.handlePrimaryAnimation()
  routeContext.primaryAnimationStatus.value = 3
  route.handlePrimaryAnimation()
  assert.equal(wx.leftOp.value, 0.6, 'cancelled native pop restores the original drawer position')
  routeContext.primaryAnimationStatus.value = 2
  routeContext.primaryAnimation.value = 0
  route.handlePrimaryAnimation()
  assert.equal(wx.pageTrans.value, 0)
  assert.equal(wx.pageScale.value, 1)
  drawer.onUnload()
  drawer.drawerContentReady()
  assert.equal(wx.drawerRouteVisible.value, false, 'late readiness cannot resurrect an unloaded route')
  assert.equal(preview().opacity, 0)

  home._openingLeftPage = false
  home.openLeft()
  navigations.at(-1).fail()
  assert.equal(home._openingLeftPage, false)
  assert.equal(wx.pageTrans.value, 0)
  assert.equal(preview().opacity, 0, 'navigation failure restores the closed home')
  componentDefinition.lifetimes.detached.call(list)
  componentDefinition.lifetimes.detached.call(controller)
  assert.equal(eventBus.eventNames().length, 0)
  console.log('drawer handoff: ok')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
