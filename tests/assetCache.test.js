const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const cache = require('../static_utils/assetListCache')
const { TTL, MAX_BYTES } = cache
let now = Date.now()
const image = id => ({ id, source: 'library', attachmentType: 'image', fileID: `cloud://env/${id}`, title: id,
  url: `https://images.test/${id}`, urlExpiresAt: now + 600000 })
const page = (id, hasMore = true) => ({ items: [image(id)], nextCursor: hasMore ? `after-${id}` : '', hasMore })
const entry = { source: 'library', ownerKey: 'a'.repeat(64), update_time: 1, savedAt: now, pages: [page('first')] }
assert.equal(cache.KEY, 'assetListCache_v2')
const tagged = cache.put({}, 'tagged', { ...entry, pages:[{ ...page('tagged'),
  items:[{ ...image('tagged'), name:'水彩猫.png', favorite:true, tags:['水彩', 'Cat'] }] }] }, now)
assert.equal(cache.normalize(tagged, now).entries.tagged.pages[0].items[0].favorite, true)
assert.deepEqual(cache.normalize(tagged, now).entries.tagged.pages[0].items[0].tags, ['水彩', 'Cat'])
const template = { ...image('sample_retroPortrait'), source: 'templates', supportsImageInput: true }
assert.equal(cache.put({}, 'template', { ...entry, source: 'templates', pages: [{ items: [template], hasMore: false }] }, now)
  .entries.template.pages[0].items[0].supportsImageInput, true)
let cached = cache.put({}, 'one', entry, now)
assert.ok(!JSON.stringify(cached).includes('https://'))
assert.ok(!JSON.stringify(cached).includes('urlExpiresAt'))
assert.equal(cache.normalize(cached, now + TTL - 1).entries.one.pages.length, 1)
assert.equal(cache.normalize(cached, now + TTL).entries.one, undefined)
cached = cache.put({}, 'one', { ...entry, pages: Array.from({ length: 8 }, (_, i) => page(String(i))) }, now)
assert.equal(cached.entries.one.pages.length, 5)
assert.equal(cached.entries.one.pages[4].nextCursor, 'after-4')
for (let i = 0; i < 12; i++) cached = cache.put(cached, `key-${i}`, entry, now + i)
assert.equal(Object.keys(cached.entries).length, 10)
assert.equal(cached.entries['key-0'], undefined)
const largePage = i => ({ ...page(String(i)), items: Array.from({ length: 20 }, (_, n) => ({ ...image(`${i}-${n}`), prompt: '中'.repeat(20000) })) })
cached = cache.put({}, 'large', { ...entry, pages: [largePage(0), largePage(1), largePage(2)] }, now)
assert.ok(Buffer.byteLength(JSON.stringify(cached)) <= MAX_BYTES)
assert.equal(cached.entries.large.pages.length, 1)
assert.equal(cached.entries.large.pages[0].nextCursor, 'after-0')

