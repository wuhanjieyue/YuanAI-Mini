const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const {
  canAccessPlan,
  normalizeModelCatalog,
  normalizeModeSelection,
  getSelectionView,
  getReasoningChoices,
  getReasoningIndex
} = require('../static_utils/modelCatalog')

const storeSource = fs.readFileSync('store/index.js', 'utf8')
const catalogInitializer = storeSource.match(/modelCatalog: ([^\n]+),/)[1]
let restoredCatalog = false
const startupCatalog = vm.runInNewContext(catalogInitializer, {
  normalizeModelCatalog,
  wx: { getStorageSync() { restoredCatalog = true; return { models:[{ id:'stale' }] } } }
})
assert.equal(restoredCatalog, false, 'a persisted catalog cannot bypass the current startup request')
assert.equal(startupCatalog.models.length, 0)

const catalog = normalizeModelCatalog({
  accessPlan:'guest',
  defaults:{ chat:'yuan-go', temporary:'yuan-go', work:'yuan-go' },
  models:[{
    id:'yuan-go', name:'Yuan-Go', modes:['chat', 'temporary', 'work'], minPlan:'guest', defaultEffortId:'high',
    efforts:[
      { id:'light', label:'轻度', minPlan:'guest' },
      { id:'medium', label:'中', minPlan:'user' },
      { id:'high', label:'高', minPlan:'user' }
    ]
  }]
})
assert.equal(canAccessPlan('guest', 'user'), false)
assert.equal(canAccessPlan('unknown', 'guest'), false)
assert.deepEqual(normalizeModeSelection(catalog, 'chat', { effortId:'high' }), {
  modelId:'yuan-go', effortId:'light'
})
assert.equal(getSelectionView({ ...catalog, accessPlan:'user' }, {
  modelId:'yuan-go', effortId:'high'
}).progress, 1)

const currentCatalog = normalizeModelCatalog({
  ...JSON.parse(fs.readFileSync('tests/fixtures/backend-contracts/model_catalog.json', 'utf8')),
  accessPlan:'user'
})
const choices = getReasoningChoices(currentCatalog.models)
assert.deepEqual(choices.options.map((option) => [option.modelId, option.effortId]), [
  ['yuan-go', 'light'], ['yuan-go', 'medium'], ['yuan-go', 'high'],
  ['yuan-go', 'very-high'], ['yuan-go', 'ultra-high']
])
const proChoices = getReasoningChoices(currentCatalog.models, 'yuan-pro')
assert.deepEqual(proChoices.options.map((option) => [option.modelId, option.effortId]), [
  ['yuan-pro', 'light'], ['yuan-pro', 'medium'], ['yuan-pro', 'high'],
  ['yuan-pro', 'very-high'], ['yuan-pro', 'ultra-high']
])
assert.equal(new Set(choices.options.map((option) => option.id)).size, 5)
assert.deepEqual(getReasoningChoices([]), { options:[] })
assert.deepEqual(getReasoningChoices(currentCatalog.models, 'missing'), { options:[] })
assert.deepEqual(normalizeModeSelection(currentCatalog, 'chat'), { modelId:'yuan-go', effortId:'medium' })
assert.equal(getReasoningIndex(choices.options, 'yuan-go', 'high'), 2)
assert.equal(getReasoningIndex(choices.options, 'yuan-go', 'medium'), 1)
assert.equal(getReasoningIndex(proChoices.options, 'yuan-pro', 'light'), 0)
assert.equal(getReasoningIndex(proChoices.options, 'yuan-pro', 'very-high'), 3)
for(const modeId of ['chat', 'temporary', 'work']) {
  assert.deepEqual(normalizeModeSelection(currentCatalog, modeId, { modelId:'yuan-pro', effortId:'high' }), {
    modelId:'yuan-pro', effortId:'high'
  })
  assert.deepEqual(normalizeModeSelection({ ...currentCatalog, accessPlan:'guest' }, modeId,
    { modelId:'yuan-pro', effortId:'high' }), { modelId:'yuan-go', effortId:'light' })
}
const lockedChoices = getReasoningChoices(currentCatalog.models.map((model) => ({
  ...model, locked:model.id === 'yuan-pro',
  efforts:model.efforts.map((effort) => ({ ...effort, locked:effort.id === 'ultra-high' }))
})))
assert.deepEqual(lockedChoices.options.map((option) => option.locked), [false, false, false, false, true])

