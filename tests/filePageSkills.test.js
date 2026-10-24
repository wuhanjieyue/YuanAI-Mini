const assert = require('node:assert/strict')
const fs = require('node:fs'), vm = require('node:vm')
const {createRequire} = require('node:module')
const path = require('node:path')
const source = fs.readFileSync('pages/filePage/index.js','utf8')
const localRequire = createRequire(path.resolve('pages/filePage/index.js'))
const flush = () => new Promise(resolve => setImmediate(resolve))
const baseIds = ['image_generation','deep_research','web_search','study']
const item = id => ({id,title:`技能 ${id}`,titleEn:`Skill ${id}`,description:`Description ${id}`,
  logoUrl:`https://example.test/${id}.png`,installed:true,enabled:true})
const rows = [...baseIds.map(item),item('skillhub_copywriter'),{...item('disabled'),enabled:false}]

function setup(options = {}) {
  const store = {applicationSettings:{language:'中文'},user:{login:true,userId:'user-A'},assetCacheEpoch:0}
  const pending = [], events = [], backs = [], observers = [], media = []
  let definition, unbound = 0
  vm.runInNewContext(source, {
    Page:value=>{definition=value},getApp:()=>({globalData:{su_system:{screenHeight:844},su_menu:{bottom:88}}}),
    require:name=>{
      if(name.includes('themeBinding')) return {bindPageTheme(){},unbindPageTheme(){unbound++},syncThemeNavigation(){}}
      if(name.includes('store/index')) return {store}
      if(name.includes('request/skills')) return {listInstalledSkills:args=>new Promise((resolve,reject)=>pending.push({args,resolve,reject}))}
      if(name==='mobx-miniprogram') return {reaction(read,callback){
        const observer={read,callback,key:read(),active:true};observers.push(observer)
        return ()=>{observer.active=false}
      }}
      return localRequire(name)
    },
    wx:{worklet:{shared:value=>({value}),runOnJS:fn=>fn},nextTick:fn=>fn(),navigateBack:options=>backs.push(options),
      chooseMedia:options=>media.push(options),chooseMessageFile:options=>media.push(options),editImage(){}}
  })
  const page={...definition,data:structuredClone(definition.data),
    setData(patch){Object.assign(this.data,patch)},applyAnimatedStyle(){},
    getOpenerEventChannel:()=>({emit:(name,data)=>events.push({name,data})})}
  page.onLoad(options)
  return {page,store,pending,events,backs,media,observers,get unbound(){return unbound},
    react(){for(const observer of observers){const key=observer.read();if(observer.active && key!==observer.key){observer.key=key;observer.callback(key)}}}}
}

async function main(){
  const h=setup({feature:'thinking'})
  assert.equal(h.page.data.model,'deep_research','legacy feature URLs still highlight the corresponding Skill')
  assert.equal(h.pending.length,1)
  assert.equal(h.pending[0].args,undefined,'installed data is requested once and without pagination/search')
  assert.equal(h.page.data.utilsLoading,true)
  h.page.selectUtil({currentTarget:{dataset:{id:'web_search'}}})
  assert.equal(h.events.length,0)
  h.pending[0].resolve({items:rows});await flush()
  assert.deepEqual(Array.from(h.page.data.utils,row=>row.id),[...baseIds,'skillhub_copywriter'])
  assert.ok(h.page.data.utils.every(row=>row.logoUrl))
  assert.equal(h.page.data.utilsLoading,false)
  const requestCount=h.pending.length
  h.store.applicationSettings.language='English';h.react()
  assert.equal(h.page.data.utils[0].name,rows[0].titleEn)
  assert.equal(h.page.data.utils[4].name,rows[4].titleEn)
  assert.equal(h.pending.length,requestCount,'language switching does not reload or reorder Skills')
  h.page.selectUtil({currentTarget:{dataset:{id:'disabled'}}})
  h.page.selectUtil({currentTarget:{dataset:{id:'not-installed'}}})
  assert.equal(h.events.length,0,'unlisted or disabled IDs cannot be selected')
  h.page.selectUtil({currentTarget:{dataset:{id:'skillhub_copywriter'}}})
  assert.equal(h.events[0].name,'selectFeature')
  assert.equal(h.events[0].data.feature,'')
  assert.equal(h.events[0].data.skill.id,'skillhub_copywriter')
  assert.equal(h.events[0].data.skill.logoUrl,rows[4].logoUrl)
  assert.equal(h.backs.length,1)
  h.page.selectUtil({currentTarget:{dataset:{id:'web_search'}}})
  assert.equal(h.events.length,1,'closing blocks duplicate choices')
  h.page.onUnload()
  assert.ok(h.observers.every(observer=>!observer.active))
  assert.equal(h.unbound,1)

  for(const [index,feature] of ['imging','thinking','searching','studying'].entries()){
    const base=setup({skillId:baseIds[index]})
    base.pending[0].resolve({items:rows});await flush()
    assert.equal(base.page.data.model,baseIds[index])
    base.page.selectUtil({currentTarget:{dataset:{id:baseIds[index]}}})
    assert.equal(base.events[0].data.feature,feature)
    assert.equal(base.events[0].data.skill,undefined,'the four existing modes preserve their execution contract')
    base.page.onUnload()
  }

  const failed=setup()
  failed.pending[0].reject(new Error('offline'));await flush()
  assert.equal(failed.page.data.utilsFailed,true)
  const retry=failed.page.loadEnabledSkills()
  failed.store.applicationSettings.language='English';failed.react()
  failed.pending[1].resolve({items:[rows[4]]});await retry
  assert.equal(failed.page.data.utils[0].name,rows[4].titleEn,'late responses use the current language')
  assert.equal(failed.page.data.utilsFailed,false)
  failed.page.onUnload()

  for(const kind of ['account','unload']){
    const stale=setup()
    if(kind==='account'){
      stale.store.user={login:false,userId:''};stale.store.assetCacheEpoch++;stale.react()
      assert.equal(stale.backs.length,1,'identity changes dismiss the old account picker')
    }else stale.page.onUnload()
    stale.pending[0].resolve({items:rows});await flush()
    assert.equal(stale.page.data.utils.length,0,'old responses cannot repopulate the picker')
    stale.page.selectUtil({currentTarget:{dataset:{id:'skillhub_copywriter'}}})
    assert.equal(stale.events.length,0)
    if(kind==='account') stale.page.onUnload()
  }
  const empty=setup()
  empty.pending[0].resolve({items:[{...rows[4],enabled:false}]});await flush()
  assert.equal(empty.page.data.utils.length,0)
  assert.equal(empty.page.data.utilsLoading,false)
  empty.page.onUnload()
  for(const action of ['camera','photo','file']){
    const picker=setup({action})
    assert.equal(picker.media.length,1,'existing media action URLs still open the native picker')
    picker.page.onUnload();picker.pending[0].resolve({items:[]});await flush()
  }
  const template=fs.readFileSync('pages/filePage/index.wxml','utf8')
  assert.match(template,/<image[^>]+src="\{\{item.logoUrl\}\}"/)
  assert.doesNotMatch(template,/\{\{item.icon\}\}/)
  assert.match(template,/list-item data-id=/,'Skill rows stay direct Skyline list children')
  console.log('filePageSkills: enabled filtering, logo rows, mode/Skill selection, locale, retries and identity gates passed')
}
main().catch(error=>{console.error(error);process.exitCode=1})
