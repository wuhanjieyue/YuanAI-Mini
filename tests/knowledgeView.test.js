const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const requestModule = { exports:{} }
const membershipRequests = []
vm.runInNewContext(fs.readFileSync(require.resolve('../request/knowledge'), 'utf8').replace(/^import .*$/gm, ''), {
 module:requestModule, require:name => name === '../static_utils/chatSources' ? require('../static_utils/chatSources') : require(name),
 callHttp:async (path, body) => { membershipRequests.push({ path, body }); return { statusCode:200, result:{ code:200, data:{ added:true } } } }
})
const evidenceId = 'kc_' + 'a'.repeat(48)
assert.equal(requestModule.exports.knowledgeCitationId('http://127.0.0.1:9000/knowledge/citations/' + evidenceId), evidenceId)
assert.equal(requestModule.exports.knowledgeCitationId('http://backend.example.test:9000/knowledge/citations/' + evidenceId), evidenceId)
assert.equal(requestModule.exports.knowledgeCitationId('https://bad.test/knowledge/citations/' + evidenceId + '?token=secret'), '')
assert.equal(requestModule.exports.knowledgeCitationId('https://bad.test/not-a-reference'), '')
const { createRequire } = require('node:module')
const file = require.resolve('../components/_self/yb-knowledge-view/index.js')
const template = fs.readFileSync(file.replace('index.js', 'index.wxml'), 'utf8')
assert.match(template, /<view wx:if="\{\{!item\.isImage\}\}" class="knowledge-status text-l1 bg-l0">/)
assert.match(template, /<text wx:if="\{\{item\.status !== 'ready'\}\}">\{\{item\.knowledgeStatus\}\}<\/text>/)
assert.match(template, /\{\{item\.status === 'ready' \? '' : ' · '\}\}\{\{item\.knowledgeDetail\}\}/)
const localRequire = createRequire(file)
const store = { assetCacheEpoch:1 }
const requests = [], events = [], native = [], animations = new Map()
let reply = async () => ({ items:[{ id:'kd_one', assetId:'file_one', fileID:'private/a.pdf', name:'制度.pdf', extension:'pdf', attachmentType:'file', status:'ready', chunkCount:2 }], hasMore:false, nextCursor:'' })
let imported = [], definition
const menu = { open:async () => true, close:() => true }
const behavior = { methods:{ mergeAssetImageState:rows => rows, assetActionsChanged(e) { this.setData({ actionsOpen:e.detail.open }); this.triggerEvent('actionschange', e.detail) } } }
const wx = {
 getWindowInfo:() => ({ windowWidth:375, windowHeight:812, screenHeight:844 }),
 getStorageSync:() => 300, setStorage() {}, hideKeyboard() {}, nextTick:fn => fn(),
 worklet:{ shared:value => ({ value }), timing:value => value, Easing:{ ease:'ease' } },
 chooseMessageFile:options => native.push(['file',options]), chooseMedia:options => native.push(['image',options]),
 showLoading() {}, hideLoading() {}, showToast:options => native.push(['toast',options]),
 navigateTo:options => native.push(['navigate', options])
}
const api = {
 listKnowledge:async options => { requests.push(options); return reply(options) },
 importKnowledge:async ids => { imported.push(Array.from(ids)); return {} }, retryKnowledge:async id => events.push(['retry',id])
}
vm.runInNewContext(fs.readFileSync(file,'utf8').replace(/^import .*$/gm,''), {
 Component:value => { definition=value }, store, wx, clearTimeout() {}, setTimeout:() => 1,
 uploadCloudFiles:async files => files.map((_file,i) => ({ assetId:'uploaded_'+i })),
 require:name => name.endsWith('assetListBehavior') ? behavior : name.endsWith('/knowledge') ? api : localRequire(name)
})
function view() {
 return { ...behavior.methods, ...definition.methods, properties:{ language:'中文' },
 data:{ ...JSON.parse(JSON.stringify(definition.data)), items:[] }, _assetVersion:0, _knowledgeEpoch:store.assetCacheEpoch,
 setData(patch,callback) { Object.assign(this.data,patch); callback?.() },
 triggerEvent:(name,data) => events.push([name,data]), applyAnimatedStyle:(selector,fn) => animations.set(selector,fn),
 selectComponent:() => menu }
}
;(async () => {
 assert.deepEqual(await requestModule.exports.getKnowledgeMembership('file_one'), { added:true })
 assert.equal(membershipRequests[0].path, '/knowledge/membership')
 assert.equal(membershipRequests[0].body.assetId, 'file_one')
 assert.equal(Object.keys(membershipRequests[0].body).join(','), 'assetId')
 const v=view(); definition.lifetimes.attached.call(v)
 await new Promise(resolve => setImmediate(resolve))
 assert.equal(v.data.items[0].assetId,'file_one')
 assert.equal(v.data.items[0].knowledgeStatus,'可检索')
 assert.equal(v.data.categories.map(x => x.name).join('/'),'全部/文件/图片')
 v.openChunks({ currentTarget:{ dataset:{ id:'kd_one' } } })
 assert.equal(native.at(-1)[0], 'navigate')
 assert.equal(native.at(-1)[1].routeType, 'settingRouterBuilder')
 assert.equal(native.at(-1)[1].routeOptions.stacked, true)
 assert.match(native.at(-1)[1].url, /knowledgeChunks\/index\?id=kd_one$/)
 v.openChunks({ currentTarget:{ dataset:{ id:'kd_one' } } })
 assert.equal(native.length, 1, 'double taps cannot open two chunk lists')
 native.pop()[1].complete()
 assert.ok(animations.has('.knowledge-search-row'))
 v.setData({ activeCategory:'image', query:'合同' }); await v.loadAssetPage(true)
 assert.equal(requests.at(-1).category,'image'); assert.equal(requests.at(-1).query,'合同')
 await v.openAddMenu(); v.selectAddAction({ currentTarget:{ dataset:{ action:'file' } } })
 assert.equal(native.length,0,'picker waits for flyout exit')
 v.addMenuClosed(); const picker=native.at(-1)[1]
 assert.equal(native.at(-1)[0],'file'); assert.equal(picker.count,9)
 await picker.success({ tempFiles:[{ path:'/tmp/a.pdf',name:'a.pdf',size:12 }] }); picker.complete()
 assert.deepEqual(imported,[['uploaded_0']])
 await v.retryDocument({ currentTarget:{ dataset:{ id:'kd_one' } } }); assert.ok(events.some(x => x[0]==='retry'))
 let finish
 reply=() => new Promise(resolve => { finish=resolve })
 const delayed=v.loadAssetPage(true)
 store.assetCacheEpoch++
 v.setData({ items:[] })
 finish({ items:[{ id:'old-account',name:'secret.pdf' }],hasMore:false,nextCursor:'' })
 await delayed; assert.equal(v.data.items.length,0,'late data cannot cross accounts')
 reply=async () => { throw Error('service unavailable') }
 await v.loadAssetPage(true); assert.equal(v.data.failed,true)
 definition.lifetimes.detached.call(v)
 assert.equal(fs.existsSync(require.resolve('../components/_self/yb-knowledge-view/index.js').replace('index.js','mockData.js')),false)
 console.log('knowledgeView: real upload/import, filtering, retry, menu timing and account fencing passed')
})().catch(error => { console.error(error); process.exitCode=1 })
