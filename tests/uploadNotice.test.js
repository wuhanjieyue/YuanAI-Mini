const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
let definition
const timers = [], cleared = [], animations = []
let measurements = []
vm.runInNewContext(fs.readFileSync('components/yb-notice-capsule/index.js', 'utf8'), {
  Component: value => { definition = value },
  wx: { worklet: { shared: value => ({ value }), timing(value, options, complete) { animations.push({ ...options, value, complete }); return value }, Easing: { ease: 'ease' }, runOnJS: callback => callback },
    getWindowInfo: () => ({ windowWidth:390 }), getMenuButtonBoundingClientRect: () => ({ top:68,bottom:100,height:32 }) },
  setTimeout(callback, duration) { const timer = { callback, duration }; timers.push(timer); return timer },
  clearTimeout(timer) { cleared.push(timer) }
})
const styles = {}
const capsule = { ...definition.methods, properties:{ text:'默认文字',duration:definition.properties.duration.value,heightRpx:definition.properties.heightRpx.value }, data:{ ...definition.data },
  applyAnimatedStyle(selector, callback) { styles[selector] = callback },
  createSelectorQuery: () => ({ select() { return this }, boundingClientRect(callback) { measurements.push(callback); return this }, exec() {} }),
  setData(patch, callback) { Object.assign(this.data, patch); callback?.() } }
