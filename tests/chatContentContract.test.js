const {serverNode,serverTrace} = require('./serverPresentation')
const assert = require('node:assert/strict')
const {applySegment, finalContent, mainTextProjection, projectSegments} = require('../static_utils/chatSegments')
const {applyProcessEvent, applyProcessResponseContent, normalizeProcessTrace, completeProcessTrace, currentProcessNode:selectCurrent} = require('../static_utils/processTrace')
const currentProcessNode = trace => selectCurrent(serverTrace(trace))
const ids = {runId:'run',modelRequestId:'M1',messageId:'S1',itemId:'item1',parentCallId:''}
// Allow two output items per request at the highest 64-request budget.
// Live projection and history must retain the final response after progress.
let extendedRows = []
for(let index=0; index<128; index++){
  const identity = {runId:'extended',modelRequestId:'M'+Math.floor(index/2),messageId:'S'+index,itemId:'I'+index,parentCallId:''}
  extendedRows = applySegment(extendedRows,{...identity,op:'start',purpose:index >= 126 ? 'final' : 'commentary'})
  extendedRows = applySegment(extendedRows,{...identity,op:'delta',offset:0,text:'正文'+index})
  extendedRows = applySegment(extendedRows,{...identity,op:'end'})
}
assert.equal(extendedRows.length,128)
assert.equal(finalContent(extendedRows),'正文126正文127')
assert.equal(mainTextProjection(JSON.parse(JSON.stringify(extendedRows))).displayContent,'正文126正文127')
let extendedTrace = []
for(let index=0; index<384; index++){
  extendedTrace = applyProcessEvent(extendedTrace,{id:'extended-'+index,callId:'extended-'+index,
    runId:'extended',modelRequestId:'M1',parentCallId:'exec',name:'read_file',
    kind:'tool',title:'读取文件',status:'completed',public:{summary:'已返回'}})
}
assert.equal(extendedTrace.length,384,'main reasoning, exec and actual operations each need their own display slot')
assert.equal(normalizeProcessTrace(JSON.parse(JSON.stringify(extendedTrace))).length,384)
assert.equal(projectSegments(extendedTrace,extendedRows).filter(node=>node.kind === 'tool').length,384)
let rows = applySegment([], {...ids,op:'start',purpose:'pending'})
let trace = []
const delta = {...ids,op:'delta',offset:0,text:'公开说明😀'}
rows = applySegment(rows,delta)
rows = applySegment(rows,delta)
trace = projectSegments(trace,rows)
assert.equal(rows[0].content,'公开说明😀')
assert.equal(finalContent(rows),'')
assert.deepEqual(mainTextProjection(rows),{displayContent:'公开说明😀',displayModelRequestId:'M1'},'pending main text is immediately visible without changing final-only storage')
assert.equal(trace[0].title,undefined,'segment reduction does not generate process copy')
assert.equal(normalizeProcessTrace(trace)[0].activityIcon,'icon-thinking','main body process rows use the updated thinking glyph')
assert.equal(trace[0].kind,'stage')
assert.equal(trace.some(node=>node.callId),false,'ordinary text never invents function execution')
const mainThinking={...ids,id:'thinking_M1',kind:'stage',stage:'main_reasoning',title:'正在思考',phase:'started',status:'running'}
let mainTrace=applyProcessEvent([],mainThinking)
assert.equal(mainTrace[0].runId,ids.runId,'main reasoning nodes preserve their run identity')
assert.equal(mainTrace[0].modelRequestId,ids.modelRequestId)
assert.equal(mainTrace[0].parentCallId,'')
assert.equal(mainTrace[0].activityIcon,'icon-thinking','new and replayed main reasoning rows use the same thinking glyph')
mainTrace=applyProcessResponseContent(mainTrace,'甲😀',{processId:'thinking_M1',offset:0,kind:'reasoning'})
mainTrace=applyProcessResponseContent(mainTrace,'甲😀',{processId:'thinking_M1',offset:0,kind:'reasoning'})
mainTrace=applyProcessResponseContent(mainTrace,'乙',{processId:'thinking_M1',offset:3,kind:'reasoning'})
assert.equal(mainTrace[0].responseContent,'甲😀乙','reasoning deltas use UTF16 offsets and deduplicate replay')
assert.deepEqual(mainTrace[0].responseItems,[{kind:'reasoning',start:0,end:4}],
  'the actual main reasoning response shape carries responseItems with UTF16 bounds')
