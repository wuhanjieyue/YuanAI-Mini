import { store } from '../store/index'
import { apiBaseUrl } from '../app_config'
import { getAssetIdentity, resolveAssetUrls } from './request'
import eventBus, { ASSET_LIST_INVALIDATED } from '../static_utils/eventBus'
const cache = require('../static_utils/assetListCache')
let epoch = -1, identity, owner = ''
const pending = new Map(), checked = new Map(), urls = new Map(), generations = new Map()
function session() {
  if (epoch === store.assetCacheEpoch) return
  epoch = store.assetCacheEpoch
  identity = null; owner = ''; pending.clear(); checked.clear(); urls.clear(); generations.clear()
}
eventBus.on(ASSET_LIST_INVALIDATED, ({ source }) => {
  session()
  generations.set(source, (generations.get(source) || 0) + 1)
  for (const key of checked.keys()) if (JSON.parse(key)[2] === source) checked.delete(key)
})
export async function assetContext(source, category, query = '', origin = '') {
  session()
  const startEpoch = epoch
  if (source !== 'templates' && !owner) {
    if (!identity) identity = getAssetIdentity().then(data => {
      if (startEpoch !== store.assetCacheEpoch) throw Error('Account changed')
      if (!/^[a-f0-9]{64}$/.test(data.ownerKey)) throw Error('Invalid asset identity')
      owner = data.ownerKey
    }).finally(() => { if (startEpoch === epoch) identity = null })
    await identity
  }
  const ownerKey = source === 'templates' ? 'public' : owner
  return { source, ownerKey, epoch: startEpoch, generation: generations.get(source) || 0,
    key: JSON.stringify([apiBaseUrl, ownerKey, source, category, query.trim().toLowerCase(), ...(origin ? [origin] : [])]) }
}
export function assetContextCurrent(context) {
  session()
  return context.epoch === epoch && context.generation === (generations.get(context.source) || 0)
}
export function cachedAssetEntry(context) {
  const entry = cache.normalize(store.assetListCache).entries[context.key]
  if (entry) entry.pages = entry.pages.map(page => ({ ...page, items: withAssetUrls(page.items) }))
  return entry
}
export function assetRecentlyChecked(context) {
  return Date.now() - (checked.get(context.key) || 0) < 60000
}
export function saveAssetEntry(context, entry) {
  if (!assetContextCurrent(context)) return
  checked.set(context.key, Date.now())
  rememberAssetUrls(entry.pages.flatMap(page => page.items))
  store.setAssetListCache(cache.put(store.assetListCache, context.key, { ...entry, source: context.source, ownerKey: context.ownerKey }))
}
export function requestAssetPage(context, fetchPage, options) {
  const key = JSON.stringify([context.key, context.generation, options])
  if (!pending.has(key)) {
    const request = fetchPage(options).then(page => {
      if (!assetContextCurrent(context) || page.ownerKey !== context.ownerKey) throw Error('Asset identity changed')
      return page
    }).finally(() => { if (pending.get(key) === request) pending.delete(key) })
    pending.set(key, request)
  }
  return pending.get(key)
}
function urlKey(item) { return `${item.source}:${item.id}` }
export function rememberAssetUrls(items) {
  session()
  for (const item of items) if (item.url?.startsWith('https://') && item.urlExpiresAt > Date.now() + 30000) {
    urls.set(urlKey(item), { fileID: item.fileID, url: item.url, urlExpiresAt: item.urlExpiresAt })
  }
  for (const [key, item] of urls) if (item.urlExpiresAt <= Date.now()) urls.delete(key)
}
export function withAssetUrls(items) {
  session()
  return items.map(item => {
    const signed = urls.get(urlKey(item))
    return signed?.fileID === item.fileID && signed.urlExpiresAt > Date.now() + 30000
      ? { ...item, ...signed } : { ...item, url: '', urlExpiresAt: 0, loaded: false }
  })
}
export async function refreshAssetMetadata(items) {
  if (!items.length) return items
  const context = await assetContext('library', 'all')
  const resolved = new Map()
  for (let offset = 0; offset < items.length; offset += 20) {
    const batch = items.slice(offset, offset + 20)
    const data = await resolveAssetUrls({ source: 'library', ids: batch.map(item => item.id) })
    if (!assetContextCurrent(context) || data.ownerKey !== context.ownerKey) throw Error('Asset identity changed')
    for (const item of data.items || []) resolved.set(item.id, item)
  }
  return items.map(item => {
    const latest = resolved.get(item.id)
    if (!latest || latest.fileID !== item.fileID) return item
    return { ...item, origin: latest.origin || item.origin, name: typeof latest.name === 'string' ? latest.name : item.name, favorite: latest.favorite === true, tags: Array.isArray(latest.tags) ? latest.tags : [],
      url: latest.url, urlExpiresAt: latest.urlExpiresAt }
  })
}
export async function renewAssetUrls(items, force = false) {
  session()
  const startEpoch = epoch
  rememberAssetUrls(force ? [] : items)
  const result = withAssetUrls(items)
  const missing = result.filter(item => (item.attachmentType === 'image') && (force || !item.url))
  for (const source of ['library', 'mine', 'templates']) {
    const group = missing.filter(item => item.source === source)
    for (let offset = 0; offset < group.length; offset += 20) {
      const batch = group.slice(offset, offset + 20)
      const key = JSON.stringify(['urls', source, batch.map(item => item.id).sort()])
      if (!pending.has(key)) {
        const request = resolveAssetUrls({ source, ids: batch.map(item => item.id) }).finally(() => { if (pending.get(key) === request) pending.delete(key) })
        pending.set(key, request)
      }
      const data = await pending.get(key)
      if (startEpoch !== store.assetCacheEpoch) throw Error('Account changed')
      if (source !== 'templates' && owner && data.ownerKey !== owner) throw Error('Asset identity changed')
      if (force) for (const item of batch) urls.delete(urlKey(item))
      rememberAssetUrls(data.items)
    }
  }
  return withAssetUrls(items).map(item => ({ ...item, loadFailed: item.attachmentType === 'image' && !item.url }))
}
