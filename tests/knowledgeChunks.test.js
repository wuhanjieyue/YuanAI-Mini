const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const i18n = require('../static_utils/i18n')
const read = path => fs.readFileSync(require.resolve('../' + path), 'utf8')
const store = { assetCacheEpoch: 1, applicationSettings: { language: '中文' } }
const navigations = [], parsed = [], requests = []
let listReply, detailReply
const api = {
  listKnowledgeChunks: (id, options) => { requests.push({ id, ...options }); return listReply() },
  getKnowledgeChunk: (id, chunkId, revision) => { requests.push({ id, chunkId, revision }); return detailReply() }
}
function pageAt(path) {
  let definition
  vm.runInNewContext(read(path), {
    Page: value => { definition = value },
    wx: { navigateTo: options => navigations.push(options), navigateBack() {} },
    require: name => name.endsWith('themeBinding') ? { bindPageTheme() {}, unbindPageTheme() {}, syncThemeNavigation() {} }
      : name.endsWith('i18n/index') ? i18n : name.endsWith('store/index') ? { store }
        : name.endsWith('request/knowledge') ? api
          : name.endsWith('towxmlstream/index') ? { static: (content, type) => { parsed.push({ content, type }); return { content } } } : {}
  })
  return { ...definition, data: { ...definition.data, effectiveTheme: 'light' },
    setData(patch) { Object.assign(this.data, patch) } }
}
const tick = () => new Promise(setImmediate)
const doc = { id: 'kd_one', name: '制度.pdf', revision: 3 }
;(async () => {
  listReply = async () => ({ document: doc, items: [{ id: 'map_one', heading: '章'.repeat(100), preview: '真实分块正文'.repeat(30), rank: 0 },
    { id: 'map_two', heading: '', rank: 1 }], hasMore: true, nextCursor: 'next' })
  const list = pageAt('mdPackage/pages/knowledgeChunks/index.js')
  list.onLoad({ id: doc.id }); await tick()
  assert.equal(list.data.items.length, 2)
  assert.match(list.data.items[0].title, /^真实分块正文/)
  assert.equal(list.data.items[1].title, '分块 2')
  assert.equal(list.data.title, doc.name)
  list.openChunk({ currentTarget: { dataset: { id: 'map_one' } } })
  list.openChunk({ currentTarget: { dataset: { id: 'map_two' } } })
  assert.equal(navigations.length, 1)
  assert.equal(navigations[0].routeType, 'settingRouterBuilder')
  assert.equal(navigations[0].routeOptions.stacked, true, 'same stacked route as Help lifts the chunk list')
  assert.match(navigations[0].url, /documentId=kd_one&id=map_one&revision=3$/)
  navigations[0].complete()
  listReply = async () => ({ document: doc, items: [{ id: 'map_three', heading: '第三块', rank: 2 }], hasMore: false, nextCursor: '' })
  await list.loadChunks()
  assert.equal(requests.at(-1).cursor, 'next')
  assert.equal(list.data.items.length, 3)
  let finish
  listReply = () => new Promise(resolve => { finish = resolve })
  const oldLoad = list.loadChunks(true)
  store.assetCacheEpoch++
  list.onShow()
  finish({ document: doc, items: [{ id: 'secret', heading: 'old account' }], hasMore: false })
  await oldLoad
  assert.equal(list.data.items.length, 0, 'late chunks cannot cross an account switch')
  list.onUnload()

  detailReply = async () => ({ heading: '审批', content: '# 审批\n\n**必须先审批。**' })
  const detail = pageAt('mdPackage/pages/knowledgeChunk/index.js')
  detail.onLoad({ documentId: doc.id, id: 'map_one', revision: '3' }); await tick()
  assert.equal(requests.at(-1).revision, 3)
  assert.equal(parsed.at(-1).content, '# 审批\n\n**必须先审批。**')
  assert.equal(parsed.at(-1).type, 'markdown')
  detailReply = async () => { throw Error('分块版本已更新，请重新打开列表') }
  await detail.loadChunk()
  assert.equal(detail.data.failed, true)
  assert.match(detail.data.error, /分块版本已更新/)
  detailReply = () => new Promise(resolve => { finish = resolve })
  const lateDetail = detail.loadChunk()
  detail.onUnload()
  const previous = parsed.length
  finish({ heading: 'closed', content: 'must not render' }); await lateDetail
  assert.equal(parsed.length, previous)
  for (const name of ['knowledgeChunks', 'knowledgeChunk']) {
    const wxml = read(`mdPackage/pages/${name}/index.wxml`)
    assert.match(wxml, /associative-container="pop-gesture"/)
    assert.match(wxml, /root-background-color="#ffffff00"/)
    assert.ok(JSON.parse(read('app.json')).subPackages[0].pages.includes(`pages/${name}/index`))
  }
  assert.match(read('mdPackage/pages/knowledgeChunks/index.wxml'), /max-lines="1" overflow="ellipsis"/)
  assert.match(read('mdPackage/pages/knowledgeChunk/index.wxml'), /openTyper="\{\{false\}\}"/)
  console.log('knowledgeChunks: pagination, stacked routes, complete Markdown, retry and lifecycle/account guards passed')
})().catch(error => { console.error(error); process.exitCode = 1 })
