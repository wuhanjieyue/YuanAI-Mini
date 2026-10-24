const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
let definition
const haptics = []
global.triggerHaptic = (enabled, type) => { if(enabled) haptics.push(type) }
global.Component = value => { definition = value }
const componentPath = path.resolve(__dirname, '../mdPackage/components/assisAct/index.js')
const componentSource = fs.readFileSync(componentPath, 'utf8')
  .replace("import { triggerHaptic } from '../../../static_utils/haptic'", 'const { triggerHaptic } = global')
const componentModule = new Module(componentPath)
componentModule.filename = componentPath
componentModule.paths = Module._nodeModulePaths(path.dirname(componentPath))
componentModule._compile(componentSource, componentPath)
delete global.Component

async function main() {
  const chatViewWxml = fs.readFileSync(path.resolve(__dirname, '../components/_self/yb-chat-view/index.wxml'), 'utf8')
  const doneWxml = fs.readFileSync(path.resolve(__dirname, '../mdPackage/components/assisDone/index.wxml'), 'utf8')
  const streamWxml = fs.readFileSync(path.resolve(__dirname, '../mdPackage/components/assisStream/index.wxml'), 'utf8')
  assert.match(chatViewWxml, /hapticFeedback: applicationSettings\.hapticFeedback/)
  assert.match(doneWxml, /haptic-feedback="\{\{hapticFeedback\}\}"/)
  assert.match(streamWxml, /haptic-feedback="\{\{hapticFeedback\}\}"/)
  const requests = []
  const toasts = []
  global.wx = {
    yuanAI: { updateChatFeedback: async value => { requests.push(value) } },
    showToast: value => toasts.push(value)
  }
  const instance = {
    data: { item: { messageId: 'reply' }, feedbackValue: null, hapticFeedback: true },
    properties: { language: '中文' },
    setData(value) { Object.assign(this.data, value) },
    selectComponent() { return { close() {} } },
    triggerEvent() {}
  }
  definition.methods.feedbackFlyoutOpened.call(instance)
  definition.methods.moreFlyoutOpened.call(instance)
  definition.methods.copy.call(instance)
  definition.methods.share.call(instance)
  definition.methods.openSources.call(instance)
  definition.methods.selectMoreAction.call(instance, { currentTarget: { dataset: { action: 'webSearch' } } })
  const choose = value => definition.methods.setFeedback.call(instance, { currentTarget: { dataset: { value } } })
  await choose('like')
  assert.equal(instance.data.feedbackValue, 'like')
  await choose('dislike')
  assert.equal(instance.data.feedbackValue, 'dislike')
  await choose('dislike')
  assert.equal(instance.data.feedbackValue, null)
  assert.deepEqual(requests.map(value => value.value), ['like', 'dislike', null])
  wx.yuanAI.updateChatFeedback = async () => { throw new Error('offline') }
  await choose('like')
  assert.equal(instance.data.feedbackValue, null)
  assert.equal(toasts.length, 1)
  let finish
  wx.yuanAI.updateChatFeedback = () => new Promise(resolve => { finish = resolve })
  const pending = choose('like')
  await choose('dislike')
  instance.data.item = { messageId: 'another-reply' }
  finish()
  await pending
  assert.equal(instance.data.feedbackValue, null)
  assert.equal(instance._feedbackPending, false)
  assert.deepEqual(haptics, ['light', 'light', 'light', 'light', 'light', 'light', 'light', 'light', 'light', 'light', 'light'])
  instance.data.hapticFeedback = false
  definition.methods.feedbackFlyoutOpened.call(instance)
  definition.methods.moreFlyoutOpened.call(instance)
  definition.methods.copy.call(instance)
  definition.methods.share.call(instance)
  definition.methods.openSources.call(instance)
  definition.methods.selectMoreAction.call(instance, { currentTarget: { dataset: { action: 'webSearch' } } })
  assert.equal(haptics.length, 11)
  console.log('messageFeedback: ok')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
