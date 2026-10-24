const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const source = fs.readFileSync('components/_self/yb-chat-view/index.js', 'utf8')
const block = source.slice(source.indexOf('    async regenerate(e){'), source.indexOf('    /**\n     * 输入框组件手动结束对话回调'))
let observer, submitted = 0, reloaded = 0, measure, lastSubmission
const runtime = { epoch:0, setVisibleTurn(){}, submitTurn(key, params){ submitted++; lastSubmission = params }, observe(key, fn){ observer = fn; return () => {} } }
const methods = vm.runInNewContext(`({${block}})`, {
  chatRuntime:runtime, ...require('../static_utils/chatFeature'),
  buildMessageContentParts:require('../static_utils/chatAttachment').buildMessageContentParts,
  THINK:'thinking', IMG:'imging', SEARCH:'searching', STUDY:'studying', wx:{showToast(){}}, t:() => ''
})
function view(session = false){
  const self = {
    ...methods, _sessionTurnSeq:0, _conversationLoadVersion:0, _sessionCompletedChats:[], properties:{},
    data:{currentConversationId:'c',modeId:'chat',sivId:'original-anchor',sessionTurns:[],chats:[
      {role:'assistant',turnId:'newer',content:'newer'},
      {role:'assistant',turnId:'old',content:'old'},
      {role:'user',turnId:'old',messageId:'user-old',content:'question'}
    ]},
    createSelectorQuery(){ return {select(selector){self.selector=selector;return this},boundingClientRect(fn){measure=fn;return this},exec(){}} },
    setData(patch, callback){Object.assign(this.data, patch);callback?.()},
    selectComponent(){return {syncAskStatus(){},reloadResponse(){reloaded++},restoreResponse(){self.restored=true}}},
    tryStartSessionTurn(){}
  }
  if(session){
    self.data.chats=[]
    self.data.sessionTurns=[{turnKey:'latest',turnId:'newer',layoutOwner:true}, {turnKey:'stable',turnId:'old',layoutOwner:false,streamContent:'question'}]
  }
  return self
}
async function check(){
  const skillView=view()
  const skillPart={type:'skill',id:'copywriter',title:'copywriter'}
  Object.assign(skillView.data.chats[2],{contentParts:[skillPart],feature:'',featureLabel:'copywriter'})
  const skillRetry=skillView.regenerate({detail:{turnId:'old',conversationId:'c'}})
  measure({height:200});await skillRetry
  assert.equal(skillView.data.chats.find(message=>message.role==='user').featureLabel,'copywriter')
  assert.equal(skillView.data.sessionTurns[0].featureLabel,'copywriter','plain regeneration keeps the generic Skill tag')
  assert.equal(JSON.stringify(skillView.data.sessionTurns[0].contentParts),JSON.stringify([skillPart]))
  assert.equal(lastSubmission.skillIds,undefined,'regeneration inherits the server selection')
  observer({status:'failed',error:{message:'retry'}})
  for (const [from, fromLabel, to, toLabel] of [
    ['searching', '网页搜索', 'thinking', '深度研究'],
    ['thinking', '深度研究', 'searching', '网页搜索'],
    ['searching', '网页搜索', 'studying', '研究与学习'],
    ['studying', '研究与学习', 'imging', '创建图片'],
    ['imging', '创建图片', '', '']
  ]) {
    for(const session of [false,true]){
      const switched=view(session)
      const original=session ? switched.data.sessionTurns[1] : switched.data.chats[2]
      const attachment={type:'attachment',fileID:'cloud://original',name:'notes.txt'}
      Object.assign(original,{feature:from,featureLabel:fromLabel,contentParts:[{type:'feature',value:from},attachment]})
      const before=structuredClone(switched.data)
      const changed=switched.regenerate({detail:{turnId:'old',conversationId:'c',selectedFeature:to}})
      measure({height:200});await changed
      const turn=switched.data.sessionTurns[0]
      const bubble=session ? turn : switched.data.chats.find(message=>message.role==='user')
      assert.equal(bubble.feature,to)
      assert.equal(bubble.featureLabel,toLabel)
      assert.equal(JSON.stringify(bubble.contentParts),JSON.stringify([...(to ? [{type:'feature',value:to}] : []),attachment]))
      assert.equal(bubble.streamContent ?? bubble.content,'question')
      assert.equal(lastSubmission.feature,to)
      assert.equal(lastSubmission.searching,to === 'searching')
      assert.equal(lastSubmission.thinking,to === 'thinking')
      observer({status:'failed',error:{message:'retry'}})
      assert.deepEqual(switched.data.chats,before.chats,'creation failure restores the original user label')
      assert.deepEqual(switched.data.sessionTurns,before.sessionTurns)
    }
  }
  const initialReloaded = reloaded
  const shared=view()
  shared.data.sessionTurns=[{turnKey:'unrelated',turnId:'newer',layoutOwner:true,streamContent:'different question'}]
  const sharedRetry=shared.regenerate({detail:{turnId:'old',conversationId:'c'}})
  assert.equal(shared.selector,'#history-row-1','a shared history reply must replace its own row')
  measure({height:220});await sharedRetry
  assert.equal(shared.data.chats[0].regenerateTurn.streamContent,'question')
  assert.equal(shared.data.sessionTurns.length,1,'later session rows are removed')
  observer({status:'failed',error:{message:'retry'}})
  const branch=view()
  branch.data.branchOrigin={conversationId:'source',cutoffSeq:1}
  branch.data.chats.splice(1,0,{role:'branchPoint',origin:branch.data.branchOrigin})
  branch.data.chats[2].seq=1
  const branchRetry=branch.regenerate({detail:{turnId:'old',conversationId:'c',seq:1}})
  measure({height:300});await branchRetry
  assert.equal(branch.data.branchOrigin,null)
  assert.ok(!branch.data.chats.some(item => item.role === 'branchPoint'))
  observer({status:'failed',error:{message:'retry'}})
  const missing=view()
  missing.data.chats=missing.data.chats.filter(item => item.turnId !== 'old')
  missing.data.sessionTurns=[{turnKey:'unrelated',turnId:'newer',layoutOwner:true}]
  const beforeMissing=submitted
  await missing.regenerate({detail:{turnId:'old',conversationId:'c'}})
  assert.equal(submitted,beforeMissing,'missing target must not regenerate another turn')
  assert.equal(missing.selector,undefined)
  for(const session of [false,true]){
    const self=view(session), before=structuredClone(self.data)
    const pending=self.regenerate({detail:{turnId:'old',conversationId:'c'}})
    assert.deepEqual(self.data,before,'measurement must precede all layout mutations')
    const count=submitted
    await self.regenerate({detail:{turnId:'old',conversationId:'c'}})
    assert.equal(submitted,count,'double click during measurement cannot submit')
    measure({height:1234});await pending
    const turn=self.data.sessionTurns.find(x=>x.regenerating)
    assert.equal(turn.preservedHeight,0)
    assert.equal(self.data.sivId,'assis-up')
    if(session){
      assert.equal(turn.turnKey,'stable')
      assert.equal(turn.layoutOwner,true)
      assert.equal(self.data.sessionTurns.length,1)
      assert.equal(self.selector,'#turn-row-stable')
    }else{
      assert.equal(self.selector,'#history-row-1')
      assert.deepEqual(self.data.chats.map(x=>x.turnId),before.chats.slice(1).map(x=>x.turnId))
      assert.equal(self.data.chats[0].regenerateTurn.turnKey,turn.turnKey)
      assert.equal(turn.historyInline,true)
      assert.equal(turn.layoutOwner,true)
    }
    observer({status:'failed',error:{message:'retry'}})
    assert.deepEqual(self.data.chats,before.chats)
    assert.deepEqual(self.data.sessionTurns,before.sessionTurns)
    assert.equal(self.data.sivId,'original-anchor')
    if(session) assert.equal(self.restored,true)
  }
  const stale=view(), pending=stale.regenerate({detail:{turnId:'old',conversationId:'c'}})
  stale._conversationLoadVersion++
  const count=submitted
  measure({height:800});await pending
  assert.equal(submitted,count,'late measurement after leaving conversation cannot submit')
  assert.equal(reloaded,initialReloaded + 1)
  const finishBlock=source.slice(source.indexOf('  finish(e){'),source.indexOf('  selectFeature('))
  const finishMethods=vm.runInNewContext(`({${finishBlock}})`, {CHAT_MODE_IDS:{TEMPORARY:'temporary'},chatRuntime:runtime,triggerHaptic(){}})
  const history=view()
  const first=history.regenerate({detail:{turnId:'old',conversationId:'c'}})
  measure({height:1234});await first
  const renderKey=history.data.sessionTurns[0].turnKey
  history.syncSessionCache=()=>{}
  finishMethods.finish.call(history,{detail:{turnKey:renderKey,conversationId:'c',chats:[{role:'assistant',turnId:'replacement',content:'new response'}]}})
  assert.equal(history.data.chats[0].turnId,'replacement','completion updates the original row')
  assert.equal(history.data.chats[0].preservedHeight,0,'regenerated latest row releases old height')
  assert.equal(history._sessionCompletedChats.length,0,'history replacement is not duplicated at the cache front')
  const queued=view(true)
  queued._activeTurnKey='latest'
  queued.data.streamStatus=true
  queued.syncSessionCache=()=>{}
  finishMethods.finish.call(queued,{detail:{turnKey:'stable',conversationId:'c',chats:[
    {role:'assistant',turnId:'old',content:'done'}, {role:'user',turnId:'old',content:'question'}
  ]}})
  assert.equal(queued._activeTurnKey,'latest','较早轮次完成时保留队列中的当前轮次')
  assert.equal(queued.data.streamStatus,true)
  assert.equal(queued._sessionCompletedChats.length,2)
  const repeated=history.regenerate({detail:{turnId:'replacement',conversationId:'c',selectedFeature:'thinking'}})
  measure({height:1234});await repeated
  assert.equal(history.data.sessionTurns[0].turnKey,renderKey,'repeat refresh reuses the inline renderer')
  assert.equal(history.data.chats.find(message=>message.role==='user').featureLabel,'深度研究','repeat refresh finds the shared user by messageId after the assistant turnId changes')
  assert.equal(history.data.chats[0].regenerateTurn.streamContent,'question')
  observer({status:'failed',error:{message:'retry'}})
  assert.equal(history.data.chats[0].content,'new response','repeat failure restores the latest successful response')
  assert.equal(history.data.chats.find(message=>message.role==='user').featureLabel,'','repeat failure restores the previous plugin label')
  const ready=source.slice(source.indexOf('  stramready(e){'),source.indexOf('  streamMounted(e){'))
  const readyMethods=vm.runInNewContext(`({${ready}})`)
  const self=view(true);self.data.sessionTurns[1].regenerating=true
  readyMethods.stramready.call(self,{detail:{turnKey:'stable'}})
  assert.equal(self.data.sivId,'original-anchor','mount handshake cannot scroll a refreshed response')
  const streamSource=fs.readFileSync('mdPackage/components/assisStream/index.js','utf8')
  assert.match(streamSource,/if\(!this\._regenerating\) this\.streamMinHeight\.value = this\._that\.chatHeight\.value/)
  assert.match(streamSource,/if\(crect && !this\._regenerating\) this\._that\.chatHeight\.value/)
  console.log('chatRegenerateLayout: ok')
}
check().catch(error=>{console.error(error);process.exitCode=1})
