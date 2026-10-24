const {serverNode: serverFixture,serverTrace} = require('./serverPresentation')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const root = path.resolve(__dirname, '..')
const read = name => fs.readFileSync(path.join(root, name), 'utf8')
const otherUtils = {}
vm.runInNewContext(read('static_utils/otherUtils.js').replace(/^export /gm, ''), otherUtils)
const wxml = read('pages/reasoningPage/index.wxml'), wxss = read('pages/reasoningPage/index.wxss')
assert.doesNotMatch(wxml, /item\.statusLabel|⌃|⌄/, 'execution status is not a separate disclosure row')
assert.doesNotMatch(wxml, /item\.kind|item\.responseContent/, 'stages and tools use the same collapsible detail viewport')
assert.match(wxml, /class="reasoning-tool-title\b[^\"]*dr\b[^\"]*ac\b[^\"]*" bind:tap="toggleTool"[^>]*>[\s\S]*?item\.title[\s\S]*?item\.hasDetails[\s\S]*?icon-arr-up[\s\S]*?icon-arr-down[\s\S]*?<\/view>/)
const detailMarkup = wxml.match(/<scroll-view class="reasoning-details-scroll\b[^\"]*"([\s\S]*?)<\/scroll-view>/)?.[1]
assert.ok(detailMarkup, 'all tool details have one scroll viewport')
assert.match(detailMarkup, /style="height:{{item\.detailHeight}}px;" scroll-y="{{item\.expanded}}"/)
for (const field of ['item.public.summary', 'item.error.message', 'item.public.query', 'item.public.files',
  'item.detailText', 'item.public.sources', 'item.details']) assert.ok(detailMarkup.includes(field), field)
assert.match(detailMarkup, /class="reasoning-details-content\b[^\"]*" data-id="{{item\.id}}" list-item/)
assert.doesNotMatch(detailMarkup, /item\.responseContent|item\.public\.result|wx:if="{{item\.expanded}}"/)
assert.match(wxml, /class="reasoning-label\b[^"]*\bft36\b[^"]*"/)
assert.match(wxml, /class="[^"]*\breasoning-expand-icon\b[^"]*\bft36\b[^"]*"/)
assert.match(wxss, /\.reasoning-expand-icon\s*\{[^}]*line-height:\s*52rpx/)
assert.match(wxss, /\.reasoning-details\s*\{[^}]*height:\s*0;[^}]*max-height:\s*360rpx;[^}]*overflow:\s*hidden/)
assert.match(wxml, /item\.stage === 'public_commentary' \? 'reasoning-commentary'/)
assert.match(wxss, /\.reasoning-commentary\s*\{[^}]*white-space:\s*pre-wrap;[^}]*word-break:\s*break-all/)

function openPage() {
  const store = { applicationSettings: { language: '中文' } }
  let definition, receive, observe, unsubscribed = 0, unbound = 0
  const timers = new Map(), nextTicks = [], queries = [], animations = [], cancelled = [], styles = []
  let timerId = 0
  const query = () => {
    let callback
    return {
      in() { return this },
      selectAll(selector) { assert.equal(selector, '.reasoning-details-content'); return this },
      boundingClientRect(fn) { callback = fn; return this },
      exec() { queries.push(callback); return this }
    }
  }
  vm.runInNewContext(read('pages/reasoningPage/index.js'), {
    require(name) {
      if (name.endsWith('themeBinding')) return { bindPageTheme() {}, syncThemeNavigation() {}, unbindPageTheme() { unbound++ } }
      if (name.endsWith('processTrace')) return require('../static_utils/processTrace')
      if (name.endsWith('otherUtils')) return otherUtils
      if (name.endsWith('store/index')) return { store }
      if (name.endsWith('i18n/index')) return require('../static_utils/i18n/index')
      throw Error(name)
    },
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id },
    clearTimeout(id) { timers.delete(id) },
    wx: {
      worklet: {
        shared: value => ({ value }), runOnJS: fn => fn,
        timing(value, options) { animations.push({ value, duration: options.duration }); return value },
        cancelAnimation(value) { cancelled.push(value) }
      },
      getWindowInfo: () => ({ screenHeight: 800, windowWidth: 375 }),
      nextTick(fn) { nextTicks.push(fn) }, createSelectorQuery: query,
      yuanAI: { chatRuntime: {
        setVisibleTurn(key) { assert.equal(key, 'runtime-key') },
        observe(key, fn) { assert.equal(key, 'runtime-key'); observe = fn; return () => { unsubscribed++ } }
      } }
    },
    getApp: () => ({ globalData: { su_system: { screenHeight: 800, windowWidth: 375 }, su_menu: { bottom: 50 } } }),
    Page(value) { definition = value }
  })
  const page = { ...definition, data: { ...definition.data },
    setData(patch, callback) { Object.assign(this.data, patch); callback?.() },
    getOpenerEventChannel() { return { on(_name, fn) { receive = fn } } },
    createSelectorQuery: query,
    applyAnimatedStyle(selector, fn) { styles.push({ selector, fn }); fn(); return styles.length },
    clearAnimatedStyle() {}
  }
  page.onLoad()
  return { page, animations, cancelled, styles, queries, timers,
    receive:data=>receive({...data,processTrace:serverTrace(data.processTrace || [])}), observe:record=>observe({...record,assistant:{...record.assistant,processTrace:serverTrace(record.assistant?.processTrace || []),
      modelRequests:(record.assistant?.modelRequests || []).map(row=>({...row,presentation:row.presentation || serverFixture({...row,stage:'main_reasoning'}).presentation}))}}),store,
    get unsubscribed() { return unsubscribed }, get unbound() { return unbound },
    flush() {
      for (const [id, timer] of [...timers]) { timers.delete(id); timer.fn() }
      while (nextTicks.length) nextTicks.shift()()
    },
    measure(rects) { assert.ok(queries.length, 'page measures mounted detail content'); queries.shift()(rects) }
  }
}