for(const changed of [{runId:'other-run'},{modelRequestId:'other-model'},{parentCallId:'other-parent'}]){
  mainTrace=applyProcessResponseContent(mainTrace,'错',{...ids,...changed,processId:'thinking_M1',offset:4,kind:'reasoning'})
  assert.equal(mainTrace[0].responseContent,'甲😀乙','reasoning text rejects a mismatched run, model or parent')
  mainTrace=applyProcessEvent(mainTrace,{...mainThinking,...changed,phase:'completed'})
  assert.equal(mainTrace[0].status,'running','mismatched process events cannot finish the active model node')
}
mainTrace=applyProcessEvent(mainTrace,{...mainThinking,phase:'completed'})
assert.equal(mainTrace[0].status,'completed')
mainTrace=applyProcessResponseContent(mainTrace,'迟到',{...ids,processId:'thinking_M1',offset:4,kind:'reasoning'})
mainTrace=applyProcessEvent(mainTrace,{...mainThinking,phase:'started'})
assert.equal(mainTrace[0].responseContent,'甲😀乙','late reasoning cannot append after model completion')
assert.equal(mainTrace[0].status,'completed','late started events cannot reopen a terminal model node')
assert.equal(normalizeProcessTrace(JSON.parse(JSON.stringify(mainTrace)))[0].responseContent,'甲😀乙')
const tool = {id:'C1',callId:'C1',runId:'run',modelRequestId:'M1',parentCallId:'',kind:'tool',title:'文件解析',status:'proposed',public:{}}
let partialTrace = applyProcessEvent([], {...tool, status:'partial', public:{summary:'部分完成：保留已有证据'}})
partialTrace = applyProcessEvent(partialTrace, {...tool, status:'completed'})
assert.equal(completeProcessTrace(partialTrace)[0].status,'partial','partial is terminal and cannot be rewritten as success')
assert.equal(normalizeProcessTrace(JSON.parse(JSON.stringify(partialTrace)))[0].status,'partial','history replay preserves partial results')
for(const status of ['proposed','ready','running']) trace = applyProcessEvent(trace,{...tool,status})
rows = applySegment(rows,{...ids,op:'delta',offset:delta.text.length,text:'仍在工作。'})
trace = projectSegments(trace,rows)
assert.equal(trace.find(node => node.callId === 'C1').status,'running')
rows = applySegment(rows,{...ids,op:'end'})
rows = applySegment(rows,{...ids,op:'purpose',purpose:'commentary'})
trace = applyProcessEvent(trace,{...tool,status:'failed',error:{code:'TOOL_FAILED',recoverable:true}})
trace = applyProcessEvent(trace,{...tool,status:'completed'})
assert.equal(trace.find(node => node.callId === 'C1').status,'failed')
const next = {...ids,modelRequestId:'M2',messageId:'S2',itemId:'item2'}
rows = applySegment(rows,{...next,op:'start'})
assert.equal(mainTextProjection(rows).displayModelRequestId,'M1','starting a new request without body preserves the old projection')
rows = applySegment(rows,{...next,op:'delta',offset:0,text:'最终回答'})
assert.deepEqual(mainTextProjection(rows),{displayContent:'最终回答',displayModelRequestId:'M2'},'the new main request first body replaces the old projection')
const mainItems=[...rows,{...next,messageId:'S3',itemId:'item3',purpose:'pending',content:'第二段'},
  {...next,messageId:'child',parentCallId:'leaf',purpose:'final',content:'工具正文'}]
assert.equal(mainTextProjection(mainItems).displayContent,'最终回答第二段','same-request items concatenate and tool text stays out of the main body')
assert.deepEqual(mainTextProjection([{modelRequestId:'legacy',messageId:'old',purpose:'final',content:'旧记录'}]),
  {displayContent:'旧记录',displayModelRequestId:'legacy'},'legacy main records without a parent identity remain visible')
