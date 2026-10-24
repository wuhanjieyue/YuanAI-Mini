const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const { createRequire } = require('module')
const position = require('../components/yb-flyout/position')
const { messages } = require('../static_utils/i18n')

const componentPath = path.join(__dirname, '../components/yb-flyout/index.js')
const source = fs.readFileSync(componentPath, 'utf8')

let pendingTimingCallbacks = null
let nextTimerId = 0
const cleanupTimers = new Map()
const worklet = {
  shared: value => ({ value }),
  timing: (value, options, callback) => {
    if (callback) {
      if (pendingTimingCallbacks) pendingTimingCallbacks.push(callback)
      else callback(true)
    }
    return value
  },
  spring: value => value,
  sequence: (...values) => values[values.length - 1],
  runOnJS: fn => fn
}
let definition
vm.runInNewContext(source, {
  Component: value => { definition = value },
  wx: {
    getWindowInfo: () => ({ windowWidth: 375, windowHeight: 800 }),
    nextTick: callback => callback(),
    worklet
  },
  require: request => {
    assert.strictEqual(request, './position')
    return position
  },
  Number,
  Promise,
  setTimeout(callback, delay) {
    const id = ++nextTimerId
    cleanupTimers.set(id, { callback, delay })
    return id
  },
  clearTimeout: id => cleanupTimers.delete(id)
})

const methods = definition.methods
const context = {
  properties: {
    popupWidthRpx: 450,
    maxHeightRatio: 0.6,
    safeGapRpx: 36,
    edgeGapRpx: 24
  },
  getWindowMetrics: methods.getWindowMetrics,
  normalizeRect: methods.normalizeRect
}

const layout = (anchor, height, portal = {}) => methods.getLayoutMetrics.call(context, anchor, height, portal)

assert.strictEqual(position.rpxToPx(24, 375), 12)
assert.strictEqual(position.clamp(12, 0, 10), 10)
assert.deepStrictEqual(position.normalizeWindowMetrics({
  windowWidth: 375,
  windowHeight: 800,
  screenTop: 20,
  safeArea: { top: 44, bottom: 798 }
}), { windowWidth: 375, windowHeight: 800, safeTop: 24, safeBottom: 778 })