const tool = (id, patch = {}) => ({ id, callId: id, kind: 'tool', name: 'web',
  title: '联网检索与读取', activityIcon: 'icon-web-search', status: 'running', public: {}, details: [],
  responseContent: '查询内容', ...patch })
const h = openPage(), page = h.page
const trace = [tool('short', { public: { result: '不重复展示的旧结果' } }), tool('long'), tool('empty', { responseContent: '' }),
  tool('exec', { name: 'exec', public: { toolNames: ['web'] } }),
  tool('fallback', { responseContent: '', public: { result: '旧工具结果' } }),
  { id: 'thinking', kind: 'stage', title: '正在思考', responseContent: '思考内容' },
  { id: 'stage_details', kind: 'stage', title: '阶段说明', details: ['仅包含阶段详情'] },
  { id: 'empty_stage', kind: 'stage', title: '正在处理' }]
const rects = (short = 80, long = 500) => [
  { dataset: { id: 'short' }, height: short }, { dataset: { id: 'long' }, height: long },
  { dataset: { id: 'fallback' }, height: 50 }, { dataset: { id: 'thinking' }, height: 120 },
  { dataset: { id: 'stage_details' }, height: 65 }
]
const node = id => page.data.processTrace.find(item => item.id === id)
const toggle = id => page.toggleTool({ currentTarget: { dataset: { id } } })
const height = id => page._toolDetails.get(id).height.value

h.receive({ turnKey: 'runtime-key', status: 'running', processTrace: trace })
h.store.applicationSettings.language = 'English'
page.onShow()
assert.equal(node('short').title, 'Web evidence · Running')
assert.equal(node('short').detailText, '查询内容')
h.store.applicationSettings.language = '中文'
page.onShow()
assert.equal(node('short').title, '联网检索与读取 · 正在执行')
assert.equal(node('empty').hasDetails, false)
assert.equal(node('exec').hasDetails, false)
assert.equal(node('thinking').hasDetails, true)
assert.equal(node('stage_details').hasDetails, true)
assert.equal(node('empty_stage').hasDetails, false)
assert.equal(node('fallback').detailText, '旧工具结果')
assert.equal(node('short').detailText, '查询内容')
toggle('empty'); toggle('exec'); toggle('empty_stage')
assert.equal(node('empty').expanded, false)
assert.equal(node('exec').expanded, false)
assert.equal(node('empty_stage').expanded, false)
h.flush()
while (h.queries.length) h.measure(rects())

for (const [id, target] of [['thinking', 120], ['stage_details', 65]]) {
  toggle(id); h.flush(); h.measure(rects())
  assert.equal(node(id).expanded, true)
  assert.equal(height(id), target, 'stage details expand to their measured height')
  assert.deepEqual(h.animations.at(-1), { value: target, duration: 250 })
  toggle(id)
  assert.equal(node(id).expanded, false)
  assert.equal(height(id), 0)
  assert.deepEqual(h.animations.at(-1), { value: 0, duration: 250 })
  h.flush()
}

