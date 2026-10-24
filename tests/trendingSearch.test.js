const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { CHAT_MODE_IDS } = require('../static_utils/chatModes')

const template = fs.readFileSync(path.join(__dirname, '../components/_self/yb-chat-view/index.wxml'), 'utf8')
const chatViewScript = fs.readFileSync(path.join(__dirname, '../components/_self/yb-chat-view/index.js'), 'utf8')
const expression = chatViewScript.match(/function shouldShowTrendingSearch\(data\) \{\s*return ([\s\S]*?)\n\}/)[1]
const empty = { recommendationItems: [{}, {}, {}], suggest: { trendingSearch: true }, chats: [], sessionTurns: [], streamStatus: false, historyInitialLoading: false, validatingConversation: false, inputFocused: false, hasInputValue: false }
const visible = patch => vm.runInNewContext(expression, { CHAT_MODE_IDS, data: { ...empty, ...patch } })
assert.equal(visible({}), true)
for (const patch of [
  { modeId: 'work' },
  { recommendationItems: [] },
  { suggest: { trendingSearch: false } },
  { chats: [{}] },
  { sessionTurns: [{}] },
  { streamStatus: true },
  { historyInitialLoading: true },
  { validatingConversation: true },
  { inputFocused: true },
  { hasInputValue: true }
]) assert.equal(visible(patch), false)
const recommendations = fs.readFileSync(path.join(__dirname, '../components/_self/yb-trending-search/index.wxml'), 'utf8')
assert.match(recommendations, /wx:for="{{items}}"/)
assert.match(recommendations, /wx:if="{{loading}}"[\s\S]*\[76, 58, 68\][\s\S]*recommendation-skeleton skeleton-clip/)
assert.match(recommendations, /catch:tap="selectItem"/)
assert.match(recommendations, /wx:if="{{index == 0}}"[\s\S]*icon-refresh-line/)
assert.match(template, /bind:refresh="refreshRecommendations"/)
assert.match(template, /<yb-trending-search[^>]*wx:if="{{trendingSearchMounted}}"/, 'the custom-component host must leave hit testing after exit')
assert.match(template, /bind:exitcomplete="handleTrendingSearchExitComplete"/)
assert.match(template, /visible="{{trendingSearchVisible}}"/)
assert.match(template, /<yb-trending-search[^>]*style="pointer-events: {{trendingSearchVisible \? 'auto' : 'none'}};"/, 'the host immediately stops intercepting taps while hidden or retracting')
assert.match(template, /loading="{{recommendationsRefreshing}}"/)
assert.match(chatViewScript, /refreshRecommendations\(\)\{[\s\S]*dailyRecommendations\.shuffle\(\)/)
assert.doesNotMatch(chatViewScript, /refreshRecommendations\(\)[\s\S]{0,200}refreshAndWait/)
assert.match(template, /bind:getAskText="updateInputValue"/)
assert.match(template, /bind:focusChange="updateInputFocus"/)

let input
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../components/_self/yb-chat-input/index.js'), 'utf8').replace(/^import .*$/gm, ''), {
  require: () => ({}),
  wx: { worklet: { timing: value => value, Easing: { ease: 'ease' } } },
  Component(value) { input = value }
})
const state = { ...empty }
const instance = {
  data: { askStatus: 2 },
  _that: { keyHeight: { value: 0 }, pressFlag: { value: false } },
  setData() {}, syncAskStatus() {},
  triggerEvent(name, detail) {
    if (name === 'getAskText') state.hasInputValue = detail.hasValue
    if (name === 'focusChange') state.inputFocused = detail.focused
  }
}
const shown = () => vm.runInNewContext(expression, { CHAT_MODE_IDS, data: state })
input.methods.keyFocus.call(instance)
assert.equal(shown(), false)
for (const text of ['hello', ' ', '\n']) {
  input.observers.askText.call(instance, text)
  input.methods.keyBlur.call(instance)
  assert.equal(shown(), false, 'blur preserves hiding for any raw text, including whitespace')
}
input.observers.askText.call(instance, '')
assert.equal(shown(), true, 'clearing an unfocused draft restores recommendations')
input.methods.keyFocus.call(instance)
input.observers.askText.call(instance, '')
assert.equal(shown(), false, 'clearing while focused keeps recommendations hidden')
input.methods.keyBlur.call(instance)
assert.equal(shown(), true)
console.log('trendingSearch: setting, empty conversation, focus and raw draft visibility passed')