assert.strictEqual(layout({ left: 20, top: 100, width: 40, height: 30 }, 200).viewportLeft, 20)
assert.strictEqual(layout({ left: 315, top: 100, width: 40, height: 30 }, 200).viewportLeft, 130)
assert.strictEqual(layout({ left: 0, top: 100, width: 20, height: 30 }, 200).viewportLeft, 12)
assert.strictEqual(layout({ left: 360, top: 100, width: 20, height: 30 }, 200).viewportLeft, 138)
assert.strictEqual(layout({ left: 20, top: 0, width: 40, height: 0 }, 100).viewportTop, 18)
assert.strictEqual(layout({ left: 315, top: 760, width: 40, height: 30 }, 400).viewportTop, 382)
assert.strictEqual(layout({ left: 20, top: 100, width: 40, height: 30 }, 700).panelHeightPx, 480)
const boundedLayout = position.calculatePosition({
  anchorRect: { left: 300, top: 600, width: 40, height: 30 },
  measuredHeight: 300,
  boundaryRect: { left: 0, top: 0, width: 375, height: 500 },
  windowMetrics: { windowWidth: 375, windowHeight: 800, safeTop: 0, safeBottom: 800 }
})
assert.strictEqual(boundedLayout.availableBottom, 500)
assert.ok(boundedLayout.panelTopPx + boundedLayout.panelHeightPx <= 482)
for (const metrics of [
  { windowWidth: 375, windowHeight: 800, safeTop: 44, safeBottom: 766 },
  { windowWidth: 812, windowHeight: 375, safeTop: 0, safeBottom: 354 }
]) {
  for (const top of [metrics.safeTop + 4, metrics.safeBottom - 44]) {
    const previewLayout = position.calculatePosition({
      anchorRect: { left: 12, top, width: metrics.windowWidth * 0.65, height: 40 },
      measuredHeight: 200,
      previewEnabled: true,
      previewWidthRpx: 675,
      previewHeightRatio: 0.4,
      windowMetrics: metrics
    })
    const preview = previewLayout.preview
    const topLimit = previewLayout.availableTop + position.rpxToPx(36, metrics.windowWidth)
    const bottomLimit = previewLayout.availableBottom - position.rpxToPx(36, metrics.windowWidth)
    const edge = position.rpxToPx(24, metrics.windowWidth)
    assert.ok(preview.top >= topLimit && preview.top + preview.height <= bottomLimit + 0.001,
      'preview must stay inside the safe viewport at both anchor extremes')
    assert.ok(preview.left >= edge && preview.left + preview.width <= metrics.windowWidth - edge + 0.001)
    assert.ok(previewLayout.viewportTop >= topLimit &&
      previewLayout.viewportTop + previewLayout.panelHeightPx <= bottomLimit + 0.001,
    'menu and preview must share the available height in landscape')
    assert.ok(previewLayout.viewportTop + previewLayout.panelHeightPx <= preview.top ||
      preview.top + preview.height <= previewLayout.viewportTop,
    'preview and action menu must not overlap')
    assert.equal(preview.width, position.rpxToPx(675, metrics.windowWidth),
      'conversation preview uses its configured card width instead of row width')
    assert.ok(preview.height > 40 && preview.height <= metrics.windowHeight * 0.4,
      'conversation preview can show messages while respecting its height ratio')
  }
}
assert.strictEqual(layout({ left: 20, top: 100, width: 40, height: 30 }, 200, { top: 124, left: 8 }).panelTopPx, 118)
assert.strictEqual(layout({ left: 20, top: 100, width: 40, height: 30 }, 200, { top: 124, left: 8 }).panelLeftPx, 20)
assert.strictEqual(layout({ left: 20, top: 100, width: 40, height: 30 }, 200, { top: 124, left: 8 }).maskTopPx, -124)
assert.strictEqual(layout({ left: 20, top: 100, width: 40, height: 30 }, 200, { top: 124, left: 8 }).maskLeftPx, -8)
assert.strictEqual(definition.properties.disabled.value, false)
assert.strictEqual(definition.properties.openOnTriggerTap.value, true)
assert.strictEqual(definition.properties.popupTransformOrigin.value, '50% 0')
for (const previewHeightRatio of [0.4, 0]) {
  const styles = new Map()
  const flyout = {
    properties: { previewHeightRatio },
    applyAnimatedStyle: (selector, updater) => styles.set(selector, updater)
  }
  definition.lifetimes.attached.call(flyout)
  const previewStyle = styles.get('.yb-flyout-preview')
  if(previewHeightRatio) {
    for(const scale of [0, 0.4, 1.08, 1]) {
      for(const opacity of [0, 0.5, 1]) {
        flyout.panelScale.value = scale
        flyout.panelOpacity.value = opacity
        assert.deepStrictEqual(previewStyle(), styles.get('.yb-flyout-panel')(),
          'content preview shares menu scaling, spring overshoot and opacity')
      }
    }
  } else {
    flyout.previewProgress.value = 0.5
    flyout.previewX.value = 20
    flyout.previewY.value = -12
    flyout.previewScale.value = 1.08
    flyout.panelScale.value = 0.4
    assert.strictEqual(previewStyle().transform, 'translate(10px, -6px) scale(1.04)',
      'existing card clones retain their independent preview animation')
    assert.strictEqual(previewStyle().opacity, undefined)
  }
}
const previewEvents = []
let previewMaskTaps = 0
const previewTapContext = {
  _phase: 'closed', properties: { previewHeightRatio: 0.4 },
  triggerEvent: name => previewEvents.push(name),
  handleMaskTap: () => { previewMaskTaps++ }
}
methods.handlePreviewTap.call(previewTapContext)
previewTapContext._phase = 'open'
methods.handlePreviewTap.call(previewTapContext)
assert.deepStrictEqual(previewEvents, ['previewtap'], 'content preview taps dispatch only after the flyout opens')
previewTapContext._phase = 'closing'
methods.handlePreviewTap.call(previewTapContext)
assert.strictEqual(previewEvents.length, 1)
previewTapContext._phase = 'open'
previewTapContext.properties.previewHeightRatio = 0
methods.handlePreviewTap.call(previewTapContext)
assert.strictEqual(previewMaskTaps, 1, 'existing card clones retain the mask-dismiss behavior')

const normalizedExternalRect = methods.normalizeRect({ left: 300, top: 200, right: 350, bottom: 240 })
assert.deepStrictEqual(JSON.parse(JSON.stringify(normalizedExternalRect)), { left: 300, top: 200, width: 50, height: 40 })