toggle('short'); h.flush(); h.measure(rects())
assert.equal(node('short').expanded, true)
assert.equal(node('short').detailHeight, 80)
assert.equal(height('short'), 80, 'short content expands to its measured height')
assert.deepEqual(h.animations.at(-1), { value: 80, duration: 250 })
assert.equal(h.styles.find(style => style.selector === `.reasoning-details-${node('short').detailKey}`).fn().height, '80px')
toggle('long'); h.flush(); h.measure(rects())
assert.equal(node('long').detailHeight, 180, '360rpx converts to 180px at a 375px window')
assert.equal(height('long'), 180)
assert.deepEqual(h.animations.at(-1), { value: 180, duration: 250 })

toggle('short')
assert.equal(height('short'), 0)
assert.deepEqual(h.animations.at(-1), { value: 0, duration: 250 })
toggle('short'); h.flush()
const delayed = h.queries.shift()
assert.equal(typeof delayed, 'function')
toggle('short')
delayed(rects())
assert.equal(node('short').expanded, false)
assert.equal(height('short'), 0, 'a late expand measurement cannot reopen a collapsed node')

toggle('short'); h.flush(); h.measure(rects())
const key = node('short').detailKey
h.observe({ status: 'running', assistant: { processTrace: trace.map(item =>
  item.id === 'short' ? { ...item, responseContent: '查询内容继续流式增加。' } : item) } })
assert.equal(node('short').expanded, true)
assert.equal(node('short').detailKey, key)
const beforeUpdate = h.animations.length
h.flush(); h.measure(rects(110, 700))
assert.equal(node('short').detailHeight, 110)
assert.equal(height('short'), 110)
assert.equal(height('long'), 180)
assert.equal(h.animations.length, beforeUpdate + 1, 'already capped content does not restart its animation')

const streaming = openPage(), streamingPage = streaming.page
streaming.receive({ turnKey: 'runtime-key', status: 'running', processTrace: [tool('stream')] })
streaming.flush()
streamingPage.toggleTool({ currentTarget: { dataset: { id: 'stream' } } })
streaming.flush()
assert.equal(streamingPage._toolDetails.get('stream').height.value, 0)
let combinedTimer
for (let delta = 1; delta <= 10; delta++) {
  streaming.observe({ status: 'running', assistant: { processTrace: [tool('stream', { responseContent: '增量'.repeat(delta) })] } })
  assert.equal(streaming.timers.size, 1)
  const timer = [...streaming.timers.keys()][0]
  if (delta === 1) combinedTimer = timer
  assert.equal(timer, combinedTimer, 'continuous deltas keep the original measurement deadline')
}
streaming.measure([{ dataset: { id: 'stream' }, height: 40 }])
assert.equal(streamingPage._toolDetails.get('stream').height.value, 40, 'text updates do not invalidate an in-flight expand measurement')
streaming.flush()
streamingPage.measureToolDetails(); streaming.flush()
const olderQuery = streaming.queries.shift(), newerQuery = streaming.queries.shift()
assert.equal(typeof olderQuery, 'function'); assert.equal(typeof newerQuery, 'function')
newerQuery([{ dataset: { id: 'stream' }, height: 120 }])
olderQuery([{ dataset: { id: 'stream' }, height: 80 }])
assert.equal(streamingPage._toolDetails.get('stream').height.value, 120, 'older measurement cannot overwrite a newer applied query')
assert.equal(streamingPage.data.processTrace[0].detailHeight, 120)
streamingPage.onUnload()

page.scheduleDetailMeasurement()
assert.ok(h.timers.size)
page.measureToolDetails(); h.flush()
const lateAfterUnload = h.queries.shift()
assert.equal(typeof lateAfterUnload, 'function')
const beforeUnload = h.animations.length
page.onUnload()
assert.equal(h.unsubscribed, 1)
assert.equal(h.unbound, 1)
assert.equal(h.timers.size, 0)
assert.equal(page._toolDetails.size, 0)
lateAfterUnload(rects(150))
assert.equal(h.animations.length, beforeUnload, 'unmounted pages ignore outstanding measurements')
assert.ok(h.cancelled.length >= 2, 'shared detail animations are cancelled on close and unload')

const legacy = openPage()
legacy.receive({ content: '旧正文', status: 'completed' })
assert.deepEqual(legacy.page.data.processTrace,[],'legacy cached text cannot fabricate a process node')
legacy.page.onUnload()

