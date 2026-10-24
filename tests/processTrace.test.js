const assert=require('node:assert/strict')
const {applyProcessEvent,applyProcessResponseContent,applyProcessPresentations,streamProcessTimeline,
  normalizeProcessTrace,currentProcessNode,isVisibleProcessNode,publicProcessText,localizeProcessNode,
  formatProcessDuration,formatStoppedDuration}=require('../static_utils/processTrace')
let trace=applyProcessEvent([],{id:'raw',callId:'raw',kind:'tool',name:'web',title:'raw title',status:'running',runId:'r',modelRequestId:'m'})
trace=applyProcessResponseContent(trace,'😀',{processId:'raw',runId:'r',modelRequestId:'m',offset:0,kind:'answer'})
assert.equal(trace[0].responseContent,'😀')
assert.equal(currentProcessNode(trace),undefined,'raw protocol data never becomes presentation copy')
assert.equal(publicProcessText(trace[0],'中文'),'')
assert.equal(localizeProcessNode(trace[0],'中文').title,'')
assert.equal(isVisibleProcessNode(trace[0]),false)
trace=applyProcessResponseContent(trace,'bad',{processId:'raw',runId:'r',modelRequestId:'m',offset:1,kind:'answer'})
assert.equal(trace[0].responseContent,'😀','raw UTF-16 offset validation is retained')
trace=applyProcessEvent(trace,{...trace[0],status:'completed'})
trace=applyProcessEvent(trace,{...trace[0],status:'running'})
assert.equal(trace[0].status,'completed','late lifecycle events cannot reopen a terminal node')
assert.equal(formatProcessDuration(31000),'31秒')
assert.equal(formatProcessDuration(61000,'English'),'1M 1S')
assert.equal(formatStoppedDuration(90061000),'25时1分')
const phaseNode={id:'phase',callId:'phase',kind:'tool',name:'sandbox_dependencies',status:'running',public:{progress:{phase:'install',elapsed_seconds:7}}}
// New nodes take every displayed word from the server, including unknown future tools.
const serverFields = {title:'后端新标题',endedTitle:'后端结束标题',detailTitle:'后端详情标题',groupTitle:'后端完成汇总',
  content:'tools.web() sample==1.2.3 😀',details:['后端详情'],summary:'后端摘要',errorMessage:'安全说明',statusLabel:'后端状态',responseItems:[]}
const serverPresentation = {version:1,format:'code',visible:true,hasDetails:true,locales:{
  'zh-CN':serverFields,'en-US':{...serverFields,title:'Server title',content:'tools.web() sample==1.2.3 😀'}}}
const serverNode = {...phaseNode,id:'server',runId:'r',modelRequestId:'m',parentCallId:'outer',name:'future_operation',presentation:serverPresentation}
assert.equal(localizeProcessNode(serverNode,'中文').title,'后端新标题')
assert.equal(localizeProcessNode(serverNode,'English').title,'Server title')
assert.equal(localizeProcessNode(serverNode,'中文',true).title,'后端结束标题')
assert.equal(publicProcessText(serverNode,'中文'),serverFields.content,'technical tokens are not rewritten by the client')
const cachedServer = normalizeProcessTrace(JSON.parse(JSON.stringify([serverNode])))
assert.equal(publicProcessText(cachedServer[0],'English'),serverFields.content,'cached bilingual data switches without a request')
const update = {id:'server',runId:'r',modelRequestId:'m',parentCallId:'outer',status:'running',presentation:{locales:{
  'zh-CN':{contentAppend:{offset:serverFields.content.length,text:' tail'}},
  'en-US':{contentAppend:{offset:serverFields.content.length,text:' tail'}}}}}
const appendedServer = applyProcessPresentations(cachedServer,[update])
assert.equal(publicProcessText(appendedServer[0],'中文'),serverFields.content+' tail')
assert.equal(publicProcessText(applyProcessPresentations(appendedServer,[update])[0],'中文'),serverFields.content+' tail','replayed display offsets do not duplicate text')
assert.equal(publicProcessText(applyProcessPresentations(cachedServer,[{...update,runId:'other'}])[0],'中文'),serverFields.content)
const endedServer = {...serverNode,status:'completed'}
assert.equal(publicProcessText(applyProcessPresentations([endedServer],[update])[0],'中文'),serverFields.content,'late running updates cannot change a terminal presentation')
const resetServer = applyProcessPresentations(appendedServer,[{...update,presentation:{locales:{'zh-CN':{content:''},'en-US':{content:''}}}}])
assert.equal(publicProcessText(resetServer[0],'中文'),'','an explicit empty server value clears the old code')
const modelTimeline = streamProcessTimeline([],[],'English',[{modelRequestId:'empty-model',parentCallId:'',status:'running',presentation:serverPresentation}])
assert.equal(modelTimeline.entries[0].node.title,'Server title','a model without tokens uses the server placeholder copy')

console.log('processTrace: server authority, bilingual cache, display patches, raw identity and offset fences passed')
