const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { EventEmitter } = require('node:events')

const pagePath = path.join(__dirname, '../pages/leftpage/index.js')
assert.match(fs.readFileSync(pagePath, 'utf8'), /import \{ chatRuntime \} from '\.\.\/\.\.\/request\/chatRuntime'/)
const pageRequire = createRequire(pagePath)
const requests = []
const owners = []
const eventBus = new EventEmitter()
const chatRuntime = { epoch: 0, acceptOwner: value => owners.push(value) }
const store = {
  chatMessageCache: { entries: {} },
  getChatMessageCacheEntry(id) { return this.chatMessageCache.entries[id] || null },
  setChatMessageCacheEntry() { assert.fail('a five-message preview must not replace the complete message cache') }
}
const wx = {
  worklet: {
    shared: value => ({ value }),
    timing: value => value,
    runOnJS: fn => fn
  },
  navigateBack() {},
  nextTick: callback => callback(),
  router: { getRouteContext: () => ({}) },
  pageTrans: { value: 0 }, pageScale: { value: 1 }, pageFilter: { value: 0 },
  leftTrans: { value: 0 }, leftOp: { value: 0 }, drawerRouteVisible: { value: false }
}
let definition
vm.runInNewContext(fs.readFileSync(pagePath, 'utf8').replace(/^import .*\n/gm, ''), {
  Page: value => { definition = value },
  wx, store, chatRuntime, eventBus, CHAT_SESSION_RESET: 'reset',
  getApp: () => ({ globalData: { su_system: { screenWidth: 375 } } }),
  getConversationMessages: args => new Promise((resolve, reject) => requests.push({ args, resolve, reject })),
  triggerHaptic() {},
  createStoreBindings: () => ({ updateStoreBindings() {}, destroyStoreBindings() {} }),
  require: name => name.endsWith('/themeBinding')
    ? { bindPageTheme() {}, unbindPageTheme() {}, syncThemeNavigation() {} }
    : pageRequire(name)
})

function create() {
  const events = [], closes = [], opens = []
  const self = {
    ...definition,
    data: { ...structuredClone(definition.data), applicationSettings: { language: '中文' } },
    _conversationPreviewVersion: 0,
    events, closes, opens,
    eventChannel: { emit: (name, detail) => events.push({ name, detail }) },
    getOpenerEventChannel() { return this.eventChannel },
    setData(patch, callback) { Object.assign(this.data, patch); callback?.() },
    selectComponent: id => id === '#conversationActions'
      ? { open: rect => opens.push(rect), close: (...args) => {
        closes.push(args)
        self.closeConversationActions()
        self.conversationActionsHidden()
      } }
      : { closeConversationActions() {} }
  }
  self.onLoad({})
  return self
}

const message = (seq, role = seq % 2 ? 'user' : 'assistant') => ({
  seq, role, messageId: `message-${seq}`, content: `content-${seq}`
})
const response = messages => ({ data: { messages, ownerKey: 'owner' } })
const ids = items => Array.from(items, item => item.messageId)
const anchor = { top: 200, left: 20, width: 240, height: 40 }
function open(self, conversationId) {
  self.openConversationActions({ detail: { conversationId, rect: anchor, options: [{ value: 'pin' }] } })
}
async function settle(request, value, failed = false) {
  if(failed) request.reject(value)
  else request.resolve(value)
  await new Promise(setImmediate)
}