console.log('reasoningDetails: stage/tool details, measured cap, 250ms animation, collapse races, live updates and cleanup passed')

const namesPage = openPage()
const rawNamesTrace = [tool('names', {status:'completed', responseContent:'通过attachment_analysis继续核对attachment_analysis。',
  public:{summary:'view_image已完成'},details:['使用exec整理']})]
const savedNamesTrace = JSON.stringify(rawNamesTrace)
namesPage.receive({status:'completed',processTrace:rawNamesTrace})
assert.equal(namesPage.page.data.processTrace[0].detailText, '通过attachment_analysis继续核对attachment_analysis。')
assert.equal(namesPage.page.data.processTrace[0].public.summary, 'view_image已完成')
namesPage.store.applicationSettings.language = 'English'
namesPage.page.onShow()
assert.equal(namesPage.page.data.processTrace[0].detailText, '通过attachment_analysis继续核对attachment_analysis。')
assert.equal(namesPage.page.data.processTrace[0].public.summary, 'view_image已完成')
assert.equal(namesPage.page.data.processTrace[0].details[0], '使用exec整理')
namesPage.store.applicationSettings.language = '中文'
namesPage.page.onShow()
assert.equal(namesPage.page.data.processTrace[0].public.summary, 'view_image已完成')
assert.equal(JSON.stringify(rawNamesTrace), savedNamesTrace, 'history projection never rewrites cached model content')
namesPage.page.onUnload()

const failurePage = openPage()
const rawFailures = [
  tool('probe', {name:'exec',status:'completed',public:{toolNames:[]}}),
  tool('script-failure', {name:'exec',status:'failed',public:{toolNames:[],summary:'secret'},
    responseContent:'secret',details:['secret'],error:{code:'EXEC_JS_ERROR',message:'secret',diagnostic:{message:'secret'}}}),
  tool('script-unknown', {name:'exec',status:'unknown',public:{toolNames:[]},responseContent:'secret'}),
  {id:'main-thought',stage:'main_reasoning',title:'正在思考',responseContent:'思考摘要'},
  {id:'public-update',stage:'public_commentary',title:'正在思考',responseContent:'公开进度'}
]
const originalFailures = JSON.stringify(rawFailures)
failurePage.receive({status:'completed',processTrace:rawFailures})
const failureNode = id => failurePage.page.data.processTrace.find(item => item.id === id)
assert.equal(failureNode('probe'),undefined)
assert.equal(failureNode('script-failure').title,'工具编排已结束')
assert.equal(failureNode('script-failure').hasDetails,true)
assert.equal(failureNode('script-unknown').hasDetails,true)
assert.match(failureNode('script-unknown').detailText,/尚未确认/)
assert.equal(failureNode('main-thought').title,'已完成思考')
assert.equal(failureNode('public-update').title,'公开进度')
assert.equal(failureNode('public-update').activityIcon,'icon-app-control-created')
assert.equal(failureNode('public-update').hasDetails,false)
assert.equal(failureNode('public-update').detailText,'')
assert.doesNotMatch(JSON.stringify(failurePage.page.data.processTrace),/secret|diagnostic/)
failurePage.page.toggleTool({currentTarget:{dataset:{id:'script-failure'}}})
failurePage.flush()
failurePage.measure([{dataset:{id:'script-failure'},height:68}])
assert.equal(failureNode('script-failure').expanded,true)
failurePage.store.applicationSettings.language = 'English'
failurePage.page.onShow()
assert.equal(failureNode('script-failure').title,'Tool orchestration ended')
assert.match(failureNode('script-failure').error.message,/orchestration script failed/)
assert.equal(failureNode('script-failure').expanded,true,'language switching preserves expansion by call identity')
assert.equal(failureNode('public-update').title,'公开进度')
assert.match(failureNode('script-unknown').detailText,/unconfirmed/)
assert.equal(JSON.stringify(rawFailures),originalFailures,'safe UI projection retains raw stored evidence')
failurePage.page.onUnload()

