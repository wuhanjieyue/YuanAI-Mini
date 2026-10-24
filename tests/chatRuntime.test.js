const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const { createRequire } = require('node:module')
const settle = async () => { for(let i=0;i<25;i++) await Promise.resolve() }
const deferred = () => { let resolve, reject; const promise=new Promise((a,b)=>{resolve=a;reject=b}); return { promise,resolve,reject } }
function environment(storage = {}, server = { unread:{} }) {
  const creations=[], attachments=[], cancellations=[], statusRequests=[], readRequests=[], timers=new Map(), snapshots=new Map()
  let clock=0, timerId=0, requestSeed=0
  const storeSource=fs.readFileSync('store/index.js','utf8')
    .replace(/import \{ observable, action \} from 'mobx-miniprogram'/, "const { observable, action } = require('mobx-miniprogram')")
    .replace(/export const /g,'const ')
  const wxStorage={getStorageSync:key=>storage[key],setStorageSync(key,value){storage[key]=JSON.parse(JSON.stringify(value))},removeStorageSync(key){delete storage[key]}}
  const store=vm.runInNewContext(storeSource+'\nstore',{require:createRequire(path.resolve('store/index.js')),wx:wxStorage})
  const listeners=[]
  const context={ store, console, Math, Date, Set, Map,
    eventBus:{on(_,fn){listeners.push(fn)}},CHAT_SESSION_RESET:'reset',
    setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,at:clock+ms});return id},clearTimeout(id){timers.delete(id)},
    require:createRequire(path.resolve('request/chatRuntime.js')),
    prepareChatTurn:params=>({...params,clientMessageId:'fixed-'+requestSeed++}),
    createChatTurn(data){const pending=deferred();creations.push({data,pending});return pending.promise},
    attachChatTurn(ids){
      const queued=[], waiting=[];let closed=false
      const transport={ids,get closed(){return closed},close(){closed=true;waiting.splice(0).forEach(fn=>fn({done:true}))},
        fail(error){waiting.splice(0).forEach(fn=>fn(Promise.reject(error)))},
        push(data){const item={done:false,value:{data:JSON.stringify(data)}};if(waiting.length)waiting.shift()(item);else queued.push(item)},
        eventStream:{[Symbol.asyncIterator](){return {next(){return Promise.resolve(queued.shift() || (closed?{done:true}:new Promise(resolve=>waiting.push(resolve))))},return(){transport.close();return Promise.resolve({done:true})}}}}
      }
      attachments.push(transport);return transport
    },
    cancelChatTurn:async ids=>{cancellations.push(ids);return {data:{...ids,status:'cancelled'}}},
    getChatTurnsStatus:async(params)=>{statusRequests.push(params);return {data:{ownerKey:'owner',unreadConversations:{...server.unread},turns:(params.turns || []).map(item=>store.chatRuns[item.conversationId] || item),nextOffset:null}}},
    markConversationReadRequest:async params=>{
      readRequests.push(params)
      if(server.unread[params.conversationId] === params.completedRunId) delete server.unread[params.conversationId]
      return {data:{ownerKey:'owner',conversationId:params.conversationId,
        completedRunId:server.unread[params.conversationId] || params.completedRunId,unread:Boolean(server.unread[params.conversationId])}}
    },
    getConversationMessagesStatus:async()=>({data:{ownerKey:'owner'}}),
    getConversationMessages:async ids=>({data:snapshots.get(ids.turnId)})
  }
  const source=fs.readFileSync('request/chatRuntime.js','utf8').replace(/^import .*\n/gm,'').replace('export const chatRuntime','const chatRuntime')
  const runtime=vm.runInNewContext(source+'\nchatRuntime',context)
  const meta=(name)=>({ownerKey:'owner',conversationId:name,turnId:'turn-'+name,runId:'run-'+name,status:'running',modeId:'chat',assistantMessageId:'assistant-'+name,userMessageId:'user-'+name})
  const snapshot=(name,content='',seq=-1,status='running')=>({type:'snapshot',protocolVersion:1,...meta(name),status,snapshotSeq:seq,assistant:{messageId:'assistant-'+name,content,status,snapshotSeq:seq}})
  return {runtime,io:context,creations,attachments,cancellations,statusRequests,readRequests,timers,store,server,storage,wxStorage,meta,snapshot,snapshots,emitReset:reason=>listeners.forEach(fn=>fn({reason})),
    async tick(ms){clock+=ms;for(const [id,item]of [...timers])if(item.at<=clock){timers.delete(id);item.fn()}await settle()}}
}
async function check(){
  const contract=environment();contract.runtime.setForeground(true);await settle()
  contract.runtime.submitTurn('contract',{conversationId:'contract',askText:'核验',modeId:'chat'})
  contract.creations[0].pending.resolve({data:contract.meta('contract')});await settle()
  let projected
  contract.runtime.observe('contract',record=>{projected=record})
  const wire=contract.attachments[0]
  wire.push({...contract.snapshot('contract'),assistant:{content:'',processTrace:[],textSegments:[],snapshotSeq:-1,runId:'run-contract'}});await settle()
  const ids={runId:'run-contract',modelRequestId:'M1',messageId:'S1',itemId:'I1'}
  let sequence=0
  const send=async delta=>{const frame={...contract.meta('contract'),protocolVersion:1,seq:sequence++,type:'message_segment',payload:{choices:[{delta}]}};wire.push(frame);await settle();return frame}
  await send({message_segment:{...ids,op:'start',purpose:'pending'}})
  const repeat=await send({message_segment:{...ids,op:'delta',offset:0,text:'我先核验。'}})
  wire.push(repeat);await settle()
  assert.equal(projected.assistant.displayContent,'我先核验。','main pending body is visible immediately and replayed deltas do not duplicate it')
  assert.equal(projected.assistant.displayModelRequestId,'M1')
  const tool={runId:'run-contract',modelRequestId:'M1',id:'C1',callId:'C1',kind:'tool',name:'web_search',title:'网页搜索',status:'running',public:{}}
  await send({process_event:tool})
  await send({message_segment:{...ids,op:'delta',offset:'我先核验。'.length,text:'仍在检索。'}})
  assert.equal(projected.assistant.content,'','pending text is excluded from final-only archival content')
  assert.equal(projected.assistant.displayContent,'我先核验。仍在检索。')
  assert.equal(projected.assistant.textSegments[0].content,'我先核验。仍在检索。')
  assert.equal(projected.assistant.processTrace.find(node=>node.callId==='C1').status,'running','public commentary cannot finish a tool')
  await send({message_segment:{...ids,op:'end'}})
  await send({message_segment:{...ids,op:'purpose',purpose:'commentary'}})
  const file={type:'attachment',assetId:'file_owned',fileID:'cloud://owned/report.md',name:'report.md',extension:'md'}
  const delivered=await send({file_delivery:[file]})
  wire.push(delivered);await settle()
  assert.equal(projected.assistant.attachments.length,1,'repeated delivery event creates one downloadable attachment')
  assert.equal(projected.assistant.contentParts[0].assetId,'file_owned')
  const contractRestore=JSON.parse(JSON.stringify(projected.assistant))
  contractRestore.snapshotSeq=sequence-1
  wire.push({...contract.snapshot('contract','',sequence-1),assistant:contractRestore});await settle()
  assert.equal(projected.assistant.displayContent,'我先核验。仍在检索。','snapshot restoration and live reduction use the same body projection')
  await send({process_event:{...tool,status:'completed',public:{summary:'已核验',result:'专项结果'}}})
  const finalIds={...ids,modelRequestId:'M2',messageId:'S2',itemId:'I2'}
  await send({message_segment:{...finalIds,op:'start'}})
  assert.equal(projected.assistant.displayContent,'我先核验。仍在检索。','new request without body retains the previous visible body')
  await send({message_segment:{...finalIds,op:'delta',offset:0,text:'主模型最终回答'}})
  assert.equal(projected.assistant.displayContent,'主模型最终回答','new request first body replaces the previous body before final classification')
  assert.equal(projected.assistant.displayModelRequestId,'M2')
  await send({model_request:{runId:ids.runId,modelRequestId:'M2',status:'completed',responseStarted:true}})
  await send({model_request:{runId:ids.runId,modelRequestId:'M2',status:'running',responseStarted:true}})
  assert.equal(projected.assistant.modelRequests.filter(row=>row.modelRequestId==='M2').length,1,'late model requests cannot duplicate terminal identity')
  assert.equal(projected.assistant.modelRequests.find(row=>row.modelRequestId==='M2').status,'completed','late running model events cannot reopen a completed request')
  await send({message_segment:{...finalIds,op:'end'}})
  await send({message_segment:{...finalIds,op:'purpose',purpose:'final'}})
  assert.equal(projected.assistant.content,'主模型最终回答')
  assert.equal(projected.assistant.processTrace.filter(node=>node.stage==='public_commentary').length,1)
  assert.equal(projected.assistant.processTrace.find(node=>node.callId==='C1').public.result,'专项结果')
  assert.equal(projected.status,'running','model end cannot finish the turn')
  await send({process_event:{...tool,runId:'old-run',status:'failed'}})
  assert.equal(projected.assistant.processTrace.find(node=>node.callId==='C1').status,'completed')
  const terminalProjection={...projected.assistant,status:'completed',snapshotSeq:sequence}
  wire.push({...contract.snapshot('contract',terminalProjection.content,sequence,'completed'),assistant:terminalProjection});await settle()
  assert.equal(projected.status,'completed')
  assert.equal(projected.assistant.textSegments[1].purpose,'final')
  contract.runtime.reset()
  async function liveRun(name) {
    const client=environment();client.runtime.setForeground(true);await settle()
    client.runtime.submitTurn(name,{conversationId:name,askText:'recover',modeId:'chat'})
    client.creations[0].pending.resolve({data:client.meta(name)});await settle()
    let record
    client.runtime.observe(name,value=>{record=value})
    const wire=client.attachments.at(-1)
    wire.push(client.snapshot(name,'live prefix',10));await settle()
    return {client,wire,record}
  }
  const recovered=await liveRun('restart')
  recovered.wire.push(recovered.client.snapshot('restart','ordinary old snapshot',4));await settle()
  assert.equal(recovered.record.seq,10,'an ordinary old snapshot cannot rewind the live cursor')
  assert.equal(recovered.record.assistant.content,'live prefix','an ordinary old snapshot cannot replace newer live text')
  recovered.wire.push({...recovered.client.snapshot('restart','durable prefix',4),resetCursor:true});await settle()
  assert.equal(recovered.record.seq,4,'a scoped restart snapshot restores the durable cursor')
  assert.equal(recovered.record.assistant.content,'durable prefix','restart recovery replaces text not saved before the server exited')
  assert.equal(recovered.record.meta.resetCursor,undefined,'the one-frame recovery marker is not persisted in run metadata')
  const resumed={...recovered.client.meta('restart'),protocolVersion:1,seq:5,type:'content_delta',payload:{choices:[{delta:{content:' resumed'}}]}}
  recovered.wire.push(resumed);recovered.wire.push(resumed);await settle()
  assert.equal(recovered.record.seq,5)
  assert.equal(recovered.record.assistant.content,'durable prefix resumed','the restored cursor accepts the next event once')
  recovered.client.runtime.reset()
  async function finishHidden(name, mutate = () => {}) {
    const hidden=await liveRun(name)
    const turn={...hidden.client.meta(name),status:'failed',lastEventSeq:4}
    const assistant={role:'assistant',runId:turn.runId,turnId:turn.turnId,conversationId:turn.conversationId,
      status:'failed',content:'durable terminal prefix',snapshotSeq:4}
    const response={ownerKey:'owner',turn,turnMessages:[assistant]}
    const discoveredTurn={...turn}
    hidden.client.io.getChatTurnsStatus=async()=>({data:{ownerKey:'owner',turns:[discoveredTurn],nextOffset:null}})
    mutate(response)
    hidden.client.snapshots.set(discoveredTurn.turnId,response)
    hidden.client.runtime.setVisibleTurn()
    await hidden.client.tick(5000)
    return hidden
  }
  const backgroundRestart=await finishHidden('background-restart')
  assert.equal(backgroundRestart.record.status,'failed','background status discovery accepts the recovered terminal state')
  assert.equal(backgroundRestart.record.seq,4,'background terminal readback restores the durable cursor after a restart')
  assert.equal(backgroundRestart.record.assistant.content,'durable terminal prefix','background terminal readback drops unpersisted live text')
  backgroundRestart.client.runtime.reset()
  for (const invalid of ['turn','run','assistant-run','watermark']) {
    const rejected=await finishHidden(`background-${invalid}`,response=>{
      if(invalid==='turn') response.turn.turnId='another-turn'
      if(invalid==='run') response.turn.runId='another-run'
      if(invalid==='assistant-run') response.turnMessages[0].runId='another-run'
      if(invalid==='watermark') response.turn.lastEventSeq=3
    })
    assert.equal(rejected.record.seq,10,`${invalid} terminal readback cannot reset another cursor`)
    assert.equal(rejected.record.assistant.content,'live prefix',`${invalid} terminal readback cannot replace text`)
    rejected.client.runtime.reset()
  }
  for (const invalid of ['outer-run','inner-run','watermark']) {
    const rejected=await liveRun(invalid)
    const snapshot={...rejected.client.snapshot(invalid,'untrusted rollback',4),resetCursor:true}
    if(invalid==='outer-run') snapshot.runId='another-run'
    if(invalid==='inner-run') snapshot.assistant.runId='another-run'
    if(invalid==='watermark') snapshot.assistant.snapshotSeq=3
    rejected.wire.push(snapshot);await settle()
    assert.equal(rejected.record.seq,10,`${invalid} recovery cannot reset the cursor`)
    assert.equal(rejected.record.assistant.content,'live prefix',`${invalid} recovery cannot replace text`)
    rejected.client.runtime.reset()
  }
  const recoveringStop=await liveRun('recovering-stop')
  const stoppedReply=deferred()
  recoveringStop.client.io.cancelChatTurn=()=>stoppedReply.promise
  const stoppedRecovery=recoveringStop.client.runtime.cancelTurn('recovering-stop')
  recoveringStop.wire.push({...recoveringStop.client.snapshot('recovering-stop','durable prefix plus unseen text',4),resetCursor:true});await settle()
  assert.equal(recoveringStop.record.seq,4,'a stopped run may restore the durable event cursor')
  assert.equal(recoveringStop.record.assistant.content,'live prefix','restart recovery preserves the clicked stop text boundary')
  recoveringStop.wire.push({...recoveringStop.client.meta('recovering-stop'),protocolVersion:1,seq:5,type:'content_delta',payload:{choices:[{delta:{content:' late'}}]}});await settle()
  assert.equal(recoveringStop.record.assistant.content,'live prefix','resumed late text cannot reopen a cancelled projection')
  recoveringStop.client.snapshots.set('turn-recovering-stop',{ownerKey:'owner',turnMessages:[{role:'assistant',status:'cancelled',content:'durable prefix plus unseen text late',snapshotSeq:6}],turn:{...recoveringStop.client.meta('recovering-stop'),status:'cancelled'}})
  stoppedReply.resolve({data:{...recoveringStop.client.meta('recovering-stop'),status:'cancelled'}});await stoppedRecovery
  assert.equal(recoveringStop.record.status,'cancelled')
  assert.equal(recoveringStop.record.assistant.content,'live prefix','the cancelled terminal snapshot keeps the same stopped text boundary')
  recoveringStop.client.runtime.reset()
  const imageLive=environment();imageLive.runtime.setForeground(true);await settle()
  const imageReady=deferred()
  imageLive.runtime.submitTurnWhenReady('photo',{queueGroup:'photo',modeId:'chat',askText:'edit'},imageReady.promise)
  imageReady.resolve({queueGroup:'photo',modeId:'chat',askText:'edit',contentParts:[{type:'attachment',fileID:'cloud://photo'}]})
  await settle()
  imageLive.creations[0].pending.resolve({data:imageLive.meta('photo')});await settle()
  assert.equal(imageLive.attachments.length,1,'uploaded attachment starts SSE without leaving the chat or previewing the image')
  let imageRecord
  imageLive.runtime.observe('photo',record=>{imageRecord=record})
  imageLive.attachments[0].push(imageLive.snapshot('photo','',0));await settle()
  imageLive.attachments[0].push({...imageLive.meta('photo'),protocolVersion:1,seq:1,type:'process',
    payload:{choices:[{delta:{process_event:{id:'image',kind:'tool',title:'正在生成图片',phase:'started'}}}]}});await settle()
  assert.equal(imageRecord.assistant.processTrace[0].title,'正在生成图片','tool progress arrives on SSE without snapshot polling')
  const requestsBefore=imageLive.statusRequests.length
  await imageLive.tick(10000)
  assert.equal(imageLive.statusRequests.length,requestsBefore+1,'foreground discovery also synchronizes unread replies from other devices')
  imageLive.attachments[0].push(imageLive.snapshot('photo','done',2,'completed'));await settle()
  assert.equal(imageLive.readRequests.at(-1).completedRunId,'run-photo','a visible completed stream submits a backend read receipt')
  imageLive.runtime.submitTurnWhenReady('followup',{queueGroup:'photo',conversationId:'photo',modeId:'chat'},
    Promise.resolve({conversationId:'photo',modeId:'chat',askText:'edit again'}))
  await settle()
  imageLive.creations[1].pending.resolve({data:{...imageLive.meta('followup'),conversationId:'photo'}});await settle()
  assert.equal(imageLive.attachments.length,2,'an attachment after a completed turn in the same conversation becomes visible')
  const queuedImage=deferred()
  imageLive.runtime.submitTurnWhenReady('queued-photo',{queueGroup:'photo',conversationId:'photo',modeId:'chat'},queuedImage.promise)
  imageLive.attachments[1].push({...imageLive.snapshot('followup','done',0,'completed'),conversationId:'photo'});await settle()
  assert.equal(imageLive.runtime.getRunningKey('photo'),'queued-photo','the pending attachment becomes the next visible head')
  queuedImage.resolve({conversationId:'photo',modeId:'chat',askText:'queued edit'});await settle()
  imageLive.creations[2].pending.resolve({data:{...imageLive.meta('queued-photo'),conversationId:'photo'}});await settle()
  assert.equal(imageLive.attachments.length,3,'an upload finishing after the previous turn ended still starts SSE')
  imageLive.runtime.reset()
  for(const returnBeforeUpload of [false,true]) {
    const hidden=environment();hidden.runtime.setForeground(true);await settle()
    const ready=deferred()
    hidden.runtime.submitTurnWhenReady('photo',{queueGroup:'photo',modeId:'chat'},ready.promise)
    hidden.runtime.setVisibleTurn()
    assert.equal(hidden.runtime.getRunningKey('unrelated'),'','another conversation cannot select an unrelated pending upload')
    if(returnBeforeUpload) hidden.runtime.setVisibleTurn(hidden.runtime.getRunningKey('photo'))
    ready.resolve({queueGroup:'photo',modeId:'chat',askText:'edit'});await settle()
    hidden.creations[0].pending.resolve({data:hidden.meta('photo')});await settle()
    assert.equal(hidden.attachments.length,returnBeforeUpload?1:0,'upload completion respects the current page visibility')
    if(!returnBeforeUpload) {
      hidden.runtime.setVisibleTurn(hidden.runtime.getRunningKey('photo'));await settle()
      assert.equal(hidden.attachments.length,1,'return after upload reconnects the existing turn')
    }
    hidden.runtime.reset()
  }
  const staged=environment(); staged.runtime.setForeground(true); await settle()
  const upload=deferred()
  staged.runtime.submitTurnWhenReady('image',{queueGroup:'same',conversationId:'same',modeId:'chat',askText:'edit',localFiles:[{previewPath:'/tmp/photo.jpg'}]},upload.promise)
  staged.runtime.submitTurn('after',{queueGroup:'same',conversationId:'same',modeId:'chat',askText:'next'})
  assert.equal(staged.creations.length,0,'neither turn reaches /turns before the first attachment uploads')
  assert.equal(staged.runtime.getPendingTurns('same')[1].localStatus,'uploading')
  upload.resolve({queueGroup:'same',conversationId:'same',modeId:'chat',askText:'edit',contentParts:[{type:'attachment',fileID:'cloud://env/photo.jpg'}]})
  await settle()
  assert.equal(staged.creations.length,1)
  assert.equal(staged.creations[0].data.contentParts[0].fileID,'cloud://env/photo.jpg')
  assert.equal(staged.creations[0].data.askText,'edit')
  staged.creations[0].pending.resolve({data:staged.meta('same')});await settle()
  assert.equal(staged.attachments.length,1,'a queued text turn cannot steal the uploading head visibility')
  const failedUpload=environment(); failedUpload.runtime.setForeground(true); await settle()
  const firstUpload=deferred()
  failedUpload.runtime.submitTurnWhenReady('image',{queueGroup:'failed',modeId:'chat',askText:'edit',localFiles:[{previewPath:'/tmp/photo.jpg'}]},firstUpload.promise)
  firstUpload.reject(new Error('upload failed')); await settle()
  assert.equal(failedUpload.creations.length,0)
  assert.equal(failedUpload.runtime.getPendingTurns('failed')[0].localStatus,'failed')
  const again=deferred()
  failedUpload.runtime.retryTurnWhenReady('image',{queueGroup:'failed',modeId:'chat',askText:'edit'},again.promise)
  again.resolve({queueGroup:'failed',modeId:'chat',askText:'edit',contentParts:[{type:'attachment',fileID:'cloud://env/retried.jpg'}]})
  await settle()
  assert.equal(failedUpload.creations.length,1,'retry submits the original local turn once')
  failedUpload.creations[0].pending.resolve({data:failedUpload.meta('failed')});await settle()
  assert.equal(failedUpload.attachments.length,1,'retrying the attachment starts its stream')
  const staleUpload=deferred()
  failedUpload.runtime.submitTurnWhenReady('old-account',{queueGroup:'old-account',modeId:'chat',askText:'old'},staleUpload.promise)
  failedUpload.runtime.reset()
  staleUpload.resolve({queueGroup:'old-account',modeId:'chat',askText:'old'})
  await settle()
  assert.equal(failedUpload.creations.length,1,'an upload finishing after account reset cannot submit an old turn')
  staged.runtime.reset()
  const stopped=environment();stopped.runtime.setForeground(true);await settle()
  stopped.runtime.submitTurn('stop',{conversationId:'stop',askText:'hello',modeId:'chat'})
  stopped.creations[0].pending.resolve({data:{...stopped.meta('stop'),createdAt:new Date(Date.now()-4000).toISOString(),
    streamTicket:{ticket:'first-turn-ticket',expiresIn:90}}});await settle()
  const stream=stopped.attachments.at(-1)
  assert.equal(stream.ids.initialTicket,'first-turn-ticket')
  assert.equal(stopped.store.chatRuns.stop.streamTicket,undefined,'the scoped ticket is not persisted in run state')
  const stopSnapshot=stopped.snapshot('stop','visible',0)
  stopSnapshot.assistant.processTrace=[{id:'stop-tool',kind:'tool',title:'工具',status:'running'}]
  stream.push(stopSnapshot);await settle()
  const cancelResponse=deferred()
  stopped.io.cancelChatTurn=ids=>{stopped.cancellations.push(ids);return cancelResponse.promise}
  let stopTrace=[]
  const seen=[];stopped.runtime.observe('stop',record=>{stopTrace=record.assistant.processTrace;seen.push({status:record.status,content:record.assistant.content})})
  const cancellation=stopped.runtime.cancelTurn('stop')
  assert.deepEqual(seen.at(-1),{status:'cancelling',content:'visible'},'stop projects immediately before the HTTP response')
  assert.equal(stopTrace[0].status,'running','stop request cannot confirm tool cancellation')
  assert.equal(stopped.cancellations.length,1,'stop still calls the cloud endpoint')
  stream.push({...stopped.meta('stop'),protocolVersion:1,seq:1,type:'content_delta',payload:{choices:[{delta:{content:'late'}}]}});await settle()
  assert.equal(seen.at(-1).content,'visible','late deltas do not resume stopped output')
  stopped.snapshots.set('turn-stop',{ownerKey:'owner',turnMessages:[{role:'assistant',status:'cancelled',content:'visible late',processTrace:[],snapshotSeq:2}],turn:{...stopped.meta('stop'),status:'cancelled'}})
  cancelResponse.resolve({data:{...stopped.meta('stop'),status:'cancelled'}});await cancellation
  assert.deepEqual(seen.at(-1),{status:'cancelled',content:'visible'},'terminal snapshot keeps the clicked stop boundary')
  const clicked=environment();clicked.runtime.setForeground(true);await settle()
  clicked.runtime.submitTurn('clicked',{conversationId:'clicked',askText:'hello',modeId:'chat'})
  clicked.creations[0].pending.resolve({data:clicked.meta('clicked')});await settle()
  const clickedStream=clicked.attachments.at(-1)
  const clickedInitial=clicked.snapshot('clicked','已显示😀缓冲尾巴',0)
  clickedInitial.assistant.textSegments=[{runId:'run-clicked',modelRequestId:'main',messageId:'answer',purpose:'final',content:'已显示😀缓冲尾巴'}]
  clickedStream.push(clickedInitial);await settle()
  const clickedReply=deferred(), receipt={contentLength:'已显示😀'.length,processDurationMs:1234}
  clicked.io.cancelChatTurn=ids=>{clicked.cancellations.push(ids);return clickedReply.promise}
  let clickedView
  clicked.runtime.observe('clicked',record=>{clickedView=record.assistant})
  const clickedCancel=clicked.runtime.cancelTurn('clicked',receipt)
  assert.equal(clickedView.content,'已显示😀','runtime freezes the printed prefix rather than its received buffer')
  assert.equal(clickedView.processDurationMs,1234)
  assert.equal(clickedView.textSegments[0].content,'已显示😀')
  assert.deepEqual(JSON.parse(JSON.stringify(clickedView.displayStop)),receipt)
  assert.deepEqual(JSON.parse(JSON.stringify(clicked.cancellations[0].displayStop)),receipt)
  const restoredClick=clicked.runtime.restoreConversation({ownerKey:'owner',activeTurn:clicked.meta('clicked'),
    turnMessages:[{role:'assistant',messageId:'assistant-clicked',content:'已显示😀更多后台输出',status:'running',snapshotSeq:1}]})
  assert.equal(restoredClick.status,'cancelling','a history read before cancel acknowledgement cannot reopen the stopped runtime')
  assert.equal(restoredClick.assistant.content,'已显示😀')
  assert.equal(restoredClick.assistant.textSegments[0].content,'已显示😀','late snapshots cannot replace frozen text segments')
  clicked.snapshots.set('turn-clicked',{ownerKey:'owner',turnMessages:[{role:'assistant',status:'cancelled',content:'已显示😀',snapshotSeq:2}],
    turn:{...clicked.meta('clicked'),status:'cancelled'}})
  clickedReply.resolve({data:{...clicked.meta('clicked'),status:'cancelled'}});await clickedCancel
  assert.equal(clickedView.content,'已显示😀')
  const completedClick=environment();completedClick.runtime.setForeground(true);await settle()
  completedClick.runtime.submitTurn('completed-click',{conversationId:'completed-click',askText:'hello',modeId:'chat'})
  completedClick.creations[0].pending.resolve({data:completedClick.meta('completed-click')});await settle()
  completedClick.snapshots.set('turn-completed-click',{ownerKey:'owner',
    turnMessages:[{role:'assistant',status:'completed',content:'已显示😀缓冲尾巴',snapshotSeq:0}],
    turn:{...completedClick.meta('completed-click'),status:'completed'}})
  completedClick.attachments.at(-1).push(completedClick.snapshot('completed-click','已显示😀缓冲尾巴',0,'completed'));await settle()
  await completedClick.runtime.cancelTurn('completed-click',receipt)
  assert.equal(completedClick.cancellations.length,1,'Stop persists even when the backend finished before Markdown playback')
  assert.deepEqual(JSON.parse(JSON.stringify(completedClick.cancellations[0].displayStop)),receipt)
  const e=environment();e.runtime.setForeground(true);await settle()
  e.runtime.submitTurn('A',{askText:'a',modeId:'chat'})
  e.runtime.setVisibleTurn()
  e.runtime.submitTurn('B',{askText:'b',modeId:'chat'})
  let bText='';const stop=e.runtime.observe('B',r=>{bText=r.assistant.content})
  e.creations[1].pending.resolve({data:e.meta('B')});await settle()
  e.creations[0].pending.resolve({data:{...e.meta('A'),conversation:{conversationId:'A',pinnedAt:'2026-09-13'}}});await settle()
  assert.equal(e.store.pinnedChatHistory.conversations[0].conversationId,'A')
  assert.equal(e.store.chatHistory.conversations.length,0,'a pinned conversation is not duplicated into recent history')
  assert.equal(e.attachments.length,1,'late A creation does not attach over visible B')
  e.attachments[0].push(e.snapshot('B','answer-b',0,'completed'));await settle()
  assert.equal(bText,'answer-b')
  e.runtime.setVisibleTurn('A');await settle()
  const a=e.attachments.at(-1);a.push(e.snapshot('A','prefix',0));await settle()
  a.push({...e.meta('A'),protocolVersion:1,seq:2,type:'content_delta',payload:{choices:[{delta:{content:'gap'}}]}});await settle()
  assert.equal(e.attachments.at(-1).ids.afterSeq,-1,'sequence gap requests a full snapshot')
  e.attachments.at(-1).push(e.snapshot('A','repaired',2));await settle()
  let aText='';e.runtime.observe('A',r=>{aText=r.assistant.content})
  assert.equal(aText,'repaired')
  e.runtime.setOnline(false);await settle()
  const count=e.attachments.length;await e.tick(20000)
  assert.equal(e.attachments.length,count,'offline stops subscriptions')
  e.runtime.setOnline(true);await settle()
  assert.equal(e.attachments.at(-1).ids.afterSeq,2)
  assert.equal(e.creations.length,2,'reconnect never submits another model run')
  const streamFailure=environment();streamFailure.runtime.setForeground(true);await settle()
  streamFailure.runtime.submitTurn('stream-failure',{askText:'retry',modeId:'chat'})
  streamFailure.creations[0].pending.resolve({data:streamFailure.meta('stream-failure')});await settle()
  streamFailure.attachments[0].fail(new Error('network unavailable'));await settle()
  assert.equal(streamFailure.runtime.getPendingTurns('stream-failure').length,0,'流中断后已有云端轮次不能变成本地失败消息')
  assert.equal([...streamFailure.timers.values()].some(item=>item.at===5000),true,
    'a failed foreground stream schedules status discovery without leaving the mini program')
  streamFailure.runtime.reset()
  const beforeEpoch=e.runtime.epoch
  e.emitReset('new-chat');await settle()
  assert.equal(e.runtime.epoch,beforeEpoch,'new chat must not reset other runs or account epoch')
  e.runtime.setVisibleTurn('B');e.runtime.setVisibleTurn('A');await settle()
  assert.equal(e.attachments.at(-1).closed,false,'a retiring subscription cannot close its replacement')
  e.runtime.reset();await settle()
  a.push({...e.meta('A'),protocolVersion:1,seq:3,type:'content_delta',payload:{choices:[{delta:{content:'stale'}}]}});await settle()
  assert.equal(Object.keys(e.store.chatRuns).length,0)
  assert.equal(bText,'answer-b');stop()
  const retry=environment();retry.runtime.setForeground(true);await settle()
  retry.runtime.submitTurn('retry',{askText:'r',modeId:'chat'})
  retry.creations[0].pending.reject(Object.assign(new Error('response lost'),{statusCode:503}));await settle();await retry.tick(1000)
  assert.equal(retry.runtime.getPendingTurns('retry')[0].localStatus,'submitting','服务不可用时保留待提交请求，不生成未落库的失败回复')
  assert.deepEqual(retry.creations[1].data,retry.creations[0].data,'create retry keeps its entire request and idempotency key')
  retry.runtime.reset();retry.creations[1].pending.resolve({data:retry.meta('late')});await settle()
  assert.equal(Object.keys(retry.store.chatRuns).length,0,'late account response is discarded')
  const temporary=environment();temporary.runtime.setForeground(true);await settle()
  temporary.runtime.submitTurn('T',{askText:'temp',modeId:'temporary'})
  temporary.runtime.setVisibleTurn()
  temporary.creations[0].pending.resolve({data:{...temporary.meta('T'),modeId:'temporary'}});await settle()
  assert.equal(temporary.cancellations.length,1,'leaving before metadata still cancels the accepted temporary run')
  assert.equal(Object.keys(temporary.store.chatRuns).length,0,'temporary turns stay out of the durable catalog')
  const temporaryQueue=environment();temporaryQueue.runtime.setForeground(true);await settle()
  temporaryQueue.runtime.submitTurn('temp-first',{askText:'first',modeId:'temporary',queueGroup:'temp-group'})
  temporaryQueue.runtime.submitTurn('temp-second',{askText:'second',modeId:'temporary',queueGroup:'temp-group'})
  temporaryQueue.runtime.setVisibleTurn()
  assert.equal(temporaryQueue.runtime.getPendingTurns('temp-group').length,0,'切走临时会话时不保留排队消息的投影')
  const discovery=environment();discovery.runtime.setForeground(true);await settle()
  for(const name of ['A','B']){
    discovery.runtime.submitTurn(name,{askText:name,modeId:'chat'})
    discovery.creations.at(-1).pending.resolve({data:discovery.meta(name)});await settle()
  }
  await discovery.tick(5000)
  assert.deepEqual(Object.keys(discovery.statusRequests.at(-1).turns[0]).sort(),['conversationId','runId','turnId'],'status recovery sends identifiers only')
  const finalResponse=deferred();let readingFinal=false
  discovery.io.getChatTurnsStatus=async()=>({data:{ownerKey:'owner',turns:[{...discovery.meta('A'),status:'completed'},discovery.meta('B')],nextOffset:null}})
  discovery.io.getConversationMessages=()=>{readingFinal=true;return finalResponse.promise}
  await discovery.tick(5000);assert.equal(readingFinal,true)
  discovery.runtime.reset();finalResponse.resolve({data:{}});await settle()
  assert.equal(Object.keys(discovery.store.chatRuns).length,0,'reset during terminal discovery cannot repopulate the old account')

  const invalid=environment();invalid.runtime.setForeground(true);await settle()
  invalid.store.chatRuns.A=invalid.meta('A')
  let invalidCalls=0
  invalid.io.getChatTurnsStatus=async()=>{invalidCalls++;throw {errCode:400,errMsg:'system error'}}
  invalid.runtime.setVisibleTurn('elsewhere');await invalid.tick(5000);await invalid.tick(30000)
  assert.equal(invalidCalls,1,'a non-retryable discovery error stops the polling loop')
  invalid.runtime.setForeground(false);invalid.runtime.setForeground(true);await settle()
  assert.equal(invalidCalls,2,'a later foreground entry may perform one fresh recovery check')

  const legacy=environment()
  legacy.store.chatRuns.legacy={...legacy.meta('legacy'),runId:''}
  legacy.runtime.setForeground(true);await settle();await legacy.tick(30000)
  assert.equal(legacy.statusRequests.length,2,'unread synchronization continues after invalid legacy runs are removed')
  assert.equal(legacy.statusRequests[0].turns.length,0,'legacy incomplete identifiers are not sent')
  assert.equal(legacy.store.chatRuns.legacy,undefined,'legacy incomplete runs are removed locally')

  const serial=environment();serial.runtime.setForeground(true);await settle()
  const first={...serial.meta('C'),turnId:'turn-first',runId:'run-first'}
  serial.runtime.submitTurn('first',{conversationId:'C',askText:'one',modeId:'chat',turnKey:'first'})
  serial.creations[0].pending.resolve({data:first});await settle()
  serial.runtime.submitTurn('second',{conversationId:'C',askText:'two',modeId:'chat',turnKey:'second'})
  serial.runtime.submitTurn('third',{conversationId:'C',askText:'three',modeId:'chat',turnKey:'third'})
  assert.equal(serial.creations.length,1,'同会话的后两条只进入本地队列')
  assert.deepEqual(Array.from(serial.runtime.getPendingTurns('C'),item=>item.streamContent || item.askText),['three','two'])
  serial.attachments[0].push({type:'snapshot',protocolVersion:1,...first,status:'completed',snapshotSeq:0,
    assistant:{content:'ok',status:'completed',snapshotSeq:0}});await settle()
  assert.equal(serial.creations.length,2,'前一轮完成后只发送队首')
  assert.equal(serial.creations[1].data.askText,'two')
  const second={...serial.meta('C'),turnId:'turn-second',runId:'run-second'}
  serial.creations[1].pending.resolve({data:second});await settle()
  serial.attachments.at(-1).push({type:'snapshot',protocolVersion:1,...second,status:'failed',snapshotSeq:0,
    assistant:{content:'',status:'failed',snapshotSeq:0}});await settle()
  assert.equal(serial.creations.length,3,'前一轮失败也继续发送下一条')
  assert.equal(serial.creations[2].data.askText,'three')
  serial.runtime.reset()
  assert.equal(serial.runtime.getPendingTurns('C').length,0,'账号重置清空本地队列')

  const conflict=environment();conflict.runtime.setForeground(true);await settle()
  conflict.runtime.submitTurn('pending',{conversationId:'E',askText:'queued',modeId:'chat',turnKey:'pending'})
  const originalRequest=conflict.creations[0].data
  const blocker={...conflict.meta('E'),turnId:'turn-external',runId:'run-external'}
  conflict.creations[0].pending.reject(Object.assign(new Error('busy'),{
    code:'TURN_IN_PROGRESS',statusCode:409,data:{activeTurn:blocker}
  }));await settle()
  assert.equal(conflict.creations.length,1,'服务端进行中冲突不立即重试')
  assert.equal(conflict.runtime.getPendingTurns('E').length,1,'冲突后保留本地待发送项')
  assert.equal(conflict.runtime.getRunningKey('E'),`cloud-${blocker.turnId}`)
  conflict.attachments.at(-1).push({type:'snapshot',protocolVersion:1,...blocker,status:'cancelled',snapshotSeq:0,
    assistant:{content:'',status:'cancelled',snapshotSeq:0}});await settle()
  assert.equal(conflict.creations.length,2,'已有轮次停止后重试队首')
  assert.deepEqual(conflict.creations[1].data,originalRequest,'重试沿用原始请求与幂等消息 ID')

  const background=environment();background.runtime.setForeground(true);await settle()
  background.runtime.submitTurn('waiting',{conversationId:'BG',askText:'later',modeId:'chat',turnKey:'waiting'})
  const remote={...background.meta('BG'),turnId:'turn-remote',runId:'run-remote'}
  background.creations[0].pending.reject(Object.assign(new Error('busy'),{
    code:'TURN_IN_PROGRESS',statusCode:409,data:{activeTurn:remote}
  }));await settle()
  background.runtime.setVisibleTurn()
  background.io.getChatTurnsStatus=async()=>({data:{ownerKey:'owner',turns:[{...remote,status:'completed'}],nextOffset:null}})
  await background.tick(5000)
  assert.equal(background.creations.length,2,'切换页面后仍从状态发现推进待发送队列')

  const restored=environment();restored.runtime.setForeground(true);await settle()
  restored.runtime.restoreConversation({ownerKey:'owner',activeTurn:restored.meta('R'),messages:[]})
  restored.runtime.setVisibleTurn('cloud-turn-R');await settle()
  const activeTransport=restored.attachments.at(-1)
  restored.runtime.submitTurn('queued-R',{conversationId:'R',askText:'next',modeId:'chat',turnKey:'queued-R'})
  assert.equal(restored.creations.length,0,'恢复中的云端轮次阻止同会话新请求')
  assert.equal(activeTransport.closed,false,'加入队列不能关闭前一轮的实时订阅')

  const failedLocal=environment();failedLocal.runtime.setForeground(true);await settle()
  failedLocal.runtime.submitTurn('failed-local',{conversationId:'F',askText:'keep',modeId:'chat',turnKey:'failed-local'})
  failedLocal.creations[0].pending.reject(Object.assign(new Error('bad request'),{statusCode:400}));await settle()
  failedLocal.runtime.setVisibleTurn()
  assert.equal(failedLocal.runtime.getPendingTurns('F')[0].localStatus,'failed','未入云的失败消息在会话恢复时仍可投影')
  failedLocal.runtime.failLocalTurn('model-failed',{conversationId:'F',askText:'visible',turnKey:'model-failed'},new Error('model unavailable'))
  assert.equal(failedLocal.runtime.getPendingTurns('F')[0].askText,'visible','模型列表加载失败也保留已显示的用户消息')
  const localRetry=environment();localRetry.runtime.setForeground(true);await settle()
  localRetry.runtime.submitTurn('failed',{conversationId:'C',askText:'first',modeId:'chat',turnKey:'failed'})
  const originalId=localRetry.creations[0].data.clientMessageId
  localRetry.creations[0].pending.reject(Object.assign(new Error('rejected'),{statusCode:400}));await settle()
  localRetry.runtime.submitTurn('running',{conversationId:'C',askText:'second',modeId:'chat',turnKey:'running'})
  localRetry.creations[1].pending.resolve({data:localRetry.meta('C')});await settle()
  const oldRecord=localRetry.runtime.retryLocalTurn('failed',{conversationId:'C',askText:'first',modeId:'chat',turnKey:'failed'})
  assert.equal(localRetry.creations.length,2,'手动重试排在同会话运行轮次之后')
  assert.equal(localRetry.runtime.getPendingTurns('C')[0].turnKey,'failed','重试复用原用户气泡')
  localRetry.attachments.at(-1).push(localRetry.snapshot('C','done',0,'completed'));await settle()
  assert.equal(localRetry.creations[2].data.askText,'first','前一轮终态后提交原消息')
  assert.notEqual(localRetry.creations[2].data.clientMessageId,originalId,'显式重试使用新的消息 ID')
  let observedRecord
  const stopLocalRetry=localRetry.runtime.observe('failed',record=>{ observedRecord=record })
  assert.equal(observedRecord,oldRecord,'重试沿用原轮次记录')
  stopLocalRetry()
  const catalogRetry=environment();catalogRetry.runtime.failLocalTurn('catalog',{conversationId:'D',askText:'draft',turnKey:'catalog'},new Error('model unavailable'))
  catalogRetry.runtime.retryLocalTurn('catalog',{conversationId:'D',askText:'draft',modeId:'chat',turnKey:'catalog'})
  assert.equal(catalogRetry.creations[0].data.askText,'draft','模型目录失败后的直接重试可正常创建轮次')

  const fresh=environment();fresh.runtime.setForeground(true);await settle()
  fresh.runtime.failLocalTurn('new-failed',{askText:'still visible',turnKey:'new-failed',queueGroup:'local-new'},new Error('model unavailable'))
  fresh.runtime.submitTurn('new-first',{askText:'first',modeId:'chat',queueGroup:'local-new',turnKey:'new-first'})
  fresh.runtime.submitTurn('new-second',{askText:'second',modeId:'chat',queueGroup:'local-new',turnKey:'new-second'})
  assert.equal(fresh.creations.length,1)
  fresh.creations[0].pending.resolve({data:fresh.meta('created')});await settle()
  assert.equal(fresh.runtime.getPendingTurns('local-new').length,0)
  assert.equal(fresh.runtime.getPendingTurns('created').length,2,'新会话创建后迁移待发送队列及失败消息')
  assert.equal(fresh.runtime.getPendingTurns('created').some(item=>item.turnKey==='new-failed'),true,'新会话创建后仍保留此前发送失败的气泡')
  fresh.attachments[0].push(fresh.snapshot('created','done',0,'completed'));await settle()
  assert.equal(fresh.creations[1].data.conversationId,'created','新会话下一条使用服务端会话 ID')

  const titles=environment();titles.runtime.setForeground(true);await settle()
  titles.store.chatHistory={ownerKey:'owner',latestModifiedAt:'version',nextOffset:20,hasMore:true,conversations:[{conversationId:'A',title:'old',titleType:'auto'},{conversationId:'B',title:'B'}]}
  titles.store.pinnedChatHistory={ownerKey:'owner',nextOffset:5,conversations:[{conversationId:'A',title:'old',titleType:'auto',pinnedAt:'pinned'}]}
  let checks=0
  titles.io.getConversationMessagesStatus=async()=>({data:{ownerKey:'owner',conversation:{conversationId:'A',title:++checks===1?'old':'new title',titleType:'auto',titleGenerationStatus:checks===1?'pending':'completed'}}})
  titles.runtime.refreshConversationTitle('A');titles.runtime.refreshConversationTitle('A');await settle()
  assert.equal(checks,1,'title requests are deduplicated')
  titles.runtime.setVisibleTurn('elsewhere');await titles.tick(2000)
  assert.equal(titles.store.chatHistory.conversations[0].title,'new title')
  assert.equal(titles.store.pinnedChatHistory.conversations[0].title,'new title')
  assert.equal(titles.store.pinnedChatHistory.conversations[0].pinnedAt,'pinned')
  assert.equal(titles.store.chatHistory.nextOffset,20);assert.equal(titles.store.chatHistory.latestModifiedAt,'version')
  assert.equal(titles.store.chatHistory.conversations[1].conversationId,'B')
  const manual=deferred();titles.io.getConversationMessagesStatus=()=>manual.promise
  titles.runtime.refreshConversationTitle('A');await settle()
  titles.store.chatHistory.conversations[0]={conversationId:'A',title:'my title',titleType:'manual'}
  manual.resolve({data:{ownerKey:'owner',conversation:{conversationId:'A',title:'late auto',titleType:'auto',titleGenerationStatus:'completed'}}});await settle()
  assert.equal(titles.store.chatHistory.conversations[0].title,'my title')
  const stale=deferred();titles.io.getConversationMessagesStatus=()=>stale.promise
  titles.runtime.refreshConversationTitle('A');titles.runtime.reset()
  stale.resolve({data:{ownerKey:'owner',conversation:{conversationId:'A',title:'old account',titleType:'auto'}}});await settle()
  assert.equal(titles.store.chatHistory.conversations[0].title,'my title')
  const paused=environment();paused.runtime.setForeground(true);await settle()
  let pausedCalls=0;paused.io.getConversationMessagesStatus=async()=>{pausedCalls++;return {data:{ownerKey:'owner',conversation:{conversationId:'A',titleGenerationStatus:'completed'}}}}
  paused.runtime.setOnline(false);paused.runtime.refreshConversationTitle('A');await paused.tick(5000)
  assert.equal(pausedCalls,0);paused.runtime.setOnline(true);await settle();assert.equal(pausedCalls,1)
  const server={unread:{'remote-A':'run-A','remote-B':'run-B'}}
  const firstDevice=environment({},server),secondDevice=environment({},server)
  firstDevice.runtime.setForeground(true);secondDevice.runtime.setForeground(true);await settle()
  assert.equal(firstDevice.store.hasUnreadConversations,true,'cold start discovers unread replies without local run history')
  assert.deepEqual(Object.keys(secondDevice.store.unreadConversations),['remote-A','remote-B'])
  await firstDevice.runtime.markConversationRead('remote-A','run-A')
  assert.equal(firstDevice.store.hasUnreadConversations,true,'another unread conversation keeps the aggregate dot')
  await secondDevice.tick(5000)
  assert.equal(secondDevice.store.unreadConversations['remote-A'],undefined,'read receipts synchronize across devices')
  await secondDevice.runtime.markConversationRead('remote-B','run-B')
  await firstDevice.tick(5000)
  assert.equal(firstDevice.store.hasUnreadConversations,false,'the final remote read clears the header badge')
  server.unread['remote-C']='run-C'
  const restarted=environment({},server);restarted.runtime.setForeground(true);await settle()
  assert.equal(restarted.store.unreadConversations['remote-C'],'run-C','reopening uses the server rather than a local snapshot')
  assert.equal(restarted.storage.chatReadState,undefined,'unread state is no longer persisted by the client')

  const oldPoll=deferred()
  restarted.io.getChatTurnsStatus=()=>oldPoll.promise
  await restarted.tick(5000)
  await restarted.runtime.markConversationRead('remote-C','run-C')
  oldPoll.resolve({data:{ownerKey:'owner',turns:[],nextOffset:null,unreadConversations:{'remote-C':'run-C'}}});await settle()
  assert.equal(restarted.store.hasUnreadConversations,false,'a status request started before a receipt cannot re-light the read response')
  server.unread['remote-D']='run-new'
  await firstDevice.tick(5000)
  await firstDevice.runtime.markConversationRead('remote-D','run-old')
  assert.equal(firstDevice.store.unreadConversations['remote-D'],'run-new','a stale receipt cannot clear a newer reply')

  const lostAck=deferred()
  firstDevice.io.markConversationReadRequest=()=>lostAck.promise
  const oldReceipt=firstDevice.runtime.markConversationRead('remote-D','run-new')
  firstDevice.store.setUnreadConversations({'remote-D':'run-newest'})
  lostAck.resolve({data:{ownerKey:'owner',completedRunId:'run-new',unread:false}});await oldReceipt
  assert.equal(firstDevice.store.unreadConversations['remote-D'],'run-newest','a late receipt response cannot erase a newer discovered completion')
  let attempts=0
  secondDevice.io.markConversationReadRequest=async()=>{
    if(++attempts===1) throw new Error('offline')
    return {data:{ownerKey:'owner',completedRunId:'run-D',unread:false}}
  }
  await secondDevice.runtime.markConversationRead('retry-read','run-D')
  await secondDevice.tick(5000)
  assert.equal(attempts,2,'an interrupted read receipt retries on the next foreground sync')
  const foreignRead=deferred()
  secondDevice.io.markConversationReadRequest=()=>foreignRead.promise
  secondDevice.runtime.markConversationRead('old-owner','old-run')
  secondDevice.runtime.reset()
  foreignRead.resolve({data:{ownerKey:'owner',completedRunId:'old-run',unread:true}});await settle()
  assert.equal(secondDevice.store.hasUnreadConversations,false,'late receipt responses cannot repopulate a reset account')
  console.log('chatRuntime: lifecycle, server unread, cross-device reads, restart, stale receipts and retries passed')
}
check().catch(error=>{console.error(error);process.exitCode=1})