const wxml = fs.readFileSync(path.join(__dirname, '../components/yb-flyout/index.wxml'), 'utf8')
const componentWxss = fs.readFileSync(path.join(__dirname, '../components/yb-flyout/index.wxss'), 'utf8')
const settingWxml = fs.readFileSync(path.join(__dirname, '../pages/setting/index.wxml'), 'utf8')
const settingJs = fs.readFileSync(path.join(__dirname, '../pages/setting/index.js'), 'utf8')
const personalizationWxml = fs.readFileSync(path.join(__dirname, '../components/_self/yb-subsetting-personalization/index.wxml'), 'utf8')
const personalizationPath = path.join(__dirname, '../components/_self/yb-subsetting-personalization/index.js')
const personalizationSource = fs.readFileSync(personalizationPath, 'utf8')
let personalizationDefinition
vm.runInNewContext(personalizationSource.replace(/^import .*$/m, 'const rpx2px = () => 0'), {
  Component: value => { personalizationDefinition = value },
  wx: { getWindowInfo: () => ({ windowWidth: 375 }) },
  require: createRequire(personalizationPath)
})
const personalizationContext = {
  properties: {
    language: 'English',
    aiName: 'YuanAI',
    draft: { basicTone: '亲和友善', traits: { gentle: '默认', warm: '增强', headings: '减弱', emoji: '默认' } }
  },
  data: { i18n: messages('中文') },
  setData(updates) { Object.assign(this.data, updates) }
}
personalizationDefinition.methods.syncCopy.call(personalizationContext, 'English', 'YuanAI')
assert.strictEqual(personalizationContext.data.selectedBasicToneLabel, 'Friendly')
assert.deepStrictEqual(JSON.parse(JSON.stringify(personalizationContext.data.selectedTraitLabels)), {
  gentle: 'Default', warm: 'More', headings: 'Less', emoji: 'Default'
})
const leftPageJson = fs.readFileSync(path.join(__dirname, '../pages/leftpage/index.json'), 'utf8')
const leftPageWxml = fs.readFileSync(path.join(__dirname, '../pages/leftpage/index.wxml'), 'utf8')
const featurePopupJson = fs.readFileSync(path.join(__dirname, '../components/_self/yb-feature-popup/index.json'), 'utf8')
const featurePopupWxml = fs.readFileSync(path.join(__dirname, '../components/_self/yb-feature-popup/index.wxml'), 'utf8')
const modelsSelectJson = fs.readFileSync(path.join(__dirname, '../components/yb-models-select/index.json'), 'utf8')
const modelsSelectJs = fs.readFileSync(path.join(__dirname, '../components/yb-models-select/index.js'), 'utf8')
const modelsSelectWxml = fs.readFileSync(path.join(__dirname, '../components/yb-models-select/index.wxml'), 'utf8')
const modelsSelectWxss = fs.readFileSync(path.join(__dirname, '../components/yb-models-select/index.wxss'), 'utf8')
const titleNavJs = fs.readFileSync(path.join(__dirname, '../components/_self/yb-title-nav/index.js'), 'utf8')
const titleNavWxml = fs.readFileSync(path.join(__dirname, '../components/_self/yb-title-nav/index.wxml'), 'utf8')
const titleNavWxss = fs.readFileSync(path.join(__dirname, '../components/_self/yb-title-nav/index.wxss'), 'utf8')
const chatViewJs = fs.readFileSync(path.join(__dirname, '../components/_self/yb-chat-view/index.js'), 'utf8')

