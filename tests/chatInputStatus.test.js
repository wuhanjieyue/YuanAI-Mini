const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

let component
const events = []
const source = fs.readFileSync('components/_self/yb-chat-input/index.js', 'utf8').replace(/^import .*$/gm, '')
vm.runInNewContext(source, {
  require: () => ({}),
  wx: { worklet: { shared() {}, timing() {}, Easing: {}, sequence() {} } },
  Component: definition => { component = definition }
})

const input = {
  data: { ...component.data },
  setData(patch) { Object.assign(this.data, patch) },
  triggerEvent(name, detail) { events.push({ name, detail }) },
  ...component.methods
}

input.syncAskStatus('', true)
assert.equal(input.data.askStatus, 1)
input.data.askText = '下一条消息'
component.observers.askText.call(input, input.data.askText)
assert.equal(input.data.askStatus, 1)
input.finish()
assert.equal(input.data.askStatus, 0)
input.data.askText = ''
component.observers.askText.call(input, '')
assert.equal(input.data.askStatus, 2)

events.length = 0
input.data.disabled = true
input.data.askText = '保留草稿'
for (const status of [0, 2]) {
  input.data.askStatus = status
  input.tap()
}
input.longpress({})
input.tapVoice()
input.startRecordAnim()
input.inputAsk({ detail: { value: '@' } })
input.clearText()
input.startChat()
assert.equal(input.data.askText, '保留草稿', 'disabled input preserves the draft')
assert.equal(events.length, 0, 'disabled send, voice and mention actions emit no events')
input.data.askStatus = 1
input.tap()
assert.equal(events.at(-1).name, 'endStream', 'an existing response can still be stopped')
input.data.disabled = false
input.data.askStatus = 0
input.data.settings = { hideKey: true }
input.startChat()
assert.equal(events.at(-1).name, 'startChat', 're-enabling restores sending')
assert.equal(events.at(-1).detail.askText, '保留草稿')

const template = fs.readFileSync('components/_self/yb-chat-input/index.wxml', 'utf8')
const textarea = template.match(/<textarea[\s\S]*?<\/textarea>/)[0]
const bindings = Object.fromEntries([...textarea.matchAll(/\b(disabled|focus|value|placeholder)="\{\{([^}]+)\}\}"/g)]
  .map(([, name, expression]) => [name, expression]))
const display = { disabled: true, disabledPlaceholder: '此功能正在开发中', inputFocus: true, askText: '保留草稿', placeHolder: '询问任何问题' }
assert.equal(vm.runInNewContext(bindings.disabled, display), true)
assert.equal(vm.runInNewContext(bindings.focus, display), false)
assert.equal(vm.runInNewContext(bindings.value, display), '')
assert.equal(vm.runInNewContext(bindings.placeholder, display), '此功能正在开发中')
display.disabled = false
assert.equal(vm.runInNewContext(bindings.value, display), '保留草稿')
assert.equal(vm.runInNewContext(bindings.placeholder, display), '询问任何问题')
display.disabled = true
display.disabledPlaceholder = ''
assert.equal(vm.runInNewContext(bindings.value, display), '保留草稿', 'history validation keeps the draft visible')
assert.match(template, /disabled && askStatus != 1 \? 'input-action-disabled'/)
assert.match(template, /askStatus == 0 \|\| \(disabled && askStatus != 1\)/)
const host = fs.readFileSync('components/_self/yb-chat-view/index.wxml', 'utf8')
assert.match(host, /disabled="\{\{modeId == 'work'\}\}"/)
assert.match(host, /disabled-placeholder="\{\{modeId == 'work' \? i18n.chat.inDevelopment : ''\}\}"/)
const { t } = require('../static_utils/i18n/index')
assert.equal(t('中文', 'chat.inDevelopment'), '此功能正在开发中')
assert.equal(t('English', 'chat.inDevelopment'), 'This feature is under development')
console.log('chatInputStatus: disabled input, send/voice guards, draft restoration and Stop passed')

assert.doesNotMatch(host, /(?:disabled|class)="[^"]*(?:historyInitialLoading|validatingConversation)[^"]*input-box-disabled/)