const chatViewJs = fs.readFileSync('components/_self/yb-chat-view/index.js', 'utf8')
const chatViewWxml = fs.readFileSync('components/_self/yb-chat-view/index.wxml', 'utf8')
const pageLifetimes = vm.runInNewContext('({' + chatViewJs.match(/pageLifetimes: \{([\s\S]*?)\n  \},\n\n  methods:/)[1] + '})', {
  store: { unreadConversations: {} },
  chatRuntime: { getRunningKey() { return '' }, setVisibleTurn() {} }
})
const coveredView = { data:{ pageHidden:false, reasoningProgress:0.6 }, setData(patch) { Object.assign(this.data, patch) } }
for(let i=0;i<3;i++) {
  pageLifetimes.hide.call(coveredView)
  assert.equal(coveredView.data.pageHidden, true)
  pageLifetimes.show.call(coveredView)
  assert.equal(coveredView.data.pageHidden, false)
  assert.equal(coveredView.data.reasoningProgress, 0.6)
}
assert.match(chatViewWxml, /wx:if="\{\{[^}]*!pageHidden\}\}" class="gauge-trigger-slot/)
const sliderJs = fs.readFileSync('components/_self/yb-reasoning-slider/index.js', 'utf8')
const sliderWxml = fs.readFileSync('components/_self/yb-reasoning-slider/index.wxml', 'utf8')
const sliderWxss = fs.readFileSync('components/_self/yb-reasoning-slider/index.wxss', 'utf8')
const gaugeJs = fs.readFileSync('components/yb-gauge-trigger/index.js', 'utf8')
const gaugeWxml = fs.readFileSync('components/yb-gauge-trigger/index.wxml', 'utf8')
const modelsJs = fs.readFileSync('components/yb-models-select/index.js', 'utf8')
const appJson = JSON.parse(fs.readFileSync('app.json', 'utf8'))
const homeJs = fs.readFileSync('pages/index/index.js', 'utf8')
const homeWxml = fs.readFileSync('pages/index/index.wxml', 'utf8')
const thinkItemJs = fs.readFileSync('mdPackage/components/thinkItem/index.js', 'utf8')
const streamJs = fs.readFileSync('mdPackage/components/assisStream/index.js', 'utf8')
const streamWxml = fs.readFileSync('mdPackage/components/assisStream/index.wxml', 'utf8')
const doneJs = fs.readFileSync('mdPackage/components/assisDone/index.js', 'utf8')
const doneWxml = fs.readFileSync('mdPackage/components/assisDone/index.wxml', 'utf8')
const reasoningPageJs = fs.readFileSync('pages/reasoningPage/index.js', 'utf8')
const reasoningPageWxml = fs.readFileSync('pages/reasoningPage/index.wxml', 'utf8')
const reasoningPageWxss = fs.readFileSync('pages/reasoningPage/index.wxss', 'utf8')

assert.match(chatViewWxml, /wx:if="\{\{smartMode && leftIcon != 'stop' && modeId != 'work'/)
assert.doesNotMatch(chatViewWxml, /wx:if="\{\{[^}]*reasoningSliderOpen[^}]*\}\}" class="gauge-trigger-slot/)
assert.match(chatViewWxml, /<yb-gauge-trigger progress="\{\{reasoningProgress\}\}" popup-open="\{\{\(reasoningSliderOpen && !reasoningSliderClosing\) \|\| modelPickerOpen\}\}" accent-color="\{\{modeId == 'temporary' \? temporaryAccentActionColor : accentActionColor\}\}"/)
assert.match(chatViewWxml, /bind:closing="startCloseReasoningSlider"/)
assert.match(chatViewWxml, /models="\{\{workModels\}\}"/)
assert.match(chatViewWxml, /model-id="\{\{modeId == 'work' \? workModelSelection\.modelId : reasoningModelId\}\}"/)
assert.match(chatViewWxml, /efforts="\{\{reasoningEfforts\}\}" current-effort-id="\{\{reasoningEffortId\}\}"/)
assert.doesNotMatch(chatViewWxml, /access-plan=/)
assert.match(chatViewJs, /function withLockedEfforts[\s\S]*locked:!canAccessPlan\(accessPlan, effort\.minPlan\)/)
assert.match(chatViewJs, /function withLockedModels[\s\S]*locked:!canAccessPlan\(accessPlan, model\.minPlan\)/)
assert.match(chatViewJs, /ensureModelCatalogReady/)
assert.match(chatViewJs, /setWorkModelSelection\(selection\)/)
assert.match(chatViewJs, /reasoningEnabled = this\.data\.modeId === CHAT_MODE_IDS\.WORK \|\| this\.data\.smartMode/)
assert.match(chatViewJs, /modeId,[\s\S]*reasoningEnabled,[\s\S]*requestReady:false/)
assert.match(chatViewJs, /modelId:selection\.modelId, effortId:selection\.effortId, modelName:modelView\.modelName, requestReady:true/)
assert.match(chatViewJs, /closeReasoningSlider\(e\)\{[\s\S]*if\(e\.detail\?\.changed\) triggerHaptic\(this\.data\.applicationSettings\?\.hapticFeedback, 'light'\)/)

assert.match(sliderWxml, /worklet:ongesture="handlePan"/)
assert.match(sliderJs, /static_utils\/otherUtils/)
assert.match(sliderWxml, /worklet:should-response-on-move="shouldResponseOnMove"/)
assert.match(sliderWxml, /wx:for="\{\{markers\}\}"/)
assert.match(sliderJs, /allowedMaxShared/)
assert.match(sliderJs, /triggerEvent\('locked'/)
assert.match(sliderJs, /if \(!effort\.locked\) allowedMax = index/)
assert.doesNotMatch(sliderJs, /canAccessPlan|accessPlan/)
assert.match(sliderJs, /effortId:effort\?\.effortId/)
assert.match(sliderWxml, /class="reasoning-model-summary\b[^\"]*ft40\b[^\"]*wt6\b[^\"]*" catch:tap="openModels"/)
assert.match(sliderWxml, /\{\{draftModelName\}\} \{\{draftLabel\}\}/)
assert.match(sliderWxml, /iconfont icon-arrow-right ft40/)
assert.match(sliderWxss, /@import '\/static_wxss\/skyother.wxss'/)
assert.match(chatViewWxml, /current-model-id="\{\{reasoningModelId\}\}"[\s\S]*bind:openModels="showModels"/)
assert.match(sliderJs, /this\.backdropOpacity\.value = timing\(1, \{ duration:260 \}\)/)
assert.match(sliderJs, /this\.backdropOpacity\.value = timing\(0, \{ duration:260 \}\)/)
assert.match(sliderJs, /return \{ transform:`scaleX\(\$\{currentWidth \/ fillBodyMaxWidth\}\)` \}/)
const backdropRule = sliderWxss.match(/\.reasoning-backdrop\{([^}]*)\}/)[1]
assert.doesNotMatch(backdropRule, /box-shadow|backdrop-filter|(?:^|\s)border:/)
assert.match(sliderWxss, /background: var\(--accent-action-bg\)/)
assert.match(sliderWxss, /border: 4rpx solid var\(--accent-action-bg\)/)
assert.match(sliderWxss, /box-shadow: 0 10rpx 32rpx var\(--accent-shadow\)/)
assert.match(sliderWxss, /\.reasoning-fill-start\{[\s\S]*width: 42rpx;[\s\S]*border-radius: 42rpx 0 0 42rpx;[\s\S]*\}/)
assert.match(sliderWxss, /\.reasoning-fill-body\{[\s\S]*left: 50rpx;[\s\S]*\}/)
assert.doesNotMatch(sliderWxss, /#ff6b0a|rgba\(255, 107, 10/)

assert.match(gaugeWxml, /<canvas[^>]*type="2d"/)
assert.match(gaugeJs, /progress:\s*\{/)
assert.match(gaugeJs, /accentColor:\s*\{/)
assert.match(gaugeJs, /context\.strokeStyle = this\.data\.accentColor/)
assert.match(gaugeJs, /drawRing\(this\._displayProgress\)/)
assert.match(gaugeJs, /rgba\(51, 51, 51, 0\.18\)/)
assert.doesNotMatch(gaugeJs, /REASONING_LEVEL_MAX/)

assert.match(modelsJs, /models:\{ type:Array/)
assert.match(modelsJs, /modelId:kind === 'model' \? id : this\.data\.modelId/)
assert.match(modelsJs, /triggerEvent\('locked'/)
assert.match(modelsJs, /locked:model\.locked === true/)
assert.match(modelsJs, /locked:effort\.locked === true/)
assert.doesNotMatch(modelsJs, /canAccessPlan|accessPlan/)
assert.doesNotMatch(modelsJs, /Yuan-O1|Yuan-Pro/)

const animationCompletions = []
const animationTimings = []
const worklet = {
  shared: (value) => ({ value }),
  timing: (value, options, callback) => {
    animationTimings.push({ value, duration:options.duration })
    if(callback) animationCompletions.push(callback)
    return value
  },
  spring: (value) => value,
  sequence: (...values) => values[values.length - 1],
  runOnJS: (fn) => fn
}
let modelsDefinition
vm.runInNewContext(modelsJs, {
  require: (request) => require(path.resolve('components/yb-models-select', request)),
  wx: { worklet },
  Component: (definition) => { modelsDefinition = definition }
})
const modelEvents = []
const modelsContext = {
  data: {
    models: [{
      id: 'yuan-go',
      name: 'Yuan-Go',
      locked: false,
      efforts: [
        { id: 'light', label: '轻度', locked: false },
        { id: 'high', label: '高', minPlan: 'user', locked: true }
      ]
    }],
    modelId: 'yuan-go',
    effortId: 'light'
  },
  setData(updates, callback) {
    Object.assign(this.data, updates)
    if (callback) callback()
  },
  triggerEvent(name, detail) { modelEvents.push({ name, detail }) }
}
modelsDefinition.methods.syncCatalogData.call(modelsContext)
assert.equal(modelsContext.data.effortOptions[1].locked, true)
modelsDefinition.methods.changeModel.call(modelsContext, {
  currentTarget: { dataset: { kind: 'effort', id: 'high' } }
})
assert.deepEqual(JSON.parse(JSON.stringify(modelEvents)), [
  { name: 'locked', detail: { minPlan: 'user' } }
])

const pickerCalls = [], pickerEvents = []
const picker = {
  ...modelsDefinition.methods,
  data:{ modelId:'yuan-go', effortId:'high', otherOpen:true,
    modelOptions:currentCatalog.models,
    effortOptions:currentCatalog.models[0].efforts },
  triggerEvent(name, detail) { pickerEvents.push({ name, detail }) },
  closeOther() { pickerCalls.push('collapse-models'); this.data.otherOpen = false },
  resetOtherState() { pickerCalls.push('reset-models') },
  hidePicker() { pickerCalls.push('close-picker') },
  selectComponent() { return { close() { pickerCalls.push('close-flyout') } } }
}
picker.changeModel({ currentTarget:{ dataset:{ kind:'model', id:'yuan-pro' } } })
assert.deepEqual(pickerCalls, ['collapse-models'], 'choosing a secondary model keeps the effort popup open')
assert.deepEqual(JSON.parse(JSON.stringify(pickerEvents)), [
  { name:'changeModel', detail:{ modelId:'yuan-pro', effortId:'high' } }
])
pickerCalls.length = 0
picker.handleCardTap()
assert.deepEqual(pickerCalls, [], 'visible card padding keeps the popup open')
picker.data.otherOpen = true
picker.handleMaskTap()
picker.handleMaskTap()
assert.deepEqual(pickerCalls, ['collapse-models', 'close-flyout'], 'transparent safety padding follows the outside-tap close sequence')
pickerCalls.length = 0
picker.changeModel({ currentTarget:{ dataset:{ kind:'effort', id:'medium' } } })
assert.deepEqual(pickerCalls, ['reset-models', 'close-picker'], 'choosing an effort still completes the picker')
const modelsWxml = fs.readFileSync('components/yb-models-select/index.wxml', 'utf8')
assert.match(modelsWxml, /class="models-flyout-content\b[^\"]*"[^>]*catch:tap="handleMaskTap"/)
assert.equal((modelsWxml.match(/catch:tap="handleCardTap"/g) || []).length, 2, 'both visible cards stop outside-tap bubbling')

let sliderDefinition
let gaugeDefinition
vm.runInNewContext(gaugeJs, { wx:{worklet}, Component:value => { gaugeDefinition = value } })
const gaugeStyles = {}, gaugeEvents = []
const gauge = {
  ...gaugeDefinition.methods, data:{progress:0.5,popupOpen:false},
  applyAnimatedStyle(selector, callback) { gaugeStyles[selector] = callback },
  triggerEvent:name => gaugeEvents.push(name)
}
gaugeDefinition.lifetimes.attached.call(gauge)
const canvasIdentity = gauge._canvas = {}
for(const popupOpen of [true, false, true, false]) {
  gauge.data.popupOpen = popupOpen
  gaugeDefinition.properties.popupOpen.observer.call(gauge, popupOpen)
  assert.equal(gauge.triggerOpacity.value, popupOpen ? 0 : 1)
  assert.equal(gauge.triggerScale.value, popupOpen ? 0.8 : 1)
  gauge.open()
  assert.equal(gauge._canvas, canvasIdentity, 'visibility animation keeps the Canvas instance mounted')
}
assert.equal(gaugeEvents.length, 2, 'hidden gauge cannot reopen an active popup')
assert.equal(gaugeStyles['.gauge-trigger']().opacity, '1')
const sliderRuntimeJs = sliderJs.replace(
  /import\s+\{\s*rpx2px\s*\}\s+from\s+['"][^'"]+['"];?\s*/,
  ''
)
vm.runInNewContext(sliderRuntimeJs, {
  require: (request) => require(path.resolve('components/_self/yb-reasoning-slider', request)),
  rpx2px: (rpx, screenWidth) => Math.floor((screenWidth / 750) * Number(rpx)),
  wx: { worklet },
  Component: (definition) => { sliderDefinition = definition }
})
const sliderContext = {
  data: {
    efforts: [
      { id: 'light', label: '轻度', locked: false },
      { id: 'medium', label: '中', locked: false },
      { id: 'high', label: '高', locked: true }
    ]
  },
  _thumbCenterOffset: 10,
  _thumbTravel: 100
}
assert.equal(sliderDefinition.methods.getAllowedMaxIndex.call(sliderContext), 1)
const markers = sliderDefinition.methods.buildMarkers.call(sliderContext)
assert.deepEqual(markers.map((item) => item.locked), [false, false, true])

const sliderEvents = []
const headingRect = { left:80, top:600, width:215, height:36 }
const slider = {
  ...sliderDefinition.methods,
  data:{ ...sliderDefinition.data, efforts:proChoices.options, currentModelId:'yuan-pro', currentEffortId:'high' },
  _phase:'closed', _token:0,
  _thumbCenterOffset:10, _thumbTravel:100, _trackLeft:0,
  setData(patch) { Object.assign(this.data, patch) },
  triggerEvent(name, detail) { sliderEvents.push({ name, detail }) },
  createSelectorQuery() {
    return { select() { return this }, boundingClientRect(callback) { this.callback = callback; return this },
      exec() { this.callback(headingRect) } }
  }
}
for(const name of ['viewOpen', 'islandScale', 'islandOpacity', 'backdropOpacity', 'sliderProgress',
  'draftIndexShared', 'levelMaxShared', 'allowedMaxShared', 'thumbPressed']) slider[name] = worklet.shared(0)
slider.syncCatalogData()
assert.equal(slider.data.draftIndex, 2, 'selected model high effort activates its third anchor')
assert.equal(slider.data.draftModelName, 'Yuan-Pro')
assert.equal(slider.show(), true)
slider.setDraftIndex(4)
assert.equal(slider.data.draftLabel, '超高')
slider.close()
assert.deepEqual(JSON.parse(JSON.stringify(sliderEvents)), [
  { name:'closing', detail:{ handoff:false } }
], 'outside tap notifies immediately without committing the draft')
assert.equal(slider.show(), false, 'cannot reopen during close')
animationCompletions.shift()()
assert.deepEqual(JSON.parse(JSON.stringify(sliderEvents)), [
  { name:'closing', detail:{ handoff:false } },
  { name:'commit', detail:{ index:4, modelId:'yuan-pro', effortId:'ultra-high', label:'超高' } },
  { name:'close', detail:{ changed:true } }
])
sliderEvents.length = 0
slider.show()
slider.setDraftIndex(2)
assert.equal(slider.data.draftModelName, 'Yuan-Pro', 'moving the slider only changes effort within the current model')
slider.openModels()
assert.equal(slider._phase, 'closing')
assert.deepEqual(JSON.parse(JSON.stringify(sliderEvents)), [
  { name:'closing', detail:{ handoff:true } },
  { name:'openModels', detail:{ anchorRect:headingRect, modelId:'yuan-pro', effortId:'high' } }
], 'picker handoff is emitted before the hide animation finishes')
slider.openModels()
assert.equal(sliderEvents.length, 2, 'repeated taps cannot open duplicate pickers')
animationCompletions.shift()()
assert.equal(sliderEvents.some((event) => event.name === 'commit'), false, 'handoff does not overwrite a newer picker selection')
slider.data.efforts = choices.options.map((option, index) => ({ ...option, locked:index > 0 }))
slider.data.currentModelId = 'yuan-go'
slider.data.currentEffortId = 'light'
slider.syncCatalogData()
slider.show()
slider.tapTrack({ detail:{ x:85 } })
assert.equal(sliderEvents.at(-1).name, 'locked')
assert.equal(slider.data.draftIndex, 0, 'guest cannot select a locked effort')
slider.dismiss()
sliderEvents.length = 0
slider.data.efforts = proChoices.options
slider.data.currentModelId = 'yuan-pro'
slider.data.currentEffortId = 'medium'
slider.data.currentEffortLabel = '中'
slider.syncCatalogData()
slider.show()
assert.equal(slider.data.draftIndex, 1)
assert.equal(slider.data.draftLabel, '中', 'full picker selection remains the actual displayed effort')
slider.close()
animationCompletions.shift()()
assert.equal(sliderEvents.some((event) => event.name === 'commit'), false, 'closing without an edit preserves the selected effort')
slider.show()
slider.openModels()
assert.equal(sliderEvents.at(-1).detail.effortId, 'medium', 'picker handoff preserves the actual effort too')
animationCompletions.shift()()
slider.show()
slider.tapTrack({ detail:{ x:60 } })
assert.equal(slider.data.draftLabel, '高')
slider.close()
animationCompletions.shift()()
assert.equal(sliderEvents.at(-2).detail.effortId, 'high', 'explicitly tapping an anchor chooses the matching model effort')

slider.show()
slider.setDraftIndex(4)
slider.close()
const staleClose = animationCompletions.shift()
slider.dismiss()
slider.show()
slider.setDraftIndex(2)
slider.close()
const currentClose = animationCompletions.shift()
const pendingEvents = sliderEvents.length
staleClose()
assert.equal(slider._phase, 'closing', 'old close completion cannot finish a reopened slider')
assert.equal(sliderEvents.length, pendingEvents, 'old completion cannot commit the new draft early')
currentClose()
assert.equal(slider._phase, 'closed')
assert.equal(sliderEvents.at(-2).detail.effortId, 'high')
assert.equal(sliderEvents.at(-2).detail.modelId, 'yuan-pro')

const immediateQuery = slider.createSelectorQuery
let staleHeadingQuery
slider.createSelectorQuery = () => ({
  select() { return this },
  boundingClientRect(callback) { staleHeadingQuery = callback; return this },
  exec() {}
})
slider.show()
slider.openModels()
slider.dismiss()
slider.show()
const reopenedEvents = sliderEvents.length
staleHeadingQuery(headingRect)
assert.equal(slider._phase, 'open', 'old heading measurement cannot close a reopened slider')
assert.equal(sliderEvents.length, reopenedEvents, 'old heading measurement cannot open a model picker')
slider.createSelectorQuery = immediateQuery
slider.dismiss()

const reasoningHostMethods = vm.runInNewContext('({' + chatViewJs.slice(
  chatViewJs.indexOf('  startCloseReasoningSlider('), chatViewJs.indexOf('  openSources(')
) + '})', { triggerHaptic() {} })
const gaugeHiddenExpression = chatViewWxml.match(/popup-open="\{\{([^}]+)\}\}"/)[1]
const hostEvents = []
const host = {
  ...reasoningHostMethods,
  data:{ reasoningSliderOpen:false, reasoningSliderClosing:false, modelPickerOpen:false },
  setData(patch) {
    Object.assign(this.data, patch)
    const hidden = vm.runInNewContext(gaugeHiddenExpression, this.data)
    if(hidden !== gauge.data.popupOpen) {
      gauge.data.popupOpen = hidden
      gaugeDefinition.properties.popupOpen.observer.call(gauge, hidden)
    }
  },
  triggerEvent(name, detail) { hostEvents.push({ name, detail }) }
}
const emitSliderEvent = slider.triggerEvent
slider.triggerEvent = function(name, detail) {
  emitSliderEvent.call(this, name, detail)
  if(name === 'closing') host.startCloseReasoningSlider({ detail })
  if(name === 'close') host.closeReasoningSlider({ detail })
}
slider.show()
host.setReasoningSliderOpen(true)
animationTimings.length = 0
slider.close()
assert.equal(animationCompletions.length, 1, 'slider close completion is still pending')
assert.equal(gauge.triggerOpacity.value, 1, 'Canvas starts restoring before slider completion')
assert.deepEqual(animationTimings.slice(0, 2), [
  { value:1, duration:160 }, { value:1, duration:160 }
], 'Canvas scale and opacity keep their 160ms duration')
assert.equal(host.data.reasoningSliderOpen, true, 'drawer remains locked until the outgoing slider finishes')
slider.close()
assert.equal(animationCompletions.length, 1, 'repeated close cannot restart either transition')
const restoredTimingCount = animationTimings.length
animationCompletions.shift()()
assert.equal(host.data.reasoningSliderOpen, false)
assert.equal(host.data.reasoningSliderClosing, false)
assert.equal(animationTimings.length, restoredTimingCount, 'completion does not restart Canvas restoration')
assert.equal(gauge._canvas, canvasIdentity)
slider.show()
host.setReasoningSliderOpen(true)
slider.openModels()
assert.equal(gauge.triggerOpacity.value, 0, 'model picker handoff keeps the Canvas hidden')
host.setData({ modelPickerOpen:true })
animationCompletions.shift()()
assert.equal(gauge.triggerOpacity.value, 0, 'slider completion cannot reveal Canvas under a model picker')
host.setData({ modelPickerOpen:false })
assert.equal(gauge.triggerOpacity.value, 1)
host.setData({ reasoningSliderClosing:true })
host.dismissReasoningSlider = reasoningHostMethods.dismissReasoningSlider
host.selectComponent = () => slider
host.dismissReasoningSlider()
assert.equal(host.data.reasoningSliderClosing, false, 'dismiss also clears a stale closing flag')

assert.ok(appJson.pages.includes('pages/reasoningPage/index'))
assert.match(chatViewJs, /normalizeHistoryMessage.*require\('\.\.\/\.\.\/\.\.\/static_utils\/chatHistoryMessages'\)/)
assert.match(fs.readFileSync('static_utils/chatHistoryMessages.js', 'utf8'), /thinkStatus:\s*stopped \|\| processTrace\.length \? 2 : 0/)
assert.match(thinkItemJs, /!\[1,2\]\.includes\(this\.data\.thinkStatus\) \|\| !hasTrace/)
assert.match(thinkItemJs, /const trace = this\.data\.fullProcessTrace\?\.length \? this\.data\.fullProcessTrace : this\.data\.processTrace/)
assert.match(thinkItemJs, /triggerEvent\('open', \{[\s\S]*processTrace:trace,[\s\S]*processDurationMs:/)
assert.match(streamJs, /triggerEvent\('openReasoning', \{[\s\S]*?\.\.\.e\.detail,[\s\S]*?turnKey:this\._startedTurnKey \|\| this\.data\.turnKey/)
assert.match(doneJs, /triggerEvent\('openReasoning', e\.detail \|\| \{\}/)
assert.match(streamWxml, /bind:open="open"/)
assert.match(doneWxml, /bind:open="openReasoning"/)
assert.match(chatViewWxml, /bind:openReasoning="openReasoning"/)
assert.match(homeWxml, /bind:openReasoning="openReasoningPage"/)
assert.match(homeJs, /url: '\/pages\/reasoningPage\/index',[\s\S]*routeType: 'upRouterBuilder',[\s\S]*eventChannel\.emit\('showReasoning'/)
assert.match(reasoningPageJs, /eventChannel\.on\('showReasoning'/)
assert.match(reasoningPageJs, /if\(e\.size <= 0\.01\) runOnJS\(this\.closePage\.bind\(this\)\)\(\)/)
assert.match(reasoningPageWxml, /<draggable-sheet[\s\S]*initial-child-size="\{\{0\.5\}\}"[\s\S]*snap-sizes="\{\{\[0\.5, 1\]\}\}"/)
assert.match(reasoningPageWxml, /associative-container="draggable-sheet"/)
assert.match(reasoningPageWxml, /class="reasoning-header\b[^\"]*plr36\b[^\"]*" list-item/)
assert.match(reasoningPageWxml, /wx:for="\{\{processTrace\}\}"[\s\S]*class="reasoning-step dr as plr36/)
assert.match(reasoningPageWxml, /reasoning-details-scroll[\s\S]*item\.detailText[\s\S]*reasoning-response/)
assert.match(reasoningPageWxss, /\.reasoning-response\s*\{[\s\S]*white-space:\s*pre-wrap/)
assert.match(reasoningPageWxml, /class="reasoning-complete\b[^\"]*dr\b[^\"]*as\b[^\"]*plr36\b[^\"]*" list-item/)
assert.match(reasoningPageWxml, /class="reasoning-step dr as plr36[\s\S]*?class="reasoning-rail\b[^\"]*reasoning-step-rail\b[^\"]*dc\b[^\"]*ac\b[^\"]*"/)
assert.match(reasoningPageWxml, /i18n\.reasoning\.title/)
assert.match(reasoningPageWxml, /i18n\.reasoning\.processed[^\n]*durationText/)
assert.match(reasoningPageWxml, /class="reasoning-complete\b[^\"]*dr\b[^\"]*as\b[^\"]*plr36\b[^\"]*"[\s\S]*?class="reasoning-rail\b[^\"]*reasoning-complete-rail\b[^\"]*dc\b[^\"]*ac\b[^\"]*"[\s\S]*?class="reasoning-complete-icon/)
assert.match(reasoningPageWxss, /\.reasoning-rail\s*\{[\s\S]*?width:\s*40rpx;/)
assert.match(reasoningPageWxss, /\.reasoning-icon,[\s\S]*?\.reasoning-complete-icon\s*\{[\s\S]*?width:\s*40rpx;[\s\S]*?height:\s*52rpx;/)
assert.match(reasoningPageWxss, /\.reasoning-line\s*\{[\s\S]*?min-height:\s*72rpx;/)

console.log('reasoningControls: ok')