definition.lifetimes.attached.call(capsule)
definition.lifetimes.ready.call(capsule)
const style = () => styles['.notice-capsule']()
assert.equal(style().transform, 'translateY(-65.92px) scale(0.6)')
assert.equal(style().opacity, 0.3)
assert.equal(capsule.properties.heightRpx, 120)
definition.properties.heightRpx.observer.call(capsule, 144)
assert.ok(Math.abs(Number(style().transform.match(/translateY\(([^p]+)px/)[1]) + 72.16) < 1e-8,
  'a taller capsule must still start at the native menu center')
capsule._progress.value = 1
assert.equal(style().transform, 'translateY(0px) scale(1)', 'height does not change the final top offset')
definition.properties.heightRpx.observer.call(capsule, 120)
capsule._progress.value = 0
capsule.show('单个附件不能超过 20 MB')
measurements.pop()({ top:40,left:20 })
assert.equal(capsule.data.visible, true)
assert.equal(capsule.data.message, '单个附件不能超过 20 MB')
assert.equal(capsule.data.noticeTop, 78.72)
assert.ok(Math.abs(capsule.data.noticeLeft - 7.3) < 1e-9)
assert.equal(style().transform, 'translateY(0px) scale(1)')
assert.equal(style().opacity, 1)
assert.equal(animations.at(-1).duration, 100)
assert.equal(animations.at(-1).easing, 'ease')
assert.equal(timers.length, 0, 'dwell time must start after the enter animation finishes')
animations.at(-1).complete(false)
assert.equal(timers.length, 0, 'cancelled enter animation must not start a timer')
animations.at(-1).complete(true)
assert.equal(timers.at(-1).duration, 2000)
capsule._progress.value = 0.5
assert.equal(style().transform, 'translateY(-32.96px) scale(0.8)')
assert.ok(Math.abs(style().opacity - 0.65) < 1e-9)
capsule.properties.duration = 3000
capsule.show(); measurements.pop()(null)
assert.equal(capsule.data.message, '默认文字')
animations.at(-1).complete(true)
assert.equal(timers.at(-1).duration, 3000)
assert.equal(cleared.at(-1), timers[0])
timers.at(-1).callback()
assert.equal(capsule.data.visible, true, 'keep mounted throughout the exit animation')
assert.equal(animations.at(-1).duration, 100)
assert.equal(animations.at(-1).value, 0)
assert.equal(style().transform, 'translateY(-65.92px) scale(0.6)')
assert.equal(style().opacity, 0.3)
const autoHide = animations.at(-1)
capsule.hide(); assert.equal(animations.at(-1), autoHide, 'repeat hide must not restart the exit')
autoHide.complete(true); assert.equal(capsule.data.visible, false)
capsule.show('旧提醒'); const stale = measurements.pop()
capsule.show('最新提醒'); const current = measurements.pop()
current({ top:0,left:0 }); stale({ top:80,left:0 })
assert.equal(capsule.data.message, '最新提醒', 'late layout must not replace the latest notice')
const staleEnter = animations.at(-1), timerCount = timers.length
capsule.show('迟到提醒'); const hidden = measurements.pop()
staleEnter.complete(true)
assert.equal(timers.length, timerCount, 'stale enter completion must not start a timer')
definition.pageLifetimes.hide.call(capsule); hidden(null)
assert.equal(capsule.data.message, '最新提醒', 'page hide invalidates pending layout')
animations.at(-1).complete(true)
assert.equal(capsule.data.visible, false)
capsule.properties.duration = 0
capsule.show('保持显示'); measurements.pop()(null)
animations.at(-1).complete(true)
const count = timers.length
assert.equal(capsule.data.visible, true)
capsule.hide(); assert.equal(capsule.data.visible, true)
const staleHide = animations.at(-1)
capsule.show('重新显示'); measurements.pop()(null)
staleHide.complete(true)
assert.equal(capsule.data.visible, true, 'old exit completion must not hide a newer notice')
capsule.hide()
const detachedHide = animations.at(-1)
definition.lifetimes.detached.call(capsule)
capsule.setData = () => { assert.fail('detached animation completion must not update data') }
detachedHide.complete(true)
capsule.show('已卸载'); assert.equal(timers.length, count)
assert.equal(definition.options.multipleSlots, true)
const markup = fs.readFileSync('components/yb-notice-capsule/index.wxml', 'utf8')
assert.match(markup, /<slot name="prefix"/)
assert.match(markup, /<slot name="suffix"/)
assert.match(markup, /<slot wx:else/)
assert.match(markup, /!customContent/)
assert.match(markup, /height:\{\{heightRpx\}\}rpx/)
assert.match(markup, /border-radius:\{\{heightRpx \/ 2\}\}rpx/)
const css = fs.readFileSync('components/yb-notice-capsule/index.wxss', 'utf8')
assert.match(css, /skyother\.wxss/)
assert.match(css, /transform-origin: 50% 50%/)
assert.match(css, /notice-capsule-hidden[^}]*visibility: hidden;[^}]*pointer-events: none;/)
assert.match(css, /notice-capsule-closing[^}]*pointer-events: none;/)
assert.match(markup, /aria-hidden="\{\{!visible \|\| closing\}\}"/)
const chatMarkup = fs.readFileSync('components/_self/yb-chat-view/index.wxml', 'utf8')
assert.match(chatMarkup, /<yb-notice-capsule[^>]*custom-content="\{\{true\}\}"[^>]*alert="\{\{true\}\}"/)
const assetMarkup = fs.readFileSync('components/_self/yb-asset-actions/index.wxml', 'utf8')
for (const hostMarkup of [chatMarkup, assetMarkup]) {
  assert.doesNotMatch(hostMarkup.match(/<yb-notice-capsule\b[^>]*>/)[0], /\bduration=/, 'both callers use the shared 2000ms dwell default')
}
assert.match(chatMarkup, /slot="suffix"[^>]*catch:tap="hideUploadFailure"/)
const source = fs.readFileSync('components/_self/yb-chat-view/index.js', 'utf8')
const hostContext = { t: () => '' }
vm.runInNewContext('this.methods = {' + source.slice(source.indexOf('  showUploadFailure('), source.indexOf('  /**', source.indexOf('  showUploadFailure('))) + '}', hostContext)
let shown, dismissed = false
const host = { ...hostContext.methods, properties:{ language:'中文' }, setData(patch, callback) { Object.assign(this, patch); callback?.() },
  selectComponent: () => ({ show(message) { shown = message }, hide() { dismissed = true } }) }
