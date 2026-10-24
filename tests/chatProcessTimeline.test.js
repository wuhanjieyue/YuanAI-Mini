const {serverNode,serverTrace} = require('./serverPresentation')
const assert = require('node:assert/strict')
const {projectSegments: rawProjectSegments} = require('../static_utils/chatSegments')
const projectSegments = rawProjectSegments
const {streamProcessTimeline: renderTimeline} = require('../static_utils/processTrace')
const streamProcessTimeline = (trace,rows,language,models=[]) => renderTimeline(serverTrace(projectSegments(trace,rows)),rows,language,models.map(row=>({...row,presentation:row.presentation || serverNode({...row,stage:'main_reasoning'}).presentation})))

const reasoning = (request, text = '', status = 'completed') => ({
  id:`thinking_${request}`, runId:'r', modelRequestId:request, parentCallId:'',
  kind:'stage', stage:'main_reasoning', title:'正在思考', status,
  responseContent:text, details:[]
})
const exec = (request, status = 'completed') => ({
  id:`exec_${request}`, callId:`exec_${request}`, name:'exec', runId:'r',
  modelRequestId:request, parentCallId:'', kind:'tool', title:'正在使用联网检索与读取',
  status, public:{toolNames:['web']}
})
const tool = (request, text = '', status = 'completed') => ({
  id:`search_${request}`, callId:`search_${request}`, name:'web', runId:'r',
  modelRequestId:request, parentCallId:`exec_${request}`, kind:'tool', title:'联网检索与读取',
  stage:'search', status, responseContent:text, details:[]
})
const segment = (request, content, purpose = 'commentary', extra = {}) => ({
  runId:'r', modelRequestId:request, parentCallId:'', messageId:`body_${request}`,
  purpose, content, ended:true, ...extra
})
const compaction = (id = 'context_compaction_1',status = 'running') => ({
  id,runId:'r',modelRequestId:'',parentCallId:'',kind:'stage',stage:'context_compaction',
  title:'正在压缩上下文',activityIcon:'icon-context-compaction',status,responseContent:'',details:[]
})
const rows = [segment('M1','先做联网检索与读取。'), segment('M2','再核验一次。')]
const trace = [reasoning('M1','第一轮思考'), exec('M1'), tool('M1','第一个结果'),
  reasoning('M2','第二轮思考'), exec('M2'), tool('M2','第二个结果')]
const timeline = streamProcessTimeline(projectSegments(trace, rows), rows, '中文')
assert.deepEqual(timeline.entries.map(row => row.kind === 'commentary' ? row.text : row.node.id),
  ['thinking_M1','先做联网检索与读取。','exec_M1','search_M1',
    'thinking_M2','再核验一次。','exec_M2','search_M2'],
  'projected commentary appended to the trace must appear before its own calls')
assert.equal(new Set(timeline.entries.map(row => row.id)).size,timeline.entries.length,
  'each row owns a stable unique render identity')
assert.equal(timeline.finalContent,'','public commentary does not become the final response')
assert.deepEqual(streamProcessTimeline(projectSegments([reasoning('M2','第二轮思考')],rows),rows,'中文')
  .entries.map(row => row.kind==='commentary' ? row.text : row.node.id),
  ['先做联网检索与读取。','thinking_M2','再核验一次。'],
  'a request without reasoning keeps its commentary before the following main request')
assert.deepEqual(streamProcessTimeline(projectSegments([reasoning('M2','第二轮思考')],rows),rows,'中文',
  [{modelRequestId:'M1',parentCallId:'',status:'completed'},
    {modelRequestId:'M2',parentCallId:'',status:'running'}])
  .entries.map(row=>row.kind==='commentary' ? row.text : row.node.id),
  ['thinking_M1','先做联网检索与读取。','thinking_M2','再核验一次。'],
  'a synthesized first thinking row preserves main request order around later real reasoning')
assert.deepEqual(streamProcessTimeline(trace,[segment('M1','待确认正文','pending')],'中文')
  .entries.filter(row => row.kind === 'commentary').map(row => row.text),['待确认正文'],
  'a top-level actual call confirms pending text as its own request commentary')
for(const calls of [[],[exec('OTHER')],[{...exec('M1'),parentCallId:'child'}]]){
  const pending = streamProcessTimeline(calls,[segment('M1','待确认正文','pending')],'中文')
  assert.equal(pending.entries.some(row => row.kind === 'commentary'),false,
    'pending text needs a top-level call belonging to the same model request')
  assert.equal(pending.finalContent,'')
}
const finalRows = [...rows,segment('M3','正式😀','final'),
  segment('M3','回答','final',{messageId:'final_part_2'}),
  segment('CHILD','私有工具正文','final',{parentCallId:'search_M1'}),
  segment('TOOL','工具结果','tool_result',{parentCallId:'search_M1'})]
const finalTimeline = streamProcessTimeline([...trace,reasoning('M3','总结思考')],finalRows,'中文')
assert.equal(finalTimeline.finalContent,'正式😀回答','only confirmed main final segments enter Markdown')
assert.equal(finalTimeline.entries.at(-1).node.id,'thinking_M3')
const privateExec = {...exec('M1'),arguments:{code:'PRIVATE_CODE'},diagnostic:'PRIVATE_DIAGNOSTIC',
  details:['PRIVATE_DETAIL'],responseContent:'PRIVATE_SCRIPT',public:{toolNames:['web'],result:'PRIVATE_RESULT'}}
const safe = streamProcessTimeline([privateExec],[],'中文')
assert.doesNotMatch(JSON.stringify(safe),/PRIVATE_/,'execution payloads never enter the display projection')
const safeSummary = streamProcessTimeline([],[segment('M1','公开摘要','commentary',{
  arguments:'PRIVATE_ARGUMENTS',diagnostic:'PRIVATE_DIAGNOSTIC'})],'中文')
assert.doesNotMatch(JSON.stringify(safeSummary),/PRIVATE_/, 'commentary preserves only normalized public segment fields')
assert.equal(streamProcessTimeline([], [segment('M1','先调用 web。')],'English')
  .entries[0].text,'先调用 web。','commentary preserves server-provided text')
assert.deepEqual(trace[0],reasoning('M1','第一轮思考'),'display projection does not mutate stored trace')
const selectedImage = [{...exec(''),id:'host_image',callId:'host_image',modelRequestId:'',
  title:'正在使用创建图片',public:{toolNames:['image_generation']}},
  {...tool(''),id:'image',callId:'image',name:'image_generation',title:'创建图片',
    parentCallId:'host_image',modelRequestId:''}]
assert.deepEqual(streamProcessTimeline(selectedImage,[],'中文').entries.map(row=>row.node.id),
  ['host_image','image'],'explicit selected tools can display before a main-model request exists')
for(const [language,title] of [['中文','正在压缩上下文'],['English','Compacting context']]){
  const preparing = streamProcessTimeline([compaction()],[],language,
    [{modelRequestId:'SUMMARY',parentCallId:'context_compaction_1',status:'running'}])
  assert.deepEqual(preparing.entries.map(row=>row.node.id),['context_compaction_1'],
    'a private child summary request does not replace compaction with main thinking')
  assert.equal(preparing.entries[0].node.title,title)
  assert.equal(preparing.entries[0].node.activityIcon,'icon-context-compaction')
  assert.equal(preparing.entries[0].text,'','the compaction row has no streaming summary detail')
  assert.deepEqual(preparing.entries[0].responseItems,[])
}
const compactedTimeline = streamProcessTimeline([compaction('context_compaction_1','completed'),
  reasoning('M1','继续处理','running'),exec('M1','running'),tool('M1','','running')],[],'中文')
assert.deepEqual(compactedTimeline.entries.map(row=>row.node.id),
  ['context_compaction_1','thinking_M1','exec_M1','search_M1'],
  'the completed compaction remains an independent node before subsequent real work')
assert.equal(compactedTimeline.entries[0].node.title,'上下文已压缩')
const repeatedCompactionTrace = [compaction('context_compaction_1','completed'),reasoning('M1','已思考'),
  exec('M1'),tool('M1'),compaction('context_compaction_2','running')]
const repeatedCompactionRequests = [{modelRequestId:'M1',parentCallId:'',status:'completed'},
  {modelRequestId:'M2',parentCallId:'',status:'running',responseStarted:false}]
const betweenRequests = streamProcessTimeline(repeatedCompactionTrace,[rows[0]],'中文',repeatedCompactionRequests)
assert.deepEqual(betweenRequests.entries.map(row=>row.kind==='commentary' ? row.text : row.node.id),
  ['context_compaction_1','thinking_M1','先做联网检索与读取。','exec_M1','search_M1','context_compaction_2','thinking_M2'],
  'repeated unassigned compactions retain their actual position before the next request placeholder')
assert.equal(betweenRequests.entries.filter(row=>row.node.stage==='context_compaction').length,2,
  'two real compression identities cannot be merged because they share an empty model request ID')
assert.deepEqual(streamProcessTimeline([...repeatedCompactionTrace,reasoning('M2','开始核对','running')],
  [rows[0]],'中文',repeatedCompactionRequests).entries.map(row=>row.kind==='commentary' ? row.text : row.node.id),
  betweenRequests.entries.map(row=>row.kind==='commentary' ? row.text : row.node.id),
  'real reasoning replaces the next request placeholder without moving either compression')

// Exercise component methods with controlled clocks, selectors and native animation completion.
const realTimers = [global.setTimeout,global.clearTimeout,global.setInterval,global.clearInterval,Date.now]
const timers = new Map(), animations = [], events = []
let nextTimer = 0, now = 100000, definition, thinkDefinition, turnListener, observeCalls = 0
const schedule = (fn,delay,interval = false) => {
  timers.set(++nextTimer,{fn,delay,interval}); return nextTimer
}
global.setTimeout = (fn,delay) => schedule(fn,delay)
global.setInterval = (fn,delay) => schedule(fn,delay,true)
global.clearTimeout = global.clearInterval = id => timers.delete(id)
Date.now = () => now
global.getApp = () => ({})
global.wx = {worklet:{shared:value => ({value}),spring:value => value,
  timing(value,options,callback){animations.push({value,options,callback});return value},
  runOnJS:fn => fn},yuanAI:{chatRuntime:{observe(key,listener){
    observeCalls++;turnListener=listener;return () => {if(turnListener===listener)turnListener=null}
  }}}}
global.Component = value => { definition = value }
require('../mdPackage/components/assisStream/index.js')
global.Component = value => { thinkDefinition = value }
require('../mdPackage/components/thinkItem/index.js')
function instance(){
  return {...definition.methods,applyCloudSnapshot(assistant){return definition.methods.applyCloudSnapshot.call(this,{...assistant,processTrace:serverTrace(assistant.textSegments?.length ? projectSegments(assistant.processTrace || [],assistant.textSegments) : assistant.processTrace || []),modelRequests:(assistant.modelRequests || []).map(row=>({...row,presentation:row.presentation || serverNode({...row,stage:'main_reasoning'}).presentation}))})},properties:{language:'中文'},
    data:{...definition.data,mdText:{text:''},turnKey:'local',streamContent:'question',
      contentParts:[],attachments:[],processTrace:[],generatedImages:[]},
    _that:{chatHeight:{value:0}},streamMinHeight:{value:0},_destroyed:false,_renderEpoch:1,
    processHeight:wx.worklet.shared(120),processOpacity:wx.worklet.shared(1),
    setData(patch,callback){
      for(const [key,value] of Object.entries(patch)){
        const row=key.match(/^timelineEntries\[(\d+)\]\.(displayText|hidden)$/)
        if(row)this.data.timelineEntries[Number(row[1])][row[2]]=value
        else if(key==='mdText.text')this.data.mdText={...this.data.mdText,text:value}
        else this.data[key]=value
      }
      callback?.()
    },
    triggerEvent(name,detail){events.push({name,detail})},
    selectComponent(id){assert.equal(id,'#streamMarkdown');return this._markdownChild || null},
    applyAnimatedStyle(selector,style){this._animationSelector=selector;this._animationStyle=style;return selector},
    clearAnimatedStyle(){},
    createSelectorQuery(){return {select(){return this},selectAll(){this.multiple=true;return this},
      boundingClientRect(fn){fn(this.multiple ? [{height:120,id:'stream-process-row-0'}] : {height:120});return this},exec(){}}}
  }
}
const snapshot = (processTrace = [],textSegments = [],extra = {}) => ({
  status:'running',processTrace:projectSegments(processTrace,textSegments),textSegments,...extra,
  ...(extra.modelRequests ? {modelRequests:extra.modelRequests.map(row=>({...row,presentation:row.presentation || serverNode({...row,stage:'main_reasoning'}).presentation}))} : {})
})
const findRow = (renderer,id) => renderer.data.timelineEntries.find(row => row.node?.id===id)
const toolRows = renderer => renderer.data.timelineEntries.filter(row => row.node?.callId)
const finishSummaries = renderer => {
  for(let count=0;renderer.data.timelineSummaryPending;count++){
    assert.ok(count<100,'each complete summary releases the next timeline prefix')
    assert.ok(timers.get(renderer._timelineTimer),'a pending summary owns the real character playback timer')
    tick(24)
  }
}
const parallelTool = (id,text = '',status = 'running') => ({...tool('M1',text,status),id,callId:id,
  name:id==='A' ? 'web' : 'attachment_analysis',title:id==='A' ? '联网检索与读取' : '附件联合分析'})
const parallelSnapshot = (left = '',right = '第二项😀积压') =>
  snapshot([reasoning('M1','之前的推理'),exec('M1','running'),parallelTool('A',left),parallelTool('B',right)],[rows[0]])