const listeners = {}
let identityCalls = 0, signingCalls = 0, listingCalls = 0
const store = { assetCacheEpoch: 0, assetListCache: { entries: {} }, setAssetListCache(value) { this.assetListCache = value } }
const api = { store, apiBaseUrl: 'http://127.0.0.1:9000', Date: { now: () => now }, Map, Set,
  eventBus: { on(name, callback) { listeners[name] = callback } }, ASSET_LIST_INVALIDATED: 'invalidate',
  require: () => cache,
  getAssetIdentity: async () => { identityCalls++; return { ownerKey: entry.ownerKey } },
  resolveAssetUrls: async ({ source, ids }) => {
    signingCalls++; assert.ok(ids.length <= 20)
    return { ownerKey: entry.ownerKey, items: ids.map(id => ({ ...image(id), source })) }
  }
}
vm.runInNewContext(fs.readFileSync(require.resolve('../request/assetCache'), 'utf8').replace(/^import .*$/gm, '').replace(/^export /gm, ''), api)
;(async () => {
  const [context, same] = await Promise.all([api.assetContext('library', 'all'), api.assetContext('library', 'all')])
  assert.equal(identityCalls, 1)
  assert.equal(context.key, same.key)
  const uploaded = await api.assetContext('library', 'all', '', 'uploaded')
  const generated = await api.assetContext('library', 'all', '', 'generated')
  assert.notEqual(uploaded.key, generated.key)
  assert.notEqual(context.key, generated.key)
  assert.equal(cache.metadata({ ...image('origin'), origin: 'generated' }).origin, 'generated')
  api.saveAssetEntry(context, entry)
  assert.equal(api.assetRecentlyChecked(context), true)
  assert.equal(api.cachedAssetEntry(context).pages[0].items[0].url, image('first').url)
  await api.renewAssetUrls([image('first')]); assert.equal(signingCalls, 0)
  now += 601000
  const unsigned = Array.from({ length: 41 }, (_, i) => ({ ...image(String(i)), url: '', urlExpiresAt: 0 }))
  const signed = await api.renewAssetUrls(unsigned)
  assert.equal(signingCalls, 3)
  assert.ok(signed.every(item => item.url && !item.loadFailed))
  const fetch = async () => { listingCalls++; return { ownerKey: context.ownerKey, notModified: true, update_time: 1 } }
  await Promise.all([api.requestAssetPage(context, fetch, {}), api.requestAssetPage(context, fetch, {})])
  assert.equal(listingCalls, 1)
  const before = api.cachedAssetEntry(context).savedAt
  api.saveAssetEntry(context, api.cachedAssetEntry(context))
  assert.equal(api.cachedAssetEntry(context).savedAt, before, 'validation must not extend the 30 day lifetime')
  listeners.invalidate({ source: 'library' })
  assert.equal(api.assetContextCurrent(context), false)
  const next = await api.assetContext('library', 'all')
  assert.equal(api.assetRecentlyChecked(next), false)
  store.assetCacheEpoch++
  assert.equal(api.assetContextCurrent(next), false)
  await api.assetContext('library', 'all')
  assert.equal(identityCalls, 2)
  const publicContext = await api.assetContext('templates', 'popular')
  assert.equal(publicContext.ownerKey, 'public')
  const snapshots = unsigned.map(item => ({ ...item, name:'生成的图片', tags:[] }))
  signingCalls = 0
  api.resolveAssetUrls = async ({ ids }) => {
    signingCalls++; assert.ok(ids.length <= 20)
    return { ownerKey:entry.ownerKey, items:ids.map(id => ({ ...image(id), name:`水彩猫${id}.png`, favorite:true, tags:['水彩', 'Cat'],
      ...(id === '1' ? { fileID:'foreign/file' } : {}) })).concat(image('outside-chat')) }
  }
  const refreshed = await api.refreshAssetMetadata(snapshots)
  assert.equal(refreshed[0].favorite, true)
  assert.equal(signingCalls, 3)
  assert.equal(refreshed.length, snapshots.length, 'metadata cannot add unrelated library files')
  assert.equal(refreshed[0].name, '水彩猫0.png')
  assert.deepEqual(Array.from(refreshed[0].tags), ['水彩', 'Cat'])
  assert.equal(refreshed[1].name, '生成的图片', 'metadata must match both id and fileID')
  assert.equal(snapshots[0].name, '生成的图片', 'message snapshots remain unchanged')
  api.resolveAssetUrls = async () => ({ ownerKey:'b'.repeat(64), items:[] })
  await assert.rejects(api.refreshAssetMetadata(snapshots), /identity changed/)
  api.resolveAssetUrls = async () => { store.assetCacheEpoch++; return { ownerKey:entry.ownerKey, items:[] } }
  await assert.rejects(api.refreshAssetMetadata(snapshots), /identity changed/)
  console.log('assetCache: TTL, bounds, cursor retention, identity, request dedupe, invalidation and URL renewal passed')
})().catch(error => { console.error(error); process.exitCode = 1 })