host.showUploadFailure('限制提醒'); assert.equal(shown, '限制提醒')
host.hideUploadFailure(); assert.equal(dismissed, true)

function makeCapsule() {
  const bindings = {}, events = []
  const instance = { ...definition.methods, properties:{ text:'', duration:2000, heightRpx:definition.properties.heightRpx.value }, data:{ ...definition.data }, events,
    applyAnimatedStyle(selector, callback) { bindings[selector] = callback },
    createSelectorQuery:capsule.createSelectorQuery,
    triggerEvent(name) { events.push(name) },
    setData(patch, callback) {
      Object.assign(this.data, patch)
      if (callback && this.deferData) this.pendingData = callback
      else callback?.()
    } }
  definition.lifetimes.attached.call(instance)
  definition.lifetimes.ready.call(instance)
  instance.style = () => bindings['.notice-capsule']()
  return instance
}
const first = makeCapsule(), second = makeCapsule(), third = makeCapsule()
first.show('第一条'); measurements.pop()(null)
const firstEnter = animations.at(-1)
first._progress.value = 0.7
first.show('更新第一条')
assert.equal(first._progress.value, 0.7, 'same-instance updates never reset the enter progress')
measurements.pop()(null)
assert.equal(first.style().transform, 'translateY(0px) scale(1)')
const beforeStaleEnter = timers.length
firstEnter.complete(true)
assert.equal(timers.length, beforeStaleEnter, 'an earlier update cannot start a second dwell timer')
animations.at(-1).complete(true)
const firstTimer = timers.at(-1)
first.show('刷新停留时间'); measurements.pop()(null)
firstTimer.callback()
assert.equal(first.data.closing, false, 'an already-queued old timer cannot close an updated capsule')
second.show('第二条')
assert.equal(first.data.closing, false, 'keep the previous capsule until its replacement is measured')
measurements.pop()(null)
const [fadeOut, fadeIn] = animations.slice(-2)
assert.equal(fadeOut.value, 0); assert.equal(fadeIn.value, 1)
assert.equal(fadeOut.duration, 100); assert.equal(fadeIn.duration, 100)
assert.equal(first.data.closing, true, 'outgoing capsule stops accepting taps immediately')
assert.deepEqual(first.events, ['replaced'])
assert.equal(cleared.includes(firstTimer), true)
for (const instance of [first, second]) {
  instance._opacity.value = 0.5
  assert.equal(instance.style().transform, 'translateY(0px) scale(1)', 'handoff changes opacity without translation or scaling')
  assert.equal(instance.style().opacity, 0.5)
}
fadeOut.complete(true)
assert.equal(first.data.visible, false)
fadeIn.complete(true)
assert.equal(second.data.visible, true)

first.show('过期请求'); const staleFirst = measurements.pop()
third.show('最新请求'); const latestThird = measurements.pop()
staleFirst(null)
assert.equal(first.data.visible, false, 'a slower measurement cannot overtake the latest show across instances')
latestThird(null)
const thirdEnter = animations.at(-1)
assert.equal(third.data.message, '最新请求')
assert.deepEqual(second.events, ['replaced'])

first.deferData = true
first.show('迟到渲染'); measurements.pop()(null)
second.show('新胶囊'); measurements.pop()(null)
first.pendingData()
const staleFirstHide = animations.at(-1)
assert.equal(first.data.closing, true, 'stale setData completion cannot leave a ghost capsule visible')
staleFirstHide.complete(true)
const beforeThirdCompletion = timers.length
thirdEnter.complete(true)
assert.equal(timers.length, beforeThirdCompletion, 'a displaced enter completion cannot schedule an old timer')

second.hide()
second._progress.value = 0.6
first.deferData = false
first.show('收起中接替'); measurements.pop()(null)
assert.equal(second._progress.value, 0.6, 'handoff freezes an in-flight exit instead of replaying it')
assert.equal(first._progress.value, 1, 'the replacement fades in at its final position')
const outgoingExit = animations.at(-2)
definition.lifetimes.detached.call(second)
second.setData = () => assert.fail('a detached outgoing capsule cannot update data')
outgoingExit.complete(true)
definition.pageLifetimes.hide.call(first)
animations.at(-1).complete(true)
assert.equal(first.data.visible, false)
definition.lifetimes.detached.call(first)
definition.lifetimes.detached.call(third)

