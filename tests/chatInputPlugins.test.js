const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
let definition
vm.runInNewContext(read('components/_self/yb-chat-input/index.js').replace(/^import .*$/gm, ''), {
  require: () => ({}),
  wx: { worklet: {} },
  Component(value) { definition = value }
})
const inputEvents = []
const chatInputInstance = {
  data: { askText: '' },
  setData(updates) { Object.assign(this.data, updates) },
  triggerEvent(name) { inputEvents.push(name) },
  ...definition.methods
}

inputEvents.length = 0
for (const value of ['', ' @', '@ ', 'a@', '@a', '@@', '\n@']) {
  chatInputInstance.inputAsk({ detail: { value } })
  assert.equal(chatInputInstance.data.askText, value)
}
assert.equal(inputEvents.length, 0, '只有完整输入为 @ 才打开插件')
chatInputInstance.inputAsk({ detail: { value: '@' } })
assert.deepEqual(inputEvents, ['openPlugins'])
assert.equal(chatInputInstance.data.askText, '@', '打开及取消弹窗均保留 @')
assert.equal(chatInputInstance.data.inputFocus, false)
chatInputInstance.inputAsk({ detail: { value: '@' } })
assert.deepEqual(inputEvents, ['openPlugins'], '同值事件不重复打开')
assert.equal(chatInputInstance.data.askText, '@')

assert.match(read('components/_self/yb-chat-view/index.wxml'), /bind:openPlugins="openPlugins"/)
const chatViewSource = read('components/_self/yb-chat-view/index.js')
const openPlugins = vm.runInNewContext('({' + chatViewSource.match(/openPlugins\(\)\s*\{[^}]*\}/)[0] + '}).openPlugins')
let focused, opened = 0
openPlugins.call({ setFoucs(value) { focused = value }, openFilePage(...args) { assert.deepEqual(args, ['', true]); opened++ } })
assert.equal(focused, false)
assert.equal(opened, 1, '复用已有半屏工具页入口')
assert.doesNotMatch(read('pages/index/index.wxml'), /bind:openPlugins=/)
assert.doesNotMatch(read('pages/index/index.js'), /openPlugins\(/)
assert.match(read('pages/index/index.wxml'), /bind:openFile="openFilePage"/)
const pageSource = read('pages/index/index.js')
const callbackSource = pageSource.match(/selectFeature: \(data\) => \{([\s\S]*?)\n        \},/)[1]
for (const fromMention of [false, true]) {
  for (const text of ['@', '@hello', ' @', '']) {
    let selected = 0, cleared = 0
    const input = { data: { askText: text }, clearText() { cleared++; this.data.askText = '' } }
    const select = vm.runInNewContext('(function(data) {' + callbackSource + '})', { detail: { fromMention }, epoch:0, store:{assetCacheEpoch:0} })
    select.call({ getChatView: () => ({ selectFeature() { selected++ }, selectComponent: () => input }) }, { feature: 'searching', tip: 'Search' })
    assert.equal(selected, 1)
    assert.equal(cleared, fromMention && text === '@' ? 1 : 0)
  }
}
for (const fromMention of [false, true]) {
  for (const text of ['@', '@hello', '原有草稿']) {
    const skill = {id:'skillhub_copywriter',title:'文案创作',titleEn:'Copywriter',logoUrl:'https://example.test/logo.png'}
    let selected, cleared = 0
    const input = {data:{askText:text},clearText(){cleared++;this.data.askText=''}}
    const state = {assetCacheEpoch:0}
    const select = vm.runInNewContext('(function(data) {' + callbackSource + '})', {detail:{fromMention},epoch:0,store:state})
    const host = {getChatView:()=>({selectSkill(item){selected=item},selectComponent:()=>input})}
    select.call(host,{skill})
    assert.equal(selected,skill,'generic Skill selection uses the tag-only chat method')
    assert.equal(cleared,fromMention && text === '@' ? 1 : 0)
    state.assetCacheEpoch++
    selected=null
    select.call(host,{skill})
    assert.equal(selected,null,'an old account event cannot change the new account draft')
  }
}
console.log('chatInputPlugins: ok')