let component
const animations = []
const completions = []
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../components/_self/yb-trending-search/index.js'), 'utf8'), {
  wx: { worklet: {
    shared: value => ({ value }),
    timing(value, options, complete) { animations.push({ value, ...options }); if (complete) completions.push(complete); return value },
    Easing: { ease: 'ease' },
    runOnJS: callback => callback
  } },
  Component(value) { component = value }
})
let style
let exitCompleteCount = 0
const animated = { data: { visible: true }, ...component.methods, applyAnimatedStyle(selector, callback) { style = callback }, triggerEvent(name) { if (name === 'exitcomplete') exitCompleteCount += 1 } }
component.properties.visible.observer.call(animated)
assert.equal(animations.length, 0, 'early property notification waits until the node is ready')
component.lifetimes.ready.call(animated)
assert.equal(style().opacity, 1)
assert.equal(style().transform, 'scaleY(1)')
for (const value of [false, true, false]) {
  animated.data.visible = value
  component.properties.visible.observer.call(animated)
  assert.equal(style().opacity, Number(value), 'rapid toggles target the latest visibility')
}
assert.equal(style().transform, 'scaleY(0.8)')
assert.deepEqual(animations.map(item => item.duration), [220, 160, 220, 160])
completions[0]()
assert.equal(exitCompleteCount, 0, 'stale close completion cannot unmount a reopened list')
completions[1]()
assert.equal(exitCompleteCount, 1, 'the latest close completion requests host unmount')
console.log('trendingSearch: two-phase host visibility and reversible animation passed')

const exitHandlerBody = chatViewScript.match(/handleTrendingSearchExitComplete\(\)\{([\s\S]*?)\n    \}/)[1]
const exitHandler = vm.runInNewContext(`(function() {${exitHandlerBody}})`)
for (const initiallyVisible of [true, false]) {
  const host = {
    data: { trendingSearchVisible:false, trendingSearchMounted:true },
    setData(patch) { Object.assign(this.data, patch) }
  }
  let exits = 0
  const beforeReady = {
    data: { visible:initiallyVisible }, ...component.methods,
    applyAnimatedStyle() {},
    triggerEvent(name) {
      if (name === 'exitcomplete') { exits += 1; exitHandler.call(host) }
    }
  }
  const animationCount = animations.length
  component.properties.visible.observer.call(beforeReady)
  beforeReady.data.visible = false
  component.properties.visible.observer.call(beforeReady)
  component.lifetimes.ready.call(beforeReady)
  assert.equal(animations.length, animationCount, 'an already hidden node needs no retract animation')
  assert.equal(exits, 1, 'hidden before ready still notifies the host to unmount')
  assert.equal(host.data.trendingSearchMounted, false, 'history loaded before ready leaves no invisible host')
  host.data.trendingSearchVisible = true
  host.data.trendingSearchMounted = true
  exitHandler.call(host)
  assert.equal(host.data.trendingSearchMounted, true, 'a delayed exit cannot remove reopened recommendations')
}
console.log('trendingSearch: hiding before ready unmounts the host without waiting for animation')

assert.match(fs.readFileSync(path.join(__dirname, '../components/_self/yb-trending-search/index.wxss'), 'utf8'), /transform-origin: 0% 100%/)
const recommendationStyles = fs.readFileSync(path.join(__dirname, '../components/_self/yb-trending-search/index.wxss'), 'utf8')
assert.match(recommendationStyles, /\.refresh-button\s*\{[\s\S]*padding: 12rpx;[\s\S]*margin: -12rpx;/, 'refresh hit area expands without changing its layout footprint')
assert.match(fs.readFileSync(path.join(__dirname, '../components/_self/yb-trending-search/index.wxml'), 'utf8'), /class="refresh-button\b[^"]*\bft40\b/)

let selected
const picker = { data: { visible: true, loading: false, items: [{ id: '0', text: '新闻' }] }, triggerEvent(name, item) { selected = { name, id: item.id } } }
component.methods.selectItem.call(picker, { currentTarget: { dataset: { id: '0' } } })
assert.deepEqual(selected, { name: 'select', id: '0' })
picker.data.visible = false; selected = null
component.methods.selectItem.call(picker, { currentTarget: { dataset: { id: '0' } } })
assert.equal(selected, null, 'hidden and retracting recommendations cannot be selected')
picker.data.visible = true; picker.data.loading = true
component.methods.selectItem.call(picker, { currentTarget: { dataset: { id: '0' } } })
assert.equal(selected, null, 'recommendation skeletons cannot be selected')
let refreshCount = 0
const refresher = { data: { visible: true, loading: false }, triggerEvent(name) { if (name === 'refresh') refreshCount += 1 } }
component.methods.refresh.call(refresher)
refresher.data.loading = true; component.methods.refresh.call(refresher)
refresher.data.visible = false; component.methods.refresh.call(refresher)
assert.equal(refreshCount, 1, 'only a visible refresh control emits refresh')