const playback = makeCapsule(), notice = makeCapsule(), newerNotice = makeCapsule()
playback.properties.duration = 0
playback.properties.resumeOnReplace = true
playback.show('朗读'); measurements.pop()(null); animations.at(-1).complete(true)
notice.show('提醒一'); measurements.pop()(null)
animations.at(-2).complete(true); animations.at(-1).complete(true)
assert.equal(playback.data.visible, false, 'the playback capsule yields to the notice')
newerNotice.show('提醒二'); measurements.pop()(null)
animations.at(-2).complete(true); animations.at(-1).complete(true)
const noticeDwell = timers.at(-1)
noticeDwell.callback()
assert.equal(newerNotice._progress.value, 1, 'dismissal with a waiting capsule only fades')
measurements.pop()(null)
assert.equal(playback.data.visible, true, 'the latest notice expiry restores the waiting playback capsule')
assert.equal(playback.data.message, '朗读')
assert.equal(playback._progress.value, 1, 'restoration fades in without replaying the pop animation')
const restoredEnter = animations.at(-1)
animations.at(-2).complete(true); restoredEnter.complete(true)
assert.equal(newerNotice.data.visible, false)
const afterRestoreTimers = timers.length
restoredEnter.complete(true)
assert.equal(timers.length, afterRestoreTimers, 'restored playback remains persistent')

notice.show('即将消失'); measurements.pop()(null)
animations.at(-2).complete(true); animations.at(-1).complete(true)
timers.at(-1).callback()
const supersededRestore = measurements.pop()
notice.show('又一条提醒'); measurements.pop()(null)
supersededRestore(null)
assert.equal(playback.data.visible, false, 'a new notice wins over an earlier restoration request')
assert.equal(notice.style().opacity, 1, 'refreshing an outgoing reminder reverses its fade instead of leaving it transparent')
animations.at(-1).complete(true)
timers.at(-1).callback(); measurements.pop()(null)
animations.at(-2).complete(true); animations.at(-1).complete(true)
assert.equal(playback.data.visible, true)

notice.show('期间播放结束'); measurements.pop()(null)
const coveredExit = animations.at(-2)
animations.at(-1).complete(true)
playback.hide()
coveredExit.complete(true)
const pendingMeasurements = measurements.length
timers.at(-1).callback()
assert.equal(measurements.length, pendingMeasurements, 'playback ended during the notice must not be restored')
animations.at(-1).complete(true)
assert.equal(playback.data.visible, false)

playback.show('重新朗读'); measurements.pop()(null)
notice.show('迟到恢复'); measurements.pop()(null)
animations.at(-2).complete(true); animations.at(-1).complete(true)
timers.at(-1).callback()
const pendingRestore = measurements.pop()
playback.hide()
pendingRestore(null)
assert.equal(playback.data.visible, false, 'stopping during a pending restore invalidates its layout callback')
animations.at(-1).complete(true)

playback.show('离页前朗读'); measurements.pop()(null)
notice.show('离页提醒'); measurements.pop()(null)
animations.at(-2).complete(true); animations.at(-1).complete(true)
definition.pageLifetimes.hide.call(notice)
const hiddenRestore = measurements.pop()
definition.pageLifetimes.hide.call(playback)
hiddenRestore(null)
animations.at(-1).complete(true)
assert.equal(playback.data.visible, false, 'page hide must not resurrect covered playback')
for (const instance of [playback, notice, newerNotice]) definition.lifetimes.detached.call(instance)
console.log('noticeCapsule: custom slots, shared appearance, 100ms enter/exit and cross-capsule handoff, timers, portal origin and lifecycle races passed')
