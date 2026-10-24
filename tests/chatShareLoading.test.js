const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8')

const page = read('pages/index/index.js')
const view = read('components/_self/yb-chat-view/index.js')
assert.match(page, /this\.setData\(\{ shareLoading: true \}\)/)
assert.match(page, /\.finally\(\(\) => \{\s*clearTimeout\(timer\)\s*this\.setData\(\{ shareLoading: false \}\)/)
assert.match(view, /showFeaturePopup\(type, anchorRect\)[\s\S]*?this\.blurChatInput\(\)/)
assert.match(view, /blurChatInput\(\)[\s\S]*?input\.setInputFocus\(false\)[\s\S]*?wx\.hideKeyboard\(\)/)
for (const file of ['components/_self/yb-feature-popup/index.wxml']) {
  const markup = read(file)
  assert.match(markup, /shareLoading \? 'icon-loading_flow_iconfont/)
  assert.match(markup, /open-type="share" disabled="\{\{shareLoading\}\}"/)
}
const actionMarkup = read('mdPackage/components/assisAct/index.wxml')
assert.match(actionMarkup, /shareLoading \|\| sharePending \? 'icon-loading_flow_iconfont/)
assert.match(actionMarkup, /open-type="share" disabled="\{\{shareLoading\}\}" bind:tap="shareHaptic"/)
const action = read('mdPackage/components/assisAct/index.js')
let component
let pendingTimer
vm.runInNewContext(action.replace(/^import .*\n/, ''), {
  Component: definition => { component = definition },
  require: name => name.includes('theme') ? { getThemeStyle:() => ({}) } : {},
  triggerHaptic: () => {},
  setTimeout: callback => { pendingTimer = callback; return 1 },
  clearTimeout: () => {}
})
const instance = {
  data: { hapticFeedback:false, sharePending:false },
  setData(update) { Object.assign(this.data, update) }
}
component.methods.shareHaptic.call(instance)
assert.equal(instance.data.sharePending, true)
component.observers.shareLoading.call(instance, false)
assert.equal(instance.data.sharePending, false)
component.methods.shareHaptic.call(instance)
pendingTimer()
assert.equal(instance.data.sharePending, false)
for (const file of ['components/_self/yb-chat-view/index.wxml', 'mdPackage/components/assisDone/index.wxml', 'mdPackage/components/assisStream/index.wxml']) {
  assert.match(read(file), /share-loading="\{\{shareLoading\}\}"/)
}
console.log('chatShareLoading: ok')