async function main() {
  assert.equal(typeof definition.loadConversationPreview, 'function')
  const cached = create()
  store.chatMessageCache.entries.cached = { chats: Array.from({ length: 8 }, (_, index) => message(8 - index)), hasMore: true }
  store.chatMessageCache.entries.cached.chats.splice(2, 0, { role: 'branchPoint', turnId: 'branch' })
  const originalCache = structuredClone(store.chatMessageCache)
  open(cached, 'cached')
  assert.deepEqual(ids(cached.data.conversationPreview), ['message-4', 'message-5', 'message-6', 'message-7', 'message-8'],
    'branch separators do not consume one of the five preview messages')
  assert.equal(cached.data.conversationPreviewLoading, false)
  assert.equal(requests.length, 0, 'cache hit opens immediately without a network request')
  assert.deepEqual(cached.opens, [anchor])
  assert.deepEqual(store.chatMessageCache, originalCache, 'preview must preserve older cached messages and pagination')
  store.chatMessageCache.entries.empty = { chats: [] }
  open(cached, 'empty')
  assert.equal(cached.data.conversationPreview.length, 0)
  assert.equal(cached.data.conversationPreviewLoading, false, 'empty cached chats show an empty state rather than a skeleton')
  assert.equal(requests.length, 0)

  const fetched = create()
  open(fetched, 'uncached')
  assert.equal(fetched.data.conversationPreviewLoading, true)
  const initial = requests.at(-1)
  assert.deepEqual(JSON.parse(JSON.stringify(initial.args)), { conversationId: 'uncached', limit: 5 })
  await settle(initial, response(Array.from({ length: 8 }, (_, index) => message(index + 1))))
  assert.deepEqual(ids(fetched.data.conversationPreview), ['message-4', 'message-5', 'message-6', 'message-7', 'message-8'])
  assert.equal(fetched.data.conversationPreviewLoading, false)
  assert.equal(fetched.data.conversationPreviewFailed, false)
  assert.deepEqual(owners, ['owner'])
  assert.deepEqual(store.chatMessageCache, { entries: { ...originalCache.entries, empty: { chats: [] } } })
  open(fetched, 'network-empty')
  await settle(requests.at(-1), response([]))
  assert.equal(fetched.data.conversationPreview.length, 0)
  assert.equal(fetched.data.conversationPreviewLoading, false)
  assert.equal(fetched.data.conversationPreviewFailed, false)
  open(fetched, 'network-error')
  await settle(requests.at(-1), new Error('offline'), true)
  assert.equal(fetched.data.conversationPreviewLoading, false)
  assert.equal(fetched.data.conversationPreviewFailed, true)

  const switching = create()
  open(switching, 'old')
  const oldRequest = requests.at(-1)
  open(switching, 'new')
  const newRequest = requests.at(-1)
  await settle(newRequest, response([message(12)]))
  await settle(oldRequest, response([message(1)]))
  assert.deepEqual(ids(switching.data.conversationPreview), ['message-12'], 'late history cannot overwrite the newly selected preview')

  for (const invalidate of [
    self => self.closeConversationActions(),
    self => self.closePage(),
    self => self.onUnload(),
    () => { chatRuntime.epoch++ }
  ]) {
    const stale = create()
    open(stale, 'late')
    const request = requests.at(-1)
    invalidate(stale)
    const before = JSON.stringify(stale.data)
    const ownerCount = owners.length
    await settle(request, response([message(99)]))
    assert.equal(JSON.stringify(stale.data), before, 'close, unload and account changes must reject late preview results')
    assert.equal(owners.length, ownerCount, 'invalidated results cannot adopt an earlier account owner')
    stale.onUnload()
  }
  const staleFailure = create()
  open(staleFailure, 'old-error')
  const failedRequest = requests.at(-1)
  open(staleFailure, 'cached')
  await settle(failedRequest, new Error('offline'), true)
  assert.equal(staleFailure.data.conversationPreviewFailed, false, 'a late failure cannot replace a cached preview')

  const reset = create()
  open(reset, 'before-reset')
  const resetRequest = requests.at(-1)
  eventBus.emit('reset')
  assert.equal(reset._activeConversationId, '')
  assert.equal(reset.data.conversationPreviewLoading, false)
  assert.equal(reset.data.conversationPreview.length, 0)
  await settle(resetRequest, response([message(88)]))
  assert.equal(reset.data.conversationPreview.length, 0, 'account reset clears visible content and invalidates pending fetch')

  const selected = create()
  open(selected, 'cached')
  selected.openConversationPreview()
  assert.deepEqual(selected.closes, [['api', true]])
  assert.deepEqual(JSON.parse(JSON.stringify(selected.events)), [{ name: 'selectConversation', detail: { conversationId: 'cached' } }],
    'preview tap keeps the captured conversation after synchronous flyout cleanup')
  assert.equal(selected._closing, true)

  for (const invalidate of [
    null,
    self => self.closeConversationActions(),
    self => self.closePage(),
    self => self.onUnload(),
    () => eventBus.emit('reset'),
    () => { chatRuntime.epoch++ }
  ]) {
    const delayed = create(), callbacks = []
    delayed.setData = function (patch, callback) {
      Object.assign(this.data, patch)
      if(callback) callbacks.push(callback)
    }
    open(delayed, 'cached')
    assert.equal(callbacks.length, 1)
    invalidate?.(delayed)
    callbacks[0]()
    assert.equal(delayed.opens.length, invalidate ? 0 : 1,
      'a delayed render callback opens only the current, visible account preview')
    delayed.onUnload()
  }

  const template = fs.readFileSync(path.join(__dirname, '../pages/leftpage/index.wxml'), 'utf8')
  assert.match(template, /preview-enabled="\{\{true\}\}"/)
  assert.match(template, /preview-width-rpx="\{\{675\}\}"/)
  assert.match(template, /preview-height-ratio="\{\{0\.4\}\}"/)
  assert.match(template, /bind:previewtap="openConversationPreview"/)
  assert.match(template, /conversationPreviewLoading/)
  assert.match(template, /conversationPreviewFailed \|\| !conversationPreview\.length/)
  assert.match(template, /<assis-done[^>]*show-actions="\{\{false\}\}"/)
  for(const self of [cached, fetched, switching, staleFailure, reset, selected]) self.onUnload()
  assert.equal(eventBus.listenerCount('reset'), 0, 'unloaded drawers release the account-reset listener')
  console.log('conversationPreview: cache, latest five messages, lifecycle races and preview tap passed')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
