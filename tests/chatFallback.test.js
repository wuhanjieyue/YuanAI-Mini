const {serverNode,serverTrace} = require('./serverPresentation')
const assert = require('node:assert/strict')
const {projectSegments: rawProjectSegments} = require('../static_utils/chatSegments')
const projectSegments = rawProjectSegments
let definition, listener
let subscriptions = 0
const events = []
global.wx = { worklet:{ shared: value => ({value}), timing(){}, spring(){} }, yuanAI:{ chatRuntime:{ observe(key, fn){ subscriptions++; listener=fn; return () => { subscriptions-- } } } } }
wx.towxml = require('../mdPackage/components/towxmlstream/index').static
global.getApp = () => ({})
global.Component = value => { definition = value }
require('../mdPackage/components/assisStream/index.js')
function instance(){
  return { ...definition.methods,applyCloudSnapshot(assistant){return definition.methods.applyCloudSnapshot.call(this,{...assistant,processTrace:serverTrace(assistant.textSegments?.length ? projectSegments(assistant.processTrace || [],assistant.textSegments) : assistant.processTrace || []),modelRequests:(assistant.modelRequests || []).map(row=>({...row,presentation:row.presentation || serverNode({...row,stage:'main_reasoning'}).presentation}))})}, properties:{language:'中文'}, data:{...definition.data,mdText:{...definition.data.mdText},turnKey:'local',streamContent:'question',contentParts:[],attachments:[],processTrace:[],generatedImages:[]},
    _that:{chatHeight:{value:0}},streamMinHeight:{value:0},_destroyed:false,
    setData(patch,callback){for(const [key,value] of Object.entries(patch)){
      const row=key.match(/^timelineEntries\[(\d+)\]\.(displayText|hidden)$/)
      if(row)this.data.timelineEntries[Number(row[1])][row[2]]=value
      else if(key==='mdText.text')this.data.mdText={text:value}
      else this.data[key]=value
    }callback?.()},
    triggerEvent(name,detail){events.push({name,detail})},
    createSelectorQuery(){return {select(){return this},selectAll(){return this},boundingClientRect(fn){fn(null);return this},exec(){}}}
  }
}
function projection(status,content='') {return {status,connection:'connected',meta:{conversationId:'c',turnId:'t',runId:'r',assistantMessageId:'a',userMessageId:'u'},assistant:{content,processTrace:[],contentParts:[]}}}
let thinkItemDefinition
global.Component=value=>{thinkItemDefinition=value}
require('../mdPackage/components/thinkItem/index.js')
const activityPresentation=renderer=>{
  const item={data:{},setData(value){Object.assign(this.data,value)}}
  thinkItemDefinition.observers['processTrace, language, responseStarted, thinkingStarted, completedTools, timelineNode, processingOnly, nodeEnded'].call(item,
    renderer.data.displayProcessTrace || renderer.data.processTrace,'中文',renderer.data.responseStarted,renderer.data.thinkingStarted,
    renderer.data.completedTools)
  return item.data
}
const activityTitle=renderer=>activityPresentation(renderer).activityTitle
let openedTrace
const fullTimeline=[{id:'first',kind:'stage',title:'正在思考',status:'completed'},
  {id:'second',callId:'second',name:'web_search',kind:'tool',title:'网页搜索',status:'running'}]
thinkItemDefinition.methods.openReasoning.call({data:{thinkStatus:1,processTrace:[fullTimeline[1]],fullProcessTrace:fullTimeline},
  triggerEvent(name,detail){openedTrace=detail.processTrace}})
assert.deepEqual(openedTrace,fullTimeline,'the current tool row opens the complete turn timeline')
assert.match(require('node:fs').readFileSync('mdPackage/components/assisStream/index.wxml','utf8'), /full-process-trace="\{\{timelineMode \? timelineTrace : processTrace\}\}"/)
const submitting=instance();submitting._ready=true
submitting._pendingTurn={turnKey:'local'};submitting.startPendingTurn()
assert.equal(submitting.data.thinkStatus,0,'sending keeps the original three-dot loader until turn creation succeeds')
assert.equal(submitting.data.turnCreated,false)
assert.equal(submitting.data.responseStarted,false)
assert.equal(submitting.data.generatedImages.length,0,'a normal first send never creates a local image placeholder')
assert.equal(activityTitle(submitting),'正在处理','sending does not invent a thinking or tool node')
submitting.resetStream()
const created=instance();created.observeTurn('local');listener(projection('queued'))
assert.equal(created.data.turnCreated,true,'the successful create-turn response owns the processing transition')
assert.equal(created.data.thinkStatus,1)
assert.equal(activityTitle(created),'正在处理')
assert.equal(activityPresentation(created).activityIcon,'','processing has no tool icon')
created.resetStream()
for(const status of ['completed','failed','cancelled']){
  const renderer=instance();renderer.observeTurn('local')
  const oldListener=listener
  oldListener(projection('running','partial'))
  assert.equal(renderer.data.mdText.text,'partial')
  oldListener(projection(status,status==='cancelled'?'':'cloud answer'))
  if(status!=='cancelled')renderer.finish()
  assert.equal(renderer.data.settled,true)
  assert.equal(events.at(-1).detail.chats[0].status,status)
  assert.doesNotMatch(renderer.data.mdText.text,/我好像/)
  const content=renderer.data.mdText.text
  oldListener(projection('running','late'))
  assert.equal(renderer.data.mdText.text,content)
  assert.equal(subscriptions,0)
}
const failed=instance();failed.observeTurn('local');listener(projection('failed'))
assert.match(failed.data.mdText.text,/我好像有点不舒服/)
failed.finish();assert.equal(failed.data.settled,true)
const image=instance();image.observeTurn('local')
const imageFailure=projection('failed')
imageFailure.assistant.contentParts=[{type:'artifact',artifactType:'image',artifactId:'photo',status:'completed',fileID:'cloud://photo',url:'https://example.com/photo.png'}]
listener(imageFailure)
assert.equal(image.data.mdText.text,'','a saved image does not gain a false text fallback')
assert.equal(image.data.generatedImages[0].status,'completed')
const retryAutonomousImage=instance();retryAutonomousImage._ready=true
retryAutonomousImage._pendingTurn={turnKey:'local',runtimeKey:'retry-autonomous-image',regenerating:true,feature:'',imging:false}
retryAutonomousImage.startPendingTurn()
assert.equal(retryAutonomousImage.data.generatedImages.length,0,'a normal retry never creates a local image placeholder')
listener(projection('running'))
assert.equal(retryAutonomousImage.data.generatedImages.length,0,'empty progress snapshots do not create an autonomous image card')
const autonomousGenerating=projection('running')
autonomousGenerating.assistant.contentParts=[{type:'artifact',artifactType:'image',artifactId:'autonomous-photo',
  width:576,height:768,status:'generating'}]
listener(autonomousGenerating)
assert.equal(retryAutonomousImage.data.generatedImages[0].status,'generating', 'an actual autonomous image event reuses the same loading card')
assert.equal(require('../static_utils/generatedImages').visibleGeneratedImages(retryAutonomousImage.data.generatedImages).length,1)
const autonomousDelivered=projection('running')
autonomousDelivered.assistant.contentParts=[{type:'artifact',artifactType:'image',artifactId:'markdown-photo',
  width:504,height:896,status:'completed',displayMode:'markdown',url:'https://example.com/poster.png'}]
