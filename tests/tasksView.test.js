;(async () => {
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const read = path => fs.readFileSync(`${__dirname}/../${path}`, 'utf8')
let definition, message, closed = 0, menuClosed = 0, saveError = false
const timers = []
let opened = 0
const events = []
const store = {
  workModelSelection:{ modelId:'fast', effortId:'low' },
  modelCatalog:{ accessPlan:'user', defaults:{ chat:'fast' }, models:[
    { id:'fast', name:'快速模型', minPlan:'guest', modes:['chat'], defaultEffortId:'low', efforts:[{ id:'low', label:'低', minPlan:'guest' }, { id:'high', label:'高', minPlan:'user' }] },
    { id:'deep', name:'深度模型', minPlan:'user', modes:['chat'], defaultEffortId:'medium', efforts:[{ id:'medium', label:'中', minPlan:'user' }] },
    { id:'pro', name:'高级模型', minPlan:'pro', modes:['chat'], defaultEffortId:'high', efforts:[{ id:'high', label:'高', minPlan:'pro' }] }
  ] }
}
const channel = { on(name, callback) { this[name] = callback }, emit(name, value) { events.push({ name, value }) } }
vm.runInNewContext(read('pages/taskEdit/index.js').replace(/^import .+$/gm, ''), {
  setTimeout: fn => { timers.push(fn); return timers.length }, clearTimeout() {},
  store, loadModelCatalog:async () => store.modelCatalog,
  persistTask:async task => { if (saveError) throw new Error('保存失败'); return { task:{ ...task, name:task.name.trim(), description:task.description.trim() } } }, taskAction:async () => ({ conversationId:'conv_task' }),
  Page: value => { definition = value },
  GestureState:{ BEGIN:1, ACTIVE:2, END:3, CANCELLED:4 }, clamp:(n,a,b) => Math.max(a,Math.min(b,n)), Curves:{}, bottomSheetSuspendedCurve:() => {},
  require: path => path.includes('modelCatalog') ? require('../static_utils/modelCatalog') : path.includes('themeBinding') ? { bindPageTheme() {}, unbindPageTheme() {}, syncThemeNavigation() {} } : { getSettingSheetMetrics: () => ({ sheetHeight:700 }), SETTING_ROUTE_DURATION:250 },
  wx:{ getWindowInfo:() => ({ windowWidth:375 }), router:{ getRouteContext:() => null }, hideKeyboard() {}, worklet:{ runOnJS:fn => fn, shared:value => ({ value }), timing:(value, options, cb) => { if (cb) cb(); return value } }, showToast: value => { message = value.title }, navigateBack: () => closed++ }
})
function instance(def) {
  return Object.assign({}, def.methods || def, {
    data:JSON.parse(JSON.stringify(def.data || {})),
    setData(update) {
      for (const [key, value] of Object.entries(update)) {
        const keys = key.split('.')
        if (keys.length === 2) this.data[keys[0]][keys[1]] = value
        else this.data[key] = value
      }
    },
    getOpenerEventChannel: () => channel,
    selectComponent: () => ({ close() { menuClosed++ }, open() { opened++ } }),
    triggerEvent: (name, value) => events.push({ name, value })
  })
}
const page = instance(definition)
page.onLoad()
assert.equal(page.data.modelLabel, '快速模型 · 低')
assert.equal(page.data.models[2].locked, true)
assert.equal(page.data.models[2].efforts[0].locked, true)
page.modelChanged({ detail:{ modelId:'deep', effortId:'low' } })
assert.equal(page.data.task.effortId, 'medium')
assert.equal(page.data.modelLabel, '深度模型 · 中')
page.closePage()
assert.equal(opened, 1)
opened = 0
page.modelChanged({ detail:{ modelId:'fast', effortId:'low' } })
assert.equal(store.workModelSelection.modelId, 'fast')
const headerStyles = {}
page.createSelectorQuery = () => ({ select() { return this }, boundingClientRect(callback) { callback({ width:28 }); return this }, exec() {} })
page.applyAnimatedStyle = (selector, callback) => { headerStyles[selector] = callback }
page.onReady()
assert.equal(headerStyles['.task-save-button']().paddingLeft, '26px')
assert.equal(headerStyles['.task-save-label-wrap']().width, '28px')
assert.equal(headerStyles['.task-save-icon-wrap']().width, '0px')
page._saveMorph.value = 1
assert.equal(headerStyles['.task-save-button']().paddingLeft, '11px')
assert.equal(headerStyles['.task-save-label-wrap']().width, '0px')
assert.equal(headerStyles['.task-save-icon-wrap']().width, '24px')
page._saveMorph.value = 0
let popped = 0, stopped = 0
page.routeContext = { primaryAnimation:{ value:1 }, userGestureInProgress:{ value:true }, startUserGesture() {}, stopUserGesture() { stopped++ }, didPop() { popped++ } }
assert.equal(page.shouldScrollResponse({ deltaY:5 }), false)
page.handleVerticalDrag({ state:2, deltaY:350 })
page.handleVerticalDrag({ state:3, velocityY:0 })
assert.equal(popped, 0)
assert.equal(stopped, 1)
page.routeContext.primaryAnimation.value = 0.8
page.handleVerticalDrag({ state:4 })
assert.equal(page.routeContext.primaryAnimation.value, 1)
assert.equal(popped, 0)
closed = 0
page.menuOpened()
assert.equal(page.shouldPanAccept(), false)
page.menuClosed()
page.saveTask()
assert.match(message, /请填写/)
assert.equal(closed, 0)
page.inputChanged({ currentTarget:{ dataset:{ field:'name' } }, detail:{ value:' 阅读周报 ' } })
page.inputChanged({ currentTarget:{ dataset:{ field:'description' } }, detail:{ value:' 整理学习资料 ' } })
page.setData({ 'task.weekday':5 })
page.selectOption({ currentTarget:{ dataset:{ field:'repeat', value:'按周' } } })
assert.equal(page.data.task.frequency, '每周五')
const choose = (field, value) => page.selectOption({ currentTarget:{ dataset:{ field, value } } })
page.frequencyChanged({ detail:{ value:[1, 0] } })
assert.equal(page.data.task.frequency, '每2周 · 周一')
choose('repeat', '按月')
page.frequencyChanged({ detail:{ value:[0, 31] } })
assert.equal(page.data.task.frequency, '每月最后一天')
choose('repeat', '按周')
assert.equal(page.data.task.frequency, '每2周 · 周一')
choose('repeat', '按小时')
page.frequencyChanged({ detail:{ value:[2] } })
page.minuteChanged({ detail:{ value:[45] } })
assert.equal(page.data.task.frequency, '每3小时')
assert.equal(page.data.task.hourlyMinute, 45)
choose('repeat', '自定义')
choose('customUnit', '月')
page.frequencyChanged({ detail:{ value:[2, 14] } })
assert.equal(page.data.task.frequency, '每3月 · 15日')
choose('customUnit', '小时')
page.frequencyChanged({ detail:{ value:[5] } })
choose('customUnit', '月')
assert.equal(page.data.interval, 3)
choose('repeat', '工作日')
assert.equal(page.data.task.frequency, '周一至周五')
choose('time', '自定义')
page.timeChanged({ detail:{ value:[23, 59] } })
assert.equal(page.data.exactTime, '23:59')
choose('repeat', '从不')
assert.equal(page.data.task.frequency, '仅一次')
assert.equal(page.data.exactTime, '23:59')
page.dateChanged({ currentTarget:{ dataset:{ field:'runDate' } }, detail:{ value:[0, 1, 30] } })
assert.equal(page.data.runDatePicker.days.length, 28)
assert(page.data.task.runDate.endsWith('-02-28'))
choose('repeat', '按天')

page.selectOption({ currentTarget:{ dataset:{ field:'end', value:'在选定日期结束' } } })
channel.editTask({ task:{ ...page.data.task, id:'existing', endDate:'2028-01-31' } })
page.dateChanged({ detail:{ value:[page.data.years.indexOf(2028), 1, 30] } })
assert.equal(page.data.task.endDate, '2028-02-29')
assert.equal(page.data.days.length, 29)
page.dateChanged({ detail:{ value:[page.data.years.indexOf(2027), 1, 28] } })
assert.equal(page.data.task.endDate, '2027-02-28')
page.modelChanged({ detail:{ modelId:'fast', effortId:'high' } })
saveError = true
await page.saveTask()
assert.equal(page.data.saveButtonState, 'idle')
assert.equal(page.menuShown.value, false)
assert.equal(page.data.task.name, ' 阅读周报 ')
saveError = false
const savePromise = page.saveTask()
assert.equal(page.data.saveButtonState, 'saving')
await page.saveTask()
await savePromise
assert.equal(page.data.saveButtonState, 'done')
assert.equal(timers.length, 1)
timers.shift()()
assert.equal(closed, 1)
assert.equal(events.at(-1).value.task.name, '阅读周报')
assert.equal(events.at(-1).value.task.id, 'existing')
assert.equal(events.at(-1).value.task.effortId, 'high')
assert.equal(store.workModelSelection.effortId, 'low')
const saved = events.at(-1).value.task
page.setData({ saveButtonState:'idle' })
channel.editTask({ task:saved })
assert.equal(page.data.task.intervals['自定义月'], 3)
assert.equal(page.data.task.hour, 23)
assert.equal(page.data.task.minute, 59)
choose('repeat', '自定义')
page.setData({ 'task.runDate':'2028-01-01', 'task.endDate':'2027-12-31' })
page.saveTask()
assert.equal(closed, 1)
assert.match(message, /结束日期不能早于/)

const editor = instance(definition)
editor.onLoad()
const initialClosed = closed
editor.closePage()
assert.equal(closed, initialClosed + 1)
editor.inputChanged({ currentTarget:{ dataset:{ field:'name' } }, detail:{ value:'changed' } })
editor.closePage()
assert.equal(opened, 1)
assert.equal(closed, initialClosed + 1)
editor.keepEditing()
assert.equal(editor.data.task.name, 'changed')
editor.inputChanged({ currentTarget:{ dataset:{ field:'name' } }, detail:{ value:'' } })
editor.frequencyChanged({ detail:{ value:[0, 0] } })
editor.closePage()
assert.equal(closed, initialClosed + 2)
assert.match(read('pages/taskEdit/index.wxss'), /max-height: 630rpx; line-height: 42rpx/)
editor.discardChanges()
editor.discardClosed()
assert.equal(closed, initialClosed + 3)

let fetchTaskPage = async () => ({ items:[], hasMore:false, nextCursor:'' })
vm.runInNewContext(read('components/_self/yb-tasks-view/index.js').replace(/^import .+$/gm, ''), {
  Component:value => { definition = value }, require:() => ({}), wx:{ showToast() {} },
  taskView:task => task, listTasks:(...args) => fetchTaskPage(...args),
  taskAction:async (id, action) => ({ task:{ id, paused:action === 'pause' }, deleted:action === 'delete' })
})
const list = instance(definition)
list._version = 0
const first = { id:'real_task', name:'真实任务', paused:false }
assert.equal(list.data.tasks.length, 0)
list.updateTask({ task:first })
await list.handleAction({ detail:{ task:first, action:'toggle' } })
assert.equal(list.data.tasks.length, 0)
list.selectTab({ detail:{ id:'paused' } })
await Promise.resolve()
list.updateTask({ task:{ ...first, paused:true } })
assert.equal(list.data.tasks[0].paused, true)
list.updateTask({ task:{ ...first, id:'new', paused:true } })
assert.equal(list.data.tasks.length, 2)
await list.handleAction({ detail:{ task:first, action:'delete' } })
assert.equal(list.data.tasks.length, 1)
assert(!list.data.tasks.some(task => task.id === first.id))
list.menuChanged({ detail:{ open:true } })
const eventCount = events.length
list.openTask({ currentTarget:{ dataset:{} } })
assert.equal(events.length, eventCount)

list.data.menuOpen = false
await list.loadTasks()
list.selectTab({ detail:{ id:'completed' } })
await Promise.resolve()
list.data.tasks = [{ id:'run_a', conversationId:'conv_a', name:'执行一' }, { id:'run_b', conversationId:'conv_b', name:'执行二' }]
list.openTask({ currentTarget:{ dataset:{ id:'run_a' } } })
assert.equal(events.at(-1).name, 'openTaskChat')
assert.equal(events.at(-1).value.conversationId, 'conv_a')
list.openTask({ currentTarget:{ dataset:{ id:'run_b' } } })
assert.equal(events.at(-1).value.conversationId, 'conv_b')
list.openTask({ currentTarget:{ dataset:{} } })
assert.equal(events.at(-1).name, 'editTask')
const menuEventCount = events.length

// Each tab appends its own cursor page; a failed next page never replaces existing rows.
for (const tab of ['active', 'paused', 'completed']) {
  const paged = instance(definition)
  paged._version = 0
  paged.data.activeTab = tab
  let requests = [], failNext = true
  fetchTaskPage = async (cursor, status) => {
    requests.push({ cursor, status })
    assert.equal(status, tab)
    if (!cursor) return { items:Array.from({length:15}, (_,i) => ({id:`${tab}_${i}`})), nextCursor:'next15', hasMore:true }
    assert.equal(cursor, 'next15')
    if (failNext) { failNext = false; throw new Error('network') }
    return { items:[{id:`${tab}_14`},{id:`${tab}_15`}], nextCursor:'', hasMore:false }
  }
  await paged.reload()
  assert.equal(paged.data.tasks.length, 15)
  await paged.loadMore()
  assert.equal(paged.data.tasks.length, 15)
  assert.equal(paged.data.error, 'network')
  await paged.retry()
  assert.equal(paged.data.tasks.length, 16)
  assert.equal(paged.data.hasMore, false)
  await paged.loadMore()
  assert.equal(requests.length, 3)
}
const switching = instance(definition)
switching._version = 0
switching._visible = true
let resolveOld, calls = []
fetchTaskPage = (cursor, tab) => {
  calls.push(tab)
  if (tab === 'active') return new Promise(resolve => { resolveOld = resolve })
  return Promise.resolve({items:[{id:'paused_only',paused:true}],hasMore:false,nextCursor:''})
}
const pending = switching.reload()
await switching.loadMore()
switching.selectTab({detail:{id:'paused'}})
resolveOld({items:[{id:'stale_active'}],nextCursor:'stale',hasMore:true})
await pending
await Promise.resolve()
assert.deepEqual(calls, ['active','paused'])
assert.equal(switching.data.tasks[0].id, 'paused_only')
assert.equal(switching.data.nextCursor, '')
assert.match(read('components/_self/yb-tasks-view/index.wxml'), /bind:scrolltolower="loadMore"/)

vm.runInNewContext(read('components/_self/yb-task-menu/index.js'), { Component: value => { definition = value } })
const menu = instance(definition)
menu.data.task = first
menu.choose({ currentTarget:{ dataset:{ action:'delete' } } })
assert.equal(events.length, menuEventCount)
menu.closed()
assert.equal(events.at(-1).value.action, 'delete')
assert(menuClosed > 0)
assert(!/longpress|showModal|showActionSheet|<picker\s/.test(read('components/_self/yb-tasks-view/index.wxml') + read('pages/taskEdit/index.wxml')))
assert(JSON.parse(read('app.json')).pages.includes('pages/taskEdit/index'))
console.log('tasksView: API editing, menu lifecycle, list updates and leap-date checks passed')

// Month guidance must not resize an already measured flyout as the wheel moves.
assert.match(read('pages/taskEdit/index.wxml'), /wx:if="{{unit === '月'}}" class="task-schedule-hint text-muted" style="opacity:/)

// The shared two-level selector owns its flyout; anchor it inside the task sheet.
;(async () => {
  const editor = instance(page)
  editor.data.saveButtonState = 'idle'
  editor.data.menuOpen = false
  editor.menuShown = { value:false }
  editor._openingModels = false
  const rect = { left:200, top:300, width:100, height:40 }
  const boundary = { left:0, top:80, width:375, height:700 }
  editor.createSelectorQuery = () => ({ select() { return this }, boundingClientRect() { return this }, exec(callback) { callback([rect, boundary]) } })
  let calls = 0
  editor.selectComponent = () => ({ async show(anchor, bounds) { calls++; assert.equal(anchor, rect); assert.equal(bounds, boundary); return true } })
  const before = JSON.stringify(editor.data.task)
  await editor.showModels()
  assert.equal(calls, 1)
  assert.equal(editor.menuShown.value, true)
  assert.equal(JSON.stringify(editor.data.task), before)
  await editor.showModels()
  assert.equal(calls, 1)
  editor.menuClosed()
  assert.equal(editor.menuShown.value, false)
  editor.selectComponent = () => ({ async show() { return false } })
  await editor.showModels()
  assert.equal(editor.menuShown.value, false)
})().catch(error => { console.error(error); process.exitCode = 1 })

})().catch(error => { console.error(error); process.exitCode = 1 })
