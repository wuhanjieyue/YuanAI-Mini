const {serverNode,serverTrace}=require('./serverPresentation')
const assert = require('node:assert/strict')
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path')
const { createRequire } = require('node:module')
let component
const views=new Map(), requests=[], visible=[], deletions=[], messageStatuses=new Map()
const runtime={epoch:0,acceptOwner(){},saveView(id,state){views.set(id,state)},getView:id=>views.get(id),setVisibleTurn:key=>visible.push(key),restoreConversation(data){return {key:'cloud-'+data.activeTurn.turnId,meta:data.activeTurn,assistant:data.turnMessages[1],user:data.turnMessages[0]}}}
runtime.getPendingTurns=()=>[]
runtime.getRunningKey=()=>''
const readReceipts=[]
runtime.markConversationRead=(id,runId)=>{readReceipts.push({id,runId});delete store.unreadConversations[id]}
const store={modelCatalog:{},workModelSelection:{},unreadConversations:{}}
const requireLocal=createRequire(path.resolve('components/_self/yb-chat-view/index.js'))
vm.runInNewContext(fs.readFileSync('components/_self/yb-chat-view/index.js','utf8').replace(/^import .*\n/gm,''),{
  require:name=>name.endsWith('/filePreview') ? {} : requireLocal(name),Component:value=>{component=value},wx:{worklet:{shared:value=>({value}),timing:value=>value,sequence(){}}},
  store, chatRuntime:runtime,appStaticRoot:'/static',setTimeout,clearTimeout,
  getConversationMessages:args=>new Promise((resolve,reject)=>requests.push({args,resolve,reject})),
  getConversationMessagesStatus:async({conversationId})=>({data:messageStatuses.get(conversationId) || {}}),
  t:()=>'',triggerHaptic(){},rpx2px:(value,width)=>value*width/750,formatFileSize:()=>'',deleteCloudFile:id=>{deletions.push(id);return Promise.resolve()},
})
function create(){
 const input={data:{askText:''},setAskText(text){this.data.askText=text},syncAskStatus(text=this.data.askText,responding){this.responding=responding},finish(){this.responding=false},setPlaceHolder(){},setSmartMode(enabled){this.smartMode=enabled}}
 const self={...component.methods,data:structuredClone(component.data),properties:{language:'中文'},_sessionCompletedChats:[],_activeTurnKey:'',_conversationLoadVersion:0,
   setData(patch,callback){Object.assign(this.data,patch);callback?.()},selectComponent:id=>id==='#chatInput'?input:null,
   triggerEvent(){},dismissReasoningSlider(){},getActiveStreamComponent(){return null},
   getChatMessageCacheEntry(){return null},setChatMessageCacheEntry(){},removeChatRun(){},tryStartSessionTurn(){},input}
 return self
}
const response=(id,status='running')=>({data:{ownerKey:'owner',conversation:{conversationId:id,modeId:'chat',title:id},messages:[],activeTurn:{conversationId:id,turnId:'turn-'+id,runId:'run-'+id,userMessageId:'user-original',assistantMessageId:'assistant-new',status},turnMessages:[{role:'user',messageId:'user-original',turnId:'original-turn',content:'original question'}, {role:'assistant',messageId:'assistant-new',content:'cloud prefix',status,snapshotSeq:3}]}})
async function check(){
 const smart=create()
 assert.equal(smart.data.smartMode,false,'chat keeps smart mode off until the model catalog succeeds')
 smart.systemInfo={screenWidth:375,screenHeight:812}
 smart.inputHeight={value:79}
 smart.leftIconWitdh={value:0}
 smart.applyAnimatedStyle=()=>{}
 smart.initView()
 assert.equal(smart.inputHeight.value,26,'parent initialization keeps the input compact while the catalog is unavailable')
 smart.data.smartMode=true
 smart.initView()
 assert.equal(smart.inputHeight.value,79,'ready smart mode preserves the two-line layout')
 smart.data.smartMode=false
 smart.initView()
 assert.equal(smart.inputHeight.value,26,'disabled smart mode keeps the compact layout')
 smart.syncSmartMode=enabled=>smart.input.setSmartMode(enabled)
 smart.resetChatComposer()
 assert.equal(smart.data.smartMode,false,'new chat cannot enable thinking before catalog readiness')
 smart.data.modelCatalogReady=true
 smart.resetChatComposer()
 assert.equal(smart.data.smartMode,true)
 assert.equal(smart.input.smartMode,true,'new chat resets input layout to smart mode')
 smart.setSmartMode(false)
 assert.equal(smart.data.smartMode,false,'smart mode can still be turned off')
 assert.equal(smart._smartModePreferences.chat,false)
 smart.resetChatComposer()
 assert.equal(smart._smartModePreferences.chat,true,'new chat restores the enabled default')
 const pendingThinking=create()
 pendingThinking._smartModePreferences={chat:true,temporary:false}
 let finishCatalog
 pendingThinking.ensureModelCatalogReady=()=>new Promise(resolve=>{finishCatalog=resolve})
 const enablePending=pendingThinking.setSmartMode(true)
 assert.equal(pendingThinking.data.smartMode,false,'manual enable waits for the catalog request')
 finishCatalog(false)
 await enablePending
 assert.equal(pendingThinking.data.smartMode,false,'failed catalog request leaves thinking off')
 assert.equal(pendingThinking._smartModePreferences.chat,true,'loading failure preserves the default preference')
 const enableRetry=pendingThinking.setSmartMode(true)
 pendingThinking.data.modelCatalog=JSON.parse(fs.readFileSync('tests/fixtures/backend-contracts/model_catalog.json','utf8'))
 pendingThinking.data.modelCatalog.accessPlan='user'
 pendingThinking.syncModelCatalogState()
 assert.equal(pendingThinking.data.smartMode,true,'successful catalog restores the chat preference')
 assert.equal(pendingThinking.data.reasoningEffortId,'medium','fresh defaults select medium')
 finishCatalog(true)
 await enableRetry
 await pendingThinking.setSmartMode(false)
 pendingThinking.syncModelCatalogState()
 assert.equal(pendingThinking.data.smartMode,false,'later catalog synchronization preserves manual off')
 pendingThinking.data.modelCatalog={}
 pendingThinking.syncModelCatalogState()
 pendingThinking.resetChatComposer()
 assert.equal(pendingThinking.data.smartMode,false,'reset remains off when the catalog is unavailable')
 const switchedThinking=create()
 switchedThinking.ensureModelCatalogReady=()=>new Promise(resolve=>{finishCatalog=resolve})
 const enableBeforeModeSwitch=switchedThinking.setSmartMode(true)
 switchedThinking.data.modeId='temporary'
 switchedThinking.data.modelCatalogReady=true
 finishCatalog(true)
 await enableBeforeModeSwitch
 assert.equal(switchedThinking.data.smartMode,false,'a late enable cannot turn on thinking in a different mode')
 const voice=create(), voiceCompletions=[]
 voice.input.finishVoiceSend=(version,focus)=>voiceCompletions.push({version,focus})
 voice.input.cancelVoice=()=>{voice.cancelledRecording=true}
 voice.cancelVoice();assert.equal(voice.cancelledRecording,true,'left control cancels recording or transcription')
 let finishVoiceSubmit
 voice.startChat=()=>new Promise(resolve=>{finishVoiceSubmit=resolve})
 const directSend=voice.sendTranscription({detail:{askText:'听写',voiceVersion:7,keyHeight:36}})
 assert.equal(voiceCompletions.length,0,'keep loading while message submission is pending')
 finishVoiceSubmit();await directSend
 assert.deepEqual(voiceCompletions,[{version:7,focus:true}])
 voice.startChat=async()=>{}
 await voice.sendTranscription({detail:{askText:'被拦截的听写',voiceVersion:8,keyHeight:36}})
 assert.equal(voiceCompletions.at(-1).version,8,'early rejected send also unlocks its own transcription')
 const failedPopup=create(), restoredTitles=[]
 failedPopup.blurChatInput=()=>{}
 const titleTrigger={closeFeatures:()=>restoredTitles.push('restore')}
 let popupResult=Promise.resolve(false)
 failedPopup.selectComponent=id=>id==='#titleNav'?titleTrigger:id==='#featurePopup'?{show:()=>popupResult}:null
 await failedPopup.showFeaturePopup('mode',{left:40,top:40,width:80,height:32})
 assert.equal(restoredTitles.length,1,'failed flyout open restores the external mode title')
 let resolveOldPopup
 popupResult=new Promise(resolve=>{resolveOldPopup=resolve})
 const oldPopup=failedPopup.showFeaturePopup('mode',{})
 failedPopup.handleFeaturePopupClose({detail:{type:'mode'}})
 popupResult=Promise.resolve(true)
 await failedPopup.showFeaturePopup('mode',{})
 resolveOldPopup(false);await oldPopup
 assert.equal(restoredTitles.length,2,'an older canceled open cannot restore the title under a newer menu')
 const botPicker=create()
 botPicker.data.modeId='work'
 botPicker.systemInfo={screenWidth:375}
 for(const name of ['modelSummaryWidth','modelSummarySca','modelSummaryOpa','modelSummaryTra']) botPicker[name]={value:1}
 botPicker.ensureModelCatalogReady=async()=>true
 botPicker.closeFeaturePopup=()=>{}
 botPicker.createSelectorQuery=()=>({select(){return this},boundingClientRect(){return this},
   exec(callback){callback([{left:220,top:700,width:110,height:32},{left:0,top:0,width:375,height:800}])}})
 let resolvePicker, pickerShows=0
 botPicker.selectComponent=()=>({show:()=>{pickerShows++;return new Promise(resolve=>{resolvePicker=resolve})}})
 for(let i=0;i<3;i++) {
   resolvePicker=null
   const opening=botPicker.showModels()
   botPicker.showModels()
   await new Promise(setImmediate)
   assert.equal(typeof resolvePicker,'function','model popup open registers its completion callback')
   assert.equal(botPicker.modelSummaryOpa.value,0)
   botPicker.showModelSummary()
   assert.equal(botPicker.modelSummaryOpa.value,0,'other layout synchronization cannot reveal an open picker trigger')
   resolvePicker(true);await opening
   botPicker.closeModels()
   assert.equal(botPicker.modelSummaryOpa.value,1)
 }
 assert.equal(pickerShows,3,'rapid model taps cannot enqueue duplicate pickers')
 botPicker.selectComponent=()=>({show:async()=>false})
 await botPicker.showModels()
 assert.equal(botPicker.data.modelPickerOpen,false)
 assert.equal(botPicker.modelSummaryOpa.value,1,'failed model popup open restores the Bot summary')
 const bot=create();bot.data.modeId='work';bot.input.data.askText='保留草稿'
 await bot.startChat({detail:{askText:'禁止发送'}})
 assert.equal(bot.data.sessionTurns.length,0,'Yuan Bot cannot enqueue a new message')
 assert.equal(bot._startingChat,undefined,'Yuan Bot rejects sends before preparation')
 assert.equal(bot.input.data.askText,'保留草稿')
 const returning=create();returning._queueGroup='uploading'
 runtime.getRunningKey=id=>id==='uploading'?'pending-photo':''
 component.pageLifetimes.hide.call(returning)
 assert.equal(visible.at(-1),undefined)
 component.pageLifetimes.show.call(returning)
 assert.equal(visible.at(-1),'pending-photo','page return restores the pending upload before its cloud turn exists')
 runtime.getRunningKey=()=>''
 const titleView=create();titleView.data.currentConversationId='title-A'
 titleView.data.pinnedChatHistory={conversations:[{conversationId:'title-A',title:'分析后的标题'}]}
 component.observers['chatHistory, pinnedChatHistory'].call(titleView)
 assert.equal(titleView.data.currentConversationTitle,'分析后的标题')
 titleView.data.currentConversationId='title-B'
 component.observers['chatHistory, pinnedChatHistory'].call(titleView)
 assert.equal(titleView.data.currentConversationTitle,'分析后的标题','unrelated cache updates do not replace current title')
 const view=create();view.data.currentConversationId='A';view.data.files=[{draftId:'file',fileID:'cloud://f'}];view.input.data.askText='A draft';view._scrollTop=222
 const b=view.loadConversation('B');const a=view.loadConversation('A')
 requests[0].resolve(response('B'));await b
 assert.equal(view.data.currentConversationId,'A','late B history cannot replace selected A')
 requests[1].resolve(response('A'));await a
 assert.equal(view.data.sessionTurns[0].streamContent,'original question','regeneration restores by userMessageId rather than the new turnId')
 assert.equal(view.input.responding,true,'restored active run makes the composer show Stop')
 assert.equal(view.input.data.askText,'A draft');assert.equal(view.data.files[0].fileID,'cloud://f');assert.equal(view.data.restoreScrollTop,222)
 const old=view.loadConversation('C');runtime.epoch++
 requests[2].resolve(response('C'));await old
 assert.notEqual(view.data.currentConversationTitle,'C','old account result cannot paint the view')
 const unreadView=create()
 store.unreadConversations['read-after-load']='run-read'
 const openingUnread=unreadView.loadConversation('read-after-load')
 assert.equal(store.unreadConversations['read-after-load'],'run-read','clicking a row does not acknowledge content before it loads')
 requests.at(-1).resolve({data:{ownerKey:'owner',conversation:{conversationId:'read-after-load',completedRunId:'run-read'},
   messages:[{role:'assistant',messageId:'read-answer',runId:'run-read',status:'completed',content:'done'}]}})
 await openingUnread
 assert.equal(store.unreadConversations['read-after-load'],undefined,'a successfully displayed response is acknowledged')
 assert.equal(readReceipts.at(-1).runId,'run-read','read receipts identify the response actually displayed')
 const cachedRead=create()
 const cachedAnswer={role:'assistant',messageId:'cached-answer',status:'completed',runId:'run-cached',content:'cached'}
 cachedRead.getChatMessageCacheEntry=()=>({conversation:{conversationId:'cached-read'},messageVersion:'same',chats:[cachedAnswer]})
 messageStatuses.set('cached-read',{ownerKey:'owner',messageVersion:'same',conversation:{completedRunId:'run-cached'}})
 store.unreadConversations['cached-read']='run-cached'
 const cachedOpening=cachedRead.loadConversation('cached-read')
 cachedRead.input.setAskText('校验期间输入的草稿')
 await cachedOpening
 assert.equal(cachedRead.input.data.askText,'校验期间输入的草稿')
 assert.equal(store.unreadConversations['cached-read'],undefined,'a validated cached response sends the same run-fenced receipt')
 const racedRead=create()
 racedRead.getChatMessageCacheEntry=()=>({conversation:{conversationId:'raced-read'},messageVersion:'raced',chats:[cachedAnswer]})
 messageStatuses.set('raced-read',{ownerKey:'owner',messageVersion:'raced',conversation:{completedRunId:'run-new'}})
 store.unreadConversations['raced-read']='run-new'
 const receiptCount=readReceipts.length
 const repairingRead=racedRead.loadConversation('raced-read')
 await new Promise(setImmediate)
 assert.equal(requests.at(-1).args.conversationId,'raced-read','matching versions still reload if the newest completed response is absent from the cache')
 assert.equal(readReceipts.length,receiptCount,'a mismatched completed-run marker cannot acknowledge an unseen reply')
 requests.at(-1).resolve({data:{ownerKey:'owner',conversation:{conversationId:'raced-read',completedRunId:'run-new'},
   messages:[{...cachedAnswer,runId:'run-new',content:'new'}]}})
 await repairingRead
 assert.equal(store.unreadConversations['raced-read'],undefined)
 const staleCache=create()
 staleCache.getChatMessageCacheEntry=()=>({conversation:{conversationId:'stale-unread'},messageVersion:'old',chats:[]})
 store.unreadConversations['stale-unread']='run-stale'
 const failedOpen=staleCache.loadConversation('stale-unread')
 assert.equal(store.unreadConversations['stale-unread'],'run-stale','an old cache cannot clear an unread reply')
 await new Promise(setImmediate)
 assert.equal(requests.at(-1).args.conversationId,'stale-unread')
 staleCache.input.setAskText('失败前输入的草稿')
 requests.at(-1).reject(new Error('offline'));await failedOpen
 assert.equal(staleCache.input.data.askText,'失败前输入的草稿')
 assert.equal(store.unreadConversations['stale-unread'],'run-stale','a failed refresh preserves unread state')
 const hiddenView=create()
 store.unreadConversations['hidden-result']='run-hidden'
 const hiddenOpen=hiddenView.loadConversation('hidden-result')
 hiddenView.data.pageHidden=true
 requests.at(-1).resolve({data:{ownerKey:'owner',conversation:{conversationId:'hidden-result'},messages:[]}})
 await hiddenOpen
 assert.equal(store.unreadConversations['hidden-result'],'run-hidden','a late response behind another page is not read')
 const hiddenActive=create()
 const hiddenActiveOpen=hiddenActive.loadConversation('hidden-active')
 hiddenActive.data.pageHidden=true
 const hiddenSubscriptions=visible.length
 requests.at(-1).resolve(response('hidden-active'));await hiddenActiveOpen
 assert.equal(visible.length,hiddenSubscriptions,'a hidden history response cannot register its running turn as viewed')
 let reloadUnread
 hiddenView.loadConversation=id=>{reloadUnread=id}
 component.pageLifetimes.show.call(hiddenView)
 assert.equal(reloadUnread,'hidden-result','returning to an unread conversation refreshes its content')
 delete store.unreadConversations['stale-unread'];delete store.unreadConversations['hidden-result']
 const uploads=create();uploads.data.currentConversationId='upload-A'
 uploads.selectComponent=()=>({showFun(){},hideFun(){}})
 let uploadCalls=0
 uploads.uploadSelectedFiles=async files=>{uploadCalls++;return files.map(file=>({...file,fileID:'cloud://uploaded',uploadStatus:'uploaded'}))}
 uploads.addSelectedFiles([{name:'a.txt',path:'/tmp/a.txt',size:10}])
 assert.equal(uploadCalls,0,'choosing a file must not upload it')
 views.set('upload-A',{files:structuredClone(uploads.data.files)})
 uploads._conversationLoadVersion++;uploads.data.currentConversationId='upload-B';uploads.data.files=[{fileID:'cloud://B'}]
 assert.equal(views.get('upload-A').files[0].uploadStatus,'selected','the original draft stays local')
 assert.equal(uploads.data.files[0].fileID,'cloud://B','choosing a file cannot alter another conversation')
 assert.deepEqual(deletions,[],'local draft selection has no cloud cleanup')
 const oldContext=uploads.draftContext();runtime.epoch++
 uploads.updateDraftFiles(oldContext,()=>[])
 assert.equal(uploads.data.files[0].fileID,'cloud://B','old account attachment callbacks are discarded')
 const oversized=create();oversized.data.user={login:true}
 oversized.showUploadFailure=message=>{oversized.notice=message}
 await oversized.startChat({detail:{askText:'分析附件',files:[{name:'large.jpg',size:20*1024*1024+1}]}})
 assert.match(oversized.notice,/20 MB/,'direct sends use the same per-file size guard as selection')
 assert.equal(oversized._startingChat,false)
 assert.equal(oversized.data.sessionTurns.length,0,'oversized attachments never enter the send queue')
 const fileHistory=create()
 const historyLoading=fileHistory.loadConversation('file-history')
 const delivered={type:'attachment',fileID:'cloud://owned/report.md',assetId:'file_owned',name:'report.md',extension:'md',size:12}
 requests.at(-1).resolve({data:{...response('file-history','completed').data,
   activeTurn:null,turnMessages:[],messages:[{role:'assistant',messageId:'a-file',status:'completed',content:'Saved',contentParts:[delivered]}]}})
 await historyLoading
 assert.equal(fileHistory.data.chats[0].attachments[0].assetId,'file_owned','assistant history keeps owned file attachments')
 const partialHistory=create()
 const partialLoading=partialHistory.loadConversation('partial-history')
 requests.at(-1).resolve({data:{...response('partial-history','failed').data,activeTurn:null,turnMessages:[],
   messages:['failed','cancelled'].map((status,index)=>({role:'assistant',messageId:'partial-'+index,status,
     content:'旧的存档正文',displayContent:'最新主请求可见正文'+index,displayModelRequestId:'main-'+index}))}})
 await partialLoading
 for(const item of partialHistory.data.chats){
   assert.equal(item.content,item.status==='cancelled' ? '旧的存档正文' : '最新主请求可见正文0',
     'legacy cancelled history keeps its archived answer while failed history keeps the latest display projection')
   assert.match(item.displayModelRequestId,/^main-/)
 }
 const summary='先查资料，再核对结果。'
 const historySegment=(request,content,purpose='commentary',extra={})=>({
   runId:'history-run',modelRequestId:request,parentCallId:'',messageId:'body-'+request,
   purpose,content,ended:true,...extra})
 const historyTrace=[{id:'exec-M1',callId:'exec-M1',name:'exec',runId:'history-run',
   modelRequestId:'M1',parentCallId:'',kind:'tool',title:'正在使用网页搜索',status:'cancelled',public:{toolNames:['web_search']}}]
 const summaryMessage=(status,purpose='commentary')=>({role:'assistant',messageId:'summary-'+status,status,
   content:summary,displayContent:summary,runId:'history-run',processDurationMs:2300,
   textSegments:[historySegment('M1',summary,purpose)],processTrace:serverTrace([...structuredClone(historyTrace),{id:'body-M1',runId:'history-run',modelRequestId:'M1',parentCallId:'',stage:'public_commentary',status:'completed',responseContent:summary}])})
 const historyAnswer=message=>create().createConversationSnapshot({messages:[message]}).chats[0]
 for(const status of ['cancelled','cancelling']){
   for(const purpose of ['commentary','pending']){
     const original=summaryMessage(status,purpose), before=JSON.stringify(original)
     const answer=historyAnswer(original)
     assert.equal(answer.content,'','stopped history must not promote a confirmed or pending summary into an answer')
     assert.equal(answer.displayContent,'','a stale stopped display projection must not restore a summary as Markdown')
     assert.ok(answer.processTrace.some(node=>node.stage==='public_commentary' && node.responseContent===summary),
       'the stopped summary remains available in the process details')
     assert.equal(JSON.stringify(original),before,'normalizing stopped history leaves its source message unchanged')
   }
 }
 const partialMarkdown='## 部分回答😀\n\n已确认 **信息**。'
 const stoppedCompleted=historyAnswer({role:'assistant',messageId:'completed-stop',status:'completed',
   content:partialMarkdown,displayStop:{contentLength:partialMarkdown.length,processDurationMs:2300},processDurationMs:2300})
 assert.equal(stoppedCompleted.status,'cancelled','a display stop does not require reopening completed backend execution')
 assert.equal(stoppedCompleted.content,partialMarkdown)
 assert.equal(stoppedCompleted.thinkDurationText,'2秒')
 const persistedStop=response('persisted-stop','cancelling').data
 persistedStop.turnMessages[1]={...persistedStop.turnMessages[1],content:partialMarkdown,
   processDurationMs:2300,displayStop:{contentLength:partialMarkdown.length,processDurationMs:2300}}
 const stoppedActive=create().createConversationSnapshot(persistedStop)
 assert.equal(stoppedActive.activeTurn,null,'reopening during worker cleanup cannot mount a new printing response')
 assert.equal(stoppedActive.chats[0].content,partialMarkdown)
 assert.equal(stoppedActive.chats[0].status,'cancelled')
 const finalMessage={...summaryMessage('cancelled'),textSegments:[historySegment('M1',summary),
   historySegment('M2','## 部分回答😀\n\n','final',{messageId:'final-1',ended:false}),
   historySegment('M2','已确认 **信息**。','final',{messageId:'final-2',ended:false}),
   historySegment('CHILD','工具内部正文','final',{parentCallId:'exec-M1'}),
   historySegment('M3','下一轮未确认正文','pending')]}
 for(const status of ['cancelled','cancelling']){
   const answer=historyAnswer({...finalMessage,status})
   assert.equal(answer.content,partialMarkdown,'stopped history concatenates only confirmed main final items, including partial Markdown')
   assert.equal(answer.displayContent,partialMarkdown)
   assert.ok(answer.processTrace.some(node=>node.stage==='public_commentary' && node.responseContent===summary))
 }
 for(const status of ['running','completed']){
   const answer=historyAnswer({...finalMessage,status,displayContent:'仍按现有显示投影'})
   assert.equal(answer.content,'仍按现有显示投影','running and completed history keep their existing display-content rule')
 }
 const bufferedFinal={...summaryMessage('cancelled'),textSegments:[historySegment('M2','正式回答完整缓冲','final')]}
 for(const status of ['cancelled','cancelling']){
   for(const content of ['正式回答','']){
     const answer=historyAnswer({...bufferedFinal,status,content,displayContent:'正式回答完整缓冲'})
     assert.equal(answer.content,content,'stopped history honors the displayed final-prefix cutoff instead of exposing buffered text')
     assert.equal(answer.displayContent,content)
   }
 }
 for(const textSegments of [undefined,[]]){
   const answer=historyAnswer({role:'assistant',status:'cancelled',content:'旧正式正文',displayContent:'旧摘要',textSegments})
   assert.equal(answer.content,'旧正式正文','legacy stopped answers without segments remain compatible')
 }
 const cachedStopped=create()
 const cachedSnapshot={conversation:{conversationId:'cached-stopped',modeId:'chat',title:'停止历史'},
   messageVersion:'same-version',chats:[
     {...summaryMessage('cancelled'),localTurnKey:'local-stop',measuredHeight:128,branchContext:{cutoffSeq:3},thinkContent:'缓存的完整思考'},
     {...summaryMessage('cancelling','pending'),localTurnKey:'local-pending'},
     {...finalMessage,localTurnKey:'local-final'},
     {role:'assistant',status:'cancelled',content:'旧正式正文',displayContent:'旧摘要',localTurnKey:'legacy'},
     {...bufferedFinal,content:'正式回答',displayContent:'正式回答完整缓冲'},
     {...bufferedFinal,content:'',displayContent:'正式回答完整缓冲'}
   ]}
 const originalCache=JSON.stringify(cachedSnapshot)
 cachedStopped.applyConversationSnapshot('cached-stopped',{...cachedSnapshot, conversation:{...cachedSnapshot.conversation,isScheduledTask:true}})
 assert.equal(cachedStopped.data.isScheduledTask,true)
 assert.equal(cachedStopped.data.modeId,'chat')
 cachedStopped.applyConversationSnapshot('cached-stopped',cachedSnapshot)
 assert.equal(cachedStopped.data.isScheduledTask,false)
 assert.deepEqual(Array.from(cachedStopped.data.chats,item=>item.content),['','',partialMarkdown,'旧正式正文','正式回答',''],
   'the actual cache restore entry repairs stopped summaries even when the cached version is unchanged or offline')
 assert.equal(cachedStopped.data.chats[0].displayContent,'')
 assert.equal(cachedStopped.data.chats[0].localTurnKey,'local-stop')
 assert.equal(cachedStopped.data.chats[0].measuredHeight,128)
 assert.equal(cachedStopped.data.chats[0].thinkContent,'缓存的完整思考','cache repair retains its existing reasoning details')
 assert.equal(cachedStopped.data.chats[0].branchContext.cutoffSeq,3,
   'cache repair preserves local identity, layout and branch fields')
 assert.ok(cachedStopped.data.chats[0].processTrace.some(node=>node.stage==='public_commentary' && node.responseContent===summary))
 assert.equal(JSON.stringify(cachedSnapshot),originalCache,'cache repair never mutates the stored snapshot')
 const noTokenMessage={role:'assistant',messageId:'no-token',status:'completed',content:'',textSegments:[],processTrace:[],
   modelRequests:[{modelRequestId:'main-no-token',parentCallId:'',status:'completed',presentation:serverNode({stage:'main_reasoning',status:'completed'}).presentation},
     {modelRequestId:'child-no-token',parentCallId:'tool',status:'completed'}]}
 const noTokenHistory=create().createConversationSnapshot({messages:[noTokenMessage]}).chats[0]
 assert.equal(noTokenHistory.thinkStatus,2,'a real main request without tokens keeps the history details entry')
 assert.deepEqual(noTokenHistory.processTrace.map(node=>node.modelRequestId),['main-no-token'])
 assert.deepEqual(noTokenMessage.processTrace,[],'history display projection does not mutate the cloud message')
 const stoppedView=create(), stopEvents=[], stopCaches=[]
 const stoppedMessages=[
   {role:'assistant',localTurnKey:'stopped',status:'cancelled',content:'冻结的可见正文',processDurationMs:2300,
     processTrace:[{id:'stopped-thought',stage:'main_reasoning',status:'cancelled',responseContent:'冻结的思考'}]},
   {role:'user',localTurnKey:'stopped',content:'停止这轮',contentParts:[]}
 ]
 stoppedView.data.currentConversationId='stop-conversation'
 stoppedView.data.sessionTurns=[{turnKey:'stopped',runtimeKey:'runtime-stopped',streamContent:'停止这轮',
   status:'cancelled',content:'冻结的可见正文',processDurationMs:2300},
   {turnKey:'older',turnId:'older-turn',assistantMessageId:'older-answer',streamContent:'旧问题'}]
 stoppedView._activeTurnKey='stopped';stoppedView._activeRuntimeTurnKey='runtime-stopped'
 stoppedView.data.streamStatus=true;stoppedView.input.responding=true
 stoppedView.setChatMessageCacheEntry=entry=>stopCaches.push(structuredClone(entry))
 stoppedView.input.finish=function(){stopEvents.push('input.finish');this.responding=false}
 const stoppedChild={stopped:false,stopDisplay(){
   stopEvents.push('child.stopDisplay');this.stopped=true
   stoppedView.finish({detail:{turnKey:'stopped',conversationId:'stop-conversation',chats:stoppedMessages}})
   return {contentLength:stoppedMessages[0].content.length,processDurationMs:2300}
 }}
 stoppedView.selectComponent=id=>id==='#chatInput' ? stoppedView.input : id==='#assis-stream-stopped' ? stoppedChild : null
 let resolveCancellation, cancellationFinished=false
 runtime.getRunningKey=()=> 'runtime-stopped'
 runtime.cancelTurn=(key,receipt)=>{
   assert.equal(receipt.contentLength,stoppedMessages[0].content.length)
   assert.equal(receipt.processDurationMs,2300)
   stopEvents.push('cancelTurn:'+key)
   return new Promise(resolve=>{resolveCancellation=resolve})
 }
 const cancellation=stoppedView.endStream().then(()=>{cancellationFinished=true})
 assert.equal(stoppedChild.stopped,true,'Stop freezes the visible child before a cancellation response arrives')
 assert.equal(stoppedView.input.responding,false,'Stop immediately finishes the composer')
 assert.equal(stoppedView.data.streamStatus,false,'Stop immediately releases the parent stream gate')
 assert.equal(stoppedView.data.sessionTurns.find(turn=>turn.turnKey==='stopped').stopped,true,
   'the parent remembers Stop even if the stream has not mounted yet')
 assert.ok(stopEvents.indexOf('child.stopDisplay') < stopEvents.indexOf('input.finish'))
 assert.ok(stopEvents.includes('cancelTurn:runtime-stopped'),'the cancellation request still uses the captured running key')
 await Promise.resolve()
 assert.equal(cancellationFinished,false,'local Stop completion does not depend on the deferred transport acknowledgement')
 assert.equal(JSON.stringify(stoppedView._sessionCompletedChats),JSON.stringify(stoppedMessages),
   'a cancelled turn without server IDs is retained under its local turn key')
 assert.equal(JSON.stringify(stopCaches.at(-1).chats),JSON.stringify(stoppedMessages),
   'the stopped visible response is cached before the create/cancel response returns')
 stoppedView._activeTurnKey='new-live';stoppedView._activeRuntimeTurnKey='runtime-new-live'
 stoppedView.data.sessionTurns.unshift({turnKey:'new-live',runtimeKey:'runtime-new-live',streamContent:'新问题'})
 stoppedView.data.streamStatus=true;stoppedView.input.responding=true;stoppedView.input.data.askText='新的草稿'
 const inputFinishes=stopEvents.filter(event=>event==='input.finish').length
 stoppedView.conversationReady({detail:{turnKey:'stopped',conversationId:'stop-conversation',
   turnId:'server-stopped-turn',runId:'server-stopped-run',assistantMessageId:'server-stopped-answer',userMessageId:'server-stopped-question'}})
 const savedAnswer=stoppedView._sessionCompletedChats.find(message=>message.role==='assistant')
 const savedQuestion=stoppedView._sessionCompletedChats.find(message=>message.role==='user')
 assert.equal(savedAnswer.turnId,'server-stopped-turn');assert.equal(savedAnswer.messageId,'server-stopped-answer')
 assert.equal(savedAnswer.runId,'server-stopped-run');assert.equal(savedAnswer.conversationId,'stop-conversation')
 assert.equal(savedQuestion.messageId,'server-stopped-question');assert.equal(savedQuestion.localTurnKey,undefined)
 assert.equal(savedAnswer.localTurnKey,undefined)
 assert.equal(savedAnswer.content,stoppedMessages[0].content);assert.equal(savedAnswer.processDurationMs,2300)
 assert.equal(savedAnswer.status,'cancelled');assert.equal(JSON.stringify(savedAnswer.processTrace),JSON.stringify(stoppedMessages[0].processTrace))
 assert.equal(JSON.stringify(stopCaches.at(-1).chats),JSON.stringify(stoppedView._sessionCompletedChats),'late identity adoption updates the cache')
 const stoppedRow=stoppedView.data.sessionTurns.find(turn=>turn.turnKey==='stopped')
 assert.equal(stoppedRow.turnId,'server-stopped-turn');assert.equal(stoppedRow.assistantMessageId,'server-stopped-answer')
 assert.equal(stoppedRow.userMessageId,'server-stopped-question');assert.equal(stoppedRow.content,stoppedMessages[0].content)
 assert.equal(stoppedRow.processDurationMs,2300);assert.equal(stoppedRow.status,'cancelled')
 assert.equal(stoppedView._activeTurnKey,'new-live');assert.equal(stoppedView._activeRuntimeTurnKey,'runtime-new-live')
 assert.equal(stoppedView.data.streamStatus,true);assert.equal(stoppedView.input.responding,true)
 assert.equal(stoppedView.input.data.askText,'新的草稿');assert.equal(stopEvents.filter(event=>event==='input.finish').length,inputFinishes)
 const settledView=JSON.stringify(stoppedView.data), settledMessages=JSON.stringify(stoppedView._sessionCompletedChats), cacheWrites=stopCaches.length
 for(const turnKey of ['older','stranger','stopped']){
   stoppedView.conversationReady({detail:{turnKey,conversationId:'foreign-conversation',turnId:'wrong-turn',
     assistantMessageId:'wrong-answer',userMessageId:'wrong-question'}})
   assert.equal(JSON.stringify(stoppedView.data),settledView,'stale or unrelated metadata cannot rewrite displayed rows')
   assert.equal(JSON.stringify(stoppedView._sessionCompletedChats),settledMessages)
   assert.equal(stopCaches.length,cacheWrites,'stale metadata cannot overwrite the stopped cache')
 }
 resolveCancellation();await cancellation
 assert.equal(stoppedView.data.streamStatus,true,'a late cancellation acknowledgement cannot finish the new active turn')
 assert.equal(stoppedView._activeTurnKey,'new-live');assert.equal(stoppedView.input.responding,true)
 runtime.getRunningKey=()=>'';delete runtime.cancelTurn
 const skillDraft=create(), skillSubmissions=[], skillChip={shown:0,showFun(){this.shown++},hideFun(){}}
 skillDraft.selectComponent=id=>id==='#chatInput'?skillDraft.input:id==='#funList'?skillChip:null
 skillDraft.input.setCopytext=text=>{skillDraft.input.data.askText=text}
 const skill={id:'skillhub_copywriter',title:'文案创作',titleEn:'Copywriter',logoUrl:'https://example.test/skill.png',exampleMessage:'请写一组清晰的产品界面文案。'}
 skillDraft.data.feature='imging'
 skillDraft.input.data.askText='保留已有草稿'
 skillDraft.selectSkill(skill)
 assert.equal(skillDraft.input.data.askText,'保留已有草稿','the enabled-Skill picker sets only the tag')
 skillChip.shown=0
 skillDraft.prefillSkill(skill)
 assert.equal(skillDraft.data.feature,'','Skill selection stays independent of the four feature modes')
 assert.deepEqual({...skillDraft.data.selectedSkill},{id:skill.id,title:skill.title,titleEn:skill.titleEn,logoUrl:skill.logoUrl})
 assert.equal(skillDraft.input.data.askText,skill.exampleMessage)
 assert.equal(skillChip.shown,1)
 skillDraft._sessionTurnSeq=0;skillDraft._queueGroup='skill-trial'
 skillDraft.systemInfo={screenHeight:800};skillDraft.menuRect={bottom:50}
 for(const name of ['chatHeight','pdheight','inputHeight']) skillDraft[name]={value:0}
 skillDraft.input.acceptSend=()=>{}
 skillDraft.sendAllFile=()=>{}
 let readySkill
 skillDraft.ensureModelCatalogReady=()=>new Promise(resolve=>{readySkill=resolve})
 runtime.submitTurn=(key,params)=>skillSubmissions.push(params)
 const skillSending=skillDraft.startChat({detail:{askText:skill.exampleMessage,keyHeight:0,files:[]}})
 skillDraft.closeFun()
 assert.equal(skillDraft.data.selectedSkill,null,'closing the tag removes the next-send selection')
 readySkill(true);await skillSending
 assert.deepEqual(Array.from(skillSubmissions[0].skillIds),[skill.id],'a pending send snapshots explicit Skill IDs before the tag changes')
 assert.equal(skillSubmissions[0].feature,'')
 assert.equal(skillSubmissions[0].featureLabel,skill.title,'explicit Skills use the same sent-message tag as features')
 assert.equal(JSON.stringify(skillSubmissions[0].contentParts),JSON.stringify([{type:'skill',id:skill.id,title:skill.title,titleEn:skill.titleEn}]))
 const skillHistory=skillDraft.createConversationSnapshot({messages:[{role:'user',content:skill.exampleMessage,
   contentParts:skillSubmissions[0].contentParts}],conversation:{conversationId:'skill-history'}})
 assert.equal(skillHistory.chats[0].featureLabel,skill.title,'history restores the label without guessing a feature mode')
 skillDraft.data.chats=skillHistory.chats
 skillDraft._sessionCompletedChats=skillHistory.chats
 skillDraft.syncModelCatalogState=()=>{}
 for(const language of ['English','中文']){
   skillDraft.properties.language=language
   component.observers.language.call(skillDraft,language)
   const expected=language==='English'?skill.titleEn:skill.title
   assert.equal(skillDraft.data.chats[0].featureLabel,expected)
   assert.equal(skillDraft._sessionCompletedChats[0].featureLabel,expected)
   assert.equal(skillDraft.data.sessionTurns[0].featureLabel,expected,'live and completed labels switch without a new request')
   assert.equal(skillDraft.data.sessionTurns[0].skillIds[0],skill.id)
 }
 assert.equal(skillSubmissions[0].askText,skill.exampleMessage)
 skillDraft.prefillSkill(skill)
 skillDraft.resetChatComposer()
 assert.equal(skillDraft.data.selectedSkill,null,'new-chat and account resets clear the Skill draft')
 delete runtime.submitTurn
 const catalogView=create(), catalogSubmissions=[], catalogCancellations=[]
 catalogView._sessionTurnSeq=0;catalogView._queueGroup='preparing-catalog'
 catalogView.systemInfo={screenHeight:800};catalogView.menuRect={bottom:50}
 for(const name of ['chatHeight','pdheight','inputHeight']) catalogView[name]={value:0}
 catalogView.input.acceptSend=function(){this.responding=true}
 catalogView.sendAllFile=()=>{};catalogView.clearSelectedFeature=()=>{}
 let resolveCatalog
 catalogView.ensureModelCatalogReady=()=>new Promise(resolve=>{resolveCatalog=resolve})
 runtime.submitTurn=(...args)=>catalogSubmissions.push(args)
 runtime.cancelTurn=key=>{catalogCancellations.push(key);return Promise.resolve()}
 const waitingCatalog=catalogView.startChat({detail:{askText:'目录准备期间停止',keyHeight:0,files:[]}})
 const preparingKey=catalogView.data.sessionTurns[0].turnKey
 assert.equal(catalogView.data.sessionTurns[0].requestReady,false)
 await catalogView.endStream()
 assert.equal(catalogView.data.sessionTurns[0].stopped,true,'Stop persists before model catalog preparation finishes')
 assert.equal(catalogView.data.streamStatus,false);assert.equal(catalogView.input.responding,false)
 assert.equal(catalogCancellations[0],preparingKey,'Stop still attempts cancellation before a runtime record exists')
 resolveCatalog(true);await waitingCatalog
 assert.equal(catalogSubmissions.length,0,'a late successful model catalog cannot submit a locally stopped turn')
 assert.equal(catalogView._startingChat,false);assert.equal(catalogView._attachmentSending,false)
 const mountEvents=[], mountedChild={
   stopDisplay(){mountEvents.push('stopDisplay')},
   startTurn(turn){mountEvents.push('startTurn');assert.equal(turn.stopped,true);assert.equal(turn.requestReady,true)}
 }
 catalogView.selectComponent=id=>id==='#chatInput' ? catalogView.input : id===`#assis-stream-${preparingKey}` ? mountedChild : null
 catalogView.tryStartSessionTurn=component.methods.tryStartSessionTurn
 catalogView.streamMounted({detail:{turnKey:preparingKey}})
 assert.deepEqual(mountEvents,['stopDisplay'],'a stopped stream mounting before readiness is frozen without starting a response')
 catalogView.data.sessionTurns=catalogView.data.sessionTurns.map(turn=>({...turn,requestReady:true}))
 mountEvents.length=0
 catalogView.streamMounted({detail:{turnKey:preparingKey}})
 assert.deepEqual(mountEvents,['stopDisplay','startTurn'],'a ready stopped stream enters the renderer only after Stop for metadata observation')
 assert.equal(catalogView.data.streamStatus,false);assert.equal(catalogView.input.responding,false)
 assert.equal(catalogSubmissions.length,0,'late mounting cannot resubmit the stopped response')
 delete runtime.submitTurn;delete runtime.cancelTurn
 const reasoning=create(), modelPopups=[], modelSubmissions=[]
 reasoning.data.modelCatalog={...JSON.parse(fs.readFileSync('tests/fixtures/backend-contracts/model_catalog.json','utf8')),accessPlan:'user'}
 reasoning.data.reasoningModelId='yuan-go';reasoning.data.reasoningEffortId='light'
 reasoning.syncModelCatalogState()
 assert.equal(reasoning.data.reasoningEfforts.length,5)
 reasoning.changeModel({detail:{modelId:'yuan-pro',effortId:'light'}})
 assert.equal(reasoning.data.reasoningModelId,'yuan-pro')
 assert.equal(reasoning.data.reasoningEffortId,'light','full picker preserves all available efforts')
 assert.equal(reasoning.data.reasoningProgress,0)
 assert.ok(reasoning.data.reasoningEfforts.every(option=>option.modelId==='yuan-pro'),'picker model switch rebuilds all five slider anchors immediately')
 assert.deepEqual(Array.from(reasoning.data.workModels,model=>model.efforts.length),[5,5])
 for(const model of reasoning.data.workModels){
   for(const [index,effort] of model.efforts.entries()){
     reasoning.changeModel({detail:{modelId:model.id,effortId:effort.id}})
     assert.equal(reasoning.data.reasoningModelId,model.id)
     assert.equal(reasoning.data.reasoningEffortId,effort.id,'every full picker option can be selected')
     assert.ok(reasoning.data.reasoningEfforts.every(option=>option.modelId===model.id))
     assert.equal(reasoning.data.reasoningProgress,index/4,'slider progress exactly matches the picker effort')
     reasoning.syncModelCatalogState()
     assert.equal(reasoning.data.reasoningEffortId,effort.id,'catalog sync preserves the selected model effort')
   }
 }
 reasoning.commitReasoning({detail:{modelId:'yuan-go',effortId:'high'}})
 assert.equal(reasoning.data.reasoningModelId,'yuan-go','same effort on a different model still changes selection')
 assert.equal(reasoning.data.reasoningProgress,.5)
 assert.ok(reasoning.data.reasoningEfforts.every(option=>option.modelId==='yuan-go'))
 reasoning.createSelectorQuery=()=>({select(){return this},boundingClientRect(){return this},
   exec(callback){callback([null,{left:0,top:0,width:375,height:800}])}})
 reasoning.closeFeaturePopup=()=>{}
 reasoning.hideModelSummary=()=>{throw new Error('chat picker must not animate the hidden Yuan Bot summary')}
 reasoning.selectComponent=id=>id==='#chatInput'?reasoning.input:id==='#modelsSelect'?{show:(...args)=>{modelPopups.push(args);return true}}:null
 const modelAnchor={left:80,top:600,width:215,height:36}
 await reasoning.showModels({detail:{anchorRect:modelAnchor,modelId:'yuan-pro',effortId:'ultra-high'}})
 assert.equal(modelPopups.length,1)
 assert.equal(modelPopups[0][0],modelAnchor)
 assert.equal(reasoning.data.modeId,'chat','reuse the picker without switching to Yuan Bot')
 assert.equal(reasoning.data.reasoningEffortId,'ultra-high')
 assert.equal(reasoning.data.reasoningProgress,1)
 assert.equal(reasoning.data.modelPickerOpen,true)
 reasoning.closeModels()
 assert.equal(reasoning.data.modelPickerOpen,false)
 reasoning._sessionTurnSeq=0;reasoning._queueGroup='reasoning-test'
 reasoning.systemInfo={screenHeight:800};reasoning.menuRect={bottom:50}
 for(const name of ['chatHeight','pdheight','inputHeight']) reasoning[name]={value:0}
 reasoning.input.acceptSend=()=>{}
 reasoning.sendAllFile=()=>{};reasoning.clearSelectedFeature=()=>{}
 reasoning.data.smartMode=true
 reasoning.changeModel({detail:{modelId:'yuan-pro',effortId:'medium'}})
 let modelReady
 reasoning.ensureModelCatalogReady=()=>new Promise(resolve=>{modelReady=resolve})
 runtime.submitTurn=(key,params)=>modelSubmissions.push(params)
 const modelSend=reasoning.startChat({detail:{askText:'使用选中的模型',keyHeight:0,files:[]}})
 const modelTurnKey=reasoning.data.sessionTurns[0].turnKey
 reasoning.commitReasoning({detail:{modelId:'yuan-go',effortId:'high'}})
 modelReady(true);await modelSend
 assert.equal(modelSubmissions[0].modelId,'yuan-pro','send snapshots the selected model before async preparation')
 assert.equal(modelSubmissions[0].effortId,'medium','a non-slider effort reaches the request unchanged')
 assert.equal(modelSubmissions[0].modelName,'Yuan-Pro')
 reasoning.ensureModelCatalogReady=async()=>true
 runtime.retryLocalTurn=(key,params)=>{modelSubmissions.push(params);return true}
 await reasoning.retryLocalTurn({detail:{turnKey:modelTurnKey}})
 assert.equal(modelSubmissions[1].modelId,'yuan-pro','local retry keeps the failed turn model, not the current picker')
 assert.equal(modelSubmissions[1].effortId,'medium')
 let uploadedSubmission
 reasoning.ensureModelCatalogReady=()=>new Promise(resolve=>{modelReady=resolve})
 reasoning.resolveTurnFiles=async files=>files.map(file=>({...file,fileID:'uploaded-notes'}))
 runtime.submitTurnWhenReady=(key,turn,ready)=>{uploadedSubmission=ready}
 reasoning.commitReasoning({detail:{modelId:'yuan-pro',effortId:'high'}})
 await reasoning.startChat({detail:{askText:'分析附件',keyHeight:0,files:[{name:'notes.txt',size:10,previewPath:'/tmp/notes.txt'}]}})
 reasoning.commitReasoning({detail:{modelId:'yuan-go',effortId:'light'}})
 modelReady(true)
 assert.equal((await uploadedSubmission).modelId,'yuan-pro','attachment preparation snapshots the model too')
 reasoning.data.modelCatalog.accessPlan='guest'
 reasoning.data.reasoningModelId='yuan-pro';reasoning.data.reasoningEffortId='high'
 reasoning.syncModelCatalogState()
 assert.equal(reasoning.data.reasoningModelId,'yuan-go')
 assert.equal(reasoning.data.reasoningEffortId,'light','account downgrade restores an accessible combination')
 assert.deepEqual(Array.from(reasoning.data.reasoningEfforts,option=>option.locked),[false,true,true,true,true])
 delete runtime.submitTurn;delete runtime.retryLocalTurn;delete runtime.submitTurnWhenReady
 const imagePart={type:'artifact',artifactType:'image',artifactId:'poster',status:'completed',
   width:504,height:896,displayMode:'markdown',url:'https://example.com/poster.png'}
 const retries=[]
 runtime.submitTurn=(key,params)=>retries.push({key,params})
 runtime.observe=()=>()=>{}
 for(const [feature,assistantTurnId,selectedFeature,expected] of [
   ['', 'original-image-turn', undefined, ''],
   ['', 'retried-image-turn', undefined, ''],
   ['imging', 'original-image-turn', undefined, 'imging'],
   ['searching', 'original-image-turn', undefined, 'searching'],
   ['', 'original-image-turn', 'imging', 'imging'],
   ['imging', 'original-image-turn', '', ''],
 ]){
   const imageHistory=create()
   imageHistory.data.currentConversationId='image-history'
   imageHistory._sessionTurnSeq=0
   imageHistory.createSelectorQuery=()=>({select(){return this},boundingClientRect(callback){callback({height:200});return this},exec(){}})
   const snapshot=imageHistory.createConversationSnapshot({conversation:{conversationId:'image-history'},messages:[
     {role:'user',messageId:'image-user',conversationId:'image-history',turnId:'original-image-turn',
       content:'生成海报并整理文件',contentParts:feature ? [{type:'feature',value:feature}] : []},
     {role:'assistant',messageId:'image-answer',conversationId:'image-history',turnId:assistantTurnId,
       status:'completed',feature,content:'![海报](https://example.com/poster.png)',contentParts:[imagePart]},
   ]})
   imageHistory.data.chats=snapshot.chats
   const answer=snapshot.chats.find(message=>message.role==='assistant')
   assert.equal(answer.feature,feature,'generated artifacts never imply an explicitly selected plugin')
   await imageHistory.regenerate({detail:{...answer,...(selectedFeature === undefined ? {} : {selectedFeature})}})
   const retry=imageHistory.data.sessionTurns[0]
   assert.equal(retry.feature,expected,'retry preserves the explicit selection, including a cleared plugin')
   assert.equal(retry.imging,expected === 'imging','only an explicitly selected image plugin can request a retry placeholder')
   assert.equal(retries.at(-1).params.feature,selectedFeature,'plain retries let the backend inherit the original Turn selection')
 }
 delete runtime.submitTurn
 delete runtime.observe
 const recommended=create();recommended.data.recommendationItems=[{id:'0',text:'今天的科技新闻'}];recommended.data.suggest={trendingSearch:true}
 let feature, draft, sent=0
 recommended.selectFeature=(value)=>{feature=value}
 recommended.selectComponent=()=>({setCopytext:text=>{draft=text}})
 recommended.startChat=()=>{sent++}
 recommended.selectRecommendation({detail:{id:'0'}})
 assert.equal(feature,'searching');assert.equal(draft,'今天的科技新闻');assert.equal(sent,0)
 recommended.data.hasInputValue=true;draft='existing'
 recommended.selectRecommendation({detail:{id:'0'}})
 assert.equal(draft,'existing','late click cannot overwrite a new draft')
 console.log('chatViewRecovery: history, regeneration, drafts, immediate Stop, preparation and late identity gates passed')
}
check().catch(error=>{console.error(error);process.exitCode=1})

const detailNavigation={_processDetailNavigation:true,setData(){}}
const subscriptionsBefore=visible.length
component.pageLifetimes.hide.call(detailNavigation)
assert.equal(visible.length,subscriptionsBefore,'opening active tool details retains the same stream and temporary turn')
component.methods.setProcessDetailVisible.call(detailNavigation,false)
component.pageLifetimes.hide.call(detailNavigation)
assert.equal(visible.length,subscriptionsBefore+1,'ordinary page departure keeps its existing lifecycle')
