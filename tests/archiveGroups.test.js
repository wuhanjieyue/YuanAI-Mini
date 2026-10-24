const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { groupArchivedConversations } = require('../components/_self/yb-archived-chats/archiveGroups')

const now = new Date('2026-08-15T00:00:00Z').getTime()
const groups = groupArchivedConversations([
  { conversationId: 'b', title: '去年', archivedAt: '2025-07-01T00:00:00Z' },
  { conversationId: 'a', title: '本月', archivedAt: '2026-08-10T00:00:00Z' },
  { conversationId: 'c', title: '五个月前', archivedAt: '2026-03-01T00:00:00Z' }
], '', now)

assert.deepStrictEqual(groups.map((group) => group.label), ['本月', '5个月前', '去年'])
assert.strictEqual(groupArchivedConversations(groups.flatMap((group) => group.items), '五个', now)[0].items[0].conversationId, 'c')

const { calculatePosition } = require('../components/yb-flyout/position')
const basePosition = {
  windowInfo: { windowWidth: 375, windowHeight: 800 },
  anchorCentered: true, measuredHeight: 160,
  boundaryRect: { left: 0, top: 100, width: 375, height: 560 }
}
const down = calculatePosition({ ...basePosition, anchorRect: { left: 15, top: 150, width: 345, height: 56 } })
const up = calculatePosition({ ...basePosition, anchorRect: { left: 15, top: 560, width: 345, height: 56 } })
assert.strictEqual(down.viewportTop, 178)
assert.strictEqual(up.viewportTop, 428)
assert.strictEqual(down.viewportLeft, 75)
assert.strictEqual(down.transformOrigin, '112.5px 0px')
assert.strictEqual(up.transformOrigin, '112.5px 160px')
const constrained = calculatePosition({ ...basePosition, measuredHeight: 400,
  boundaryRect: { left: 0, top: 100, width: 375, height: 180 },
  anchorRect: { left: 15, top: 200, width: 345, height: 56 } })
assert.ok(constrained.viewportTop >= 118)
assert.ok(constrained.viewportTop + constrained.panelHeightPx <= 262)

const archiveSource = fs.readFileSync(path.join(__dirname, '../components/_self/yb-archived-chats/index.js'), 'utf8')
const archiveTemplate = fs.readFileSync(path.join(__dirname, '../components/_self/yb-archived-chats/index.wxml'), 'utf8')
assert.match(archiveTemplate, /bind:longpress="openActions"/)
assert.match(archiveTemplate, /anchor-centered="{{true}}"/)
assert.match(archiveTemplate, /i18n.archive.view/)
assert.match(archiveTemplate, /i18n.archive.unarchive/)
assert.match(archiveTemplate, /loading && !groups\.length[\s\S]*archived-group-title[^\"]*archived-skeleton-group[^\"]*skeleton-clip[\s\S]*\[72, 48, 84, 60, 76\][\s\S]*class="archived-row\b[^\"]*"/)
assert.match(archiveTemplate, /loading && groups\.length[\s\S]*\[68, 46\][\s\S]*class="archived-row\b[^\"]*"/)
assert.match(archiveTemplate, /wx:if="\{\{requestStatus === 'success' && !loading && !groups\.length\}\}" class="archived-status\b[^\"]*archived-empty\b[^\"]*"/)
assert.match(archiveTemplate, /<image class="archived-empty-logo\b[^\"]*" src="\/static\/logs\/glog\.png" mode="widthFix"><\/image>/)
assert.match(archiveTemplate, /wx:elif="\{\{!loading && failed && !groups\.length\}\}" class="archived-status\b[^\"]*archived-error\b[^\"]*"/)
assert.doesNotMatch(archiveTemplate, /appStaticRoot|loading(?:-dark)?\.svg|loading-rotate/)
assert.doesNotMatch(archiveSource, /appStaticRoot/)
assert.match(archiveSource, /loading:\s*true,[\s\S]*failed:\s*false,[\s\S]*requestStatus:\s*'loading'/)
assert.match(archiveSource, /this\.setData\(\{\s*conversations,[\s\S]*groups:\s*groupArchivedConversations\(conversations, '', Date\.now\(\), this\.properties\.language\),[\s\S]*loading:\s*false,[\s\S]*requestStatus:\s*'success'/)
assert.match(archiveSource, /loading:\s*false, failed:\s*true, requestStatus:\s*'error'/)
assert.match(archiveSource, /refreshConversations\(\)[\s\S]*groups:\s*\[\][\s\S]*loading:\s*true[\s\S]*failed:\s*false/)
assert.doesNotMatch(archiveSource, /navigateBack|navigateTo|showModal/)
console.log('archiveGroups and archive popup position tests passed')

// The native gesture must wrap the real scroll node inside the component.
assert.match(archiveTemplate, /<vertical-drag-gesture-handler[^>]*native-view="scroll-view"[^>]*>\s*<scroll-view[^>]*worklet:onscrollupdate="handleScrollUpdate"/)
assert.match(archiveTemplate, /simultaneous-handlers="{{ \['pan', 'hpan'\] }}"/)
assert.match(archiveSource, /const settingPage = this\.selectOwnerComponent\(\)/)
assert.doesNotMatch(archiveSource, /this\._settingPage|settingPage\.(?:shouldArchiveScrollViewResponse|handleArchiveScrollUpdate)/)
assert.doesNotMatch(archiveSource, /triggerEvent\('scrollupdate'/)

const settingSource = fs.readFileSync(path.join(__dirname, '../pages/setting/index.js'), 'utf8')
const settingTemplate = fs.readFileSync(path.join(__dirname, '../pages/setting/index.wxml'), 'utf8')
assert.doesNotMatch(settingTemplate, /tag="archiveScroll"/)
// Execute the component's own callbacks, rather than only testing the page helper.
const shouldRespond = new Function('return function' + archiveSource.match(/shouldScrollViewResponse(\(pointerEvent\) \{[\s\S]*?\n    })/)[1])()
const updateScroll = new Function('return function' + archiveSource.match(/handleScrollUpdate(\(evt\) \{[\s\S]*?\n    })/)[1])()
const state = {
  _scrollTop: { value: 0 },
  _startPan: { value: false },
  _primaryAnimation: { value: 1 }
}
assert.strictEqual(shouldRespond.call(state, { deltaY: 10 }), false)
assert.strictEqual(state._startPan.value, true)
updateScroll.call(state, { detail: { scrollTop: 20 } })
assert.strictEqual(state._scrollTop.value, 20)
assert.strictEqual(shouldRespond.call(state, { deltaY: 10 }), true)
assert.strictEqual(state._startPan.value, false)
updateScroll.call(state, { detail: { scrollTop: 0 } })
assert.strictEqual(shouldRespond.call(state, { deltaY: -10 }), true)
state._primaryAnimation.value = 0.5
assert.strictEqual(shouldRespond.call(state, { deltaY: -10 }), false)
console.log('archive scroll gesture boundary tests passed')