const rotate = (renderer,elapsed = 3000) => {
  now+=elapsed
  const id=renderer._toolRotationTimer, timer=timers.get(id)
  assert.ok(timer,'parallel actual calls have an idle rotation deadline')
  timers.delete(id);timer.fn()
}
const tick = delay => {
  for(const [id,timer] of [...timers])if(timer.delay===delay){
    if(!timer.interval)timers.delete(id)
    timer.fn()
  }
}
const drain = delay => {
  for(let count=0;[...timers.values()].some(timer => timer.delay===delay&&!timer.interval);count++){
    assert.ok(count<100,'typing must drain without replaying an identical snapshot');tick(delay)
  }
}
const completeAnimation = () => {
  const animation = [...animations].reverse().find(item => typeof item.callback==='function')
  assert.ok(animation,'positive process height must use the native timing completion callback')
  assert.ok(animation.options.duration>0&&animation.options.duration<=1000)
  animation.callback(true)
}
try{
  const longSentence = '甲'.repeat(39) + '😀乙'
  const last40 = text => Array.from(text.replace(/\r\n|[\r\n\t]/g,' ')).slice(-40).join('')
  const windowFlow = instance();windowFlow.applyCloudSnapshot(snapshot())
  const windowText = longSentence + '。下一句'
  windowFlow.applyCloudSnapshot(snapshot([exec('M1','running'),tool('M1',windowText,'running')]))
  for(let index=1;index<40;index++)tick(24)
  assert.equal(toolRows(windowFlow)[0].displayText,'甲'.repeat(39)+'😀','the first 40 characters include a complete emoji')
  tick(24)
  assert.equal(toolRows(windowFlow)[0].displayText,'甲'.repeat(38)+'😀乙','character 41 slides out only the oldest character')
  tick(24)
  assert.equal(toolRows(windowFlow)[0].displayText,'','punctuation still resets an ordinary tool sentence')
  drain(24)
  assert.equal(toolRows(windowFlow)[0].displayText,'下一句')
  assert.equal(windowFlow.data.processTrace.find(node=>node.name==='web').responseContent,windowText,
    'the inline window never truncates complete process details')
  windowFlow.resetStream()
  const windowRestore = instance()
  windowRestore.applyCloudSnapshot(snapshot([tool('M1',longSentence,'running')]))
  assert.equal(toolRows(windowRestore)[0].displayText,last40(longSentence),'restored snapshots use the same window without replay')
  windowRestore.resetStream()
  const legacyWindow = instance();legacyWindow.data.thinkStatus=1;legacyWindow._hasThinkSnapshot=true
  legacyWindow.syncThinkText(longSentence,'legacy-tool')
  drain(24)
  assert.equal(legacyWindow.data.thinkVisibleText,last40(longSentence),'the independent process row shares the window')
  assert.equal(legacyWindow._thinkTyping.text,longSentence,'original typing text and UTF-16 cursors remain intact')
  legacyWindow.syncThinkText(longSentence+'丙','legacy-tool')
  assert.equal(legacyWindow.data.thinkVisibleText,last40(longSentence+'丙'),'later response chunks continue the same sliding window')
  legacyWindow.resetStream()

  const commandFlow = instance();commandFlow._chatMeta={turnId:'t',runId:'r'}
  commandFlow.applyCloudSnapshot(snapshot())
  const command = 'python3 ./web.py; echo "😀"\nls outputs'
  const bash = {...tool('M1','','running'),id:'bash-A',callId:'bash-A',name:'bash',title:'运行命令',public:{command}}
  commandFlow.applyCloudSnapshot(snapshot([exec('M1','running'),bash]))
  assert.equal(toolRows(commandFlow)[0].node.title,'正在运行命令')
  assert.ok(toolRows(commandFlow)[0].displayText.length < command.length,'a complete parameter starts client-side character playback')
  drain(24)
  assert.equal(toolRows(commandFlow)[0].displayText,last40(command),'command playback uses the same single-line tail window')
  assert.equal(commandFlow._timelineStates.get('bash-A').text,command,'the complete command retains its original punctuation and newlines')
  commandFlow.applyCloudSnapshot(snapshot([exec('M1'),{...bash,status:'completed',public:{result:'完整结果'}}]))
  assert.equal(toolRows(commandFlow)[0].node.title,'已运行命令')
  assert.equal(toolRows(commandFlow)[0].displayText,'','a terminal node does not type its command or result')
  assert.equal(findRow(commandFlow,'bash-A')?.text || toolRows(commandFlow)[0].text,'完整结果')
  commandFlow.applyCloudSnapshot(snapshot([exec('M1','running'),bash]))
  commandFlow.stopDisplay();drain(24)
  assert.equal(commandFlow.data.thinkVisibleText,'','stop clears pending command playback')

  const installFlow = instance();installFlow._chatMeta={turnId:'t',runId:'r'}
  installFlow.applyCloudSnapshot(snapshot())
  const installCommand = './.yuanai-deps/python/bin/python -m pip install sample==1.2.3'
  const installing = {...bash,id:'deps-A',callId:'deps-A',name:'sandbox_dependencies',
    public:{command:installCommand,progress:{phase:'install',elapsed_seconds:7,remaining_seconds:83}}}
  installFlow.applyCloudSnapshot(snapshot([exec('M1','running'),installing]))
  assert.equal(toolRows(installFlow)[0].node.title,'安装依赖')
  assert.ok(toolRows(installFlow)[0].displayText.length < installCommand.length)
  drain(24)
  assert.equal(toolRows(installFlow)[0].displayText,last40(installCommand))
  assert.equal(installFlow._timelineStates.get('deps-A').text,installCommand)
  installFlow.resetStream()

  const serverFlow = instance();serverFlow._chatMeta={turnId:'t',runId:'r'}
  serverFlow.applyCloudSnapshot(snapshot())
  const serverCopy = {title:'服务端定义标题',endedTitle:'服务端结束标题',detailTitle:'服务端详情标题',groupTitle:'服务端汇总',
    content:installCommand,details:[],summary:'',errorMessage:'',statusLabel:'',responseItems:[]}
  const serverTool = {...installing,name:'new_server_tool',presentation:{version:1,format:'code',visible:true,hasDetails:true,
    locales:{'zh-CN':serverCopy,'en-US':{...serverCopy,title:'Server controlled',content:installCommand}}}}
  serverFlow.applyCloudSnapshot(snapshot([exec('M1','running'),serverTool]))
  assert.equal(toolRows(serverFlow)[0].node.title,serverCopy.title)
  drain(24)
  assert.equal(toolRows(serverFlow)[0].displayText,last40(installCommand),'format chooses command playback for a new tool without client business rules')
  serverFlow.properties.language='English'
  definition.observers.language.call(serverFlow,'English')
  assert.equal(toolRows(serverFlow)[0].node.title,'Server controlled')
  serverFlow.resetStream()
  const serverBody = instance();serverBody._chatMeta={turnId:'t',runId:'r'}
  serverBody.applyCloudSnapshot({status:'running',processTrace:[]})
  serverBody.applyCloudSnapshot({status:'running',processTrace:[serverTool]})
  drain(24)
  assert.equal(serverBody.data.thinkVisibleText,last40(installCommand),'old message layout also plays the server code format')
  assert.equal(serverBody._thinkTyping.text,installCommand)
  serverBody.resetStream()

  const imageFlow = instance();imageFlow._chatMeta={turnId:'t',runId:'r'}
  imageFlow.applyCloudSnapshot(snapshot())
  const draw = {...tool('M1','','running'),id:'draw-A',callId:'draw-A',name:'http_request',title:'图片生成 · 提交绘图任务'}
  const loading = {artifactType:'image',artifactId:'image-A',callId:'draw-A',width:512,height:512,status:'generating'}
  const progress = segment('M1','现在生成图片。','commentary',{ended:true})
  const imageSnapshot = (trace,parts,segments=[progress],extra={}) => snapshot(trace,segments,{contentParts:parts,...extra})
  imageFlow.applyCloudSnapshot(imageSnapshot([exec('M1','running'),draw],[loading]))
  assert.equal(imageFlow.data.standaloneImages.length,0,'anchored images cannot bypass an unfinished summary through the tail slot')
  assert.equal(toolRows(imageFlow).length,0)
  finishSummaries(imageFlow)
  const slot = toolRows(imageFlow)[0]
  assert.equal(slot.node.title,'图片生成 · 提交绘图任务','a running registered HTTP image call replaces the exec envelope')
  assert.deepEqual(slot.images,[loading],'the real generating event starts the existing card after its tool row')
  const delivered = {...loading,status:'completed',url:'https://example.com/image-A.png'}
  const afterDraw = [exec('M1'),{...draw,status:'completed'},reasoning('M2','核对刚生成的图片。','running')]
  imageFlow.applyCloudSnapshot(imageSnapshot(afterDraw,[delivered]))
  const order = imageFlow.data.timelineEntries.flatMap(entry => [entry.node.id,...entry.images.map(image=>image.artifactId)])
  assert.ok(order.indexOf('image-A')>order.indexOf('draw-A') && order.indexOf('image-A')<order.indexOf('thinking_M2'),
    'the completed image stays before the following main Agent reasoning')
  const restoredImage = instance();restoredImage._chatMeta={turnId:'t',runId:'r'}
  restoredImage.applyCloudSnapshot(imageSnapshot(afterDraw,[delivered]))
  finishSummaries(restoredImage)
  assert.deepEqual(toolRows(restoredImage)[0].images,[delivered],'snapshot recovery restores the same tool/image association')
  restoredImage.stopDisplay()
  assert.deepEqual(toolRows(restoredImage)[0].images,[delivered],'stopping hides process rows and retains delivered images in place')
  const frozenImages = restoredImage.data.timelineEntries
  restoredImage.applyCloudSnapshot(imageSnapshot(afterDraw,[{...delivered,artifactId:'late-image'}]))
  assert.equal(restoredImage.data.timelineEntries,frozenImages,'late delivery cannot change stopped image placement')
  const finalImage = segment('M2','![结果](https://example.com/image-A.png)','final',{ended:true})
  imageFlow.applyCloudSnapshot(imageSnapshot(afterDraw,[delivered],[progress,finalImage]))
  assert.match(imageFlow._animationSelector,/^#stream-process-row-/,'only process rows participate in collapse, never the image container')
  completeAnimation()
  assert.equal(imageFlow.data.processCollapsed,true)
  assert.deepEqual(toolRows(imageFlow)[0].images,[delivered],'final handoff keeps the same image slot mounted')
  imageFlow.markdownImageCards({currentTarget:{dataset:{markdownKey:imageFlow.data.markdownKeys[0]-1}},detail:{artifactIds:['image-A']}})
  assert.deepEqual(imageFlow.data.markdownImageIds,[],'stale Markdown cannot hide a live image card')
  imageFlow.markdownImageCards({currentTarget:{dataset:{markdownKey:imageFlow.data.markdownKeys[0]}},detail:{artifactIds:['image-A']}})
  assert.equal(require('../static_utils/generatedImages').visibleGeneratedImages(toolRows(imageFlow)[0].images,false,[],imageFlow.data.markdownImageIds).length,0,
    'only the actually rendered final image takes over the timeline card')
  imageFlow.data.generatedImages[0].fileID='deleted-image'
  imageFlow.markUnavailableFileIds(new Set(['deleted-image']))
  assert.equal(toolRows(imageFlow)[0].images[0].status,'unavailable','deleted image state reaches its anchored card too')
  const gatedStop = instance();gatedStop._chatMeta={turnId:'t',runId:'r'};gatedStop.applyCloudSnapshot(snapshot())
  gatedStop.applyCloudSnapshot(imageSnapshot([exec('M1','running'),draw],[delivered]))
  assert.equal(toolRows(gatedStop).length,0)
  gatedStop.stopDisplay()
  assert.deepEqual(gatedStop.data.standaloneImages,[delivered],'stopping releases already received images hidden behind a playing summary')
  gatedStop.resetStream()
  imageFlow.resetStream();restoredImage.resetStream()

  const compressing = instance();compressing._chatMeta={turnId:'t',runId:'r'}
  compressing.applyCloudSnapshot(snapshot())
  compressing.applyCloudSnapshot(snapshot([compaction()],[],{
    modelRequests:[{modelRequestId:'SUMMARY',parentCallId:'context_compaction_1',status:'running'}]}))
  assert.deepEqual(compressing.data.timelineEntries.map(row=>row.node.id),['context_compaction_1'])
  assert.equal(findRow(compressing,'context_compaction_1').node.title,'正在压缩上下文')
  assert.equal(findRow(compressing,'context_compaction_1').node.activityIcon,'icon-context-compaction')
  assert.equal(findRow(compressing,'context_compaction_1').displayText,'')
  assert.equal(compressing.data.timelineSummaryPending,false)
  assert.ok(!compressing._timelineTimer,'a title-only compaction does not start the character playback timer')
  compressing.applyCloudSnapshot(snapshot([compaction('context_compaction_1','completed')]))
  assert.equal(findRow(compressing,'context_compaction_1').node.title,'上下文已压缩')
  assert.equal(findRow(compressing,'context_compaction_1').displayText,'')
  assert.ok(!compressing._timelineTimer,'completion does not introduce a summary playback delay')
  compressing.applyCloudSnapshot(snapshot([compaction('context_compaction_1','completed'),
    reasoning('AFTER','继续思考','running')],[],{modelRequests:[{modelRequestId:'AFTER',parentCallId:'',status:'running'}]}))
  assert.equal(findRow(compressing,'context_compaction_1').node.title,'上下文已压缩')
  assert.equal(findRow(compressing,'thinking_AFTER').displayText,'继','the following main request keeps its normal playback')
  compressing.applyCloudSnapshot(snapshot([compaction('context_compaction_1','completed'),
    reasoning('AFTER','继续思考'),compaction('context_compaction_2')],[],{
    modelRequests:[{modelRequestId:'AFTER',parentCallId:'',status:'completed'},
      {modelRequestId:'NEXT',parentCallId:'',status:'running',responseStarted:false}]}))
  assert.deepEqual(compressing.data.timelineEntries.map(row=>row.node.id),
    ['context_compaction_1','thinking_AFTER','context_compaction_2','thinking_NEXT'],
    'a later compression remains between its actual preceding request and the next request placeholder')
  assert.equal(findRow(compressing,'context_compaction_2').displayText,'')
  assert.ok(!compressing._timelineTimer,'an empty next thinking placeholder cannot turn compaction into typed details')
  compressing.resetStream()
  const delayedImage = instance();delayedImage.data.imging=true;delayedImage._chatMeta={turnId:'t',runId:'r'}
  const imageTool={...tool('M1','','running'),name:'image_generation',title:'创建图片'}
  delayedImage.applyCloudSnapshot(snapshot([imageTool],[segment('M1','先确认创作要求。','commentary',{ended:true})]))
  assert.equal(delayedImage.data.turnCreated,true)
  assert.equal(delayedImage.data.generatedImages.length,0,'an image tool behind a playing summary cannot mount Canvas early')
  finishSummaries(delayedImage)
  assert.ok(delayedImage.data.timelineEntries.some(row=>row.node.name==='image_generation'))
  assert.equal(delayedImage.data.generatedImages[0].artifactId,'retry_pending','Canvas starts only after the image tool joins the visible timeline')
  delayedImage.resetStream()
  const terminalImage=instance();terminalImage.data.imging=true;terminalImage._chatMeta={turnId:'t',runId:'r'}
  terminalImage.applyCloudSnapshot(snapshot([imageTool],[],{status:'failed'}))
  assert.equal(terminalImage.data.generatedImages.length,0,'a late render callback cannot add a loading card to a terminal snapshot')
  terminalImage.resetStream()
  const record = (status,assistant) => ({status,connection:'connected',
    meta:{conversationId:'c',turnId:'t',runId:'r',assistantMessageId:'a',userMessageId:'u'},assistant})
  const legacy = instance();legacy.observeTurn('local')
  turnListener(record('running',{content:'旧协议正文',textSegments:[],processTrace:[],contentParts:[]}))
  assert.equal(legacy.data.mdText.text,'旧协议正文','normalizing a legacy snapshot to empty segments preserves authoritative content')
  turnListener(record('completed',{content:'旧协议最终正文',textSegments:[],processTrace:[],contentParts:[]}))
  legacy.finish()
  assert.equal(legacy.data.assistantItem.content,'旧协议最终正文','observed legacy terminal content survives settlement')
  legacy.resetStream()

  const legacyTransition = instance();legacyTransition.observeTurn('local')
  turnListener(record('queued',snapshot()))
  assert.equal(legacyTransition.data.timelineMode,true,'normalized queued snapshots start the modern display mode')
  const queuedClock = timers.get(legacyTransition._processClockTimer).fn
  turnListener(record('running',{content:'旧正文开始',textSegments:[],processTrace:[],contentParts:[]}))
  assert.equal(legacyTransition.data.timelineMode,false,'authoritative legacy content exits modern timeline mode')
  assert.equal(legacyTransition.data.mdText.text,'旧正文开始')
  assert.deepEqual([legacyTransition.processHeight.value,legacyTransition.processOpacity.value],[-1,1])
  const beforeLateClock = JSON.stringify(legacyTransition.data)
  queuedClock()
  assert.equal(JSON.stringify(legacyTransition.data),beforeLateClock,'a queued modern clock cannot update the restored legacy mode')
  assert.equal(legacyTransition._processClockTimer,null,'a late modern clock cannot revive itself in legacy mode')
  turnListener(record('completed',{content:'旧正文结束',textSegments:[],processTrace:[],contentParts:[]}))
  assert.equal(legacyTransition.data.isFinish,true,'switching display modes keeps the legacy completion entry')
  legacyTransition.finish()
  assert.equal(legacyTransition.data.assistantItem.content,'旧正文结束')
  legacyTransition.resetStream()

  const failed = instance();failed.observeTurn('local')
  turnListener(record('queued',snapshot()))
  turnListener(record('running',snapshot(trace,rows)))
  turnListener(record('failed',snapshot(trace,rows)))
  assert.equal(failed.data.mdText.text,'','fallback waits for process collapse instead of publishing over expanded rows')
  assert.equal(failed.data.processCollapsed,false)
  assert.equal(failed.data.timelineSummaryPending,true,'failure cannot skip summaries that are still printing')
  assert.equal(failed._collapseTimer,null)
  tick(900);assert.equal(failed.data.mdText.text,'','the collapse watchdog does not bypass summary playback')
  finishSummaries(failed)
  completeAnimation()
  assert.match(failed.data.mdText.text,/我好像/,'fallback is published after native collapse completion')
  assert.equal(failed.data.processCollapsed,true)
  assert.equal(failed.data.isFinish,true)
  failed.finish();assert.equal(failed.data.assistantItem.status,'failed')
  failed.resetStream()

  const live = instance();live.applyCloudSnapshot(snapshot())
  live.applyCloudSnapshot(snapshot([reasoning('M1','甲😀乙。丙','running')]))
  assert.equal(live.data.timelineMode,true)
  assert.equal(findRow(live,'thinking_M1').displayText,'甲')
  tick(24);assert.equal(findRow(live,'thinking_M1').displayText,'甲😀','typing preserves surrogate pairs')
  drain(24);assert.equal(findRow(live,'thinking_M1').displayText,'丙','the existing sentence window is retained')
  live.applyCloudSnapshot(snapshot([reasoning('M1','甲😀乙。丙'),exec('M1'),tool('M1','工具输出','running')],[rows[0]]))
  assert.equal(live.data.timelineEntries.find(row => row.kind==='commentary').text,rows[0].content)
  assert.equal(live.data.mdText.text,'','commentary renders separately from final Markdown')
  finishSummaries(live)
  drain(24)
  const originalSnapshot = snapshot(trace,rows), originalTrace = JSON.stringify(originalSnapshot.processTrace)
  live.applyCloudSnapshot(originalSnapshot)
  assert.deepEqual(live.data.processTrace.map(node=>node.id),originalSnapshot.processTrace.map(node=>node.id),'server trace retains the stored execution identities')
  assert.equal(JSON.stringify(originalSnapshot.processTrace),originalTrace,'display timeline never mutates server trace')
  assert.deepEqual(live.data.timelineTrace.map(node=>node.id),
    ['thinking_M1','body_M1','exec_M1','search_M1','thinking_M2','body_M2','exec_M2','search_M2'],
    'detail projection has the same complete ordered timeline as live rows')
  assert.deepEqual(live.data.timelineEntries.filter(row => row.kind==='commentary').map(row => row.text),
    rows.map(row => row.content),'the next main request appends instead of clearing the previous summary')
  finishSummaries(live)
  assert.equal(live.data.finalStarted,false)
  assert.equal(live.data.processCollapsed,false)
  live.applyCloudSnapshot(snapshot(trace,[...rows,segment('M3','还未确认用途','pending')]))
  assert.equal(live.data.mdText.text,'')
  assert.equal(live.data.processCollapsed,false,'unresolved pending output cannot start final collapse')
  live.applyCloudSnapshot(snapshot([...trace,reasoning('M3','总结思考')],finalRows))
  assert.equal(live.data.mdText.text,'','final text stays hidden until collapse completes')
  completeAnimation()
  assert.equal(live.data.processCollapsed,true)
  assert.equal(live.data.finalStarted,true)
  assert.equal(live.data.mdText.text,'正式😀回答')
  const exposed = live.data.mdText.text
  tick(900);assert.equal(live.data.mdText.text,exposed,'animation and timeout completion are idempotent')
  live.resetStream()

  const restored = instance();restored.applyCloudSnapshot(snapshot([reasoning('M1','已恢复😀','running')]))
  assert.equal(findRow(restored,'thinking_M1').displayText,'已恢复😀','history snapshots do not retype')
  restored.applyCloudSnapshot(snapshot([reasoning('M1','已恢复😀续','running')]))
  assert.equal(findRow(restored,'thinking_M1').displayText,'已恢复😀续')
  restored.resetStream()
  const timeout = instance();timeout.applyCloudSnapshot(snapshot(trace,rows));finishSummaries(timeout)
  timeout.applyCloudSnapshot(snapshot(trace,finalRows))
  assert.equal(timeout.data.mdText.text,'');tick(900)
  assert.equal(timeout.data.mdText.text,'正式😀回答','a missing native callback still ends collapse within one second')
  timeout.resetStream()

  const sources = instance();sources.applyCloudSnapshot(snapshot())
  sources.applyCloudSnapshot(snapshot([{...tool('M1','甲。乙\n丙\n答','running'),
    responseItems:[{kind:'source',start:0,end:4},{kind:'source',start:4,end:6},{kind:'answer',start:6,end:7}]}]))
  assert.equal(findRow(sources,'search_M1').displayText,'甲')
  tick(24);assert.equal(findRow(sources,'search_M1').displayText,'甲。','source punctuation remains visible')
  tick(24);assert.equal(findRow(sources,'search_M1').displayText,'甲。乙')
  drain(24);assert.equal(findRow(sources,'search_M1').displayText,'答','source entries precede answer text')
  sources.resetStream()
  const sourceRestore = instance()
  sourceRestore.applyCloudSnapshot(snapshot([{...tool('M1','恢复。来源。','running'),responseItems:[{kind:'source',start:0,end:6}]}]))
  assert.equal(findRow(sourceRestore,'search_M1').displayText,'恢复。来源。','restored source entries retain their complete punctuation window')
  sourceRestore.resetStream()

  const translated = instance();translated.applyCloudSnapshot(snapshot())
  const firstPart = '先用 web。\n', sourcePart = '来源网页。\n', lastPart = '后续'
  translated.applyCloudSnapshot(snapshot([{...tool('M1',firstPart+sourcePart+lastPart,'running'),
    responseItems:[{kind:'answer',start:0,end:firstPart.length},
      {kind:'source',start:firstPart.length,end:firstPart.length+sourcePart.length},
      {kind:'answer',start:firstPart.length+sourcePart.length,end:firstPart.length+sourcePart.length+lastPart.length}]}]))
  const displayed = [findRow(translated,'search_M1').displayText]
  for(let count=0;[...timers.values()].some(timer=>timer.delay===24);count++){
    assert.ok(count<100);tick(24);displayed.push(findRow(translated,'search_M1').displayText)
  }
  assert.ok(displayed.includes('先用 web'),'server tool text is not rewritten before display')
  assert.ok(displayed.includes('来源网页。'),'translated text length cannot shift the following source window')
  assert.equal(displayed.at(-1),'后续')
  translated.resetStream()

  const starting = instance();starting._chatMeta={turnId:'t',runId:'r'}
  starting.applyCloudSnapshot(snapshot())
  assert.equal(starting.data.timelineEntries.length,0,'a queued turn does not invent a main-model request')
  const modelRequests = [{modelRequestId:'M1',parentCallId:'',status:'running',responseStarted:false},
    {modelRequestId:'CHILD',parentCallId:'search_M1',status:'running',responseStarted:false}]
  starting.applyCloudSnapshot(snapshot([],[],{modelRequests}))
  const mainRows = starting.data.timelineEntries.filter(row=>row.node?.stage==='main_reasoning')
  assert.deepEqual(mainRows.map(row=>row.node.modelRequestId),['M1'],
    'starting a main request immediately shows its thinking row before any response token')
  assert.equal(mainRows[0].displayText,'')
  const nextRequests = [{...modelRequests[0],status:'completed'},
    {modelRequestId:'M2',parentCallId:'',status:'running',responseStarted:false}]
  starting.applyCloudSnapshot(snapshot([exec('M1'),tool('M1')],[rows[0]],{modelRequests:nextRequests}))
  finishSummaries(starting)
  assert.deepEqual(starting.data.timelineEntries.filter(row=>row.node?.stage==='main_reasoning')
    .map(row=>row.node.modelRequestId),['M1','M2'],
    'a completed request without reasoning tokens keeps its thinking row before the next request')
  starting.applyCloudSnapshot(snapshot([exec('M1'),tool('M1'),reasoning('M2','开始思考','running')],
    [rows[0]],{modelRequests:nextRequests}))
  assert.equal(starting.data.timelineEntries.filter(row=>row.node?.stage==='main_reasoning'&&row.node.modelRequestId==='M2').length,1,
    'real reasoning replaces the same-request empty thinking row instead of duplicating it')
  starting.resetStream()

  const finalThinking = instance();finalThinking.applyCloudSnapshot(snapshot())
  const finalRequest = [{modelRequestId:'FINAL',parentCallId:'',status:'running',responseStarted:false}]
  finalThinking.applyCloudSnapshot(snapshot([],[],{modelRequests:finalRequest}))
  finalThinking.applyCloudSnapshot(snapshot([reasoning('FINAL','先核对😀。再总结。\n','running')],[],
    {modelRequests:finalRequest}))
  assert.equal(findRow(finalThinking,'thinking_FINAL').displayText,'先','real final reasoning replaces the empty title and starts streaming')
  const pendingAnswer = segment('FINAL','正式回答尚未确认用途','pending',{ended:false})
  finalThinking.applyCloudSnapshot(snapshot([reasoning('FINAL','先核对😀。再总结。\n','running')],[pendingAnswer],
    {modelRequests:finalRequest}))
  assert.equal(findRow(finalThinking,'thinking_FINAL').playbackStopped,false,'unpublished pending answer cannot stop final thinking playback')
  tick(24);assert.equal(findRow(finalThinking,'thinking_FINAL').displayText,'先核')
  tick(24);assert.equal(findRow(finalThinking,'thinking_FINAL').displayText,'先核对')
  tick(24);assert.equal(findRow(finalThinking,'thinking_FINAL').displayText,'先核对😀')
  tick(24);assert.equal(findRow(finalThinking,'thinking_FINAL').displayText,'先核对😀。','a sentence stays visible until the next sentence starts')
  tick(24);assert.equal(findRow(finalThinking,'thinking_FINAL').displayText,'再')
  drain(24);assert.equal(findRow(finalThinking,'thinking_FINAL').displayText,'再总结。','trailing punctuation and whitespace do not leave a title-only row')
  finalThinking.applyCloudSnapshot(snapshot([reasoning('FINAL','先核对😀。再总结。\n')],[pendingAnswer]))
  assert.equal(findRow(finalThinking,'thinking_FINAL').playbackStopped,true)
  assert.equal(findRow(finalThinking,'thinking_FINAL').displayText,'再总结。','ended reasoning keeps its displayed sentence while final purpose is unconfirmed')
  finalThinking.applyCloudSnapshot(snapshot([reasoning('FINAL','先核对😀。再总结。\n')],[{...pendingAnswer,purpose:'final',ended:true}]))
  assert.equal(finalThinking.data.mdText.text,'','formal answer still waits for native process collapse')
  completeAnimation()
  assert.equal(finalThinking.data.mdText.text,pendingAnswer.content)
  finalThinking.resetStream()

  {
    const purpose = 'commentary'
    const summary = instance();summary.applyCloudSnapshot(snapshot())
    summary.applyCloudSnapshot(snapshot([reasoning('M1','本轮积压😀长推理','running')]))
    assert.equal(findRow(summary,'thinking_M1').displayText,'本')
    const thinkingTimer = summary._timelineTimer, lateThinking = timers.get(thinkingTimer).fn
    const publicBody = segment('M1','开始执行。',purpose,{ended:false})
    summary.applyCloudSnapshot(snapshot([reasoning('M1','本轮积压😀长推理','running')],[publicBody]))
    assert.equal(findRow(summary,'thinking_M1').hidden,true,
      'thinking hides only after the same request public summary actually starts displaying')
    assert.equal(findRow(summary,'thinking_M1').displayText,'')
    assert.equal(findRow(summary,'thinking_M1').playbackStopped,true)
    assert.equal(findRow(summary,'thinking_M1').node.title,'正在思考','handoff leaves the original running node intact for details')
    assert.equal(summary.data.timelineTrace.find(node=>node.id==='thinking_M1').responseContent,'本轮积压😀长推理')
    const frozen = JSON.stringify(summary.data.timelineEntries)
    timers.delete(thinkingTimer);lateThinking()
    assert.equal(JSON.stringify(summary.data.timelineEntries),frozen,'an abandoned thinking callback cannot restart the ended sentence')
    summary.applyCloudSnapshot(snapshot([reasoning('M1','本轮积压😀长推理迟到','running')],[publicBody]))
    assert.equal(findRow(summary,'thinking_M1').displayText,'','same-request late reasoning stays only in complete details')
    summary.applyCloudSnapshot(snapshot([reasoning('M1','本轮积压😀长推理迟到'),
      exec('M1'),tool('M1'),reasoning('M2','下一轮继续思考','running')],[{...publicBody,ended:true}]))
    assert.equal(findRow(summary,'thinking_M1').hidden,true)
    assert.equal(findRow(summary,'thinking_M2'),undefined,'the following request waits for its predecessor summary to finish')
    finishSummaries(summary)
    assert.equal(findRow(summary,'thinking_M2').displayText,'下','the next main request still streams its own thinking')
    summary.resetStream()
  }

  const thinkingVisibility = instance();thinkingVisibility.applyCloudSnapshot(snapshot())
  const endedThought = reasoning('M1','完整思考内容')
  thinkingVisibility.applyCloudSnapshot(snapshot([endedThought]))
  assert.equal(findRow(thinkingVisibility,'thinking_M1').playbackStopped,true)
  assert.equal(findRow(thinkingVisibility,'thinking_M1').hidden,false,'completed thinking stays visible before any summary text')
  thinkingVisibility.applyCloudSnapshot(snapshot([endedThought],[segment('M1','未确认正文','pending',{ended:false})]))
  assert.equal(findRow(thinkingVisibility,'thinking_M1').hidden,false,'unpublished pending text cannot hide the thinking title')
  assert.equal(thinkingVisibility.data.timelineEntries.some(row=>row.kind==='commentary'),false)
  const visibilityFrames = [], visibilitySetData = thinkingVisibility.setData
  thinkingVisibility.setData=function(patch,callback){visibilityFrames.push({...patch});visibilitySetData.call(this,patch,callback)}
  const spacedBody = segment('M1',' \n甲😀','commentary',{ended:false})
  thinkingVisibility.applyCloudSnapshot(snapshot([endedThought],[spacedBody]))
  assert.equal(thinkingVisibility.data.timelineEntries.find(row=>row.kind==='commentary').displayText,'')
  assert.equal(findRow(thinkingVisibility,'thinking_M1').hidden,false,'the first whitespace character does not hide thinking')
  tick(24)
  assert.equal(findRow(thinkingVisibility,'thinking_M1').hidden,false,'a leading newline still has no visible summary content')
  tick(24)
  assert.equal(findRow(thinkingVisibility,'thinking_M1').hidden,true)
  assert.equal(thinkingVisibility.data.timelineEntries.find(row=>row.kind==='commentary').displayText,' \n甲')
  assert.ok(visibilityFrames.some(patch=>Object.entries(patch).some(([key,value])=>/\.hidden$/.test(key)&&value===true)&&
    Object.entries(patch).some(([key,value])=>/\.displayText$/.test(key)&&value===' \n甲')),
    'the first visible summary character and thinking hide are submitted in the same frame')
  thinkingVisibility.applyCloudSnapshot(snapshot([{...endedThought,id:'late_thinking_M1',responseContent:'完整思考内容迟到'}],[spacedBody]))
  assert.equal(findRow(thinkingVisibility,'late_thinking_M1').hidden,true,
    'a later actual thinking identity stays hidden after the same request public summary starts')
  assert.equal(thinkingVisibility.data.timelineTrace.find(node=>node.id==='late_thinking_M1').responseContent,'完整思考内容迟到')
  thinkingVisibility.resetStream()

  const unrelatedSummary = instance();unrelatedSummary.applyCloudSnapshot(snapshot())
  unrelatedSummary.applyCloudSnapshot(snapshot([endedThought,reasoning('M2','另一轮思考')],
    [segment('M2','第二轮正文','commentary',{ended:false})]))
  assert.equal(findRow(unrelatedSummary,'thinking_M1').hidden,false,'a different request summary cannot hide completed thinking')
  assert.equal(findRow(unrelatedSummary,'thinking_M2').hidden,true)
  unrelatedSummary.resetStream()

  for(const ending of ['stop','final']){
    const noSummary = instance();noSummary.applyCloudSnapshot(snapshot())
    noSummary.applyCloudSnapshot(snapshot([endedThought]))
    assert.equal(findRow(noSummary,'thinking_M1').hidden,false)
    if(ending==='stop'){
      noSummary.stopDisplay()
      assert.equal(noSummary.data.settled,true)
    }else{
      noSummary.applyCloudSnapshot(snapshot([endedThought],[segment('M1','正式回答','final')]))
      assert.equal(findRow(noSummary,'thinking_M1').hidden,false,'formal collapse can hide the whole section without a summary-triggered hide')
      completeAnimation()
      assert.equal(noSummary.data.mdText.text,'正式回答')
    }
    assert.equal(noSummary.data.processCollapsed,true)
    assert.deepEqual([noSummary.processHeight.value,noSummary.processOpacity.value],[0,0])
    assert.equal(noSummary.data.timelineTrace.find(node=>node.id==='thinking_M1').responseContent,endedThought.responseContent)
    noSummary.resetStream()
  }

  const handoff = instance();handoff.applyCloudSnapshot(snapshot())
  const unfinishedTool = '之前的句子。末段😀未打印完'
  handoff.applyCloudSnapshot(parallelSnapshot(unfinishedTool,'另一项积压'))
  finishSummaries(handoff)
  assert.equal(toolRows(handoff)[0].displayText,'之')
  const oldTyping = timers.get(handoff._timelineTimer).fn
  const oldRotation = timers.get(handoff._toolRotationTimer).fn
  const nextThinking = reasoning('M2','下一轮😀继续思考','running')
  const handedTrace = [...parallelSnapshot(unfinishedTool,'另一项积压').processTrace,nextThinking]
  handoff.applyCloudSnapshot(snapshot(handedTrace,[rows[0]]))
  const endedTool = findRow(handoff,'A')
  assert.deepEqual(endedTool.completedTools,[], 'a later model request cannot turn running operations into completed operations')
  assert.equal(endedTool.playbackStopped,true,'the next main thinking row ends the previous tool playback')
  assert.equal(endedTool.displayText,'','completed tools replace the previous live output sentence')
  assert.equal(handedTrace.filter(node=>node.callId && node.name !== 'exec').length,2, 'unfinished operations remain in the full trace')
  assert.equal(findRow(handoff,'thinking_M2').displayText,'下','the newly appended node starts its own character playback')
  assert.equal(findRow(handoff,'thinking_M2').playbackStopped,false)
  assert.equal(handoff._toolRotationTimer,null,'older request tools no longer rotate under the new main thinking row')
  oldTyping();oldRotation()
  assert.equal(findRow(handoff,'A').displayText,'','late typing and rotation callbacks cannot restart the previous tool')
  assert.equal(findRow(handoff,'A').node.callId,'A')
  const lateTool = unfinishedTool+'迟到正文'
  handoff.applyCloudSnapshot(snapshot([...parallelSnapshot(lateTool,'另一项积压').processTrace,nextThinking],[rows[0]]))
  assert.equal(findRow(handoff,'A').displayText,'','late old-node output cannot resume ended character playback')
  assert.equal(handoff.data.timelineTrace.find(node=>node.callId==='A').responseContent,lateTool,
    'ending the live playback does not truncate complete process details')
  drain(24)
  assert.equal(findRow(handoff,'thinking_M2').displayText,'下一轮😀继续思考','the active next node still drains normally')
  assert.equal(findRow(handoff,'A').displayText,'')
  handoff.resetStream()

  const summaryHandoff = instance();summaryHandoff.applyCloudSnapshot(snapshot())
  const mainStillRunning = [{modelRequestId:'M1',parentCallId:'',status:'running',responseStarted:true}]
  summaryHandoff.applyCloudSnapshot(snapshot([reasoning('M1','已思考','running')],[],{modelRequests:mainStillRunning}))
  assert.equal(findRow(summaryHandoff,'thinking_M1').displayText,'已')
  assert.equal(findRow(summaryHandoff,'thinking_M1').hidden,false)
  const initialSummary = segment('M1','先执行完整摘要😀', 'commentary', {ended:false})
  const wholeSummary = {...initialSummary,content:initialSummary.content+'，再核对结果。',ended:true}
  summaryHandoff.applyCloudSnapshot(snapshot([reasoning('M1','已思考','running')],[initialSummary],{modelRequests:mainStillRunning}))
  const activeSummary = summaryHandoff.data.timelineEntries.find(row=>row.kind==='commentary')
  assert.equal(activeSummary.summaryFinished,false)
  assert.equal(activeSummary.isFinish,false,'a live summary waits for its final body delta')
  assert.equal(activeSummary.displayText,'先','the summary starts by typing its first character')
  assert.equal(findRow(summaryHandoff,'thinking_M1').hidden,true,'early confirmed commentary hides thinking when its first visible character prints')
  assert.equal(summaryHandoff.data.timelineTrace.some(node=>node.callId),false,'confirmed commentary starts before any tool name or call exists')
  const summaryTimer = summaryHandoff._timelineTimer
  summaryHandoff.applyCloudSnapshot(snapshot([reasoning('M1','已思考','running')],[wholeSummary],{modelRequests:mainStillRunning}))
  const queuedSummary = summaryHandoff.data.timelineEntries.find(row=>row.kind==='commentary')
  assert.equal(queuedSummary.text,wholeSummary.content,'the summary retains every incoming body delta while printing')
  assert.equal(queuedSummary.displayText,'先','early message ending cannot complete or replace the partially displayed summary')
  assert.equal(queuedSummary.isFinish,true)
  assert.equal(summaryHandoff.data.timelineSummaryPending,true)
  assert.equal(summaryHandoff.data.timelineWaitingTools,false,'unfinished summary playback cannot reveal the tool-wait placeholder')
  assert.equal(toolRows(summaryHandoff).length,0)
  assert.equal(findRow(summaryHandoff,'thinking_M2'),undefined)
  assert.equal(summaryHandoff._timelineTimer,summaryTimer,'new summary deltas keep the running character cursor')
  tick(24);assert.equal(summaryHandoff.data.timelineEntries.find(row=>row.kind==='commentary').displayText,'先执')
  for(let count=0;!summaryHandoff.data.timelineEntries.find(row=>row.kind==='commentary').displayText.endsWith('😀');count++){
    assert.ok(count<20);tick(24)
  }
  assert.equal(summaryHandoff.data.timelineEntries.find(row=>row.kind==='commentary').displayText,initialSummary.content,
    'summary playback consumes Unicode code points without splitting its emoji')
  tick(24)
  assert.equal(summaryHandoff.data.timelineEntries.find(row=>row.kind==='commentary').displayText,initialSummary.content+'，',
    'summary punctuation stays in the cumulative visible prefix')
  assert.equal(toolRows(summaryHandoff).length,0)
  finishSummaries(summaryHandoff)
  const finishedSummary = summaryHandoff.data.timelineEntries.find(row=>row.kind==='commentary')
  assert.equal(finishedSummary.displayText,wholeSummary.content,'completed summaries retain their complete text including punctuation')
  assert.equal(finishedSummary.summaryFinished,true)
  assert.equal(summaryHandoff.data.timelineSummaryPending,false)
  assert.equal(summaryHandoff._modelRequests[0].status,'running','the summary ends and drains before its model request completes')
  assert.equal(toolRows(summaryHandoff).length,0)
  assert.equal(summaryHandoff.data.timelineWaitingTools,true,'a fully rendered closed summary shows thinking while tool arguments are still arriving')
  assert.equal(summaryHandoff.data.timelineTrace.some(node=>node.callId),false,'the local wait placeholder creates no tool execution evidence')
  summaryHandoff.applyCloudSnapshot(snapshot([reasoning('M1','已思考','running'),exec('M1','proposed')],
    [wholeSummary],{modelRequests:mainStillRunning}))
  assert.equal(summaryHandoff.data.timelineWaitingTools,false,'a real proposed tool replaces the local wait placeholder')
  assert.equal(toolRows(summaryHandoff)[0].node.status,'proposed','a proposed execution envelope cannot fabricate running evidence')
  assert.deepEqual(toolRows(summaryHandoff)[0].completedTools,[])
  summaryHandoff.applyCloudSnapshot(snapshot([reasoning('M1','已思考','running'),exec('M1','ready'),tool('M1','','ready')],
    [wholeSummary],{modelRequests:mainStillRunning}))
  assert.equal(toolRows(summaryHandoff)[0].node.status,'ready')
  summaryHandoff.applyCloudSnapshot(snapshot([reasoning('M1','已思考','running'),exec('M1','running'),tool('M1','工具完整输出','running')],
    [wholeSummary],{modelRequests:mainStillRunning}))
  assert.equal(toolRows(summaryHandoff)[0].displayText,'工')
  assert.equal(toolRows(summaryHandoff)[0].node.status,'running')
  drain(24)
  summaryHandoff.applyCloudSnapshot(snapshot([reasoning('M1','已思考'),exec('M1'),tool('M1','工具完整输出'),nextThinking],
    [wholeSummary],{modelRequests:[{...mainStillRunning[0],status:'completed'},
      {modelRequestId:'M2',parentCallId:'',status:'running'}]}))
  assert.equal(toolRows(summaryHandoff).length,1)
  assert.deepEqual(toolRows(summaryHandoff)[0].completedTools.map(node=>node.name),['web'])
  assert.equal(findRow(summaryHandoff,'thinking_M2').displayText,'下','only complete summary playback releases the next main thinking node')
  assert.equal(summaryHandoff.data.timelineWaitingTools,false,'an already known next main request does not display the previous tool wait')
  assert.equal(findRow(summaryHandoff,'thinking_M1').hidden,true)
  assert.equal(summaryHandoff.data.timelineTrace.find(node=>node.id==='thinking_M1').responseContent,'已思考')
  summaryHandoff.resetStream()

  for(const ending of ['stop','final']){
    const waitingTool = instance();waitingTool.applyCloudSnapshot(snapshot())
    const waitingBody = segment('M1','等待工具。')
    waitingTool.applyCloudSnapshot(snapshot([reasoning('M1','已思考','running')],[waitingBody],{modelRequests:mainStillRunning}))
    finishSummaries(waitingTool)
    assert.equal(waitingTool.data.timelineWaitingTools,true)
    if(ending==='stop')waitingTool.stopDisplay()
    else{
      waitingTool.applyCloudSnapshot(snapshot([reasoning('M1','已思考')],[waitingBody,segment('M2','正式回答','final')]))
      assert.equal(waitingTool.data.timelineWaitingTools,false,'confirmed formal output withdraws the local tool wait')
      completeAnimation()
      assert.equal(waitingTool.data.mdText.text,'正式回答')
    }
    assert.equal(waitingTool.data.timelineWaitingTools,false,`${ending} withdraws the local tool wait`)
    assert.equal(waitingTool.data.processCollapsed,true)
    assert.equal(waitingTool.data.timelineTrace.some(node=>node.callId),false)
    waitingTool.resetStream()
  }

  const summarySpacing = instance();summarySpacing.applyCloudSnapshot(snapshot())
  const paragraphSummary = segment('M1','甲\n\n乙。\n\n')
  summarySpacing.applyCloudSnapshot(snapshot([reasoning('M1','已思考'),exec('M1','running'),tool('M1','工具输出','running')],
    [paragraphSummary]))
  for(let count=0;count<4;count++)tick(24)
  const paragraphRow = summarySpacing.data.timelineEntries.find(row=>row.kind==='commentary')
  const paragraphState = summarySpacing._timelineStates.get(paragraphRow.node.id)
  assert.equal(paragraphRow.displayText,'甲\n\n乙。','native summary text preserves its internal paragraph spacing')
  tick(24)
  assert.equal(summarySpacing.data.timelineEntries.find(row=>row.kind==='commentary').displayText,'甲\n\n乙。',
    'trailing printed whitespace does not add blank display lines')
  assert.equal(paragraphState.visible,'甲\n\n乙。\n','display trimming leaves the underlying printed prefix unchanged')
  assert.equal(summarySpacing.data.timelineSummaryPending,true,'visually complete text still consumes its remaining raw characters')
  assert.equal(toolRows(summarySpacing).length,0)
  finishSummaries(summarySpacing)
  const compactSummary = summarySpacing.data.timelineEntries.find(row=>row.kind==='commentary')
  assert.equal(compactSummary.displayText,'甲\n\n乙。')
  assert.equal(compactSummary.text,paragraphSummary.content,'display spacing does not trim the original summary')
  assert.equal(paragraphState.visible,paragraphSummary.content)
  assert.equal(paragraphState.cursor,paragraphSummary.content.length)
  assert.equal(paragraphState.renderedCursor,paragraphSummary.content.length)
  assert.equal(compactSummary.summaryFinished,true)
  assert.equal(summarySpacing.data.timelineTrace.find(node=>node.stage==='public_commentary').responseContent,paragraphSummary.content)
  assert.equal(toolRows(summarySpacing).length,1,'the raw completion gate still releases the next tool after all characters render')
  summarySpacing.resetStream()

  const unfinishedSummary = instance();unfinishedSummary.applyCloudSnapshot(snapshot())
  const followingTrace = [reasoning('M1','已思考'),exec('M1','proposed')]
  const openBody = segment('M1','甲😀','commentary',{ended:false})
  unfinishedSummary.applyCloudSnapshot(snapshot(followingTrace,[openBody]))
  drain(24)
  const exhaustedSummary = unfinishedSummary.data.timelineEntries.find(row=>row.kind==='commentary')
  assert.equal(exhaustedSummary.displayText,openBody.content)
  assert.equal(exhaustedSummary.isFinish,false,'a proposed call does not close an ongoing summary')
  assert.equal(exhaustedSummary.summaryFinished,false)
  assert.equal(unfinishedSummary.data.timelineSummaryPending,true,'an exhausted current buffer still waits for its actual ending')
  assert.equal(toolRows(unfinishedSummary).length,0)
  assert.equal(findRow(unfinishedSummary,'thinking_M2'),undefined)
  unfinishedSummary.updateProcessClock()
  now+=499;tick(1000)
  assert.equal(unfinishedSummary.data.timelineWaitingTools,false,'short pauses between summary chunks do not flash a thinking placeholder')
  now+=501;tick(1000)
  assert.equal(unfinishedSummary.data.timelineWaitingTools,true,'a drained summary shows thinking during a real pause without waiting for message end')
  assert.equal(unfinishedSummary.data.timelineTrace.some(node=>node.stage==='main_reasoning' && node.id!=='thinking_M1'),false)
  const appendedBody = {...openBody,content:openBody.content+'乙，丙。'}
  unfinishedSummary.applyCloudSnapshot(snapshot(followingTrace,[appendedBody]))
  assert.equal(unfinishedSummary.data.timelineWaitingTools,false,'new summary text withdraws the local wait and continues streaming')
  assert.equal(unfinishedSummary.data.timelineEntries.find(row=>row.kind==='commentary').displayText,'甲😀乙',
    'later body deltas continue at the existing cursor instead of freezing or replaying the summary')
  drain(24)
  assert.equal(unfinishedSummary.data.timelineEntries.find(row=>row.kind==='commentary').displayText,appendedBody.content)
  assert.equal(unfinishedSummary.data.timelineSummaryPending,true)
  unfinishedSummary.applyCloudSnapshot(snapshot([reasoning('M1','已思考'),exec('M1','ready')],[appendedBody]))
  assert.equal(unfinishedSummary.data.timelineSummaryPending,false,'a validated ready call closes a drained summary even when its end event is missing')
  assert.equal(toolRows(unfinishedSummary)[0].node.status,'ready')
  assert.equal(unfinishedSummary.data.timelineWaitingTools,false)
  assert.equal(unfinishedSummary.data.processTrace.find(node=>node.stage==='public_commentary').status,'running','handoff evidence does not rewrite the raw segment status')
  unfinishedSummary.applyCloudSnapshot(snapshot([reasoning('M1','已思考'),exec('M1'),tool('M1','工具完成'),nextThinking],[appendedBody]))
  assert.equal(findRow(unfinishedSummary,'thinking_M2').displayText,'下')
  assert.equal(unfinishedSummary.data.timelineTrace.find(node=>node.stage==='public_commentary').responseContent,appendedBody.content)
  unfinishedSummary.resetStream()

  for(const evidence of ['model','next']){
    const missingEnd = instance();missingEnd.applyCloudSnapshot(snapshot())
    const body = segment('M1','先用 web','commentary',{ended:false})
    missingEnd.applyCloudSnapshot(snapshot([reasoning('M1','已思考')],[body],{modelRequests:mainStillRunning}))
    drain(24)
    assert.equal(missingEnd.data.timelineSummaryPending,true)
    missingEnd.applyCloudSnapshot(snapshot([reasoning('M1','已思考')],[body],{
      modelRequests:[...mainStillRunning,{modelRequestId:'M1',parentCallId:'tool-child',status:'completed'}]}))
    assert.equal(missingEnd.data.timelineSummaryPending,true,'a child-model completion cannot close the main summary')
    missingEnd.applyCloudSnapshot(snapshot([reasoning('M1','已思考'),...(evidence==='next' ? [nextThinking] : [])],[body],{
      modelRequests:evidence==='model' ? [{...mainStillRunning[0],status:'completed'}] : mainStillRunning}))
    assert.equal(missingEnd.data.timelineSummaryPending,false,'confirmed handoff proceeds after server text has drained')
    finishSummaries(missingEnd)
    assert.equal(missingEnd.data.timelineEntries.find(row=>row.kind==='commentary').displayText,'先用 web')
    assert.equal(body.ended,false,'display handoff never fabricates a provider end event')
    if(evidence==='next')assert.equal(findRow(missingEnd,'thinking_M2').displayText,'下')
    else assert.equal(missingEnd.data.timelineWaitingTools,true)
    missingEnd.resetStream()
  }

  const multipleOpenItems = instance();multipleOpenItems.applyCloudSnapshot(snapshot())
  const openItems=[segment('M1','先检查。','commentary',{ended:false}),
    segment('M1','再核对。','commentary',{messageId:'body_M1_2',ended:false})]
  multipleOpenItems.applyCloudSnapshot(snapshot([reasoning('M1','已思考'),exec('M1','ready')],openItems))
  assert.equal(toolRows(multipleOpenItems).length,0)
  finishSummaries(multipleOpenItems)
  assert.deepEqual(multipleOpenItems.data.timelineEntries.filter(row=>row.kind==='commentary').map(row=>row.displayText),
    ['先检查。','再核对。'],'a ready tool closes all preceding items without skipping either summary playback')
  assert.equal(toolRows(multipleOpenItems)[0].node.status,'ready')
  assert.equal(openItems.every(item=>item.ended===false),true)
  multipleOpenItems.resetStream()

  const unclosedFinal = instance();unclosedFinal.observeTurn('local')
  turnListener(record('queued',snapshot()))
  const unfinishedFinalRows = [segment('M1','尚未结束。','commentary',{ended:false}),segment('M2','终态回答','final')]
  turnListener(record('running',snapshot([reasoning('M1','已思考')],unfinishedFinalRows)))
  drain(24)
  assert.equal(unclosedFinal.data.timelineSummaryPending,false,'confirmed final output closes the prior summary after its complete playback')
  assert.equal(Boolean(unclosedFinal._timelineCollapsing),true,'formal output no longer waits for the entire turn to end')
  assert.equal(unclosedFinal.data.mdText.text,'')
  turnListener(record('completed',snapshot([reasoning('M1','已思考')],unfinishedFinalRows,{status:'completed'})))
  assert.equal(unclosedFinal.data.timelineSummaryPending,false)
  completeAnimation()
  assert.equal(unclosedFinal.data.mdText.text,'终态回答')
  unclosedFinal.resetStream()

  const awaitingRender = instance();awaitingRender.applyCloudSnapshot(snapshot())
  const immediateSetData = awaitingRender.setData
  let lastCharacterCallback
  awaitingRender.setData=function(patch,callback){
    immediateSetData.call(this,patch)
    if(Object.entries(patch).some(([key,value])=>/^timelineEntries\[\d+\]\.displayText$/.test(key)&&value==='甲😀')&&callback)
      lastCharacterCallback=callback
    else callback?.()
  }
  const shortSummary = segment('M1','甲😀','commentary',{ended:false})
  awaitingRender.applyCloudSnapshot(snapshot([reasoning('M1','已思考')],[shortSummary]))
  tick(24)
  assert.equal(typeof lastCharacterCallback,'function','the last summary character owns its render acknowledgement')
  const uncommittedSummary = awaitingRender.data.timelineEntries.find(row=>row.kind==='commentary')
  const uncommittedState = awaitingRender._timelineStates.get(uncommittedSummary.node.id)
  assert.equal(uncommittedState.cursor,shortSummary.content.length)
  assert.ok(uncommittedState.renderedCursor<shortSummary.content.length)
  awaitingRender.applyCloudSnapshot(snapshot([reasoning('M1','已思考'),exec('M1'),tool('M1','工具完成')],[shortSummary]))
  assert.equal(toolRows(awaitingRender).length,0,'successor snapshots cannot bypass an outstanding last-character render callback')
  awaitingRender.applyCloudSnapshot(snapshot([reasoning('M1','已思考'),exec('M1'),tool('M1','工具完成'),reasoning('M2','总结')],
    [shortSummary,segment('M2','正式回答','final')]))
  assert.equal(awaitingRender.data.timelineSummaryPending,true)
  assert.equal(Boolean(awaitingRender._timelineCollapsing),false,'final text cannot begin collapse before the last summary character renders')
  assert.equal(awaitingRender.data.mdText.text,'')
  lastCharacterCallback()
  assert.equal(awaitingRender.data.timelineSummaryPending,false)
  assert.equal(uncommittedState.renderedCursor,shortSummary.content.length)
  assert.equal(Boolean(awaitingRender._timelineCollapsing),true)
  assert.equal(awaitingRender.data.mdText.text,'')
  completeAnimation()
  assert.equal(awaitingRender.data.mdText.text,'正式回答')
  const committedData = JSON.stringify(awaitingRender.data)
  lastCharacterCallback()
  assert.equal(JSON.stringify(awaitingRender.data),committedData,'a duplicate render acknowledgement does not reopen or replay completed output')
  awaitingRender.resetStream()

  const localizedSummary = instance();localizedSummary.applyCloudSnapshot(snapshot())
  const namedSummary = segment('M1','先调用 web。')
  localizedSummary.applyCloudSnapshot(snapshot([reasoning('M1','已思考'),exec('M1'),tool('M1')],[namedSummary]))
  const chineseSummary = localizedSummary.data.timelineEntries.find(row=>row.kind==='commentary')
  assert.equal(chineseSummary.text,'先调用 web。')
  assert.equal(chineseSummary.article,undefined,'summaries use native text instead of a static Markdown article')
  localizedSummary.properties.language='English'
  definition.observers.language.call(localizedSummary,'English')
  const englishSummary = localizedSummary.data.timelineEntries.find(row=>row.kind==='commentary')
  assert.equal(englishSummary.text,'先调用 web。','language changes reproject the complete streamed public summary')
  assert.equal(localizedSummary.data.timelineSummaryPending,true)
  finishSummaries(localizedSummary)
  assert.equal(localizedSummary.data.timelineEntries.find(row=>row.kind==='commentary').displayText,'先调用 web。')
  assert.equal(toolRows(localizedSummary).length,1)
  localizedSummary.resetStream()

  const finalAhead = instance();finalAhead.observeTurn('local')
  turnListener(record('queued',snapshot()))
  const beforeFinalSummary = segment('M1','完整摘要😀，逐字显示。','commentary',{ended:false})
  turnListener(record('running',snapshot([reasoning('M1','已思考')],[beforeFinalSummary])))
  turnListener(record('completed',snapshot([reasoning('M1','已思考'),exec('M1'),tool('M1'),reasoning('M2','总结思考')],
    [{...beforeFinalSummary,ended:true},segment('M2','正式完整😀回答','final')],{status:'completed'})))
  assert.equal(finalAhead.data.timelineSummaryPending,true,'a confirmed final response waits for its pending summary')
  assert.equal(Boolean(finalAhead._timelineCollapsing),false)
  assert.equal(finalAhead.data.mdText.text,'')
  tick(900)
  assert.equal(finalAhead.data.mdText.text,'','final response collapse cannot time out through the summary gate')
  finishSummaries(finalAhead)
  assert.equal(finalAhead.data.timelineSummaryPending,false)
  assert.equal(finalAhead.data.mdText.text,'','the completed summary hands off to native process collapse first')
  completeAnimation()
  assert.equal(finalAhead.data.mdText.text,'正式完整😀回答')
  assert.equal(finalAhead.data.isFinish,true)
  finalAhead.resetStream()

  for(const action of ['stopDisplay','resetStream','detached']){
    const pendingSummary = instance();pendingSummary.applyCloudSnapshot(snapshot())
    pendingSummary.applyCloudSnapshot(snapshot([reasoning('M1','已思考'),exec('M1','running'),tool('M1','后续工具','running')],
      [segment('M1','仍在打印的完整摘要😀。')]))
    assert.equal(pendingSummary.data.timelineSummaryPending,true)
    assert.equal(toolRows(pendingSummary).length,0)
    const staleSummaryTimer = timers.get(pendingSummary._timelineTimer).fn
    if(action==='detached')definition.lifetimes.detached.call(pendingSummary)
    else pendingSummary[action]()
    const frozen = JSON.stringify(pendingSummary.data)
    staleSummaryTimer()
    assert.equal(JSON.stringify(pendingSummary.data),frozen,`${action} rejects pending summary playback callbacks`)
    if(action==='stopDisplay'){
      assert.equal(pendingSummary.data.settled,true,'cancel does not wait for the summary text to finish')
      assert.equal(pendingSummary.data.processCollapsed,true)
      assert.equal(pendingSummary.data.mdText.text,'')
    }
    pendingSummary.resetStream()
  }

  const rotating = instance();rotating.applyCloudSnapshot(snapshot())
  const parallel = parallelSnapshot();rotating.applyCloudSnapshot(parallel);finishSummaries(rotating)
  assert.equal(toolRows(rotating).length,1,'one main request owns one live tool row')
  assert.equal(toolRows(rotating)[0].node.callId,'A','the first actual running tool owns the row')
  const toolSlot = toolRows(rotating)[0].id
  assert.deepEqual(rotating.data.timelineTrace.filter(node=>node.callId).map(node=>node.callId),
    ['exec_M1','A','B'],'the detail sheet retains the envelope and all actual calls')
  const deadline = rotating._toolRotationTimer
  now+=2999;rotating.applyCloudSnapshot(parallelSnapshot())
  assert.equal(rotating._toolRotationTimer,deadline,'identical snapshots do not postpone rotation')
  assert.equal(toolRows(rotating)[0].node.callId,'A')
  rotate(rotating,1)
  assert.equal(toolRows(rotating)[0].node.callId,'B','idle calls rotate after three seconds')
  assert.equal(toolRows(rotating)[0].id,toolSlot,'changing the selected call keeps a stable request tool slot')
  assert.equal(toolRows(rotating)[0].playbackStopped,false,'same-slot tool rotation is not a new timeline node handoff')
  assert.equal(toolRows(rotating)[0].displayText,'第','a tool first selected by rotation plays its buffered response')
  drain(24)
  const played = toolRows(rotating)[0].displayText
  rotate(rotating);assert.equal(toolRows(rotating)[0].node.callId,'A')
  rotate(rotating);assert.equal(toolRows(rotating)[0].node.callId,'B')
  assert.equal(toolRows(rotating)[0].displayText,played,'returning to a tool retains its already played cursor')
  assert.equal(rotating._timelineTimer,null,'returning to the same tool does not replay its backlog')
  assert.deepEqual(rotating.data.processTrace.map(({presentation,...node})=>Object.fromEntries(Object.entries(node))),parallel.processTrace,'rotation does not rewrite execution evidence')
  rotating.resetStream()

  const active = instance();active.applyCloudSnapshot(snapshot())
  active.applyCloudSnapshot(parallelSnapshot('',''));finishSummaries(active)
  now+=2500;active.applyCloudSnapshot(parallelSnapshot('甲😀乙',''))
  assert.equal(toolRows(active)[0].displayText,'甲')
  rotate(active,500)
  assert.equal(toolRows(active)[0].node.callId,'A','new output pushes back the original idle deadline')
  now+=2000;tick(24)
  assert.equal(toolRows(active)[0].displayText,'甲😀')
  rotate(active,500)
  assert.equal(toolRows(active)[0].node.callId,'A','ongoing character playback pushes back rotation too')
  now+=500;tick(24)
  assert.equal(toolRows(active)[0].displayText,'甲😀乙')
  rotate(active)
  assert.equal(toolRows(active)[0].node.callId,'B','rotation resumes once the selected tool has been idle')
  active.applyCloudSnapshot(snapshot([exec('M1','running'),parallelTool('A','甲😀乙','completed'),parallelTool('B')],[rows[0]]))
  assert.equal(toolRows(active).length,1)
  assert.equal(active._toolRotationTimer,null,'one remaining running tool no longer rotates')
  active.resetStream()

  const serial = instance();serial.applyCloudSnapshot(snapshot())
  serial.applyCloudSnapshot(snapshot([exec('M1','proposed')],[rows[0]],{modelRequests:mainStillRunning}))
  assert.equal(toolRows(serial).length,0,'an already proposed tool still waits for every summary character')
  finishSummaries(serial)
  assert.equal(serial._modelRequests[0].status,'running','a closed summary releases arrived tools without waiting for model completion')
  assert.equal(toolRows(serial).length,1)
  assert.equal(toolRows(serial)[0].node.name,'exec','the discovered execution envelope owns the slot before actual functions exist')
  assert.equal(toolRows(serial)[0].node.status,'proposed')
  const serialSlot = toolRows(serial)[0].id
  serial.applyCloudSnapshot(snapshot([exec('M1','running'),parallelTool('A','','ready'),parallelTool('B','','ready')],[rows[0]]))
  assert.equal(toolRows(serial)[0].node.callId,'A','a ready actual function replaces its execution envelope')
  assert.equal(serial._toolRotationTimer,null,'ready functions never start a running-call rotation')
  serial.applyCloudSnapshot(snapshot([exec('M1','running'),parallelTool('A','甲串行'),parallelTool('B','','ready')],[rows[0]]))
  assert.equal(toolRows(serial)[0].displayText,'甲')
  drain(24)
  serial.applyCloudSnapshot(snapshot([exec('M1','running'),parallelTool('A','甲串行','completed'),parallelTool('B','乙串行')],[rows[0]]))
  assert.equal(toolRows(serial)[0].node.callId,'B')
  assert.equal(toolRows(serial)[0].id,serialSlot)
  assert.equal(toolRows(serial)[0].displayText,'乙','the next serial tool plays its first chunk normally')
  serial.resetStream()

  const newSerialTool = instance();newSerialTool.applyCloudSnapshot(snapshot())
  newSerialTool.applyCloudSnapshot(snapshot([exec('M1','running'),parallelTool('A','甲工具😀输出')],[rows[0]]))
  finishSummaries(newSerialTool)
  const newSerialSlot = toolRows(newSerialTool)[0].id
  assert.equal(toolRows(newSerialTool)[0].displayText,'甲')
  newSerialTool.applyCloudSnapshot(snapshot([exec('M1','running'),parallelTool('A','甲工具😀输出','completed')],[rows[0]]))
  assert.equal(toolRows(newSerialTool)[0].node.callId,'A')
  assert.deepEqual(toolRows(newSerialTool)[0].completedTools.map(node=>node.name),['web'])
  assert.equal(toolRows(newSerialTool)[0].displayText,'')
  newSerialTool.applyCloudSnapshot(snapshot([exec('M1','running'),parallelTool('A','甲工具😀输出迟到','completed')],[rows[0]]))
  assert.equal(toolRows(newSerialTool)[0].displayText,'','a completed actual call cannot replay its late output')
  const newlyDiscovered = snapshot([exec('M1','running'),parallelTool('A','甲工具😀输出迟到','completed'),
    parallelTool('B','乙新工具😀内容')],[rows[0]])
  newSerialTool.applyCloudSnapshot(newlyDiscovered)
  assert.equal(toolRows(newSerialTool).length,1)
  assert.equal(toolRows(newSerialTool)[0].id,newSerialSlot,'a newly discovered serial call reuses the same request tool slot')
  assert.equal(toolRows(newSerialTool)[0].node.callId,'B','finishing A does not pin the still-running execution envelope to A')
  assert.equal(toolRows(newSerialTool)[0].playbackStopped,false)
  assert.deepEqual(toolRows(newSerialTool)[0].completedTools,[])
  assert.equal(toolRows(newSerialTool)[0].displayText,'乙','a first-seen B plays its buffer without a prior ready event')
  assert.equal(newSerialTool._toolRotationTimer,null,'one running serial call does not need parallel rotation')
  drain(24)
  assert.equal(toolRows(newSerialTool)[0].displayText,'乙新工具😀内容')
  newSerialTool.applyCloudSnapshot(newlyDiscovered)
  assert.equal(newSerialTool._timelineTimer,null,'identical serial snapshots do not replay B')
  assert.deepEqual(newSerialTool.data.timelineTrace.filter(node=>node.callId).map(node=>node.callId),['exec_M1','A','B'])
  newSerialTool.resetStream()

  const ordinarySwitch = instance();ordinarySwitch.applyCloudSnapshot(snapshot())
  ordinarySwitch.applyCloudSnapshot(parallelSnapshot('甲','并行旧积压😀'));finishSummaries(ordinarySwitch)
  ordinarySwitch.applyCloudSnapshot(snapshot([exec('M1','running'),parallelTool('A','甲','completed'),parallelTool('B','并行旧积压😀')],[rows[0]]))
  assert.equal(toolRows(ordinarySwitch)[0].node.callId,'B')
  assert.equal(toolRows(ordinarySwitch)[0].displayText,'','ordinary completion handoff keeps the existing parallel backlog skip')
  ordinarySwitch.applyCloudSnapshot(snapshot([exec('M1','running'),parallelTool('A','甲','completed'),parallelTool('B','并行旧积压😀新增')],[rows[0]]))
  assert.equal(toolRows(ordinarySwitch)[0].displayText,'新','the newly selected tool streams only its post-handoff delta')
  assert.equal(ordinarySwitch.data.timelineTrace.find(node=>node.callId==='B').responseContent,'并行旧积压😀新增')
  ordinarySwitch.resetStream()
  for(const peer of [parallelTool('B','','ready'),{...parallelTool('B'),parentCallId:'other-batch'}]){
    const separate = instance();separate.applyCloudSnapshot(snapshot([parallelTool('A'),peer],[rows[0]]))
    finishSummaries(separate)
    assert.equal(toolRows(separate).length,1)
    assert.equal(separate._toolRotationTimer,null,'ready or different-batch peers do not rotate together')
    separate.resetStream()
  }

  const stoppedProcesses = instance();stoppedProcesses.observeTurn('local')
  const lateProjection = turnListener, createdAt = new Date(now-61000).toISOString()
  lateProjection({...record('running',parallelSnapshot('工具仍在输出','另一工具')),
    meta:{...record('running',{}).meta,createdAt}})
  const lateProcessCallbacks = [...timers.values()].map(timer=>timer.fn)
  assert.ok(stoppedProcesses.data.timelineEntries.some(row=>row.kind==='commentary'))
  assert.equal(stoppedProcesses.data.settled,false)
  stoppedProcesses.createSelectorQuery = () => {throw new Error('stopping must settle without a layout measurement')}
  const finishCount = events.filter(event=>event.name==='finish').length
  now+=750;stoppedProcesses.stopDisplay()
  assert.equal(stoppedProcesses.data.processCollapsed,true,'clicking stop immediately hides thinking, commentary and tool rows')
  assert.deepEqual([stoppedProcesses.processHeight.value,stoppedProcesses.processOpacity.value],[0,0])
  assert.equal(stoppedProcesses.data.settled,true,'the local response settles before backend cancellation and Markdown finish')
  assert.equal(stoppedProcesses.data.thinkStatus,2)
  assert.equal(stoppedProcesses.data.terminalStatus,'cancelled')
  assert.equal(stoppedProcesses.data.assistantItem.status,'cancelled')
  assert.equal(stoppedProcesses.data.processDurationMs,61750,'elapsed time is captured at the click between clock ticks')
  assert.equal(stoppedProcesses.data.thinkDurationText,'1分2秒')
  assert.equal(stoppedProcesses.data.mdText.text,'','stopping during tool execution cannot promote commentary to formal output')
  assert.ok(stoppedProcesses.data.assistantItem.processTrace.some(node=>node.callId==='B'),'complete process details remain available')
  assert.equal(events.filter(event=>event.name==='finish').length,finishCount+1)
  assert.equal(turnListener,null,'local stop immediately detaches its cloud projection listener')
  assert.equal(timers.size,0,'local stop immediately releases all display timers')
  const stoppedData = JSON.stringify(stoppedProcesses.data)
  now+=5000
  for(const callback of lateProcessCallbacks)callback()
  lateProjection(record('running',snapshot(trace,finalRows,{processDurationMs:999999})))
  stoppedProcesses.applyCloudSnapshot(snapshot(trace,finalRows,{status:'completed',processDurationMs:999999}))
  stoppedProcesses.onTypingStopped({detail:{text:'迟到正文'}})
  stoppedProcesses.finish();stoppedProcesses.stopDisplay()
  assert.equal(JSON.stringify(stoppedProcesses.data),stoppedData,'late snapshots, timers and child callbacks cannot reopen or rewrite a stopped response')
  assert.equal(events.filter(event=>event.name==='finish').length,finishCount+1,'repeated stop and finish callbacks remain idempotent')
  stoppedProcesses.resetStream()

  const stoppedClock = instance();stoppedClock.observeTurn('local')
  turnListener(record('running',snapshot(trace,rows,{processDurationMs:61000})))
  now+=750;stoppedClock.stopDisplay()
  assert.equal(stoppedClock.data.processDurationMs,61750,'a snapshot duration clock anchor survives cleanup until the click time is captured')
  stoppedClock.resetStream()

  const delayedIdentity = instance();delayedIdentity.observeTurn('local')
  const identityProjection = turnListener
  identityProjection({status:'submitting',connection:'connected',meta:{},
    assistant:snapshot([],[],{processDurationMs:1500})})
  const readyCount = events.filter(event=>event.name==='conversationready').length
  const identityFinishCount = events.filter(event=>event.name==='finish').length
  delayedIdentity.stopDisplay()
  assert.equal(delayedIdentity.data.settled,true,'stopping before server identity exists still settles locally')
  assert.ok(events.filter(event=>event.name==='finish').at(-1).detail.chats
    .every(message=>message.localTurnKey==='local'),'both locally settled messages retain their key for delayed identity reconciliation')
  assert.equal(turnListener,identityProjection,'only the identity listener remains until the accepted turn is known')
  const cancelledData = data => JSON.stringify({...data,assistantItem:{...data.assistantItem,
    conversationId:'',turnId:'',messageId:'',runId:''}})
  const identityFrozen = cancelledData(delayedIdentity.data)
  now+=5000
  const accepted = record('running',snapshot(trace,finalRows,{processDurationMs:999999}))
  identityProjection(accepted)
  assert.deepEqual(delayedIdentity._chatMeta,accepted.meta)
  assert.deepEqual([delayedIdentity.data.assistantItem.conversationId,delayedIdentity.data.assistantItem.turnId,
    delayedIdentity.data.assistantItem.messageId,delayedIdentity.data.assistantItem.runId],['c','t','a','r'])
  assert.equal(cancelledData(delayedIdentity.data),identityFrozen,'accepting late identity cannot replace stopped content, duration, nodes or status')
  assert.equal(events.filter(event=>event.name==='conversationready').length,readyCount+1)
  assert.equal(events.filter(event=>event.name==='finish').length,identityFinishCount+1,'late turn acceptance does not emit another finish')
  assert.equal(turnListener,null,'the metadata-only listener detaches after accepting identity')
  identityProjection(record('completed',snapshot(trace,finalRows,{processDurationMs:1000000})))
  assert.equal(cancelledData(delayedIdentity.data),identityFrozen)
  assert.equal(events.filter(event=>event.name==='conversationready').length,readyCount+1,'late duplicate snapshots announce identity only once')
  assert.equal(events.filter(event=>event.name==='finish').length,identityFinishCount+1)
  delayedIdentity.resetStream()

  const stopBeforeObserve = instance();stopBeforeObserve._ready=false
  stopBeforeObserve.data.processDurationMs=1700
  stopBeforeObserve.stopDisplay()
  const beforeReadyData = cancelledData(stopBeforeObserve.data), beforeReadyObserves = observeCalls
  const beforeReadyFinish = events.filter(event=>event.name==='finish').length
  const beforeReadyEvents = events.filter(event=>event.name==='stramready').length
  stopBeforeObserve.startTurn({turnKey:'local',requestReady:true})
  assert.ok(stopBeforeObserve._pendingTurn,'a not-yet-ready component retains the accepted request identity')
  stopBeforeObserve._ready=true;stopBeforeObserve.startPendingTurn()
  assert.equal(observeCalls,beforeReadyObserves+1,'a stopped component subscribes only for the pending request identity')
  assert.equal(stopBeforeObserve._pendingTurn,null)
  assert.equal(stopBeforeObserve._freezeRequested,true)
  assert.equal(cancelledData(stopBeforeObserve.data),beforeReadyData,'late component readiness cannot reset the stop gate or elapsed time')
  assert.equal(events.filter(event=>event.name==='stramready').length,beforeReadyEvents,'late readiness cannot trigger the normal turn-start path')
  assert.equal(events.filter(event=>event.name==='finish').length,beforeReadyFinish)
  assert.equal(timers.size,0)
  const afterReadyProjection = turnListener
  afterReadyProjection(record('running',snapshot(trace,finalRows,{processDurationMs:999999})))
  assert.equal(stopBeforeObserve.data.assistantItem.turnId,'t')
  assert.equal(cancelledData(stopBeforeObserve.data),beforeReadyData,'the deferred observer only reconciles identity into the stopped response')
  assert.equal(events.filter(event=>event.name==='finish').length,beforeReadyFinish)
  assert.equal(turnListener,null)
  stopBeforeObserve.resetStream()

  const knownStopped = instance();knownStopped._ready=true
  knownStopped._chatMeta={conversationId:'known-c',turnId:'known-t',runId:'known-r'}
  knownStopped.stopDisplay()
  const knownObserves = observeCalls, knownStoppedData = JSON.stringify(knownStopped.data)
  knownStopped.startTurn({turnKey:'local',requestReady:true})
  assert.equal(observeCalls,knownObserves,'a frozen response with known server identity does not subscribe again')
  assert.equal(knownStopped._pendingTurn,null)
  assert.equal(JSON.stringify(knownStopped.data),knownStoppedData)
  knownStopped.resetStream()

  const stoppedReadyCallback = instance();stoppedReadyCallback._ready=true
  stoppedReadyCallback.data.processDurationMs=2300
  stoppedReadyCallback._markdownChild={stopTyping:()=> '可见前缀'}
  const readySetData = stoppedReadyCallback.setData
  let queuedReadyCallback
  stoppedReadyCallback.setData=function(patch,callback){
    readySetData.call(this,patch)
    if(patch.askStatus===true&&callback)queuedReadyCallback=callback
    else callback?.()
  }
  stoppedReadyCallback.startTurn({turnKey:'local',requestReady:true})
  assert.equal(typeof queuedReadyCallback,'function')
  stoppedReadyCallback.stopDisplay()
  const callbackFrozen = cancelledData(stoppedReadyCallback.data), callbackObserveCount = observeCalls
  const callbackFinishCount = events.filter(event=>event.name==='finish').length
  const callbackReadyCount = events.filter(event=>event.name==='stramready').length
  queuedReadyCallback()
  assert.equal(observeCalls,callbackObserveCount+1,'a queued ready callback still subscribes for identity after local stop')
  assert.equal(stoppedReadyCallback._freezeRequested,true)
  assert.equal(cancelledData(stoppedReadyCallback.data),callbackFrozen,'the delayed setData callback preserves stopped text, time and status')
  assert.equal(events.filter(event=>event.name==='stramready').length,callbackReadyCount)
  assert.equal(events.filter(event=>event.name==='finish').length,callbackFinishCount)
  turnListener(record('running',snapshot(trace,finalRows,{processDurationMs:999999})))
  assert.equal(stoppedReadyCallback.data.assistantItem.turnId,'t')
  assert.equal(cancelledData(stoppedReadyCallback.data),callbackFrozen)
  assert.equal(turnListener,null)
  stoppedReadyCallback.resetStream()

  const stoppedAnswer = instance();stoppedAnswer.observeTurn('local')
  const answerProjection = turnListener
  answerProjection(record('running',snapshot(trace,rows)))
  answerProjection(record('running',snapshot(trace,finalRows)))
  finishSummaries(stoppedAnswer)
  completeAnimation()
  assert.equal(stoppedAnswer.data.mdText.text,'正式😀回答')
  let childStops = 0
  stoppedAnswer._markdownChild = {stopTyping(){
    childStops++;stoppedAnswer.onTypingStopped({detail:{text:'正式😀'}});return '正式😀'
  }}
  stoppedAnswer.createSelectorQuery = () => {throw new Error('stopping displayed Markdown cannot await a layout callback')}
  const stopReceipt = stoppedAnswer.stopDisplay()
  assert.deepEqual(stopReceipt,{contentLength:'正式😀'.length,processDurationMs:stoppedAnswer.data.processDurationMs})
  assert.equal(childStops,1,'stop synchronously captures the actual Markdown child prefix')
  assert.equal(stoppedAnswer.data.mdText.text,'正式😀')
  assert.equal(stoppedAnswer.data.assistantItem.content,'正式😀','the settled response keeps only the actually displayed answer prefix')
  assert.equal(stoppedAnswer.data.settled,true)
  const stoppedAnswerData = JSON.stringify(stoppedAnswer.data)
  answerProjection(record('completed',snapshot(trace,finalRows)))
  stoppedAnswer.onTypingStopped({detail:{text:'正式😀回答更多迟到文字'}})
  stoppedAnswer.finish();assert.deepEqual(stoppedAnswer.stopDisplay(),stopReceipt,'repeated Stop returns the first clicked boundary')
  assert.equal(childStops,1)
  assert.equal(JSON.stringify(stoppedAnswer.data),stoppedAnswerData,'late backend and Markdown callbacks cannot extend the displayed prefix')
  stoppedAnswer.resetStream()

  const noChildAnswer = instance();noChildAnswer.applyCloudSnapshot(snapshot(trace,finalRows));finishSummaries(noChildAnswer)
  completeAnimation();assert.equal(noChildAnswer.data.mdText.text,'正式😀回答')
  noChildAnswer.stopDisplay()
  assert.equal(noChildAnswer.data.assistantItem.content,'','a not-yet-mounted Markdown child cannot promote its upstream full text on stop')
  noChildAnswer.resetStream()

  const stopBeforeAnswer = instance();stopBeforeAnswer.applyCloudSnapshot(snapshot(trace,rows));finishSummaries(stopBeforeAnswer)
  let lateLayout
  stopBeforeAnswer.createSelectorQuery = () => ({selectAll(){return this},boundingClientRect(callback){lateLayout=callback;return this},exec(){}})
  stopBeforeAnswer.applyCloudSnapshot(snapshot(trace,finalRows))
  const lateWatchdog = timers.get(stopBeforeAnswer._collapseTimer).fn
  const animationCount = animations.length
  stopBeforeAnswer.createSelectorQuery = () => {throw new Error('stop cannot wait for the pending layout measurement')}
  stopBeforeAnswer.stopDisplay()
  assert.equal(stopBeforeAnswer.data.processCollapsed,true)
  assert.equal(stopBeforeAnswer.data.settled,true)
  assert.deepEqual([stopBeforeAnswer.processHeight.value,stopBeforeAnswer.processOpacity.value],[0,0])
  assert.equal(stopBeforeAnswer.data.mdText.text,'','an answer still awaiting collapse has not been displayed and remains hidden on stop')
  assert.equal(stopBeforeAnswer.data.assistantItem.content,'')
  const stoppedBeforeData = JSON.stringify(stopBeforeAnswer.data)
  lateLayout({height:120});lateWatchdog()
  assert.equal(animations.length,animationCount,'late measurement cannot begin a cancelled collapse animation')
  assert.equal(JSON.stringify(stopBeforeAnswer.data),stoppedBeforeData)
  stopBeforeAnswer.resetStream()

  for(const status of ['completed','failed','cancelled','cancelling']){
    const terminal = instance();terminal.applyCloudSnapshot(parallelSnapshot());finishSummaries(terminal)
    const lateRotation = timers.get(terminal._toolRotationTimer).fn
    terminal.applyCloudSnapshot({...parallelSnapshot(),status})
    assert.equal(terminal._toolRotationTimer,null,'terminal and cancellation states clear tool rotation')
    const frozen = JSON.stringify(terminal.data)
    lateRotation();assert.equal(JSON.stringify(terminal.data),frozen,'a late rotation cannot alter terminal tool selection')
    terminal.resetStream()
  }
  for(const action of ['stopDisplay','resetStream','detached']){
    const abandoned = instance();abandoned.applyCloudSnapshot(parallelSnapshot());finishSummaries(abandoned)
    const lateRotation = timers.get(abandoned._toolRotationTimer).fn
    if(action==='detached')definition.lifetimes.detached.call(abandoned)
    else abandoned[action]()
    assert.equal(abandoned._toolRotationTimer,null)
    const frozen = JSON.stringify(abandoned.data)
    lateRotation();assert.equal(JSON.stringify(abandoned.data),frozen,`${action} rejects late tool rotation`)
    abandoned.resetStream()
  }

  for(const action of ['resetStream','stopDisplay','detached']){
    const renderer = instance();renderer.applyCloudSnapshot(snapshot())
    renderer.applyCloudSnapshot(snapshot([reasoning('M1','未播放完😀','running')]))
    const lateTimers = [...timers.values()].map(timer => timer.fn)
    renderer.applyCloudSnapshot(snapshot(trace,finalRows))
    finishSummaries(renderer)
    const lateAnimation = [...animations].reverse().find(item => typeof item.callback==='function').callback
    if(action==='detached')definition.lifetimes.detached.call(renderer)
    else renderer[action]()
    if(action==='stopDisplay')assert.deepEqual([renderer.processHeight.value,renderer.processOpacity.value],[0,0],
      'stopping a pending collapse immediately hides the process section')
    const frozenShared = [renderer.processHeight.value,renderer.processOpacity.value]
    const frozen = JSON.stringify(renderer.data)
    for(const callback of lateTimers)callback()
    lateAnimation(true);tick(900)
    assert.equal(JSON.stringify(renderer.data),frozen,`${action} rejects late typing and animation callbacks`)
    assert.deepEqual([renderer.processHeight.value,renderer.processOpacity.value],frozenShared,
      `${action} rejects late shared animation changes`)
  }

  const rollback = instance();rollback.applyCloudSnapshot(snapshot(trace,rows));finishSummaries(rollback)
  const savedEntries = rollback.data.timelineEntries
  rollback.reloadResponse({turnKey:'local',runtimeKey:'retry'})
  rollback.applyCloudSnapshot(snapshot(trace,rows))
  rollback.applyCloudSnapshot(snapshot(trace,finalRows))
  finishSummaries(rollback)
  const staleRetry = [...animations].reverse().find(item => typeof item.callback==='function').callback
  rollback.restoreResponse()
  assert.deepEqual(rollback.data.timelineEntries,savedEntries,'failed regeneration restores the previous timeline')
  const restoredData = JSON.stringify(rollback.data)
  staleRetry(true);tick(900)
  assert.equal(JSON.stringify(rollback.data),restoredData,'a retry collapse cannot overwrite the restored response')
  rollback.resetStream()

  let opened
  const header = {data:{thinkStatus:1,processingOnly:true,processTrace:trace,fullProcessTrace:trace},
    triggerEvent(name,detail){opened=detail}}
  thinkDefinition.methods.openReasoning.call(header)
  assert.equal(opened,undefined,'the permanent processing header cannot open the sheet')
  const row = {...header,data:{...header.data,processingOnly:false,timelineNode:true,
    processTrace:[trace[0]]}}
  thinkDefinition.methods.openReasoning.call(row)
  assert.deepEqual(opened.processTrace,trace,'every process row opens the complete timeline')
  const streamMarkup = require('node:fs').readFileSync('mdPackage/components/assisStream/index.wxml','utf8')
  const processMarkup = require('node:fs').readFileSync('mdPackage/components/thinkItem/index.wxml','utf8')
  assert.match(processMarkup,/<text max-lines="1" overflow="ellipsis">/,'the existing inline process row stays on one line')
  assert.match(streamMarkup,/full-process-trace="\{\{timelineMode \? timelineTrace : processTrace\}\}"/,
    'the top completed header opens the new detail projection')
  assert.match(streamMarkup,/<think-item[^>]*timeline-node=[^>]*full-process-trace="\{\{timelineTrace\}\}"/,
    'each live process node opens the same complete detail projection')
  assert.doesNotMatch(streamMarkup,/nodes="\{\{item\.article\}\}"/,'summaries never switch to static Markdown during handoff')
  assert.doesNotMatch(streamMarkup,/<towxml[^>]*item\.mdText/,'summary text does not instantiate a Markdown typer')
  assert.match(streamMarkup,/<text[^>]*>\s*\{\{item\.displayText\}\}/,'summaries render their complete streamed prefix with native text')
  assert.match(streamMarkup,/completed-tools="\{\{item\.completedTools\}\}"/,'ended tool names are localized by thinkItem')
  assert.match(streamMarkup,/node-ended="\{\{item\.playbackStopped\}\}"/,'actual end and successor boundaries reach the title component')
  assert.match(streamMarkup,/!item\.hidden/,'thinking visibility follows summary output while complete details remain available')
  const waitingMarkup = streamMarkup.match(/<view\b[^>]*timelineWaitingTools[^>]*>\s*<think-item\b[^>]*>/)?.[0]
  assert.ok(waitingMarkup,'the local tool wait reuses a normal thinking item')
  assert.match(waitingMarkup,/thinking-started="\{\{true\}\}"/)
  assert.match(waitingMarkup,/think-status="\{\{1\}\}"/)
  assert.match(waitingMarkup,/full-process-trace="\{\{timelineTrace\}\}"/,'the placeholder opens the complete real processing details')
  assert.match(streamMarkup,/<view wx:if="\{\{timelineMode\}\}" class="stream-process-content">/,
    'final collapse cannot unmount the timeline image components')
  assert.match(streamMarkup,/<\/view>\s*<generated-images[^>]*images="\{\{item.images\}\}"/,
    'images are siblings of collapsing process rows inside their stable timeline slots')
  const observer = Object.entries(thinkDefinition.observers).find(([key])=>key.includes('processTrace'))
  const presentation = {...row,setData(patch){Object.assign(this.data,patch)}}
  observer[1].call(presentation,...observer[0].split(',').map(key => ({
    processTrace:serverTrace([trace[0]]),language:'中文',responseStarted:true,thinkingStarted:true,
    processingOnly:false,timelineNode:true
  }[key.trim()])))
  assert.equal(presentation.data.activityTitle,'已完成思考','completed thinking rows no longer display an active title')
  const waitingPresentation = {...presentation,data:{...presentation.data,processTrace:[],timelineNode:false,thinkingStarted:true}}
  observer[1].call(waitingPresentation,...observer[0].split(',').map(key=>({
    processTrace:[],language:'中文',responseStarted:true,thinkingStarted:true,completedTools:[],timelineNode:false,processingOnly:false
  }[key.trim()])))
  assert.equal(waitingPresentation.data.activityTitle,'正在思考','the local tool wait uses the existing localized thinking title')
  const commandPresentation = {data:{timelineNode:true,nodeEnded:true},setData(value){Object.assign(this.data,value)}}
  observer[1].apply(commandPresentation,observer[0].split(',').map(key => ({
    processTrace:[],language:'中文',thinkStatus:1,thinkingStarted:true,processingOnly:false,timelineNode:true,nodeEnded:true,
    completedTools:[serverNode({callId:'bash-A',name:'bash',status:'completed',title:'已运行命令'})]
  }[key.trim()])))
  assert.equal(commandPresentation.data.activityTitle,'已运行命令','a single command completion does not get a duplicate completed prefix')
  const groupCopy = {title:'服务端节点标题',endedTitle:'服务端节点标题',groupTitle:'服务端统一完成汇总',content:'',details:[],responseItems:[]}
  const groupNode = {...tool('M1','','completed'),presentation:{version:1,format:'text',visible:true,hasDetails:false,
    locales:{'zh-CN':groupCopy,'en-US':{...groupCopy,groupTitle:'Server completion summary'}}}}
  const groupPresentation = {data:{timelineNode:true,nodeEnded:true},setData(value){Object.assign(this.data,value)}}
  const groupArgs = language => observer[0].split(',').map(key => ({
    processTrace:[groupNode],language,responseStarted:true,thinkingStarted:true,processingOnly:false,timelineNode:true,nodeEnded:true,
    completedTools:[{callId:'different',name:'bash',title:'客户端不应拼接此标题'}]
  }[key.trim()]))
  observer[1].apply(groupPresentation,groupArgs('中文'))
  assert.equal(groupPresentation.data.activityTitle,'服务端统一完成汇总')
  observer[1].apply(groupPresentation,groupArgs('English'))
  assert.equal(groupPresentation.data.activityTitle,'Server completion summary')
  groupPresentation.data.processingOnly=true
  observer[1].apply(groupPresentation,groupArgs('English'))
  assert.equal(groupPresentation.data.activityTitle,'Processing','page-level timer header keeps its generic label')
  thinkDefinition.methods.openReasoning.call(waitingPresentation)
  assert.deepEqual(opened.processTrace,trace,'the local wait opens real details without fabricating its own trace node')

{
  const failedReturn = instance()
  failedReturn.applyCloudSnapshot(snapshot())
  const parent = {...exec('M1','failed'),error:{code:'EXEC_OUTPUT_LIMIT'}}
  const completed = {...tool('M1','','completed'),parentCallId:parent.callId}
  failedReturn.applyCloudSnapshot(snapshot([reasoning('M1','思考'),parent,completed],[rows[0]]))
  finishSummaries(failedReturn)
  const shown = toolRows(failedReturn)[0]
  assert.equal(shown.node.name,'exec','an outer return failure must not be hidden by a successful child')
  assert.equal(shown.node.title,'结果回传已结束')
  assert.deepEqual(shown.completedTools,[],'a failure group must not be labelled all completed')
  assert.equal(failedReturn.data.timelineTrace.find(node=>node.callId===completed.callId).status,'completed')
  failedReturn.resetStream()
}

  const clock = instance();clock._chatMeta={turnId:'t',runId:'r',createdAt:new Date(now-61000).toISOString()}
  clock.applyCloudSnapshot(snapshot())
  assert.equal(clock.data.thinkDurationText,'1分1秒');now+=1000;tick(1000)
  assert.equal(clock.data.thinkDurationText,'1分2秒','elapsed time advances without another cloud snapshot')
  clock.resetStream()
  assert.equal(timers.size,0,'all timers are released on completion, reset, stop and detach')
  assert.equal(turnListener,null,'observed legacy and failure cases release their display listener')
}finally{
  ;[global.setTimeout,global.clearTimeout,global.setInterval,global.clearInterval,Date.now]=realTimers
}
console.log('chatProcessTimeline: append order, public text, node handoff, typing, collapse, immediate stop and elapsed time passed')