listener(autonomousDelivered)
assert.equal(retryAutonomousImage.data.generatedImages[0].displayMode,'markdown','delivered metadata stays available for Markdown')
assert.equal(require('../static_utils/generatedImages').visibleGeneratedImages(retryAutonomousImage.data.generatedImages).length,0)
retryAutonomousImage.resetStream()
const imageTransfer=instance()
imageTransfer.data.markdownKeys=[2]
imageTransfer.markdownImageCards({currentTarget:{dataset:{markdownKey:'1'}},detail:{artifactIds:['old']}})
assert.deepEqual(imageTransfer.data.markdownImageIds,[],'old renderer image events cannot hide the next response')
imageTransfer.markdownImageCards({currentTarget:{dataset:{markdownKey:'2'}},detail:{artifactIds:['new']}})
assert.deepEqual(imageTransfer.data.markdownImageIds,['new'])
imageTransfer.resetStream()
assert.deepEqual(imageTransfer.data.markdownImageIds,[],'regeneration releases the previous body image cards')
const firstImage=instance();firstImage.data.imging=true
const nextTick=wx.nextTick
wx.nextTick=()=>{}
const ordinaryMounted=instance()
definition.lifetimes.attached.call(ordinaryMounted)
assert.equal(ordinaryMounted.data.generatedImages.length,0,'ordinary sends keep their original first-frame loading gate')
definition.lifetimes.attached.call(firstImage)
wx.nextTick=nextTick
assert.equal(firstImage._ready,false)
assert.equal(firstImage.data.generatedImages.length,0,'mounting an image turn cannot draw Canvas before processing nodes')
firstImage._ready=true
firstImage.startTurn({turnKey:'local',imging:true})
assert.equal(firstImage.data.generatedImages.length,0,'request preparation cannot preempt the processing nodes')
assert.match(require('node:fs').readFileSync('mdPackage/components/assisStream/index.wxml','utf8'),
  /class="loading-container\b[^\"]*dr\b[^\"]*ac\b[^\"]*js\b[^\"]*" wx:if="\{\{!imging &&/,'only explicit create-image sends bypass the ordinary three-dot gate')
for(const status of ['uploading','waiting','submitting','queued','running']){
  listener(projection(status))
  assert.equal(firstImage.data.generatedImages.length,0,'waiting for the image tool never creates a premature card')
}
assert.equal(firstImage.data.turnCreated,true)
assert.equal(activityTitle(firstImage),'正在处理')
const imageProgress=() => {
  const record=projection('running')
  record.assistant.textSegments=[]
  record.assistant.processTrace=[{id:'image-call',callId:'image-call',name:'image_generation',kind:'tool',title:'创建图片',status:'running'}]
  return record
}
const imageSetData=firstImage.setData, renderCallbacks=[]
firstImage.setData=function(patch,callback){imageSetData.call(this,patch);if(callback)renderCallbacks.push(callback)}
listener(imageProgress())
assert.equal(firstImage.data.timelineEntries[0].node.name,'image_generation','the actual image node is projected first')
assert.equal(firstImage.data.generatedImages.length,0,'Canvas waits for the process row rendering callback')
for(const callback of renderCallbacks) callback()
firstImage.setData=imageSetData
assert.equal(firstImage.data.generatedImages[0].status,'generating')
assert.deepEqual([firstImage.data.generatedImages[0].width,firstImage.data.generatedImages[0].height,
  firstImage.data.generatedImages[0].heightVw],[576,768,100],'the delayed placeholder retains the backend 3:4 geometry')
const firstPlaceholder=firstImage.data.generatedImages[0]
listener(imageProgress())
assert.equal(firstImage.data.generatedImages[0],firstPlaceholder,'repeated snapshots preserve the mounted Canvas')
const firstDelivered=projection('completed')
firstDelivered.assistant.contentParts=[{type:'artifact',artifactType:'image',artifactId:'first-photo',
  width:504,height:896,status:'completed',displayMode:'inline',url:'https://example.com/first.png'}]
listener(firstDelivered)
assert.equal(firstImage.data.generatedImages.length,1,'authoritative delivery replaces rather than adds to the local placeholder')
assert.equal(firstImage.data.generatedImages[0].artifactId,'first-photo')
assert.equal(firstImage.data.settled,true,'an image-only first send settles normally')
for(const status of ['completed','failed','cancelled']){
  const emptyImage=instance();emptyImage._ready=true;emptyImage.data.imging=true
  emptyImage.startTurn({turnKey:'local',imging:true})
  listener(imageProgress())
  assert.equal(emptyImage.data.generatedImages.length,1)
  const emptyTerminal=projection(status)
  emptyTerminal.meta={}
  listener(emptyTerminal)
  assert.equal(emptyImage.data.generatedImages.length,0,'an empty terminal snapshot clears the first-send placeholder')
  if(!emptyImage.data.settled) emptyImage.finish()
}
const retryImage=instance();retryImage._ready=true;retryImage.data.imging=true
retryImage._pendingTurn={turnKey:'local',runtimeKey:'retry-image',regenerating:true,imging:true}
retryImage.startPendingTurn()
assert.equal(retryImage.data.generatedImages.length,0,'image retries also wait for processing nodes')
listener(projection('running'))
assert.equal(retryImage.data.generatedImages.length,0)
const retryProgress=imageProgress();delete retryProgress.assistant.textSegments
listener(retryProgress)
assert.equal(retryImage.data.generatedImages[0].artifactId,'retry_pending','the body renderer waits for its actual image tool too')
assert.equal(retryImage.data.generatedImages[0].width/retryImage.data.generatedImages[0].height,3/4,'retries share the 3:4 placeholder')
const generated=projection('running')
generated.assistant.contentParts=[{type:'artifact',artifactType:'image',artifactId:'new-photo',width:1024,height:1024,status:'generating'}]
listener(generated)
assert.equal(retryImage.data.generatedImages[0].artifactId,'new-photo','server image event replaces the temporary card')
retryImage.resetStream()
const detached=instance();detached.observeTurn('local');const stale=listener
detached.resetStream();stale(projection('completed','stale account'))
assert.equal(detached.data.mdText.text,'')
assert.equal(subscriptions,0,'detaching removes only the projection listener')
const realSetTimeout=global.setTimeout, realClearTimeout=global.clearTimeout, realDateNow=Date.now
const timers=new Map();let timerId=0
let now=0
Date.now=()=>now
global.setTimeout=(callback,delay)=>{assert.ok(delay>0 && delay<=3000);callback.delay=delay;timers.set(++timerId,callback);return timerId}
global.clearTimeout=id=>timers.delete(id)
const controlledSetTimeout=global.setTimeout, controlledClearTimeout=global.clearTimeout
const tickThink=()=>{const callbacks=[...timers.entries()].filter(([,callback])=>callback.delay===24)
  callbacks.forEach(([id,callback])=>{timers.delete(id);callback()})}
const drainTimelineUntil=(renderer,ready)=>{
  for(let count=0;!ready();count++){
    assert.ok(count<1024,'native timeline text must drain without replaying snapshots')
    assert.ok(renderer._timelineTimer,'a pending native summary must own its character timer')
    tickThink()
  }
}
const tickRotation=(renderer,elapsed=3000)=>{now+=elapsed;const id=renderer._toolRotationTimer
  const callback=timers.get(id);assert.ok(callback);timers.delete(id);callback()}
const thinking=(text,id='tool-1',status='running')=>({status,processTrace:[{id,kind:'tool',title:'正在搜索',status:'running',details:['阶段占位'],responseContent:text}],reasoningContent:'其他节点的文字'})
try{
  const mainReasoning=(text,status='running')=>({status,modelRequests:[{modelRequestId:'main',status:'running',responseStarted:true}],
    processTrace:[{id:'thinking_main',runId:'r',modelRequestId:'main',parentCallId:'',kind:'stage',stage:'main_reasoning',
      title:'正在思考',status:'running',responseContent:text,
      responseItems:text ? [{kind:'reasoning',start:0,end:text.length}] : [],details:[]}]})
  const firstChunk=instance();firstChunk.applyCloudSnapshot({status:'queued'})
  assert.equal(activityTitle(firstChunk),'正在处理')
  firstChunk.applyCloudSnapshot(mainReasoning('首块多字'))
  assert.equal(firstChunk.data.thinkVisibleText,'首','a full first chunk after the waiting snapshot still types character by character')
  tickThink();assert.equal(firstChunk.data.thinkVisibleText,'首块')
  firstChunk.resetStream()
  const main=instance();main._chatMeta={turnId:'t',runId:'r'}
  main.applyCloudSnapshot({status:'running',modelRequests:[{modelRequestId:'main',status:'running'}]})
  assert.equal(main.data.thinkStatus,1)
  assert.equal(main.data.responseStarted,false,'a model request starting is not an upstream response')
  assert.equal(activityTitle(main),'正在处理')
  assert.equal(main.data.processTrace.length,0)
  main.applyCloudSnapshot({status:'running',modelRequests:[{modelRequestId:'main',status:'running',responseStarted:true}]})
  assert.equal(main.data.responseStarted,true)
  assert.equal(activityTitle(main),'正在处理','provider lifecycle alone does not invent a thinking text node')
  main.applyCloudSnapshot(mainReasoning('甲😀乙'))
  assert.equal(activityTitle(main),'正在思考')
  assert.equal(activityPresentation(main).activityIcon,'icon-thinking')
  assert.equal(main.data.thinkVisibleText,'甲')
  main.applyCloudSnapshot(mainReasoning('甲😀乙'))
  tickThink();assert.equal(main.data.thinkVisibleText,'甲😀','typing never splits a surrogate pair')
  tickThink();assert.equal(main.data.thinkVisibleText,'甲😀乙','duplicate snapshots do not duplicate streamed text')
  tickThink()
  const publicNode={id:'public-main',runId:'r',modelRequestId:'main',parentCallId:'',kind:'stage',stage:'public_commentary',
    title:'正在思考',purpose:'pending',status:'running',responseContent:'公开说明',details:[]}
  const mixed={status:'running',modelRequests:[{modelRequestId:'main',status:'running',responseStarted:true}],
    processTrace:[{...mainReasoning('').processTrace[0],status:'completed'},publicNode]}
  main.applyCloudSnapshot(mixed)
  assert.equal(activityTitle(main),'进展说明')
  assert.equal(main.data.thinkVisibleText,'公','public output delta uses the same typer')
  assert.equal(main.data.processTrace.filter(node=>node.kind==='tool').length,0,'text cannot create a tool node')
  const execNode={id:'main-exec',callId:'main-exec',name:'exec',kind:'tool',title:'正在使用联网检索与读取',status:'proposed',public:{toolNames:['web']}}
  const unfinished=instance();unfinished.applyCloudSnapshot({status:'queued'})
  const unrelatedTimers=new Set(timers.keys())
  unfinished.applyCloudSnapshot(mainReasoning('主推理长句尚未全部播放😀'))
  assert.equal(unfinished.data.thinkVisibleText,'主')
  const staleMainReasoning=[...timers.entries()].find(([id])=>!unrelatedTimers.has(id))[1]
  unfinished.applyCloudSnapshot({...mainReasoning('主推理长句尚未全部播放😀'),
    processTrace:[{...mainReasoning('主推理长句尚未全部播放😀').processTrace[0],status:'completed'},execNode]})
  assert.equal(activityTitle(unfinished),'正在使用联网检索与读取','tool-name input replaces completed main reasoning without waiting for its backlog')
  assert.equal(unfinished.data.displayProcessTrace[0].callId,'main-exec')
  assert.equal(unfinished.data.thinkVisibleText,'','the function proposal clears unfinished model text immediately')
  assert.deepEqual([...timers.keys()],[...unrelatedTimers],'the proposal clears its own timer and preserves the other renderer')
  staleMainReasoning();assert.equal(unfinished.data.thinkVisibleText,'','a cleared reasoning callback cannot overwrite the tool row')
  unfinished.resetStream()
  main.applyCloudSnapshot({...mixed,processTrace:[...mixed.processTrace,execNode]})
  assert.equal(activityTitle(main),'正在使用联网检索与读取','a real function proposal shows its discovered tool names')
  main.applyCloudSnapshot({...mixed,processTrace:[{...publicNode,status:'completed'},{...execNode,status:'running'}]})
  assert.equal(main.data.processTrace.find(node=>node.callId==='main-exec').status,'running','public text ending does not complete the tool')
  main.applyCloudSnapshot({...mixed,content:'最终结果',processTrace:[{...execNode,status:'running'}]})
  assert.equal(timers.size,0,'an exec envelope has no script-text typer')
  assert.equal(main.data.thinkVisibleText,'')
  assert.equal(main.data.processTrace[0].status,'running','only a terminal execution event completes the tool')
  main.resetStream()
  assert.equal(main.data.responseStarted,false,'a new turn must not inherit response-started state')
  const handoff=instance();handoff.applyCloudSnapshot({status:'queued'})
  handoff.applyCloudSnapshot(mainReasoning('未播放完的推理长句😀'))
  const staleReasoning=[...timers.values()][0]
  handoff.applyCloudSnapshot({...mainReasoning('未播放完的推理长句😀'),textSegments:[],
    processTrace:[{...mainReasoning('未播放完的推理长句😀').processTrace[0],status:'completed'}]})
  assert.equal(handoff.data.timelineEntries[0].playbackStopped,true,'real thinking completion stops its text playback')
  assert.equal(handoff.data.timelineEntries[0].hidden,false,
    'completed thinking remains visible before its same-request summary displays a nonblank character')
  const answerSegment={runId:'r',modelRequestId:'main',messageId:'answer-main',parentCallId:'',purpose:'commentary',content:'正文开始'}
  const answeringMain={...mainReasoning('未播放完的推理长句😀'),textSegments:[answerSegment],
    processTrace:projectSegments(mainReasoning('未播放完的推理长句😀').processTrace,[answerSegment])}
  handoff.applyCloudSnapshot(answeringMain)
  assert.equal(handoff.data.mdText.text,'','progress summaries stay outside final Markdown')
  assert.equal(handoff.data.timelineEntries.find(row=>row.kind==='commentary').text,'正文开始')
  assert.equal(handoff.data.timelineEntries.find(row=>row.kind==='commentary').displayText,'正',
    'public summaries begin as a native character prefix instead of a rendered Markdown article')
  assert.equal(handoff.data.thinkVisibleText,'','the timeline replaces the legacy single-row typer')
  assert.equal(handoff.data.timelineEntries[0].hidden,true,
    'the first displayed summary character hides its same-request thinking row while retaining the complete process')
  assert.equal(handoff.data.timelineEntries[0].displayText,'')
  assert.equal(handoff.data.processTrace[0].status,'running','display handoff does not change the server execution state')
  assert.equal(handoff.data.processTrace[0].responseContent,'未播放完的推理长句😀','the complete reasoning remains in the process sheet')
  assert.equal(handoff.data.processTrace[1].responseContent,'正文开始','the complete public body remains in the process sheet')
  staleReasoning();assert.equal(handoff.data.thinkVisibleText,'','a stale legacy timer cannot overwrite timeline output')
  handoff.applyCloudSnapshot({...answeringMain,processTrace:projectSegments(mainReasoning('未播放完的推理长句😀迟到').processTrace,[answerSegment])})
  assert.equal(handoff.data.timelineEntries[0].text,'未播放完的推理长句😀迟到')
  const nextThinking={...mainReasoning('下一轮推理').processTrace[0],id:'thinking_next',modelRequestId:'next'}
  handoff.applyCloudSnapshot({...answeringMain,processTrace:[answeringMain.processTrace[0],nextThinking]})
  assert.equal(handoff.data.timelineSummaryPending,true)
  assert.equal(handoff.data.timelineEntries.some(row=>row.id==='thinking_next'),false,
    'the next main request stays hidden until the preceding summary finishes streaming its native text')
  drainTimelineUntil(handoff,()=>handoff.data.timelineEntries.find(row=>row.id==='answer-main').displayText==='正文开始')
  assert.equal(handoff.data.timelineEntries.some(row=>row.id==='thinking_next'),true,
    'a real next main request closes the preceding body once its full native text has rendered')
  assert.equal(answerSegment.ended,undefined,'visual handoff preserves the raw segment lifecycle')
  const endedAnswerSegment={...answerSegment,ended:true}
  handoff.applyCloudSnapshot({...answeringMain,textSegments:[endedAnswerSegment],
    processTrace:projectSegments([answeringMain.processTrace[0],nextThinking],[endedAnswerSegment])})
  drainTimelineUntil(handoff,()=>handoff.data.timelineEntries.some(row=>row.id==='thinking_next'))
  assert.deepEqual(handoff.data.timelineEntries.map(row=>row.id),['thinking_main','answer-main','thinking_next'],
    'the next main reasoning appends after the previous summary has finished rendering')
  const nextSegments=[endedAnswerSegment,{...answerSegment,modelRequestId:'next',messageId:'answer-next',purpose:'commentary',content:'新的正文'}]
  handoff.applyCloudSnapshot({...answeringMain,textSegments:nextSegments,
    processTrace:projectSegments([answeringMain.processTrace[0],nextThinking],nextSegments)})
  assert.deepEqual(handoff.data.timelineEntries.filter(row=>row.kind==='commentary').map(row=>row.text),['正文开始','新的正文'])
  assert.equal(handoff.data.mdText.text,'','all summaries remain separate until confirmed final text arrives')
  handoff.resetStream()
  const queuedPublic=instance();queuedPublic.applyCloudSnapshot({status:'running'})
  const legacyPublic={...publicNode,responseItems:[{kind:'answer',start:0,end:4}]}
  queuedPublic.applyCloudSnapshot({status:'running',processTrace:[legacyPublic]})
  assert.equal(queuedPublic.data.thinkVisibleText,'公')
  const stalePublic=[...timers.values()][0]
  queuedPublic.applyCloudSnapshot({status:'running',content:'公开说明',processTrace:[legacyPublic]})
  assert.equal(queuedPublic.data.thinkVisibleText,'','legacy public body stops source-entry playback too')
  assert.equal(timers.size,0)
  const liveProjection=queuedPublic.data.displayProcessTrace
  stalePublic()
  assert.equal(queuedPublic.data.displayProcessTrace,liveProjection,'an abandoned source callback cannot restore the main row')
  assert.equal(queuedPublic.data.thinkVisibleText,'')
  queuedPublic.resetStream()
  const bodyRestore=instance();bodyRestore.applyCloudSnapshot(answeringMain)
  assert.equal(bodyRestore.data.thinkVisibleText,'','reconnecting after body starts cannot replay either main text channel')
  assert.equal(bodyRestore.data.processTrace.length,2)
  assert.equal(bodyRestore.data.timelineEntries.find(row=>row.kind==='commentary').displayText,'正')
  assert.equal(bodyRestore.data.timelineSummaryPending,true)
  assert.equal(timers.size,1,'a restored summary still uses the native prefix typer')
  bodyRestore.resetStream()
  const legacyThinking=instance();legacyThinking.applyCloudSnapshot({status:'running'})
  legacyThinking.applyCloudSnapshot({status:'running',reasoningContent:'旧接口的长推理'})
  legacyThinking.applyCloudSnapshot({status:'running',reasoningContent:'旧接口的长推理',content:'旧接口正文'})
  assert.equal(legacyThinking.data.thinkVisibleText,'','legacy reasoning without request IDs also stops when body starts')
  assert.equal(timers.size,0)
  assert.equal(activityPresentation(legacyThinking).activityIcon,'icon-thinking')
  legacyThinking.resetStream()
  const mainRestore=instance();mainRestore.applyCloudSnapshot(mainReasoning('已恢复😀'))
  assert.equal(mainRestore.data.thinkVisibleText,'已恢复😀')
  assert.equal(activityTitle(mainRestore),'正在思考')
  assert.equal(timers.size,0,'restored model text is a snapshot, not a fresh animation')
  mainRestore.applyCloudSnapshot(mainReasoning('已恢复😀续跑'))
  assert.equal(mainRestore.data.thinkVisibleText,'已恢复😀续')
  const lateMain=[...timers.values()][0]
  mainRestore.stopDisplay();lateMain()
  assert.equal(timers.size,0,'cancel clears the main-model text timer')
  assert.equal(mainRestore.data.thinkVisibleText,'','late callbacks cannot restore stopped text')
  mainRestore.resetStream()
  const live=instance();live.applyCloudSnapshot({status:'running'})
  live.applyCloudSnapshot(thinking('甲乙'))
  assert.equal(live.data.thinkVisibleText,'甲','structured response content types the first character immediately')
  live.applyCloudSnapshot(thinking('甲乙丙'))
  assert.equal(live.data.thinkVisibleText,'甲','full snapshots must not reset or duplicate the typing cursor')
  tickThink();assert.equal(live.data.thinkVisibleText,'甲乙')
  tickThink();assert.equal(live.data.thinkVisibleText,'甲乙丙')
  live.applyCloudSnapshot(thinking('甲乙丙。丁'))
  assert.equal(live.data.thinkVisibleText,'','sentence boundaries retain the original clear-and-continue behavior')
  tickThink();assert.equal(live.data.thinkVisibleText,'丁')
  live.applyCloudSnapshot(thinking('甲乙丙。丁戊己'))
  const staleThink=[...timers.values()][0]
  live.applyCloudSnapshot(thinking('','tool-2'))
  assert.equal(live.data.thinkVisibleText,'','a new tool must not inherit old text or stage placeholders')
  staleThink();assert.equal(live.data.thinkVisibleText,'')
  live.applyCloudSnapshot(thinking('新内容','tool-2'))
  assert.equal(live.data.thinkVisibleText,'新')
  live.applyCloudSnapshot(thinking('新内容','tool-2','cancelled'))
  assert.equal(timers.size,0);assert.equal(live.data.thinkVisibleText,'')
  const restored=instance();restored.applyCloudSnapshot(thinking('旧句。恢复前缀'))
  assert.equal(restored.data.thinkVisibleText,'恢复前缀','mounting an existing cloud snapshot must not retype its history')
  assert.equal(timers.size,0)
  restored.applyCloudSnapshot(thinking('替换内容'))
  assert.equal(restored.data.thinkVisibleText,'替换内容','authoritative prefix replacement discards stale queued text')
  const left=instance(),right=instance()
  for(const item of [left,right])item.applyCloudSnapshot({status:'running'})
  left.applyCloudSnapshot(thinking('左右'));right.applyCloudSnapshot(thinking('天地'))
  left.resetStream();tickThink()
  assert.equal(left.data.thinkVisibleText,'');assert.equal(right.data.thinkVisibleText,'天地')
  right.applyCloudSnapshot(thinking('天地人和'))
  const detachedThink=[...timers.values()][0]
  definition.lifetimes.detached.call(right);detachedThink()
  assert.equal(timers.size,0);assert.equal(right.data.thinkVisibleText,'天地人')
  const searchNode = (status='running') => ({ status, processTrace:[{ id:'search', stage:'search', kind:'tool', status,
    responseContent:'甲。乙\n丙\n答', responseItems:[{kind:'source',start:0,end:4},{kind:'source',start:4,end:6},{kind:'answer',start:6,end:7}] }] })
  const search = instance();search.applyCloudSnapshot({status:'running'})
  search.applyCloudSnapshot(searchNode());assert.equal(search.data.thinkVisibleText,'甲')
  tickThink();assert.equal(search.data.thinkVisibleText,'甲。','source punctuation does not clear the row')
  tickThink();assert.equal(search.data.thinkVisibleText,'甲。乙')
  tickThink();tickThink();assert.equal(search.data.thinkVisibleText,'丙')
  tickThink();tickThink();assert.equal(search.data.thinkVisibleText,'答','answer follows source entries')
  tickThink();search.applyCloudSnapshot(searchNode());assert.equal(timers.size,0,'same snapshot never replays drained content')
  search.resetStream()
  const recovery=instance();recovery.applyCloudSnapshot(searchNode());assert.equal(timers.size,0,'history is a snapshot')
  const cancelled=instance();cancelled.applyCloudSnapshot({status:'running'});cancelled.applyCloudSnapshot(searchNode())
  const late=[...timers.values()][0];cancelled.applyCloudSnapshot(searchNode('cancelled'));late()
  assert.equal(timers.size,0);assert.equal(cancelled.data.thinkVisibleText,'')
  const answering=instance();answering.applyCloudSnapshot({status:'running'})
  answering.applyCloudSnapshot(thinking('尚未播完的过程'))
  answering.applyCloudSnapshot({...thinking('尚未播完的过程'),content:'最终回答开始',status:'running'})
  assert.equal(timers.size,1,'main body output does not interrupt an executing tool text typer')
  assert.equal(answering.data.thinkVisibleText,'尚')
  assert.equal(answering.data.processTrace[0].status,'running','text does not complete an executing tool')
  tickThink();assert.equal(answering.data.thinkVisibleText,'尚未')
  answering.applyCloudSnapshot({...thinking('尚未播完的过程增量'),content:'最终回答开始继续',status:'running'})
  assert.equal(answering.data.processTrace[0].status,'running','only execution evidence can resolve the tool')
  assert.equal(timers.size,1)
  answering.resetStream()
  const searchAnswer=instance();searchAnswer.applyCloudSnapshot({status:'running'})
  searchAnswer.applyCloudSnapshot(searchNode())
  searchAnswer.applyCloudSnapshot({...searchNode(),content:'真实回答',status:'running'})
  assert.equal(timers.size,1,'main body output does not interrupt legacy search playback')
  assert.equal(searchAnswer.data.displayProcessTrace[0].id,'search')
  assert.equal(searchAnswer.data.processTrace[0].status,'running')
  tickThink();assert.equal(searchAnswer.data.thinkVisibleText,'甲。')
  searchAnswer.resetStream()

  const pendingExec=instance();pendingExec._chatMeta={turnId:'t',runId:'r'}
  pendingExec.applyCloudSnapshot({status:'running',processTrace:[{...execNode,title:'工具编排',public:{summary:'通用摘要'}}]})
  assert.equal(activityTitle(pendingExec),'正在使用工具','a real active exec has a generic title before its first operation is known')
  assert.equal(activityPresentation(pendingExec).activityIcon,'icon-skill-tool')
  pendingExec.applyCloudSnapshot({status:'running',processTrace:[execNode]})
  assert.equal(activityTitle(pendingExec),'正在使用联网检索与读取')
  assert.equal(activityPresentation(pendingExec).activityIcon,'icon-skill-tool')
  pendingExec.applyCloudSnapshot({status:'running',processTrace:[{...execNode,title:'正在使用联网检索与读取、附件联合分析',public:{toolNames:['web','attachment_analysis']}}]})
  assert.equal(activityTitle(pendingExec),'正在使用联网检索与读取、附件联合分析')
  assert.equal(activityPresentation(pendingExec).toolStatus,undefined)
  pendingExec.resetStream()

  const leaf=(id,text='',status='running')=>({id,callId:id,name:id==='A'?'web_search':'web_page_analysis',
    runId:'r',modelRequestId:'M1',parentCallId:'batch',kind:'tool',title:id==='A'?'网页搜索':'网页分析',
    activityIcon:'icon-web-search1',status,public:{},responseContent:text,
    responseItems:text ? [{kind:'reasoning',start:0,end:text.length}] : [],details:[]})
  const toolDuringBody=instance();toolDuringBody.applyCloudSnapshot({status:'running',textSegments:[]})
  toolDuringBody.applyCloudSnapshot({...answeringMain,processTrace:[...answeringMain.processTrace,leaf('A','工具仍在输出')]})
  assert.equal(toolDuringBody.data.timelineSummaryPending,true)
  assert.equal(toolDuringBody.data.timelineEntries.some(row=>row.node.id==='A'),false,
    'an actual tool row cannot appear before its preceding summary finishes')
  toolDuringBody.applyCloudSnapshot({...answeringMain,textSegments:[endedAnswerSegment],
    processTrace:projectSegments([...answeringMain.processTrace,leaf('A','工具仍在输出')],[endedAnswerSegment])})
  drainTimelineUntil(toolDuringBody,()=>toolDuringBody.data.timelineEntries.some(row=>row.node.id==='A'))
  assert.equal(activityTitle(toolDuringBody),'网页搜索')
  assert.equal(toolDuringBody.data.timelineEntries.find(row=>row.node.id==='A').displayText,'工','a summary does not suppress its actual function row')
  tickThink();assert.equal(toolDuringBody.data.timelineEntries.find(row=>row.node.id==='A').displayText,'工具')
  assert.equal(toolDuringBody.data.timelineEntries.find(row=>row.kind==='commentary').text,'正文开始')
  assert.equal(toolDuringBody.data.mdText.text,'')
  toolDuringBody.resetStream()
  for(const [name,title,icon] of [['attachment_analysis','附件联合分析','icon-read'],
      ['image_generation','图片生成','icon-image1'],['web','联网检索与读取','icon-web-search1']]){
    const selected=instance();selected._chatMeta={turnId:'t',runId:'r'}
    selected.applyCloudSnapshot({status:'running'})
    assert.equal(activityTitle(selected),'正在处理')
    const host={...execNode,id:'host_call_selected',callId:'host_call_selected',status:'ready',
      title:'正在使用'+title,public:{toolNames:[name]}}
    selected.applyCloudSnapshot({status:'running',processTrace:[host]})
    assert.equal(activityTitle(selected),'正在使用'+title,'a host exec displays its real selected capability before main thinking')
    const actual={...leaf('selected'),name,title,activityIcon:icon,status:'ready',parentCallId:host.callId}
    selected.applyCloudSnapshot({status:'running',processTrace:[host,actual,mainReasoning('').processTrace[0]]})
    assert.equal(activityTitle(selected),title,'a validated actual function takes priority over orchestration and text stages')
    assert.equal(activityPresentation(selected).activityIcon,icon)
    selected.applyCloudSnapshot({status:'running',processTrace:[host,{...actual,status:'running',responseContent:'工具自己的推理'},mainReasoning('').processTrace[0]]})
    assert.equal(activityTitle(selected),title)
    assert.equal(selected.data.thinkVisibleText,'工','tool reasoning types under the actual tool title')
    selected.applyCloudSnapshot({status:'running',processTrace:[{...host,status:'completed'},
      {...actual,status:'completed'},mainReasoning('主 Agent 继续处理').processTrace[0]]})
    assert.equal(activityTitle(selected),'正在思考','thinking resumes only after the actual tool completes')
    selected.resetStream()
  }
  const parallel=instance();parallel._chatMeta={turnId:'t',runId:'r'}
  parallel.applyCloudSnapshot({status:'running'})
  parallel.applyCloudSnapshot({status:'running',processTrace:[leaf('A'),leaf('B','积压的第二项')]})
  assert.equal(activityTitle(parallel),'网页搜索','the first actually running call owns the parallel process row')
  parallel.applyCloudSnapshot({status:'running',processTrace:[leaf('A','甲😀乙'),leaf('B','积压的第二项继续')]})
  assert.equal(parallel.data.thinkVisibleText,'甲')
  tickThink();assert.equal(parallel.data.thinkVisibleText,'甲😀')
  parallel.applyCloudSnapshot({status:'running',processTrace:[leaf('A','甲😀乙'),leaf('B','积压的第二项继续加长')]})
  assert.equal(activityTitle(parallel),'网页搜索','a newer parallel tool cannot steal the selected running call')
  tickThink();assert.equal(parallel.data.thinkVisibleText,'甲😀乙')
  const backlog='积压的第二项继续加长'
  parallel.applyCloudSnapshot({status:'running',processTrace:[leaf('A','甲😀乙','completed'),leaf('B',backlog)]})
  assert.equal(activityTitle(parallel),'网页分析')
  assert.equal(parallel.data.thinkVisibleText,'','parallel switching aligns to the second tool current cursor')
  assert.equal(timers.size,0,'buffered second-tool text is not replayed')
  parallel.applyCloudSnapshot({status:'running',processTrace:[leaf('A','甲😀乙','completed'),leaf('B',backlog+'新增')]})
  assert.equal(parallel.data.thinkVisibleText,'新','only post-switch second-tool deltas are typed')
  tickThink();assert.equal(parallel.data.thinkVisibleText,'新增')
  parallel.resetStream()
  const serial=instance();serial._chatMeta={turnId:'t',runId:'r'};serial.applyCloudSnapshot({status:'running'})
  serial.applyCloudSnapshot({status:'running',processTrace:[leaf('A','第一项')]})
  serial.applyCloudSnapshot({status:'running',processTrace:[leaf('A','第一项','completed'),leaf('B','串行初块')]})
  assert.equal(serial.data.thinkVisibleText,'串','a serial next tool types its initial delta instead of skipping it')
  serial.resetStream()

  const rotating=instance();rotating.applyCloudSnapshot({status:'running'})
  const rotatingSnapshot=()=>({status:'running',processTrace:[leaf('A'),leaf('B','后续工具已有内容')]})
  rotating.applyCloudSnapshot(rotatingSnapshot())
  assert.equal(activityTitle(rotating),'网页搜索')
  const initialRotation=rotating._toolRotationTimer
  now+=2999;rotating.applyCloudSnapshot(rotatingSnapshot())
  assert.equal(rotating._toolRotationTimer,initialRotation,'identical snapshots do not postpone the idle deadline')
  assert.equal(activityTitle(rotating),'网页搜索','rotation does not happen before three seconds')
  tickRotation(rotating,1)
  assert.equal(activityTitle(rotating),'网页分析','idle rotation works without another SSE event')
  assert.equal(rotating.data.thinkVisibleText,'后','the next tool buffered output is actually displayed')
  while(rotating._thinkTimer) tickThink()
  const secondText=rotating.data.thinkVisibleText
  tickRotation(rotating)
  assert.equal(activityTitle(rotating),'网页搜索','the final active tool wraps to the first')
  tickRotation(rotating)
  assert.equal(rotating.data.thinkVisibleText,secondText,'returning to a tool keeps its cursor instead of replaying text')
  assert.equal(rotating._thinkTimer,null)
  assert.deepEqual(rotating.data.processTrace.map(({presentation,...node})=>Object.fromEntries(Object.entries(node))),rotatingSnapshot().processTrace,'rotation leaves the authoritative trace unchanged')
  const stoppedRotation=timers.get(rotating._toolRotationTimer)
  rotating.stopDisplay();stoppedRotation()
  assert.equal(rotating._toolRotationTimer,null,'stop clears rotation and late callbacks cannot revive it')
  assert.equal(rotating.data.thinkVisibleText,'')
  rotating.resetStream()

  const activeRotation=instance();activeRotation.applyCloudSnapshot({status:'running'})
  const parallelSnapshot=text=>({status:'running',processTrace:[leaf('A',text),leaf('B')]})
  activeRotation.applyCloudSnapshot(parallelSnapshot(''))
  now+=2500;activeRotation.applyCloudSnapshot(parallelSnapshot('甲乙丙'))
  tickRotation(activeRotation,500)
  assert.equal(activityTitle(activeRotation),'网页搜索','new output extends the idle deadline')
  now+=2000;tickThink()
  tickRotation(activeRotation,500)
  assert.equal(activityTitle(activeRotation),'网页搜索','queued characters are allowed to finish before rotating')
  tickThink();tickRotation(activeRotation)
  assert.equal(activityTitle(activeRotation),'网页分析')
  activeRotation.applyCloudSnapshot({status:'running',processTrace:[leaf('A','甲乙丙','completed'),leaf('B')]})
  assert.equal(activeRotation._toolRotationTimer,null,'a single remaining active tool does not rotate')
  activeRotation.resetStream()

  for(const status of ['completed','failed','cancelled','cancelling']){
    const terminalRotation=instance();terminalRotation.applyCloudSnapshot(parallelSnapshot(''))
    terminalRotation.applyCloudSnapshot({...parallelSnapshot(''),status})
    assert.equal(terminalRotation._toolRotationTimer,null,'turn terminal and cancellation states stop rotation')
    terminalRotation.resetStream()
  }
  for(const peer of [{...leaf('B'),parentCallId:'other-batch'},leaf('B','','ready')]){
    const separate=instance();separate.applyCloudSnapshot({status:'running',processTrace:[leaf('A'),peer]})
    assert.equal(separate._toolRotationTimer,null,'different batches and non-running tools never rotate together')
    separate.resetStream()
  }
  const detachedRotation=instance();detachedRotation.applyCloudSnapshot(parallelSnapshot(''))
  const staleRotation=timers.get(detachedRotation._toolRotationTimer)
  definition.lifetimes.detached.call(detachedRotation);staleRotation()
  assert.equal(detachedRotation._toolRotationTimer,null,'unmount rejects a late rotation callback')
  assert.equal(timers.size,0)

  const body=instance();body._chatMeta={turnId:'t',runId:'r'};body._renderEpoch=1
  const segment=(modelRequestId,content,purpose='pending',messageId=modelRequestId)=>({runId:'r',modelRequestId,messageId,
    itemId:messageId,parentCallId:'',purpose,content,ended:false})
  const firstBody=segment('M1','我先核验。','commentary')
  body.applyCloudSnapshot({status:'running',textSegments:[firstBody],processTrace:[]})
  assert.equal(body.data.mdText.text,'','commentary does not initialize final Markdown')
  assert.equal(body.data.timelineEntries[0].text,'我先核验。')
  const firstKey=body.data.markdownKeys[0]
  body.finish({currentTarget:{dataset:{markdownKey:firstKey}}})
  assert.equal(body.data.settled,false,'a body render callback cannot produce actions before the turn ends')
  body.applyCloudSnapshot({status:'running',textSegments:[firstBody,segment('M2','')],
    processTrace:[{...mainReasoning('新请求推理').processTrace[0],id:'thinking_M2',modelRequestId:'M2'}]})
  assert.equal(body.data.mdText.text,'')
  assert.equal(body.data.markdownKeys[0],firstKey)
  const endedFirstBody={...firstBody,ended:true}
  body.applyCloudSnapshot({status:'running',textSegments:[endedFirstBody,segment('M2','')],
    processTrace:[{...mainReasoning('新请求推理').processTrace[0],id:'thinking_M2',modelRequestId:'M2'}]})
  drainTimelineUntil(body,()=>body.data.timelineEntries.some(row=>row.id==='thinking_M2'))
  assert.equal(body.data.timelineEntries.find(row=>row.id==='M1').displayText,'我先核验。',
    'native summary typing retains its complete prefix and punctuation when the next request appears')
  body.applyCloudSnapshot({status:'running',textSegments:[endedFirstBody,segment('M2','新正文','commentary')],processTrace:[]})
  assert.deepEqual(body.data.timelineEntries.filter(row=>row.kind==='commentary').map(row=>row.text),['我先核验。','新正文'])
  assert.equal(body.data.markdownKeys[0],firstKey,'appending a summary does not remount the final parser')
  const toolBody={...segment('child','工具的正文','tool_result'),parentCallId:'A'}
  const latest=[endedFirstBody,segment('M2','新正文','commentary'),segment('M2','第二段','commentary','M2-item2'),toolBody]
  body.applyCloudSnapshot({status:'running',textSegments:latest,processTrace:[]})
  assert.equal(body.data.mdText.text,'')
  assert.equal(body.data.timelineSummaryPending,true)
  assert.deepEqual(body.data.timelineEntries.filter(row=>row.kind==='commentary').map(row=>row.text),['我先核验。','新正文'],
    'the next summary waits for the current summary to finish rendering')
  const endedLatest=latest.map(row=>row.messageId==='M2'?{...row,ended:true}:row)
  body.applyCloudSnapshot({status:'running',textSegments:endedLatest,processTrace:[]})
  drainTimelineUntil(body,()=>body.data.timelineEntries.some(row=>row.id==='M2-item2'))
  assert.deepEqual(body.data.timelineEntries.filter(row=>row.kind==='commentary').map(row=>row.text),['我先核验。','新正文','第二段'])
  assert.equal(body.data.markdownKeys[0],firstKey)
  body.applyCloudSnapshot({status:'completed',textSegments:[...endedLatest.map(row=>({...row,ended:true})),
    {...segment('M3','新正文','final','final-part-1'),ended:true},
    {...segment('M3','第二段','final','final-part-2'),ended:true}],processTrace:[]})
  assert.equal(body.data.timelineSummaryPending,true)
  assert.equal(body.data.processCollapsed,false)
  assert.equal(body.data.mdText.text,'','formal Markdown waits for the last summary to finish before collapsing the process')
  drainTimelineUntil(body,()=>body.data.mdText.text==='新正文第二段')
  assert.equal(body.data.mdText.text,'新正文第二段','confirmed final items concatenate without tool text')
  body._cloudStatus='completed';body.endStream()
  body.finish({currentTarget:{dataset:{markdownKey:firstKey}}})
  assert.equal(body.data.settled,false,'an old Markdown child cannot settle the latest response after terminal')
  body.finish({currentTarget:{dataset:{markdownKey:firstKey+1}}})
  assert.equal(body.data.settled,true)
  assert.equal(body.data.assistantItem.content,'新正文第二段')
  body.resetStream()
}finally{global.setTimeout=realSetTimeout;global.clearTimeout=realClearTimeout;Date.now=realDateNow}
// Let the real typer idle before its first cloud snapshot, then inspect its final batch.
let typerDefinition
global.Component=value=>{typerDefinition=value}
require('../mdPackage/components/towxmlstream/towxml')
const {createRenderContext,destroyRenderContext}=require('../mdPackage/components/towxmlstream/render-context')
const context=createRenderContext(), nodes=[]
context.context.batchRenderCb.value[0]=(index,node,done)=>{nodes[index]=node;done?.()}
context.context.batchRenderCb.value[1]=()=>{}
context.context.textRenderCb.value=Object.assign(()=>{},{flush(){}})
const renderer=instance();renderer.data.mdText={...definition.data.mdText}
const nativeFinishes=[]
const typer={...typerDefinition.methods,data:{speed:10,mdText:renderer.data.mdText,isFinish:false,batchIds:[0,1],batchSize:40},dataNodes:[],_renderContext:context.context,
 setData(value,done){Object.assign(this.data,value);done?.()},triggerEvent(name,detail){if(name==='finish')nativeFinishes.push(detail)},customSetInterval(tick){this.tick=tick;return {cancel(){}}}}
typer.startType();typer.tick(640)
renderer.applyCloudSnapshot({content:'并行B正常',status:'completed'})
typer.data.mdText=renderer.data.mdText;typer.data.isFinish=true
typer.tick(10)
assert.equal(typer._typedText,'并','formal Markdown still consumes the first response character incrementally')
assert.equal(nativeFinishes.length,0,'a terminal response cannot finish before its text has been typed and parsed')
for(let index=0;index<4;index++)typer.tick(640)
assert.match(JSON.stringify(nodes),/并行B正常/,'an idle renderer must not consume the first response character')
assert.equal(nativeFinishes.length,1)
assert.equal(typer._typedText,'并行B正常','native finish occurs after the complete formal response is typed and parsed')
destroyRenderContext(context.id)
const emptyContext=createRenderContext()
emptyContext.context.batchRenderCb.value[1]=()=>{}
let emptyFinishes=0
const emptyTyper={...typerDefinition.methods,data:{speed:10,mdText:{text:''},isFinish:false,batchIds:[0,1],batchSize:40},_renderContext:emptyContext.context,
 triggerEvent(name){if(name==='finish')emptyFinishes++},customSetInterval(tick){this.tick=tick;return {cancel(){}}}}
emptyTyper.startType();emptyTyper.tick(640)
emptyTyper.data.isFinish=true
assert.doesNotThrow(()=>emptyTyper.tick(640),'stopping before the first character must finalize an empty renderer')
assert.equal(emptyFinishes,1)
destroyRenderContext(emptyContext.id)
console.log('chatFallback: authoritative completion, failure, empty cancellation and stale renderer guards passed')

// Reconcile the keyed Markdown child through its real detach/create lifecycle.
assert.match(require('node:fs').readFileSync('mdPackage/components/assisStream/index.wxml','utf8'), /<towxml wx:for="\{\{markdownKeys\}\}" wx:key="\*this"/)
const repeated=instance()
repeated._ready=true
let markdownChild, displayedNodes=[], mounts=0
const parentSetData=repeated.setData
repeated.setData=function(patch,done){
  const oldKey=this.data.markdownKeys[0]
  parentSetData.call(this,patch)
  if(!markdownChild || oldKey!==this.data.markdownKeys[0]){
    if(markdownChild)typerDefinition.lifetimes.detached.call(markdownChild)
    displayedNodes=[]
    mounts++
    markdownChild={...typerDefinition.methods,data:{...typerDefinition.data,openTyper:true,speed:10},
      setData(value,callback){Object.assign(this.data,value);callback?.()},
      triggerEvent(name,detail){if(name==='finish'){
        assert.equal(this._typedText,this.data.mdText.text,'native completion waits for the complete formal response')
        repeated.finish({detail,currentTarget:{dataset:{markdownKey:repeated.data.markdownKeys[0]}}})
      }},
      customSetInterval(tick){let active=true;this.tick=elapsed=>{if(active)tick(elapsed)};return {cancel(){active=false}}}}
    typerDefinition.lifetimes.created.call(markdownChild)
    const targetNodes=displayedNodes
    markdownChild._renderContext.batchRenderCb.value[0]=(index,node,callback)=>{targetNodes[index]=node;callback?.()}
    markdownChild._renderContext.batchRenderCb.value[1]=()=>{}
    markdownChild._renderContext.textRenderCb.value=Object.assign(()=>{},{flush(){}})
    Object.assign(markdownChild.data,{mdText:this.data.mdText,isFinish:this.data.isFinish})
    typerDefinition.lifetimes.ready.call(markdownChild)
  }else Object.assign(markdownChild.data,{mdText:this.data.mdText,isFinish:this.data.isFinish})
  done?.()
}
function completeResponse(text){
  listener(projection('completed',text))
  assert.equal(repeated.data.settled,false,'terminal data waits for the real Markdown child to finish')
  markdownChild.tick(10)
  assert.equal(markdownChild._typedText,text[0])
  assert.equal(repeated.data.settled,false,'the first typed character cannot finish the formal response')
  for(let index=0;index<4;index++)markdownChild.tick(640)
  assert.equal(repeated.data.settled,true)
  assert.match(JSON.stringify(displayedNodes),new RegExp(text))
}
repeated.setData({})
repeated.observeTurn('initial')
completeResponse('原始正文')
for(let index=1;index<=2;index++){
  const previousChild=markdownChild, previousMounts=mounts
  repeated.reloadResponse({turnKey:'local',runtimeKey:`retry-${index}`,regenerating:true})
  assert.equal(mounts,previousMounts+1,'each refresh replaces the finished Markdown instance')
  assert.equal(previousChild._destroyed,true,'old text context and timer are released')
  assert.deepEqual(displayedNodes,[],'loading must not display the previous response')
  previousChild.tick(640) // queued work from the detached instance must be harmless
  completeResponse(`刷新正文${index}`)
  assert.doesNotMatch(JSON.stringify(displayedNodes),/原始正文/)
}
repeated.reloadResponse({turnKey:'local',runtimeKey:'retry-failure',regenerating:true})
listener(projection('running','未完成的新正文'))
markdownChild.tick(640)
repeated.restoreResponse()
for(let index=0;index<4;index++)markdownChild.tick(640)
assert.match(JSON.stringify(displayedNodes),/刷新正文2/,'rollback remounts the last successful body')
assert.doesNotMatch(JSON.stringify(displayedNodes),/未完成的新正文/)
typerDefinition.lifetimes.detached.call(markdownChild)
console.log('chatFallback: repeated refresh clears real Markdown batches; rollback restores the last response')

const fileRenderer=instance();fileRenderer.observeTurn('files')
const delivered=projection('completed','Saved file')
delivered.assistant.contentParts=[{type:'attachment',assetId:'file_owned',fileID:'cloud://owned/report.md',name:'report.md',extension:'md',size:12}]
listener(delivered);fileRenderer.finish()
assert.equal(fileRenderer.data.generatedFiles.length,1)
assert.equal(events.at(-1).detail.chats[0].attachments[0].name,'report.md')
assert.equal(events.at(-1).detail.chats[0].contentParts[0].type,'attachment')
fileRenderer.markUnavailableFileIds(new Set(['cloud://owned/report.md']))
assert.equal(fileRenderer.data.generatedFiles[0].unavailableReason,'storage_deleted')
fileRenderer.resetStream()
assert.equal(fileRenderer.data.generatedFiles.length,0,'regeneration cannot retain previous delivered files')
console.log('chatFallback: delivered files survive assistant finish and reset on regeneration')

global.setTimeout=controlledSetTimeout;global.clearTimeout=controlledClearTimeout
try{
const publicRenderer = instance()
const publicIds = {runId:'public-run',modelRequestId:'public-model',messageId:'public-message',parentCallId:''}
const publicSegment = {...publicIds,purpose:'commentary',content:'现在调用tools.web，并继续attachment_analysis和image_generation。',ended:true}
const publicSnapshot = {status:'running',textSegments:[publicSegment],processTrace:projectSegments([], [publicSegment])}
const rawSnapshot = JSON.stringify(publicSnapshot)
publicRenderer.applyCloudSnapshot(publicSnapshot)
assert.equal(publicRenderer.data.timelineEntries[0].text,publicSegment.content)
assert.equal(publicRenderer.data.mdText.text,'')
assert.equal(publicRenderer.data.processTrace[0].responseContent,publicSegment.content)
const chineseBodyKey = publicRenderer.data.markdownKeys[0]
publicRenderer.properties.language = 'English'
definition.observers.language.call(publicRenderer, 'English')
assert.equal(publicRenderer.data.timelineEntries[0].text,publicSegment.content)
assert.equal(publicRenderer.data.markdownKeys[0], chineseBodyKey, 'summary localization leaves the final Markdown parser untouched')
assert.equal(JSON.stringify(publicSnapshot),rawSnapshot)
publicRenderer.applyCloudSnapshot({...publicSnapshot,textSegments:[publicSegment,
  {...publicSegment,messageId:'next-public-message',modelRequestId:'next-public-model',purpose:'pending',content:'attachm',ended:false}]})
assert.equal(publicRenderer.data.mdText.text,'', 'an unconfirmed prefix does not start a formal reply')
assert.equal(publicRenderer.data.timelineEntries.length,1,'an unconfirmed next request does not erase the previous summary')
publicRenderer.applyCloudSnapshot({...publicSnapshot,textSegments:[publicSegment,
  {...publicSegment,messageId:'final-public-message',modelRequestId:'final-public-model',purpose:'final'}],processTrace:[]})
assert.equal(publicRenderer.data.timelineSummaryPending,true)
assert.equal(publicRenderer.data.mdText.text,'','a localized summary must finish before the final technical body starts')
drainTimelineUntil(publicRenderer,()=>publicRenderer.data.mdText.text===publicSegment.content)
assert.equal(publicRenderer.data.mdText.text,publicSegment.content,'final technical text preserves exact identifiers')
publicRenderer.resetStream()
assert.equal(publicRenderer._displayAssistant,null)
}finally{global.setTimeout=realSetTimeout;global.clearTimeout=realClearTimeout}

const publicThinking = instance()
publicThinking.applyCloudSnapshot({status:'running',processTrace:[{
  id:'public-thinking',kind:'stage',stage:'main_reasoning',status:'running',
  responseContent:'接下来调用tools.attachm',details:[]
}]})
assert.equal(publicThinking.data.thinkVisibleText,'attachm', 'server text is not buffered or rewritten by the client')
publicThinking.applyCloudSnapshot({status:'running',processTrace:[{
  id:'public-thinking',kind:'stage',stage:'main_reasoning',status:'running',
  responseContent:'接下来调用tools.attachment_analysis核对资料',details:[]
}]})
assert.equal(publicThinking._thinkTyping.text,'接下来调用tools.attachment_analysis核对资料')
publicThinking.clearThinkTyping()
publicThinking.resetStream()
console.log('chatFallback: server progress is unchanged and raw snapshots are preserved')

// Reused renderer state and the stopped cache must never restore the old response.
const { normalizeHistoryMessage } = require('../static_utils/chatHistoryMessages')
const retryStopped = instance()
retryStopped._textSegments = [{runId:'old',modelRequestId:'old-model',messageId:'old-answer',purpose:'final',content:'重试前的完整响应'}]
retryStopped._modelRequests = [{modelRequestId:'old-model',status:'completed'}]
retryStopped.reloadResponse({turnKey:'local',runtimeKey:'new-retry'})
assert.deepEqual(retryStopped._textSegments,[])
assert.deepEqual(retryStopped._modelRequests,[])
retryStopped.stopDisplay()
let cachedStop = events.at(-1).detail.chats[0]
assert.equal(normalizeHistoryMessage(JSON.parse(JSON.stringify(cachedStop))).content,'')
assert.equal(cachedStop.textSegments.length,0)
retryStopped.restoreResponse()
assert.equal(retryStopped._textSegments[0].runId,'old','failed admission rollback retains the original response identity')
retryStopped.resetStream()
const bufferedStop = instance()
bufferedStop._textSegments = [{runId:'new',modelRequestId:'new-model',messageId:'new-answer',purpose:'final',content:'已显示😀尚未显示'}]
bufferedStop.selectComponent = () => ({stopTyping:()=>'已显示😀'})
bufferedStop.stopDisplay()
cachedStop = events.at(-1).detail.chats[0]
assert.equal(cachedStop.textSegments[0].content,'已显示😀')
assert.equal(normalizeHistoryMessage(JSON.parse(JSON.stringify(cachedStop))).content,'已显示😀')
assert.equal(cachedStop.displayStop.contentLength,'已显示😀'.length)
assert.equal(normalizeHistoryMessage({...cachedStop,content:'',textSegments:[{...cachedStop.textSegments[0],content:'旧缓存正文'}]}).content,'',
  'empty stopped content is authoritative even if a legacy cache still has full text segments')
console.log('chatFallback: retry Stop clears old identities and freezes cache text segments')
