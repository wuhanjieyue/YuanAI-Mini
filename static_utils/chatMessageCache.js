const MAX_CACHE_ENTRIES = 10
const MAX_CACHED_MESSAGES = 30

const EMPTY_CHAT_MESSAGE_CACHE = {
  entries: {},
  lru: []
}

function normalizeCache(cache = EMPTY_CHAT_MESSAGE_CACHE) {
  const sourceEntries = cache && cache.entries && typeof cache.entries === 'object' && !Array.isArray(cache.entries)
    ? cache.entries
    : {}
  const entries = {}
  Object.keys(sourceEntries).forEach((id) => {
    const entry = sourceEntries[id]
    const normalized = normalizeEntry(entry, Number(entry && entry.accessedAt) || 0)
    if (normalized) entries[id] = normalized
  })
  const lru = Array.isArray(cache && cache.lru)
    ? cache.lru.filter((id, index, list) => entries[id] && list.indexOf(id) === index)
    : []

  Object.keys(entries).forEach((id) => {
    if (!lru.includes(id)) lru.push(id)
  })
  while (lru.length > MAX_CACHE_ENTRIES) delete entries[lru.pop()]
  return { entries, lru }
}

function normalizeEntry(entry, accessedAt = Date.now()) {
  const conversationId = entry && typeof entry.conversationId === 'string' ? entry.conversationId : ''
  if (!conversationId) return null
  if (Array.isArray(entry.chats) && entry.chats.some(chat =>
    Array.isArray(chat?.processTrace) && chat.processTrace.some(node => !node?.title || !node?.activityIcon))) return null
  if (Array.isArray(entry.chats) && entry.chats.some(chat => chat?.role === 'assistant' && chat.feature === 'imging' &&
    Array.isArray(chat.contentParts) && chat.contentParts.some(part =>
      part?.type === 'artifact' && part.artifactType === 'image' && part.displayMode === 'markdown'))) return null
  if (Array.isArray(entry.chats) && entry.chats.some(chat =>
    Array.isArray(chat?.contentParts) && chat.contentParts.some(part => part?.fileID &&
      !part.unavailableReason && Number(part.urlExpiresAt || 0) <= Date.now() + 30000))) return null
  const conversation = entry.conversation && typeof entry.conversation === 'object'
    ? {
        conversationId,
        title: typeof entry.conversation.title === 'string' ? entry.conversation.title : '新对话',
        modeId: typeof entry.conversation.modeId === 'string' ? entry.conversation.modeId : 'chat'
      }
    : null
  return {
    conversationId,
    conversation,
    messageVersion: typeof entry.messageVersion === 'string' ? entry.messageVersion : '',
    chats: Array.isArray(entry.chats) ? entry.chats.slice(0, MAX_CACHED_MESSAGES) : [],
    nextCursor: Number.isInteger(entry.nextCursor) ? entry.nextCursor : null,
    hasMore: entry.hasMore === true,
    accessedAt
  }
}

function touchCache(cache, conversationId, accessedAt = Date.now()) {
  const next = normalizeCache(cache)
  const entry = next.entries[conversationId]
  if (!entry) return { cache: next, entry: null }
  next.entries[conversationId] = normalizeEntry(entry, accessedAt)
  next.lru = [conversationId, ...next.lru.filter((id) => id !== conversationId)]
  return { cache: next, entry: next.entries[conversationId] }
}

function upsertCache(cache, entry, accessedAt = Date.now()) {
  const next = normalizeCache(cache)
  const normalized = normalizeEntry(entry, accessedAt)
  if (!normalized) return next
  next.entries[normalized.conversationId] = normalized
  next.lru = [normalized.conversationId, ...next.lru.filter((id) => id !== normalized.conversationId)]
  while (next.lru.length > MAX_CACHE_ENTRIES) delete next.entries[next.lru.pop()]
  return next
}

function persistCacheWithEviction(cache, write, fallback = EMPTY_CHAT_MESSAGE_CACHE, protectedId = '') {
  let next = normalizeCache(cache)
  while (true) {
    try {
      write(next)
      return next
    } catch (error) {
      const evictId = next.lru.slice().reverse().find((id) => id !== protectedId)
      if (!evictId) return normalizeCache(fallback)
      delete next.entries[evictId]
      next.lru = next.lru.filter((id) => id !== evictId)
    }
  }
}

module.exports = {
  EMPTY_CHAT_MESSAGE_CACHE,
  MAX_CACHE_ENTRIES,
  MAX_CACHED_MESSAGES,
  normalizeCache,
  touchCache,
  upsertCache,
  persistCacheWithEviction
}
