const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const source=fs.readFileSync('request/dailyRecommendations.js','utf8').replace(/^import .*$/gm,'').replace('export const dailyRecommendations','const dailyRecommendations')+'\nthis.client=dailyRecommendations'
const items=Array.from({length:30},(_,id)=>({id:String(id),text:`topic${id}`}))
const day=new Date(Date.now()+8*3600000).toISOString().slice(0,10)
function setup(){
 const calls=[],handlers={}
 const store={suggest:{trendingSearch:true},dailyRecommendationCache:{ownerKey:'',items:[]},recommendationItems:[],
 setDailyRecommendations(value){this.dailyRecommendationCache=value;this.recommendationItems=value.items.slice(0,3)},
 setRecommendationItems(value){this.recommendationItems=value},
 clearDailyRecommendations(){this.dailyRecommendationCache={ownerKey:'',items:[]};this.recommendationItems=[]}}
 const context={store,Promise,Date,Error,CHAT_SESSION_RESET:'reset',eventBus:{on(name,fn){handlers[name]=fn}},
 getDailyRecommendations(start,force){return new Promise((resolve,reject)=>calls.push({start,force,resolve,reject}))}}
 vm.runInNewContext(source,context)
 return {...context,calls,handlers}
}
const tick=()=>new Promise(setImmediate)
const payload=(status='completed',ownerKey='owner')=>({data:{ownerKey,day,generatedDay:status==='completed'?day:'yesterday',status,enabled:true,items}})
async function check(){
 const x=setup();x.client.setForeground(true);x.client.setForeground(true)
 assert.equal(x.calls.length,1,'launch and show share one request')
 x.calls[0].resolve(payload('running'));await tick()
 assert.equal(x.store.recommendationItems.length,3,'cache updates independently of chat visibility')
 assert.equal(x.store.dailyRecommendationCache.items.length,30,'cache keeps the complete recommendation pool')
 assert.equal(x.calls.length,1,'running status does not schedule polling')
 x.client.setForeground(false)
 x.client.setForeground(true);assert.equal(x.calls.length,2)
 x.calls[1].resolve(payload());await tick()
 x.client.setForeground(false);x.client.setForeground(true);assert.equal(x.calls.length,2,'same day completed data skips request')
 x.client.refresh(true);assert.equal(x.calls.length,3);assert.equal(x.calls[2].force,true,'manual refresh bypasses the completed-day shortcut')
 x.calls[2].resolve(payload('running'));await tick()
 const before=x.store.recommendationItems.map(item=>item.id).sort().join(',')
 assert.equal(x.client.shuffle(),true)
 assert.notEqual(x.store.recommendationItems.map(item=>item.id).sort().join(','),before,'local refresh changes the visible sample')
 assert.equal(x.calls.length,3,'local refresh does not start another LLM request')

 const y=setup();y.client.setForeground(true);y.calls[0].resolve(payload('failed'));await tick()
 assert.equal(y.calls.length,1)
 y.client.setForeground(false);y.client.setForeground(true);assert.equal(y.calls.length,2,'retry only on next entry')
 y.handlers.reset({reason:'logout'});y.calls[1].resolve(payload());await tick()
 assert.equal(y.store.recommendationItems.length,0,'late response cannot cross accounts')
 y.store.suggest.trendingSearch=false;y.client.setForeground(true);assert.equal(y.calls.length,2)
 y.store.suggest.trendingSearch=true;y.handlers.dailyRecommendationSettingsSaved();assert.equal(y.calls.length,3)
 y.calls[2].resolve(payload('running','new-owner'));await tick()
 assert.equal(y.store.dailyRecommendationCache.ownerKey,'new-owner')
 assert.equal(y.calls.length,3,'running status is checked only once')
 assert.equal(y.store.recommendationItems.length,3,'transport failure preserves last result')
 const cached=setup();cached.store.user={login:true,userId:'user-one'}
 cached.store.dailyRecommendationCache={accountId:'user-one',ownerKey:'owner',day,items}
 cached.client.setForeground(true);assert.equal(cached.store.recommendationItems.length,3)
 cached.calls[0].reject(Error('offline'));await tick();assert.equal(cached.store.recommendationItems.length,3)
 const other=setup();other.store.user={login:true,userId:'user-two'}
 other.store.dailyRecommendationCache={accountId:'user-one',ownerKey:'owner',day,items}
 other.client.setForeground(true);assert.equal(other.store.recommendationItems.length,0,'cold start never restores another account cache')
 other.calls[0].reject(Error('offline'));await tick()
 console.log('dailyRecommendationClient: single request, cache, local shuffle, account epoch and re-enable passed')
}
check().catch(e=>{console.error(e);process.exitCode=1})
