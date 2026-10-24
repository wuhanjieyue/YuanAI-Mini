const assert = require('assert')
const { collectConversationFiles } = require('../static_utils/conversationFiles')

const file = (id, extra = {}) => ({ type:'attachment', fileID:`cloud://env/${id}`, assetId:id, name:`${id}.pdf`, extension:'pdf', ...extra })
const files = collectConversationFiles([
  { createdAt:'2026-09-26T00:00:00Z', attachments:[file('a'), file('b', { unavailableReason:'storage_deleted' })] },
  { contentParts:[file('a'), file('c', { assetId:'' })] }
])

assert.deepStrictEqual(files.map(item => item.id), ['a'])
assert.strictEqual(files[0].source, 'library')
assert.strictEqual(files[0].origin, 'uploaded')
assert.strictEqual(collectConversationFiles([{ role:'assistant', contentParts:[file('generated')] }])[0].origin, 'generated')
assert.strictEqual(files[0].displayName, 'a.pdf')

const image = (id, extra = {}) => ({
  type:'artifact', artifactType:'image', artifactId:`artifact_${id}`, status:'completed',
  assetId:id, fileID:`owned/images/${id}.png`, name:`${id}.png`, extension:'png',
  url:`https://provider.example/${id}.png`, ...extra
})
const inline = image('inline', { displayMode:'inline' })
const markdown = image('markdown', { displayMode:'markdown' })
const document = file('document', { artifactId:'artifact_document', status:'completed',
  attachmentType:'file', name:'delivery.md', extension:'md' })
const deliveries = collectConversationFiles([
  { attachments:[file('upload')], contentParts:[inline, markdown, document] },
  { attachments:[inline, document], contentParts:[
    { ...inline, artifactId:'artifact_duplicate', assetId:'duplicate-record' }, markdown, document
  ],
    content:'![另一个链接](https://provider.example/unowned.png)' }
])
assert.deepStrictEqual(deliveries.map(item => item.id), ['upload', 'inline', 'markdown', 'document'],
  'both explicit inline and autonomous Markdown deliveries coexist with user uploads and deduplicate by fileID')
for (const id of ['inline', 'markdown']) {
  const item = deliveries.find(file => file.id === id)
  assert.strictEqual(item.attachmentType, 'image')
  assert.strictEqual(item.isImage, true)
  assert.strictEqual(item.source, 'library')
  assert.strictEqual(item.url, '', 'provider URLs never become library preview URLs')
}
assert.strictEqual(deliveries.find(item => item.id === 'document').displayName, 'delivery.md')

const invalid = [
  ...['generating', 'failed', 'unknown', 'deleted', undefined].map(status => ({ status })),
  { unavailableReason:'storage_deleted' },
  ...['', undefined, null, 123].flatMap(value => [{ assetId:value }, { fileID:value }])
]
for (const extra of invalid) {
  assert.deepStrictEqual(collectConversationFiles([{ attachments:[
    { ...document, ...extra },
  ], contentParts:[image('invalid-image', extra)] }]), [],
  `incomplete, deleted or unowned artifacts are excluded: ${JSON.stringify(extra)}`)
}
assert.deepStrictEqual(collectConversationFiles([{ content:'![图片](https://provider.example/unowned.png)' }]), [],
  'Markdown text is not an owned artifact fallback')
console.log('conversation files: uploads, image/document deliveries, deduplication and owned completed artifacts passed')

const fs = require('node:fs')
const vm = require('node:vm')
const store = { assetCacheEpoch:0 }
let definition, metadataCalls = 0, before = [], resolveMetadata
const requests = {
  getConversationMessages: async ({ beforeSeq }) => {
    before.push(beforeSeq)
    return { data:{ messages:[{ contentParts:[image(beforeSeq ? 'second' : 'first')] }],
      hasMore:!beforeSeq, nextCursor:beforeSeq ? '' : 'older' } }
  },
  refreshAssetMetadata: async items => { metadataCalls++; return resolveMetadata(items) }
}
vm.runInNewContext(fs.readFileSync(require.resolve('../pages/conversationFiles/index'), 'utf8'), {
  Page: value => { definition = value },
  wx:{ showToast() {} },
  require: name => name.includes('chatStream') || name.includes('assetCache') ? requests
    : name.includes('store/index') ? { store }
    : name.includes('themeBinding') ? { unbindPageTheme() {} }
    : name.includes('settingRouter') ? {} : require(`../${name.replace('../../', '')}`)
})
;(async () => {
  const page = { ...definition, _context:{ conversationId:'chat', modeId:'chat' },
    data:{ ...definition.data }, setData(patch) { Object.assign(this.data, patch) } }
  resolveMetadata = items => items.map(item => ({ ...item, name:'水彩猫.png', tags:['水彩', 'Cat'] }))
  await page.loadFiles()
  assert.deepStrictEqual(before, [null, 'older'])
  assert.strictEqual(metadataCalls, 1, 'all message pages are collected before one metadata refresh')
  assert.deepStrictEqual(Array.from(page.data.files, item => item.id), ['first', 'second'])
  assert.ok(page.data.files.every(item => item.displayName === '水彩猫.png' && item.tags.includes('Cat')))
  assert.strictEqual(page.data.loading, false)
  resolveMetadata = items => { store.assetCacheEpoch++; return items }
  await page.loadFiles()
  assert.strictEqual(page.data.files.length, 0, 'account changes discard late metadata and snapshots')
  resolveMetadata = items => { page.onUnload(); return items.map(item => ({ ...item, name:'late.png' })) }
  await page.loadFiles()
  assert.ok(page.data.files.every(item => item.name !== 'late.png'), 'unloaded pages reject late metadata')
  console.log('conversation metadata: complete pagination, latest names/tags, account and unload guards passed')
})().catch(error => { console.error(error); process.exitCode = 1 })

let forwarded, closed = 0
const filePage = { getOpenerEventChannel: () => ({ emit(name, detail) { forwarded = { name, detail } } }),
  closePage() { closed++ } }
definition.chatAsset.call(filePage, { detail: { epoch: store.assetCacheEpoch, files:[{ tempFilePath:'/tmp/a.pdf' }] } })
assert.equal(closed, 1)
assert.equal(forwarded.name, 'chatAsset')
definition.chatAsset.call(filePage, { detail: { epoch: store.assetCacheEpoch - 1, files:[] } })
assert.equal(closed, 1, 'old account actions do not close or populate a new chat')