assert.match(wxml, /<root-portal>/, 'the portal remains enabled throughout the component lifecycle')
assert.match(wxml, /catch:tap="handleMaskTap"/)
assert.match(wxml, /<slot name="trigger"><\/slot>/)
assert.match(wxml, /<slot name="anchor"><\/slot>/)
assert.match(wxml, /<slot name="popup"><\/slot>/)
assert.strictEqual((wxml.match(/<slot name="trigger"><\/slot>/g) || []).length, 1)
assert.strictEqual((wxml.match(/<slot name="anchor"><\/slot>/g) || []).length, 1)
assert.strictEqual((wxml.match(/<slot name="popup"><\/slot>/g) || []).length, 1)
assert.match(wxml, /wx:if="\{\{separateAnchor\}\}"/)
assert.match(source, /async open\(anchorRect, boundaryRect\)/)
assert.doesNotMatch(source, /KeyboardHeight|keyboardHeight/)
assert.match(source, /handlePopupTap\(\)[\s\S]*closeOnPopupTap/)
assert.doesNotMatch(source, /overlaySize|applyAnimatedStyle\('\.yb-flyout-mask'/)
assert.match(componentWxss, /\.yb-flyout-mask\{[^}]*width:\s*0;[^}]*height:\s*0;/)
assert.match(componentWxss, /\.yb-flyout-mask-mounted\{[^}]*width:\s*100vw;[^}]*height:\s*100vh;/)
assert.match(wxml, /maskMounted \? 'yb-flyout-mask-mounted' : ''/)
assert.match(wxml, /<text class="yb-flyout-origin\b[^\"]*" aria-hidden="\{\{true\}\}">\.<\/text>/)
assert.match(wxml, /<text class="yb-flyout-panel-metrics\b[^\"]*" aria-hidden="\{\{true\}\}">\.<\/text>/)
assert.match(componentWxss, /\.yb-flyout-origin,\s*\.yb-flyout-panel-metrics\{[^}]*position:\s*absolute;[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;/)
assert.match(wxml, /<text class="yb-flyout-panel-metrics\b[^\"]*\bfull-bg\b/)
assert.match(fs.readFileSync(path.join(__dirname, '../static_wxss/skyother.wxss'), 'utf8'), /\.full-bg\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;/)
assert.match(source, /portalActive: false[\s\S]*triggerEvent\('afterclose'\)/)
assert.match(settingWxml, /wx:if="\{\{item\.type === 'selector' \|\| item\.type === 'accent'\}\}"/)
assert.match(settingWxml, /bind:tap="handleApplicationOptionChange"/)
assert.doesNotMatch(settingWxml, /close-on-popup-tap/)
assert.doesNotMatch(settingWxml, /<setting-select/)
assert.match(settingJs, /options: languageOptions/)
assert.match(settingJs, /options: appearanceOptions/)
assert.match(settingJs, /options: voiceOptions/)
assert.match(settingJs, /options: accentOptions/)
assert.doesNotMatch(settingWxml, /popupHeightPx/)
assert.doesNotMatch(settingJs, /popupHeightPx|listPaddingPx/)
assert.match(personalizationWxml, /data-field="basicTone"/)
assert.match(personalizationWxml, /wx:for="\{\{traitOptions\[item\.key\]\}\}"/)
assert.match(personalizationWxml, /\{\{selectedBasicToneLabel\}\}/)
assert.match(personalizationWxml, /\{\{selectedTraitLabels\[item\.key\]\}\}/)
assert.doesNotMatch(personalizationWxml, /close-on-popup-tap/)
assert.match(leftPageJson, /components\/yb-flyout\/index/)
assert.match(leftPageWxml, /<yb-flyout[\s\S]*id="conversationActions"/)
assert.match(leftPageWxml, /bind:afterclose="conversationActionsHidden"/)
assert.match(featurePopupJson, /components\/yb-flyout\/index/)
assert.match(featurePopupWxml, /<yb-flyout[\s\S]*id="anchoredFeaturePopup"/)
assert.match(featurePopupWxml, /modePopupWidthRpx/)
assert.match(chatViewJs, /modePopupWidthRpx:language === 'English' \? 480 : 416/)
assert.match(modelsSelectJson, /components\/yb-flyout\/index/)
assert.match(modelsSelectWxml, /id="modelFlyout"[\s\S]*close-on-mask-tap="\{\{false\}\}"[\s\S]*bind:masktap="handleMaskTap"/)
assert.match(modelsSelectWxml, /edge-gap-rpx="0"[\s\S]*popup-width-rpx="560"/)
assert.match(modelsSelectWxml, /popup-transform-origin="100% 100%"/)
assert.doesNotMatch(modelsSelectWxss, /\.models-flyout-panel\{[\s\S]*transform-origin/)
assert.match(modelsSelectWxml, /models-stack \{\{alignRight \? 'models-stack-right' : 'models-stack-left'\}\}/)
assert.match(modelsSelectWxss, /\.models-stack\{[\s\S]*width:\s*400rpx;[\s\S]*bottom:\s*36rpx;/)
assert.match(modelsSelectWxss, /\.models-stack-right\{[\s\S]*right:\s*36rpx;/)
assert.match(modelsSelectWxss, /\.models-stack-left\{[\s\S]*left:\s*36rpx;/)
assert.match(modelsSelectJs, /const alignRight = Number\(anchorRect\.left\) \+ width \/ 2 >= windowWidth \/ 2/)
assert.match(modelsSelectJs, /left:alignRight \? windowWidth - width : 0/)
assert.match(modelsSelectJs, /show\(anchorRect,boundaryRect\)[\s\S]*open\(viewportAnchor,boundaryRect\)/)
assert.match(modelsSelectWxml, /otherOpen \? 'is-open bshadow' : ''/)
assert.match(modelsSelectWxss, /\.other-model-panel\{[\s\S]*background:\s*transparent;[\s\S]*border:\s*1rpx solid transparent;[\s\S]*backdrop-filter:\s*none;/)
assert.match(modelsSelectWxss, /\.other-model-panel\.is-open\{[\s\S]*background:\s*var\(--glass-72, rgba\(255, 255, 255, 0\.72\)\);[\s\S]*border-color:\s*var\(--text-l3(?:, rgba\(51, 51, 51, 0\.25\))?\);[\s\S]*backdrop-filter:\s*blur\(10px\);/)
assert.match(modelsSelectJs, /modelsFlyoutHeightRpx:Math\.max\(modelsBaseHeightRpx, modelsExpandedHeightRpx\) \+ 160/)
assert.match(modelsSelectWxml, /class="models-base\b[^\"]*bshadow\b[^\"]*"/)
assert.doesNotMatch(modelsSelectWxss, /box-shadow:\s*0 8px 32px rgba\(0,0,0,0\.3\)/)
assert.match(titleNavJs, /select\('\.model-name-anchor'\)[\s\S]*triggerEvent\('showFeatures',\{rect\}/)
let titleDefinition
vm.runInNewContext(titleNavJs.replace(/^import .*$/gm, ''), {
  Component:value => { titleDefinition = value }, wx:{worklet},
  rpx2px:(value, width) => value * width / 750
})
const titleQueries = [], titleEvents = []
const title = {
  ...titleDefinition.methods, _attached:true,
  data:{featureMenuEnabled:true}, modelNameSca:{value:1}, modelNameOpa:{value:1}, modelNameTra:{value:0},
  triggerEvent:name => titleEvents.push(name),
  createSelectorQuery:() => ({ select() { return this },
    boundingClientRect(callback) { titleQueries.push(callback); return this }, exec() {} })
}
for(let i=0;i<3;i++) {
  title.showFeatures()
  title.showFeatures()
  assert.strictEqual(titleQueries.length, 1, 'rapid taps measure the title only once')
  titleQueries.shift()({left:40,top:40,width:80,height:32})
  assert.strictEqual(title.modelNameOpa.value, 0)
  title.closeFeatures()
  assert.strictEqual(title.modelNameOpa.value, 1)
}
title.showFeatures()
title.closeFeatures()
titleQueries.shift()({left:40,top:40,width:80,height:32})
assert.strictEqual(titleEvents.length, 3, 'late title measurement cannot hide a restored trigger')
assert.strictEqual(title.modelNameOpa.value, 1)
assert.match(titleNavWxml, /class="model-name-anchor\b[^\"]*"/)
assert.match(chatViewJs, /select\('\.model-summary'\)[\s\S]*select\('\.chat-page'\)[\s\S]*modelsSelect"\)\.show\(rect,boundaryRect\)/)

const events = []
const closingContext = {
  _phase: 'open',
  _token: 4,
  properties: { animateTrigger: true },
  anchorScale: { value: 0.8 },
  anchorOpacity: { value: 0 },
  anchorTranslate: { value: 0 },
  panelScale: { value: 1 },
  panelOpacity: { value: 1 },
  animateAnchor: methods.animateAnchor,
  finishClose: methods.finishClose,
  triggerEvent: (name, detail) => events.push({ name, detail }),
  setData(data, callback) {
    this.data = Object.assign({}, this.data, data)
    if (callback) callback()
  }
}

assert.strictEqual(methods.close.call(closingContext), true)
assert.strictEqual(closingContext.data.portalActive, false)
assert.deepStrictEqual(JSON.parse(JSON.stringify(events)), [
  { name: 'close', detail: { reason: 'api' } },
  { name: 'afterclose' }
])
assert.strictEqual(methods.close.call(closingContext), false)

const tapCloseReasons = []
let maskTapCount = 0
const tapContext = {
  _phase: 'open',
  _maskTapReadyAt: 0,
  properties: { closeOnMaskTap: true, closeOnPopupTap: false },
  close: reason => { tapCloseReasons.push(reason) },
  triggerEvent: name => { if (name === 'masktap') maskTapCount += 1 }
}
methods.handlePopupTap.call(tapContext)
assert.deepStrictEqual(tapCloseReasons, [])
tapContext.properties.closeOnPopupTap = true
methods.handlePopupTap.call(tapContext)
methods.handleMaskTap.call(tapContext)
assert.deepStrictEqual(tapCloseReasons, ['popup', 'mask'])
assert.strictEqual(maskTapCount, 1)
tapContext.properties.closeOnMaskTap = false
methods.handleMaskTap.call(tapContext)
assert.deepStrictEqual(tapCloseReasons, ['popup', 'mask'])
assert.strictEqual(maskTapCount, 2)

tapContext.properties.closeOnMaskTap = true
tapContext._phase = 'measuring'
methods.handleMaskTap.call(tapContext)
assert.deepStrictEqual(tapCloseReasons, ['popup', 'mask'])
assert.strictEqual(maskTapCount, 3)
tapContext._phase = 'open'
tapContext._maskTapReadyAt = Date.now() + 1000
methods.handleMaskTap.call(tapContext)
assert.deepStrictEqual(tapCloseReasons, ['popup', 'mask'])
assert.strictEqual(maskTapCount, 4)
tapContext._maskTapReadyAt = 0

let triggerOpenCount = 0
const triggerContext = {
  properties: { disabled: false, openOnTriggerTap: true },
  open: () => { triggerOpenCount += 1 }
}
methods.handleTriggerTap.call(triggerContext)
triggerContext.properties.openOnTriggerTap = false
methods.handleTriggerTap.call(triggerContext)
triggerContext.properties.openOnTriggerTap = true
triggerContext.properties.disabled = true
methods.handleTriggerTap.call(triggerContext)
assert.strictEqual(triggerOpenCount, 1)

async function testReopenAfterClose() {
  const stateEvents = []
  const updateSteps = []
  const stateContext = {
    ...methods,
    _phase: 'closed',
    _token: 0,
    properties: {
      popupWidthRpx: 450,
      maxHeightRatio: 0.6,
      safeGapRpx: 36,
      edgeGapRpx: 24,
      animateTrigger: true,
      scrollable: true,
      disabled: false
    },
    data: {},
    anchorScale: { value: 1 },
    anchorOpacity: { value: 1 },
    anchorTranslate: { value: 0 },
    panelScale: { value: 0 },
    panelOpacity: { value: 0 },
    measurePopup: async () => {
      assert.strictEqual(stateContext.data.maskMounted, true)
      return {
        portalRect: { top: 0, left: 0 },
        panelRect: { height: 800 },
        scrollHeight: 780,
        contentRect: { height: 180 }
      }
    },
    setDataAndWait(data) {
      updateSteps.push(data)
      this.data = Object.assign({}, this.data, data)
      return Promise.resolve()
    },
    setData(data, callback) {
      this.data = Object.assign({}, this.data, data)
      if (callback) callback()
    },
    triggerEvent: name => stateEvents.push(name)
  }
  const anchor = { left: 300, top: 400, width: 40, height: 30 }
  const boundary = { left: 0, top: 0, width: 375, height: 500 }

  const popupSelectors = []
  const popupRects = [{top:124,left:8,width:1,height:1}, {height:220}, {height:180}]
  const measured = await methods.measurePopup.call({
    _scrollHeight:200,
    createSelectorQuery: () => ({
      select(selector) { popupSelectors.push(selector); return this },
      boundingClientRect() { return this },
      exec(callback) { callback(popupRects) }
    })
  })
  assert.deepStrictEqual(popupSelectors, [
    '.yb-flyout-origin', '.yb-flyout-panel-metrics', '.yb-flyout-popup-content'
  ], 'popup geometry queries native markers and the single content node, not abstract containers')
  assert.strictEqual(measured.portalRect, popupRects[0])
  assert.strictEqual(measured.panelRect, popupRects[1])
  assert.strictEqual(measured.contentRect, popupRects[2])
  assert.strictEqual(measured.scrollHeight, 200, 'scroll height comes from the applied internal height')
  const measuredLayout = methods.getPopupLayout.call({...context, getLayoutMetrics:methods.getLayoutMetrics}, anchor, measured, boundary)
  assert.strictEqual(measuredLayout.layout.panelHeightPx, 200, 'marker geometry preserves the 20px panel chrome')
  assert.strictEqual(measuredLayout.scrollHeight, 180)
  assert.strictEqual(measuredLayout.layout.maskTopPx, -124)
  assert.strictEqual(measuredLayout.layout.maskLeftPx, -8)

  assert.strictEqual(await methods.open.call({ _phase: 'closed', properties: { disabled: true } }, anchor), false)
  assert.strictEqual(await methods.open.call(stateContext, anchor, boundary), true)
  assert.strictEqual(stateContext._phase, 'open')
  assert.strictEqual(updateSteps[0].maskMounted, true)
  assert.strictEqual(updateSteps[0].portalActive, false)
  assert.strictEqual(updateSteps[1].portalActive, true)
  assert.match(updateSteps[1].positionerStyle, /top:282px;/)
  assert.strictEqual(await methods.reposition.call(stateContext, anchor), true)
  assert.strictEqual(methods.close.call(stateContext), true)
  assert.strictEqual(stateContext._phase, 'closed')
  assert.strictEqual(stateContext.data.maskMounted, false)
  assert.strictEqual(await methods.open.call(stateContext, anchor), true)
  assert.strictEqual(stateContext._phase, 'open')
  assert.strictEqual(stateContext.data.maskMounted, true)
  assert.deepStrictEqual(stateEvents, ['open', 'close', 'afterclose', 'open'])
  stateContext.close()

  const createFlyout = () => ({
    ...stateContext, _phase:'closed', _token:0, _cancelOpen:null,
    properties:{...stateContext.properties, openOnTriggerTap:true, closeOnMaskTap:true},
    data:{}, events:[],
    anchorScale:{value:1}, anchorOpacity:{value:1}, anchorTranslate:{value:0},
    panelScale:{value:0}, panelOpacity:{value:0},
    triggerEvent(name) { this.events.push(name) },
    measureAnchor:async () => anchor,
    measurePopup:async () => ({ portalRect:{top:0,left:0}, panelRect:{height:200},
      scrollHeight:200, contentRect:{height:180} })
  })
  for(const stage of ['measureAnchor', 'setDataAndWait', 'measurePopup', 'activation']) {
    const previous = createFlyout(), latest = createFlyout()
    let resume
    if(stage === 'activation') {
      previous.setDataAndWait = data => {
        Object.assign(previous.data, data)
        return data.portalActive ? new Promise(resolve => { resume = resolve }) : Promise.resolve()
      }
    } else previous[stage] = () => new Promise(resolve => { resume = resolve })
    const opening = previous.open(stage === 'measureAnchor' ? undefined : anchor)
    await new Promise(setImmediate)
    assert.strictEqual(typeof resume, 'function', 'the suspended layout callback must be registered')
    assert.strictEqual(await latest.open(anchor), true)
    assert.strictEqual(await opening, false, 'superseded open settles without waiting for the old native callback')
    assert.strictEqual(previous.anchorOpacity.value, 1)
    assert.strictEqual(previous.data.maskMounted, false)
    assert.deepStrictEqual(previous.events, ['close', 'afterclose'])
    resume(stage === 'measureAnchor' ? anchor : null)
    await Promise.resolve()
    assert.strictEqual(latest._phase, 'open')
    assert.strictEqual(previous._phase, 'closed', 'late layout cannot resurrect the previous popup')
    latest.close()
  }
  for(const stage of ['measureAnchor', 'measurePopup']) {
    const failed = createFlyout()
    failed[stage] = async () => null
    assert.strictEqual(await failed.open(stage === 'measureAnchor' ? undefined : anchor), false)
    assert.strictEqual(failed.anchorOpacity.value, 1)
    assert.strictEqual(failed.data.maskMounted, false)
    assert.deepStrictEqual(failed.events, ['close', 'afterclose'], 'measurement failure notifies external title owners too')
  }
  const rejected = createFlyout()
  rejected.measurePopup = async () => { throw new Error('native query failed') }
  assert.strictEqual(await rejected.open(anchor), false)
  assert.strictEqual(rejected.anchorOpacity.value, 1)
  assert.strictEqual(rejected._phase, 'closed')

  for (const completion of ['delayed', 'cancelled', 'missing']) {
    const flyout = createFlyout()
    pendingTimingCallbacks = []
    assert.strictEqual(await flyout.open(anchor), true)
    flyout._maskTapReadyAt = 0
    flyout.handleMaskTap()
    assert.strictEqual(flyout._phase, 'closing', 'mask close retains the native closing animation')
    assert.strictEqual(flyout.anchorOpacity.value, 1, 'the trigger restores before native completion')
    assert.strictEqual(pendingTimingCallbacks.length, 1)
    assert.strictEqual(cleanupTimers.size, 1, 'one cleanup timer covers a lost native completion')
    const callback = pendingTimingCallbacks[0]
    if (completion === 'delayed') callback(true)
    else {
      if (completion === 'cancelled') {
        callback(false)
        assert.strictEqual(flyout._phase, 'closing', 'cancelled animation is not a completed close')
        assert.strictEqual(cleanupTimers.size, 1)
      }
      const [id, timer] = [...cleanupTimers][0]
      assert.strictEqual(timer.delay, 360)
      cleanupTimers.delete(id)
      timer.callback()
    }
    assert.strictEqual(flyout._phase, 'closed')
    assert.strictEqual(flyout.data.maskMounted, false)
    assert.strictEqual(cleanupTimers.size, 0, 'native completion or fallback clears the cleanup timer')
    callback(true)
    assert.strictEqual(flyout.events.filter(event => event === 'afterclose').length, 1,
      'late native completion cannot finish the same close twice')
    pendingTimingCallbacks = null
  }

  for (const replaceWithAnother of [false, true]) {
    const previous = createFlyout(), latest = replaceWithAnother ? createFlyout() : previous
    pendingTimingCallbacks = []
    await previous.open(anchor)
    previous.close()
    const lateCompletion = pendingTimingCallbacks[0]
    assert.strictEqual(await latest.open(anchor), true,
      'a new open completes the previous closing layer without awaiting native completion')
    assert.strictEqual(cleanupTimers.size, 0)
    if (replaceWithAnother) assert.strictEqual(previous.data.maskMounted, false)
    lateCompletion(true)
    assert.strictEqual(latest._phase, 'open', 'late close completion cannot close the newer popup')
    assert.strictEqual(latest.data.portalActive, true)
    pendingTimingCallbacks = null
    latest.close()
  }

  const settingFlyouts = [createFlyout(), createFlyout()]
  for (const flyout of settingFlyouts) {
    let opening
    flyout.measureAnchor = methods.measureAnchor
    flyout.createSelectorQuery = () => ({
      select(selector) { assert.strictEqual(selector, '.yb-flyout-anchor'); return this },
      boundingClientRect(callback) { this.callback = callback; return this },
      exec() { this.callback(anchor) }
    })
    flyout.open = function (...args) { opening = methods.open.apply(this, args); return opening }
    flyout.openFromTrigger = async () => {
      flyout.handleTriggerTap()
      assert.strictEqual(await opening, true)
    }
    for (let i = 0; i < 2; i++) {
      await flyout.openFromTrigger()
      assert.strictEqual(flyout.anchorOpacity.value, 0)
      flyout._maskTapReadyAt = 0
      flyout.handleMaskTap()
      assert.strictEqual(flyout._phase, 'closed')
      assert.strictEqual(flyout.anchorOpacity.value, 1)
    }
  }
  await settingFlyouts[0].openFromTrigger()
  await settingFlyouts[1].openFromTrigger()
  assert.strictEqual(settingFlyouts[0].data.maskMounted, false,
    'opening another setting cannot resurrect the previous setting popup')
  assert.strictEqual(settingFlyouts[0].anchorOpacity.value, 1)
  assert.strictEqual(settingFlyouts[1].data.portalActive, true)
  settingFlyouts[1].close()

  let featureDefinition
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../components/_self/yb-feature-popup/index.js'), 'utf8'), {
    Component: value => { featureDefinition = value }, wx: { worklet }, Promise
  })
  const anchored = createFlyout(), featureEvents = [], showCallbacks = []
  const feature = {
    ...featureDefinition.methods, data: { popupType:'' }, deferShow: false,
    popupView: {value:0}, popupScale: {value:0}, popupOpacity: {value:0},
    selectComponent: () => anchored,
    setData(data, callback) {
      if (data.popupType === 'more') assert.strictEqual(anchored.data.maskMounted, false,
        'the old anchored shell closes before switching away from its content')
      Object.assign(this.data, data)
      if (this.deferShow) showCallbacks.push(callback)
      else callback?.()
    },
    triggerEvent: (name, detail) => featureEvents.push({name, type:detail.type})
  }
  anchored.triggerEvent = name => {
    anchored.events.push(name)
    if (name === 'close') feature.handleAnchoredClose()
    if (name === 'afterclose') feature.handleAnchoredAfterClose()
  }
  assert.strictEqual(await feature.show('mode', anchor), true)
  feature.show('more')
  assert.strictEqual(feature.popupView.value, 100)
  assert.deepStrictEqual(featureEvents, [
    {name:'close', type:'mode'}, {name:'afterclose', type:'mode'}
  ])
  feature.close(true)
  feature.deferShow = true
  const pendingCloseEvents = featureEvents.length
  const staleShow = feature.show('mode', anchor)
  feature.close()
  assert.deepStrictEqual(featureEvents.slice(pendingCloseEvents), [
    {name:'close', type:'mode'}, {name:'afterclose', type:'mode'}
  ], 'cancelling a queued mode popup restores its external title')
  showCallbacks.shift()()
  assert.strictEqual(await staleShow, false, 'closing before the render callback cancels a queued show')
  assert.strictEqual(anchored.data.maskMounted, false)
  const pendingSwitchEvents = featureEvents.length
  const pendingMode = feature.show('mode', anchor)
  feature.show('more')
  assert.deepStrictEqual(featureEvents.slice(pendingSwitchEvents), [
    {name:'close', type:'mode'}, {name:'afterclose', type:'mode'}
  ], 'switching a queued mode popup to More restores the mode title')
  showCallbacks.shift()()
  assert.strictEqual(await pendingMode, false)
  showCallbacks.shift()()
  assert.strictEqual(anchored.data.maskMounted, false)
  assert.strictEqual(feature.popupView.value, 100)
  feature.close(true)
  const pendingMoreEvents = featureEvents.length
  feature.show('more')
  feature.close()
  assert.deepStrictEqual(featureEvents.slice(pendingMoreEvents), [{name:'close', type:'more'}],
    'closing a queued More popup restores its external trigger')
  showCallbacks.shift()()
  assert.strictEqual(feature.popupView.value, 0, 'a delayed More callback cannot open after close')
  feature.deferShow = false
  for (const finished of [false, true]) {
    feature.show('more')
    pendingTimingCallbacks = []
    feature.close()
    assert.strictEqual(pendingTimingCallbacks.length, 1)
    const lateMoreClose = pendingTimingCallbacks[0]
    feature.show('more')
    lateMoreClose(finished)
    assert.strictEqual(feature.popupView.value, 100,
      'cancelled or completed old More animation cannot hide a newly opened More popup')
    assert.strictEqual(feature.popupOpacity.value, 1)
    assert.strictEqual(feature.popupScale.value, 1)
    pendingTimingCallbacks = null
    feature.close(true)
  }
  feature.show('more')
  pendingTimingCallbacks = []
  feature.close()
  const moreToModeCompletion = pendingTimingCallbacks[0]
  await feature.show('mode', anchor)
  assert.strictEqual(feature.popupView.value, 0, 'switching a closing More popup to mode removes its hit layer')
  moreToModeCompletion(true)
  assert.strictEqual(anchored.data.portalActive, true)
  pendingTimingCallbacks = null
  feature.close(true)
  feature.show('more')
  pendingTimingCallbacks = []
  const repeatedCloseEvents = featureEvents.length
  feature.close()
  feature.close()
  assert.strictEqual(pendingTimingCallbacks.length, 1, 'repeated close does not enqueue another More animation')
  pendingTimingCallbacks[0](true)
  assert.strictEqual(feature.popupView.value, 0, 'repeated close keeps the original completion valid')
  assert.deepStrictEqual(featureEvents.slice(repeatedCloseEvents), [{name:'close', type:'more'}])
  pendingTimingCallbacks = null
  await feature.show('mode', anchor)
  const aftercloseCallbacks = []
  anchored.setData = function (data, callback) { Object.assign(this.data, data); if (callback) aftercloseCallbacks.push(callback) }
  feature.close(true)
  await feature.show('conversation', anchor)
  const eventCount = featureEvents.length
  aftercloseCallbacks.shift()()
  assert.strictEqual(featureEvents.length, eventCount,
    'a stale finish render callback cannot emit afterclose for the newly opened type')
  feature.close(true)
  aftercloseCallbacks.shift()()
}

testReopenAfterClose()
  .then(() => console.log('ybFlyoutPosition tests passed'))
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })

assert.match(titleNavWxml, /class="model-name-anchor\b[^"]*\bac\b/)

assert.match(titleNavWxml, /class="model-name-anchor\b[^"]*\bdr\b[^"]*\bac\b/)