const commentaryPage = openPage()
const fullSummary = '开始核对web。'.repeat(16) + '\n完整保留后续摘要。'
const rawCommentary = [
  {id:'empty-commentary',stage:'public_commentary',title:'进展说明',status:'running',responseContent:''},
  {id:'full-commentary',stage:'public_commentary',title:'进展说明',status:'running',responseContent:fullSummary+'\n\n'},
  {id:'legacy-commentary',stage:'public_commentary',title:'进展说明',status:'completed',public:{result:'旧摘要通过attachment_analysis继续核对。'}}
]
const savedCommentary = JSON.stringify(rawCommentary)
commentaryPage.receive({turnKey:'runtime-key',status:'running',processTrace:rawCommentary})
const commentaryNode = id => commentaryPage.page.data.processTrace.find(item => item.id === id)
assert.equal(commentaryNode('empty-commentary'),undefined,'an empty summary does not show a fixed progress title')
assert.equal(commentaryNode('full-commentary').title,fullSummary)
assert.ok(commentaryNode('full-commentary').title.length > 64,'summary title is not capped by the old node-title limit')
assert.equal(commentaryNode('legacy-commentary').title,'旧摘要通过attachment_analysis继续核对。')
for(const node of commentaryPage.page.data.processTrace){
  assert.equal(node.activityIcon,'icon-app-control-created')
  assert.equal(node.detailText,'','the promoted summary is not repeated in the detail viewport')
  assert.equal(node.hasDetails,false)
}
commentaryPage.store.applicationSettings.language = 'English'
commentaryPage.page.onShow()
assert.equal(commentaryNode('full-commentary').title,fullSummary)
assert.equal(commentaryNode('legacy-commentary').title,'旧摘要通过attachment_analysis继续核对。')
assert.equal(JSON.stringify(rawCommentary),savedCommentary,'summary title projection leaves stored trace untouched')
commentaryPage.observe({status:'running',assistant:{processTrace:rawCommentary.map(node => node.id === 'full-commentary'
  ? {...node,responseContent:fullSummary+'继续核对。'} : node)}})
assert.equal(commentaryNode('full-commentary').title,fullSummary+'继续核对。')
assert.equal(commentaryPage.page._toolDetails.size,0,'summary text does not create a redundant detail animation')
commentaryPage.page.onUnload()

const liveTimelinePage = openPage()
liveTimelinePage.receive({turnKey:'runtime-key',status:'running',processTrace:[]})
const modelRequests = [{runId:'r',modelRequestId:'M1',parentCallId:'',status:'running'},
  {runId:'r',modelRequestId:'CHILD',parentCallId:'live-search',status:'running'}]
liveTimelinePage.observe({status:'running',assistant:{processTrace:[],textSegments:[],modelRequests}})
assert.deepEqual(Array.from(liveTimelinePage.page.data.processTrace,node => node.modelRequestId),['M1'],
  'a live top-level main request shows its thinking row before response tokens, excluding tool child requests')
assert.equal(liveTimelinePage.page.data.processTrace[0].title,'正在思考')
const liveRows = [{runId:'r',modelRequestId:'M1',parentCallId:'',messageId:'live-summary',
  purpose:'commentary',content:'先做web。',ended:true}]
const liveTrace = [
  {id:'live-thought-1',runId:'r',modelRequestId:'M1',stage:'main_reasoning',responseContent:'第一轮思考',status:'completed'},
  tool('live-exec',{runId:'r',modelRequestId:'M1',parentCallId:'',name:'exec',status:'completed',public:{toolNames:['web']}}),
  tool('live-search',{runId:'r',modelRequestId:'M1',parentCallId:'live-exec',status:'completed'}),
  {id:'live-summary',runId:'r',modelRequestId:'M1',stage:'public_commentary',status:'completed',responseContent:liveRows[0].content}
]
const liveRecord = {status:'running',assistant:{processTrace:liveTrace,textSegments:liveRows,
  modelRequests:[{...modelRequests[0],status:'completed'},{runId:'r',modelRequestId:'M2',parentCallId:'',status:'running'}]}}
const originalLiveRecord = JSON.stringify(liveRecord)
liveTimelinePage.observe(liveRecord)
assert.deepEqual(Array.from(liveTimelinePage.page.data.processTrace,node => node.stage || node.name),
  ['main_reasoning','public_commentary','exec','web','main_reasoning'],
  'live details match the same-request thinking, summary, tools and next-request order shown in chat')
assert.equal(liveTimelinePage.page.data.processTrace[1].title,'先做web。')
assert.equal(liveTimelinePage.page.data.processTrace[0].title,'已完成思考','completed thinking uses the same title in live details')
assert.equal(liveTimelinePage.page.data.processTrace.at(-1).title,'正在思考','the next active request keeps its thinking title')
assert.equal(JSON.stringify(liveRecord),originalLiveRecord,'live details projection never rewrites a runtime snapshot')
liveTimelinePage.observe({status:'running',assistant:{...liveRecord.assistant,
  processTrace:[...liveTrace,{id:'live-thought-2',runId:'r',modelRequestId:'M2',stage:'main_reasoning',
    responseContent:'第二轮思考',status:'running'}]}})
