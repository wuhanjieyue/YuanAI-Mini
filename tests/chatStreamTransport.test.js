const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

const source = fs.readFileSync('request/chatStream.js', 'utf8')
  .replace(/^import .*\n/gm, '').replace(/export function /g, 'function ')

function environment(decoder = TextDecoder) {
  const timers = new Map()
  const store = { applicationSettings: { language: '中文' } }
  const streams = []
  const requests = []
  let response = { statusCode: 200, result: { code: 200, data: {} } }
  const api = vm.runInNewContext(source + '\n({prepareChatTurn,createChatTurn,attachChatTurn,getConversationMessages,markConversationRead})', {
    TextDecoder: decoder, Uint8Array, Date, store, currentLocation: () => ({ country: '中国' }),
    toLocale: require('../static_utils/i18n/index').toLocale,
    setTimeout(fn, ms) { timers.set(fn, ms); return fn },
    clearTimeout(fn) { timers.delete(fn) },
    callHttp(path, data) { requests.push({ path, data }); return Promise.resolve(response) },
    startHttpSse(path, data, onChunk, onComplete, onFail, initialTicket) {
      const stream = { path, data, onChunk, onComplete, onFail, initialTicket,
        aborted: false, abort() { this.aborted = true } }
      streams.push(stream)
      return stream
    }
  })
  return {
    api, store, timers, streams, requests,
    setResponse(value) { response = value },
    chunk(bytes) { streams.at(-1).onChunk({ data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }) }
  }
}

async function check() {
  for (const decoder of [TextDecoder, null]) {
    const e = environment(decoder)
    const stream = e.api.attachChatTurn({ conversationId: 'c', turnId: 't', runId: 'r', initialTicket: 'first-ticket' })
    assert.equal(e.streams[0].path, '/turns/events')
    assert.equal(e.streams[0].initialTicket, 'first-ticket')
    assert.equal(e.streams[0].data.locale, 'zh-CN')
    const iterator = stream.eventStream[Symbol.asyncIterator]()
    const data = ': heartbeat\r\n\r\ndata: ' + JSON.stringify({ content: '中文🙂𠮷跨字节' }) + '\r\n\r\ndata: [DONE]\r\n\r\n'
    for (const byte of new TextEncoder().encode(data)) e.chunk(Uint8Array.of(byte))
    assert.equal(JSON.parse((await iterator.next()).value.data).content, '中文🙂𠮷跨字节')
    assert.equal((await iterator.next()).value.data, '[DONE]')
    assert.equal((await iterator.next()).done, true)
    e.streams[0].onComplete({ statusCode: 200 })
    assert.equal(e.timers.size, 0)
  }
  const multi = environment()
  const framed = multi.api.attachChatTurn({})
  multi.chunk(new TextEncoder().encode('data: {"content":\ndata: "多行🙂"}\n\ndata: [DONE]\n\n'))
  assert.equal(JSON.parse((await framed.eventStream[Symbol.asyncIterator]().next()).value.data).content, "多行🙂")
  framed.close()
  const e = environment()
  const stream = e.api.attachChatTurn({})
  const pending = stream.eventStream[Symbol.asyncIterator]().next()
  stream.close()
  assert.equal((await pending).done, true)
  assert.equal(e.streams[0].aborted, true)
  assert.equal(e.timers.size, 0)

  for (const finish of ['disconnect', 'timeout', 'http', 'network']) {
    const e = environment()
    const stream = e.api.attachChatTurn({})
    const iterator = stream.eventStream[Symbol.asyncIterator]()
    const rejected = assert.rejects(iterator.next(), finish === 'http' ? { statusCode: 403 }
      : finish === 'network' ? /lost/ : { code: 'STREAM_RECONNECT' })
    if (finish === 'disconnect') e.streams[0].onComplete()
    if (finish === 'http') e.streams[0].onComplete({ statusCode: 403 })
    if (finish === 'network') e.streams[0].onFail(new Error('lost'))
    if (finish === 'timeout') for (const [fire, ms] of e.timers) { assert.equal(ms, 50000); fire() }
    await rejected
    assert.equal(e.streams[0].aborted, true)
    e.streams[0].onChunk({ data: new TextEncoder().encode("data: late\n\n").buffer })
    stream.close()
    assert.equal(e.timers.size, 0)
  }
  const busy = environment()
  busy.setResponse({ statusCode: 409, result: { code: 'TURN_IN_PROGRESS', msg: 'busy', data: { activeTurn: { turnId: 'old' } } } })
  await assert.rejects(busy.api.createChatTurn({}), error => error.statusCode === 409 && error.data.activeTurn.turnId === 'old')
  const login = environment()
  login.setResponse({ statusCode: 200, result: { code: 403, msg: '请先登录', data: { errorCode: 'SHARE_LOGIN_REQUIRED' } } })
  await assert.rejects(login.api.createChatTurn({}), error => error.statusCode === 403 && error.data.errorCode === 'SHARE_LOGIN_REQUIRED')
  const sample = environment()
  await sample.api.markConversationRead({conversationId:'c',completedRunId:'run-visible',ownerId:'ignored'})
  assert.deepEqual(JSON.parse(JSON.stringify(sample.requests.at(-1))), {
    path:'/conversations/read',data:{conversationId:'c',completedRunId:'run-visible'}
  }, 'read receipts send only the viewed response identity through the shared HTTP boundary')
  await sample.api.getConversationMessages({ conversationId:'c' })
  assert.deepEqual(JSON.parse(JSON.stringify(sample.requests.at(-1))), {
    path:'/messages', data:{conversationId:'c',beforeSeq:null,locale:'zh-CN'}
  }, 'ordinary history reads retain their existing request body')
  await sample.api.getConversationMessages({ conversationId:'c', beforeSeq:11, limit:5 })
  assert.deepEqual(JSON.parse(JSON.stringify(sample.requests.at(-1))), {
    path:'/messages', data:{conversationId:'c',beforeSeq:11,limit:5,locale:'zh-CN'}
  }, 'previews pass their smaller page size through the shared request boundary')
  const skillIds = ['skillhub_copywriter']
  const skillTurn = sample.api.prepareChatTurn({ askText: 'q', modeId: 'chat', skillIds })
  assert.deepEqual(Array.from(skillTurn.skillIds), skillIds)
  skillIds.length = 0
  assert.equal(skillTurn.skillIds.length, 1, 'the request owns a snapshot of the explicit selection')
  assert.equal('skillIds' in sample.api.prepareChatTurn({ regenerateFromTurnId: 'turn-existing' }), false, 'normal retries let the backend inherit the original Skill IDs')
  assert.equal(sample.api.prepareChatTurn({ askText: 'q', modeId: 'temporary' }).locale, 'zh-CN')
  sample.store.applicationSettings.language = 'English'
  assert.equal(sample.api.prepareChatTurn({ askText: 'q', modeId: 'chat' }).locale, 'en-US')
  const englishStream = sample.api.attachChatTurn({ conversationId:'c',turnId:'t',runId:'r',afterSeq:7 })
  assert.equal(sample.streams[0].data.locale, 'en-US')
  assert.equal(sample.streams[0].data.afterSeq, 7)
  englishStream.close()
  console.log('chatStreamTransport: HTTP SSE framing, errors and cancellation passed')
}

check().catch(error => { console.error(error); process.exitCode = 1 })
