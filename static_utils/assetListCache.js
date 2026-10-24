const KEY = 'assetListCache_v2'
const TTL = 30 * 24 * 60 * 60 * 1000
const MAX_BYTES = 2 * 1024 * 1024
const FIELDS = ['id', 'source', 'origin', 'fileID', 'sampleKey', 'name', 'favorite', 'tags', 'title', 'titleEn', 'prompt', 'promptEn', 'promptSource', 'supportsImageInput', 'extension', 'mimeType', 'attachmentType', 'size', 'createdAt', 'uploadedAt', 'width', 'height', 'showTitle']
const metadata = item => Object.fromEntries(FIELDS.filter(key => item[key] !== undefined).map(key => [key, item[key]]))
const bytes = value => unescape(encodeURIComponent(JSON.stringify(value))).length
function normalize(cache = {}, now = Date.now()) {
  const entries = {}
  for (const [key, entry] of Object.entries(cache.entries || {})) {
    if (!entry || !Number.isFinite(entry.savedAt) || now - entry.savedAt >= TTL || entry.savedAt > now || !Array.isArray(entry.pages) || !entry.pages.length) continue
    if (!Number.isSafeInteger(entry.update_time) || typeof entry.ownerKey !== 'string') continue
    const pages = entry.pages.slice(0, 5)
    if (pages.some(page => !Array.isArray(page.items) || page.items.some(item => !item || typeof item.id !== 'string'))) continue
    entries[key] = { source: entry.source, ownerKey: entry.ownerKey, savedAt: entry.savedAt, accessedAt: entry.accessedAt || entry.savedAt,
      update_time: entry.update_time, pages: pages.map(page => ({ items: page.items.map(metadata), nextCursor: page.nextCursor || '', hasMore: !!page.hasMore })) }
  }
  const order = Object.keys(entries).sort((a, b) => entries[b].accessedAt - entries[a].accessedAt)
  for (const key of order.slice(10)) delete entries[key]
  while (bytes({ entries }) > MAX_BYTES) {
    const oldest = Object.keys(entries).sort((a, b) => entries[a].accessedAt - entries[b].accessedAt)[0]
    if (Object.keys(entries).length > 1 || entries[oldest].pages.length === 1) delete entries[oldest]
    else entries[oldest].pages.pop()
  }
  return { entries }
}
function put(cache, key, entry, now = Date.now()) {
  return normalize({ entries: { ...(cache?.entries || {}), [key]: { ...entry, accessedAt: now } } }, now)
}
module.exports = { KEY, TTL, MAX_BYTES, metadata, normalize, put }