rows = applySegment(rows,{...next,runId:'old-run',op:'purpose',purpose:'final'})
assert.equal(finalContent(rows),'')
rows = applySegment(rows,{...next,op:'purpose',purpose:'final'})
trace = projectSegments(trace,rows)
assert.equal(finalContent(rows),'最终回答')
assert.equal(trace.filter(node => node.stage === 'public_commentary').length,1)
assert.equal(normalizeProcessTrace(trace).find(node => node.callId === 'C1').error.code,'TOOL_FAILED')
assert.equal(completeProcessTrace([{...tool,status:'running'}])[0].status,'unknown')
assert.equal(normalizeProcessTrace([{id:'old',title:'旧工具',kind:'tool'}])[0].status,'unknown')
// The exec envelope contains no script; nested nodes keep their own identity and terminal evidence.
const exec = {...tool,id:'exec',callId:'exec',name:'exec',title:'工具编排',status:'running',
  public:{toolNames:['web_search'],summary:'准备检索',query:'tools.web_search(secret)',code:'secret'},details:['secret'],responseContent:'secret'}
assert.deepEqual(normalizeProcessTrace([exec])[0].public,{toolNames:['web_search']})
assert.equal(normalizeProcessTrace([exec])[0].responseContent,'')
assert.deepEqual(normalizeProcessTrace([exec])[0].details,[])
const emptyExec = {...exec,public:{toolNames:[],summary:'secret'},status:'failed',
  error:{code:'EXEC_JS_ERROR',message:'secret',diagnostic:{message:'secret'}}}
assert.equal(currentProcessNode([emptyExec]).id,'exec','failed orchestration is visible without inner tools')
assert.equal(currentProcessNode([{...emptyExec,status:'unknown',error:null}]).status,'unknown')
assert.equal(currentProcessNode([{...emptyExec,status:'completed',error:null}]),undefined,'completed probes stay hidden')
assert.doesNotMatch(JSON.stringify(normalizeProcessTrace([emptyExec])),/secret|diagnostic/)
const leaf = {...tool,id:'leaf',callId:'leaf',name:'translation',parentCallId:'exec',status:'running'}
let nested = applyProcessEvent(applyProcessEvent([],exec),leaf)
for(const changed of [{runId:'old'},{modelRequestId:'M2'},{parentCallId:'other'},{name:'write_file'}]){
  nested = applyProcessEvent(nested,{...leaf,...changed,status:'completed'})
  assert.equal(nested.find(node => node.callId === 'leaf').status,'running')
}
nested = projectSegments(nested,rows)
assert.equal(nested.find(node => node.callId === 'leaf').status,'running')
nested = applyProcessEvent(nested,{...leaf,status:'cancelled'})
nested = applyProcessEvent(nested,{...leaf,status:'completed'})
assert.equal(nested.find(node => node.callId === 'leaf').status,'cancelled')
assert.equal(normalizeProcessTrace(JSON.parse(JSON.stringify(nested))).find(node => node.callId === 'leaf').parentCallId,'exec')
let fullTrace = []
for(let index=0;index<12;index++) fullTrace=applyProcessEvent(fullTrace,{...exec,id:`exec-${index}`,callId:`exec-${index}`,status:'completed'})
for(let index=0;index<16;index++) fullTrace=applyProcessEvent(fullTrace,{...leaf,id:`leaf-${index}`,callId:`leaf-${index}`,parentCallId:'exec-0',status:'completed'})
fullTrace=projectSegments(fullTrace,Array.from({length:12},(_,index)=>({...ids,messageId:`progress-${index}`,purpose:'commentary',content:'公开进度',ended:true})))
assert.equal(normalizeProcessTrace(JSON.parse(JSON.stringify(fullTrace))).length,40)
assert.equal(fullTrace.filter(node => node.kind === 'tool').length,28)
// Resume at every prefix; replaying deltas with original offsets cannot duplicate text.
const events = [{...ids,op:'start'},delta,{...ids,op:'end'},{...ids,op:'purpose',purpose:'final'}]
for(let split=0;split<=events.length;split++){
  let snapshot=[]
  for(const event of events.slice(0,split)) snapshot=applySegment(snapshot,event)
  snapshot=JSON.parse(JSON.stringify(snapshot))
  for(const event of events.slice(split)) snapshot=applySegment(snapshot,event)
  for(const event of events) snapshot=applySegment(snapshot,event)
  assert.equal(finalContent(snapshot),delta.text)
}
console.log('chatContentContract: purpose, identity, duplicates, replay, failures and unknown tool states passed')

