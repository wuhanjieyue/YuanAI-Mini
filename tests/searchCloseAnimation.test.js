const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { prepareSearchClose } = require('../static_utils/searchAnimation')

for (const name of ['library-view', 'create-view', 'knowledge-view', 'plugins-view', 'archived-chats']) {
  const base = path.join(__dirname, '../components/_self', `yb-${name}/index`)
  const timings = []
  let definition, keyboardHides = 0
  vm.runInNewContext(fs.readFileSync(`${base}.js`, 'utf8').replace(/^import .*$/gm, ''), {
    Component: value => { definition = value },
    require: name => name.endsWith('searchAnimation') ? { prepareSearchClose } : {},
    wx: { hideKeyboard() { keyboardHides++ }, setStorage() {}, worklet: {
      timing(value, options) { timings.push({ value, ...options }); return value }, Easing: { ease: 'ease' }
    } }
  })
  const view = {
    ...definition.methods,
    data: { query: 'test', inputFocus: true }, properties: {},
    _keyboardOffset: { value: 312 }, _keyboardHeightTmp: 300,
    _searchActionProgress: { value: 1 }, _searchActionActive: true,
    _searchCloseKeyboardHeight: { value: 0 }, _searchCloseProgress: { value: 0 },
    _searchAssets: { cancel() {} }, _searchConversations: { cancel() {} }, _requestVersion: 0,
    setData(patch, callback) { Object.assign(this.data, patch); callback?.() },
    loadAssetPage() {}, loadRecommendedSkills() {}, loadPage() {}, clearAction() {}
  }
  view.clearSearch()
  assert.equal(view.data.query, '', `${name}: clear results immediately`)
  assert.equal(keyboardHides, 1)
  assert.equal(timings.length, 0, `${name}: wait for native keyboard frames instead of separate timers`)
  view.handleSearchBlur()
  view.handleSearchKeyboardHeightChange({ detail: { height: 0, duration: 250 } })
  assert.equal(timings.length, 0, `${name}: blur and JS keyboard events cannot restart the exit`)
  for (const height of [300, 225, 150, 75, 0]) {
    view.handleSearchKeyboardUpdate({ detail: { height } })
    assert.equal(view._keyboardOffset.value, 312 * height / 300, `${name}: page and search row follow the keyboard`)
    assert.equal(view._searchActionProgress.value, height / 300, `${name}: clear-button size/opacity and search width share progress`)
  }
  assert.equal(view._searchCloseKeyboardHeight.value, 0, `${name}: completion releases keyboard-follow state`)
  view.handleSearchKeyboardUpdate({ detail: { height: 150 } })
  assert.equal(view._keyboardOffset.value, 0, `${name}: later keyboard events cannot revive a completed close`)
  view.handleSearchKeyboardHeightChange({ detail: { height: 0 } })
  assert.equal(timings.length, 0, `${name}: repeated zero-height callbacks keep the completed exit stable`)
  view.handleSearchFocus()
  view.animateSearchAction(true)
  view.handleSearchKeyboardUpdate({ detail: { height: 0 } })
  assert.equal(view._keyboardOffset.value, 312, `${name}: refocusing cancels the old close-follow state`)
  assert.equal(view._searchActionProgress.value, 1)

  view._keyboardOffset.value = 0
  view.clearSearch()
  assert.equal(view._searchActionProgress.value, 0, `${name}: without a keyboard, use the normal reverse timing`)
  view._keyboardOffset.value = 312
  view._searchActionProgress.value = 0.6
  prepareSearchClose(view)
  view.handleSearchKeyboardUpdate({ detail: { height: 150 } })
  assert.equal(view._searchActionProgress.value, 0.3, `${name}: closing during entry never jumps back to full size`)
  assert.match(fs.readFileSync(`${base}.wxml`, 'utf8'), /worklet:onkeyboardheightchange="handleSearchKeyboardUpdate"/)
}
console.log('searchCloseAnimation: five search bars follow native keyboard progress, including blur, repeated callbacks and refocus')