const secondThought = liveTimelinePage.page.data.processTrace.filter(node => node.stage === 'main_reasoning' && node.modelRequestId === 'M2')
assert.equal(secondThought.length,1,'real thinking replaces the same-request lifecycle placeholder')
assert.equal(secondThought[0].detailText,'第二轮思考')
liveTimelinePage.observe({status:'running',assistant:{content:'旧权威正文',textSegments:[],modelRequests,
  processTrace:[{id:'old-snapshot',stage:'legacy',title:'旧过程',responseContent:'旧过程详情'}]}})
assert.deepEqual(Array.from(liveTimelinePage.page.data.processTrace,node => node.id),['old-snapshot'],
  'legacy authoritative content plus normalized empty segments retains the original page trace')
liveTimelinePage.page.onUnload()

const stoppedDetails = openPage()
stoppedDetails.receive({turnKey:'runtime-key',stopped:true,status:'cancelling',durationText:'2秒',
  processTrace:[tool('stopped-tool')]})
const assertStoppedSummary = () => {
  assert.equal(stoppedDetails.page.data.stopped,true)
  assert.equal(stoppedDetails.page.data.active,false,'a locally stopped detail page cannot become active again')
  assert.equal(stoppedDetails.page.data.stopping,false)
  assert.equal(stoppedDetails.page.data.failed,false)
  assert.equal(stoppedDetails.page.data.durationText,'2秒','runtime snapshots retain the click-time duration')
}
assertStoppedSummary()
for(const status of ['running','cancelling','completed','failed']){
  const responseContent = `${status}的真实工具结果`
  stoppedDetails.observe({status,assistant:{processDurationMs:92000,
    processTrace:[tool('stopped-tool',{status:status === 'cancelling' ? 'running' : status,responseContent})]}})
  assertStoppedSummary()
  assert.equal(stoppedDetails.page.data.processTrace[0].detailText,responseContent,
    'actual tool details continue updating behind the fixed stopped summary')
}
stoppedDetails.page.onUnload()
assert.equal(stoppedDetails.unsubscribed,1,'a stopped detail page still cleans up its live trace subscription')

const commands = openPage()
const bash = tool('bash', {name:'bash',title:'运行命令',responseContent:'',public:{command:'echo "😀";\nls outputs'}})
commands.receive({turnKey:'runtime-key',status:'running',processTrace:[bash]})
assert.equal(commands.page.data.processTrace[0].title,'正在运行命令')
assert.equal(commands.page.data.processTrace[0].detailText,bash.public.command)
commands.observe({status:'running',assistant:{processTrace:[{...bash,status:'completed',public:{result:'完整结果'}}]}})
assert.equal(commands.page.data.processTrace[0].title,'已运行命令')
assert.equal(commands.page.data.processTrace[0].detailText,'完整结果')
assert.doesNotMatch(commands.page.data.processTrace[0].detailText,/ls outputs/)
commands.page.onUnload()

const serverDetails = openPage()
const serverFields = {title:'后端标题',endedTitle:'后端结束标题',detailTitle:'后端详情标题',groupTitle:'',
  content:'tools.web() 完整代码 1.2.3',details:['后端说明'],summary:'后端摘要',errorMessage:'',statusLabel:'后端状态',responseItems:[]}
const serverNode = tool('server', {name:'future_tool',presentation:{version:1,format:'code',visible:true,hasDetails:true,
  locales:{'zh-CN':serverFields,'en-US':{...serverFields,detailTitle:'Server details',summary:'Server summary'}}}})
serverDetails.receive({turnKey:'runtime-key',status:'running',processTrace:[serverNode]})
assert.equal(serverDetails.page.data.processTrace[0].title,'后端详情标题')
assert.equal(serverDetails.page.data.processTrace[0].detailText,serverFields.content)
assert.equal(serverDetails.page.data.processTrace[0].public.summary,serverFields.summary)
assert.deepEqual(serverDetails.page.data.processTrace[0].details,serverFields.details)
serverDetails.store.applicationSettings.language='English'
serverDetails.page.onShow()
assert.equal(serverDetails.page.data.processTrace[0].title,'Server details')
assert.equal(serverDetails.page.data.processTrace[0].public.summary,'Server summary')
assert.equal(serverDetails.page.data.processTrace[0].detailText,serverFields.content)
serverDetails.page.onUnload()