// Exercise the actual detail page subscription, expansion and confirmed stop projection.
const fs = require('node:fs')
const vm = require('node:vm')
let streamDefinition, reasoningEvent
vm.runInNewContext(fs.readFileSync(require.resolve('../mdPackage/components/assisStream/index.js'),'utf8'),{
  require(){return {}}, wx:{worklet:{}}, getApp:()=>({}), Component:value=>{streamDefinition=value}
})
const streamView={...streamDefinition.methods,
  data:{turnKey:'original-render-key',markdownKeys:[0]},
  _startedTurnKey:'runtime-key',
  clearThinkTyping(){},
  startPendingTurn(){},
  setData(patch){Object.assign(this.data,patch)},
  triggerEvent(name,detail){assert.equal(name,'openReasoning');reasoningEvent=detail}
}
const retryTrace=[{id:'research-retry',kind:'tool',name:'deep_research',title:'深度研究',status:'running',public:{},details:[]}]
streamView.open({detail:{turnKey:'original-render-key',status:'running',processTrace:serverTrace(retryTrace)}})
assert.equal(reasoningEvent.turnKey,'runtime-key','detail subscription follows the retry runtime, not the original rendered row')
assert.equal(reasoningEvent.processTrace[0].id,retryTrace[0].id)
streamView.reloadResponse({turnKey:'original-render-key',runtimeKey:'next-retry-key'})
assert.equal(streamView._startedTurnKey,'','reset invalidates the old runtime while the new retry is pending')
streamView._startedTurnKey='next-retry-key'
streamView.restoreResponse()
assert.equal(streamView._startedTurnKey,'runtime-key','failed retry restores the previous runtime identity as well as its response')
let page, opened, observer, unsubscribed = false
const pageI18n = require('../static_utils/i18n/index')
vm.runInNewContext(fs.readFileSync(require.resolve('../pages/reasoningPage/index.js'),'utf8'),{
  require(name){
    if(name.endsWith('themeBinding')) return {bindPageTheme(){},unbindPageTheme(){},syncThemeNavigation(){}}
    if(name.endsWith('processTrace')) return require('../static_utils/processTrace')
    if(name.endsWith('otherUtils')) return {rpx2px:(value,width)=>Math.floor(value*width/750)}
    if(name.endsWith('store/index')) return {store:{applicationSettings:{language:'中文'}}}
    if(name.endsWith('i18n/index')) return pageI18n
    throw Error(name)
  },
  clearTimeout(){},wx:{getWindowInfo:()=>({windowWidth:375}),worklet:{shared:value=>({value}),timing:value=>value,cancelAnimation(){},runOnJS:fn=>fn},yuanAI:{chatRuntime:{setVisibleTurn(key){assert.equal(key,'runtime-key')},observe(key,fn){assert.equal(key,'runtime-key');observer=record=>fn({...record,assistant:{...record.assistant,processTrace:serverTrace(record.assistant.processTrace)}});observer({status:'running',assistant:{processTrace:serverTrace(retryTrace)}});return ()=>{unsubscribed=true}}}}},
  getApp:()=>({globalData:{su_system:{screenHeight:800},su_menu:{bottom:50}}}),Page:value=>{page=value}
})
const view={...page,data:{...page.data},setData(value){Object.assign(this.data,value)},
  getOpenerEventChannel(){return {on(name,fn){opened=fn}}},applyAnimatedStyle(){}}
view.onLoad()
opened(reasoningEvent)
assert.equal(view.data.processTrace[0].id,'research-retry','immediate runtime snapshot retains the new research process')
const pageTool=serverNode({...tool,responseContent:'工具公开正文'})
opened({turnKey:'runtime-key',status:'running',processTrace:[{...pageTool,status:'running'}]})
observer({status:'running',assistant:{processTrace:[{...pageTool,status:'running'}]}})
assert.equal(view.data.active,true)
view.toggleTool({currentTarget:{dataset:{id:'C1'}}})
observer({status:'cancelling',assistant:{processTrace:[{...pageTool,status:'running'}]}})
assert.equal(view.data.stopping,true)
assert.equal(view.data.stopped,false)
assert.equal(view.data.processTrace[0].expanded,true)
observer({status:'cancelled',assistant:{processTrace:[{...pageTool,status:'unknown'}]}})
assert.equal(view.data.active,false)
assert.equal(view.data.stopped,true)
assert.equal(view.data.processTrace[0].statusLabel,'结果未确认')
view.onUnload()
assert.equal(unsubscribed,true)
console.log('reasoningPage: live subscription, expansion and stop confirmation passed')
