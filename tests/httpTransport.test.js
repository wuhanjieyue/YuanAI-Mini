const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const source = fs.readFileSync('request/http.js', 'utf8')
  .replace(/^import .*\n/gm, '').replace(/export (async )?function /g, '$1function ')
const tick = () => new Promise(resolve => setImmediate(resolve))
function environment() {
  const calls = [], streams = [], binaries = [], uploads = []
  let logins = 0, rejectBusiness = 0
  const wx = {
    login({ success }) { logins++; queueMicrotask(() => success({ code: 'one-use-code' })) },
    request(options) {
      calls.push(options)
      const task = {
        chunk: null, headers: null, aborted: false,
        onChunkReceived(fn) { this.chunk = fn }, offChunkReceived(fn) { if (this.chunk === fn) this.chunk = null },
        onHeadersReceived(fn) { this.headers = fn }, offHeadersReceived(fn) { if (this.headers === fn) this.headers = null },
        abort() { this.aborted = true; options.fail(new Error('aborted')) }
      }
      if (options.enableChunked) { streams.push({ options, task }); return task }
      if (options.url.endsWith('/speech/transcriptions')) { uploads.push({ options, task }); return task }
      if (options.responseType === 'arraybuffer') { binaries.push({ options, task }); return task }
      queueMicrotask(() => {
        const path = options.url.slice('http://127.0.0.1:9000'.length)
        const data = path === '/auth/session' ? { token: `signed-${logins}`, expiresIn: 7200 }
          : path === '/turns/ticket' ? { ticket: 'scoped-ticket' } : { ok: true }
        const statusCode = rejectBusiness > 0 && path === '/user' ? (rejectBusiness--, 401) : 200
        options.success({ statusCode, data: { code: statusCode, data } })
      })
      return task
    }
  }
  const api = vm.runInNewContext(source + '\n({callHttp,startHttpBinary,startHttpAudioUpload,startHttpSse})', {
    apiBaseUrl: 'http://127.0.0.1:9000', wx, Date, Promise, Error, Object
  })
  return { api, calls, streams, binaries, uploads, get logins() { return logins }, unauthorized(count) { rejectBusiness = count } }
}
async function check() {
  const e = environment()
  const results = await Promise.all([e.api.callHttp('/user', {}), e.api.callHttp('/models', {})])
  assert.equal(e.logins, 1)
  assert.ok(results.every(row => row.result.data.ok))
  assert.equal(e.calls.find(row => row.url.endsWith('/user')).header.Authorization, 'Bearer signed-1')
  e.unauthorized(2)
  await Promise.all([e.api.callHttp('/user', {}), e.api.callHttp('/user', {})])
  assert.equal(e.logins, 2, 'concurrent 401 refresh is merged')
  e.unauthorized(5)
  assert.equal((await e.api.callHttp('/user', {})).statusCode, 401, '401 retried only once')
  const b = environment()
  await b.api.callHttp('/user', {})
  const binary = b.api.startHttpBinary('/speech', { conversationId:'c', messageId:'m' })
  await tick()
  b.binaries[0].options.success({ statusCode:401 })
  await tick()
  const renewedBinary = b.binaries[1]
  assert.equal(renewedBinary.options.header['Idempotency-Key'], b.binaries[0].options.header['Idempotency-Key'])
  assert.equal(renewedBinary.options.header.Authorization, 'Bearer signed-2')
  assert.equal(renewedBinary.options.timeout, 330000)
  const bytes = new ArrayBuffer(16)
  renewedBinary.options.success({ statusCode:200, header:{ 'Content-Type':'audio/mpeg' }, data:bytes })
  assert.equal(await binary.promise, bytes)
  const invalidAudio = b.api.startHttpBinary('/speech', {})
  await tick()
  b.binaries.at(-1).options.success({ statusCode:200, header:{ 'content-type':'application/json' }, data:bytes })
  await assert.rejects(invalidAudio.promise)
  const cancelled = b.api.startHttpBinary('/speech', {})
  await tick()
  const aborted = assert.rejects(cancelled.promise)
  cancelled.abort()
  await aborted
  assert.equal(b.binaries.at(-1).task.aborted, true)
  const newSession = environment()
  const cancelledLogin = newSession.api.startHttpBinary('/speech', {})
  const cancelledResult = assert.rejects(cancelledLogin.promise)
  cancelledLogin.abort()
  await cancelledResult; await tick()
  assert.equal(newSession.binaries.length, 0, 'cancel during login must prevent a paid audio request')
  const voice = environment(), pcm = new ArrayBuffer(32000)
  const dictation = voice.api.startHttpAudioUpload('/speech/transcriptions', pcm)
  await tick()
  voice.uploads[0].options.success({ statusCode:401, data:{code:401} })
  await tick()
  const upload = voice.uploads[1]
  assert.equal(upload.options.header['Idempotency-Key'], voice.uploads[0].options.header['Idempotency-Key'])
  assert.equal(upload.options.header.Authorization,'Bearer signed-2')
  assert.equal(upload.options.header['Content-Type'],'application/octet-stream')
  assert.equal(upload.options.timeout,120000)
  assert.equal(upload.options.data,pcm)
  upload.options.success({statusCode:200,data:{code:200,data:{text:'识别内容。'}}})
  assert.equal(await dictation.promise,'识别内容。')
  for(const result of [{statusCode:422,data:{code:422}}, {statusCode:200,data:{code:200,data:{text:''}}},
    {statusCode:200,data:{code:200,data:{text:123}}}]) {
    const bad = voice.api.startHttpAudioUpload('/speech/transcriptions',pcm)
    await tick();voice.uploads.at(-1).options.success(result);await assert.rejects(bad.promise)
  }
  const cancelUpload = voice.api.startHttpAudioUpload('/speech/transcriptions',pcm)
  await tick()
  const cancelResult = assert.rejects(cancelUpload.promise)
  cancelUpload.abort();await cancelResult
  assert.equal(voice.uploads.at(-1).task.aborted,true)
  const loginVoice=environment()
  const beforeLogin=loginVoice.api.startHttpAudioUpload('/speech/transcriptions',pcm)
  const beforeLoginResult=assert.rejects(beforeLogin.promise)
  beforeLogin.abort();await beforeLoginResult;await tick()
  assert.equal(loginVoice.uploads.length,0,'cancel during login prevents ASR upload')
  const chunks = [], completed = [], failed = []
  const stream = e.api.startHttpSse('/turns/events', { conversationId: 'c', turnId: 't', runId: 'r', afterSeq: 17 },
    chunk => chunks.push(chunk.data.byteLength), value => completed.push(value), error => failed.push(error), 'initial')
  await tick()
  const first = e.streams[0]
  assert.equal(first.options.header.Authorization, 'Bearer initial')
  assert.equal(first.options.responseType, 'arraybuffer')
  assert.equal(first.options.header['X-WX-SERVICE'], undefined)
  first.task.headers({ statusCode: 401, header: { 'Content-Type': 'application/json' } })
  const late = first.task.chunk
  late({ data: new ArrayBuffer(8) })
  assert.equal(chunks.length, 0, 'JSON errors never parsed as SSE')
  first.options.success({ statusCode: 401 })
  await tick()
  assert.equal(e.streams.length, 2)
  const renewed = e.streams[1]
  assert.equal(renewed.options.data.afterSeq, 17)
  assert.deepEqual(Object.keys(e.calls.find(row => row.url.endsWith('/turns/ticket')).data).sort(),
    ['conversationId', 'runId', 'turnId'])
  late({ data: new ArrayBuffer(8) })
  renewed.task.headers({ statusCode: 200, header: { 'content-type': 'text/event-stream; charset=utf-8' } })
  const currentChunk = renewed.task.chunk
  currentChunk({ data: new ArrayBuffer(4) })
  assert.deepEqual(chunks, [4])
  renewed.options.success({ statusCode: 200 })
  currentChunk({ data: new ArrayBuffer(8) })
  assert.equal(completed.length, 1)
  assert.equal(failed.length, 0)
  assert.equal(renewed.task.chunk, null)
  stream.abort()
  for (const mode of ['abort', 'network', 'bad-type', 'expired-again']) {
    const t = environment(), errors = [], values = []
    const handle = t.api.startHttpSse('/turns/events', {}, value => values.push(value), value => values.push(value),
      error => errors.push(error), 'first')
    await tick()
    let request = t.streams[0]
    const delayed = request.task.chunk
    if (mode === 'abort') handle.abort()
    if (mode === 'network') request.options.fail(new Error('lost'))
    if (mode === 'bad-type') {
      request.task.headers({ statusCode: 200, header: { 'content-type': 'application/json' } })
      request.options.success({ statusCode: 200 })
    }
    if (mode === 'expired-again') {
      request.options.success({ statusCode: 401 }); await tick()
      request = t.streams[1]; request.options.success({ statusCode: 401 })
      assert.equal(t.streams.length, 2)
      assert.equal(values[0].statusCode, 401)
    }
    delayed({ data: new ArrayBuffer(8) })
    assert.equal(request.task.chunk, null)
    if (mode === 'abort') assert.equal(errors.length, 0)
    if (mode === 'network' || mode === 'bad-type') assert.equal(errors.length, 1)
  }
  const t = environment()
  const h = t.api.startHttpSse('/turns/events', {}, () => {}, () => {}, () => {})
  h.abort(); await tick(); assert.equal(t.streams.length, 0)
  console.log('httpTransport: merged login/401, RequestTask SSE, ticket renewal, JSON rejection, abort and late callbacks passed')
}
check().catch(error => { console.error(error); process.exitCode = 1 })
