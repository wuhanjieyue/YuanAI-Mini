const assert = require('assert')
const {
  EMPTY_CHAT_MESSAGE_CACHE,
  normalizeCache,
  touchCache,
  upsertCache,
  persistCacheWithEviction
} = require('../static_utils/chatMessageCache')

function entry(id, count = 2) {
  return {
    conversationId: id,
    conversation: { title:`title-${id}`, modeId:id === 'work' ? 'work' : 'chat' },
    messageVersion: `version-${id}`,
    chats: Array.from({ length: count }, (_, index) => ({ messageId: `${id}-${index}` })),
    nextCursor: count,
    hasMore: true
  }
}

assert.deepStrictEqual(upsertCache(EMPTY_CHAT_MESSAGE_CACHE, entry('work')).entries.work.conversation, {
  conversationId:'work',
  title:'title-work',
  modeId:'work'
})
const oldTrace = { ...entry('old-trace'), chats:[{ processTrace:[{ id:'search', stage:'search' }] }] }
assert.equal(normalizeCache({ entries:{ oldTrace }, lru:['oldTrace'] }).entries.oldTrace, undefined)
assert.ok(upsertCache(EMPTY_CHAT_MESSAGE_CACHE, { ...oldTrace, chats:[{ processTrace:[{ id:'search', title:'正在搜索', activityIcon:'icon-web-search1' }] }] }).entries['old-trace'])

const signedPart = { type:'attachment', fileID:'prefix/wxapp/uploads/file.png',
  url:'https://cos.example/prefix/wxapp/uploads/file.png?signature=temporary', urlExpiresAt:Date.now()+600000 }
const signedEntry = part => ({ ...entry('cos-files'), chats:[{ contentParts:[part] }] })
assert.ok(upsertCache(EMPTY_CHAT_MESSAGE_CACHE, signedEntry(signedPart)).entries['cos-files'])
assert.equal(upsertCache(EMPTY_CHAT_MESSAGE_CACHE, signedEntry({ ...signedPart, urlExpiresAt:1 })).entries['cos-files'], undefined)
assert.equal(upsertCache(EMPTY_CHAT_MESSAGE_CACHE, signedEntry({ ...signedPart, urlExpiresAt:undefined })).entries['cos-files'], undefined)
assert.ok(upsertCache(EMPTY_CHAT_MESSAGE_CACHE, signedEntry({ ...signedPart, url:'', urlExpiresAt:1,
  unavailableReason:'storage_deleted' })).entries['cos-files'])

const generatedImage={...signedPart,type:'artifact',artifactType:'image',artifactId:'poster',displayMode:'markdown'}
const imageEntry=(feature,part=generatedImage)=>({...entry('generated-image'),chats:[
  {role:'assistant',feature,contentParts:[part]},
]})
assert.equal(upsertCache(EMPTY_CHAT_MESSAGE_CACHE,imageEntry('imging')).entries['generated-image'],undefined,
  'a plugin selection inconsistent with the authoritative Markdown-only image must reload from the server')
assert.equal(normalizeCache({entries:{image:imageEntry('imging')},lru:['image']}).entries.image,undefined)
assert.ok(upsertCache(EMPTY_CHAT_MESSAGE_CACHE,imageEntry('')).entries['generated-image'])
assert.ok(upsertCache(EMPTY_CHAT_MESSAGE_CACHE,imageEntry('searching')).entries['generated-image'])
assert.ok(upsertCache(EMPTY_CHAT_MESSAGE_CACHE,imageEntry('imging',{...generatedImage,displayMode:'inline'})).entries['generated-image'])

let cache = normalizeCache(EMPTY_CHAT_MESSAGE_CACHE)
for (let index = 1; index <= 10; index += 1) cache = upsertCache(cache, entry(`c${index}`), index)
cache = touchCache(cache, 'c1', 11).cache
cache = upsertCache(cache, entry('c11'), 12)
assert.strictEqual(cache.lru.length, 10)
assert.ok(cache.entries.c1)
assert.ok(!cache.entries.c2)

cache = upsertCache(cache, entry('c11', 35), 13)
assert.strictEqual(cache.lru.length, 10)
assert.strictEqual(cache.entries.c11.chats.length, 30)

const fallback = upsertCache(EMPTY_CHAT_MESSAGE_CACHE, entry('old'), 1)
const oversized = upsertCache(fallback, entry('new'), 2)
const persisted = persistCacheWithEviction(oversized, (value) => {
  if (value.lru.length > 1) throw new Error('quota')
}, fallback, 'new')
assert.deepStrictEqual(persisted.lru, ['new'])

const skipped = persistCacheWithEviction(oversized, () => {
  throw new Error('quota')
}, fallback, 'new')
assert.deepStrictEqual(skipped, fallback)

console.log('chatMessageCache: ok')

const fs = require('fs')
const path = require('path')
const storeSource = fs.readFileSync(path.join(__dirname, '../store/index.js'), 'utf8')
const removeSource = storeSource.match(/removeChatMessageCacheEntry: action\((function \(conversationId\) \{[\s\S]*?\n  })\)/)[1]
let persistedRemoval
let removedKey = false
const storage = {
  setStorageSync: (_, value) => { persistedRemoval = value },
  removeStorageSync: () => { removedKey = true }
}
const removeEntry = new Function('normalizeCache', 'wx', 'CHAT_MESSAGE_CACHE_KEY', `return ${removeSource}`)(normalizeCache, storage, 'cache')
const cacheStore = { chatMessageCache: upsertCache(upsertCache(EMPTY_CHAT_MESSAGE_CACHE, entry('keep')), entry('delete')) }
removeEntry.call(cacheStore, 'delete')
assert.deepStrictEqual(cacheStore.chatMessageCache.lru, ['keep'])
assert.ok(persistedRemoval.entries.keep)
assert.ok(!persistedRemoval.entries.delete)
storage.setStorageSync = () => { throw new Error('storage failure') }
removeEntry.call(cacheStore, 'keep')
assert.strictEqual(removedKey, true)
console.log('chatMessageCache: deleted conversation eviction passed')
