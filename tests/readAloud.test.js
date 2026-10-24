const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const tick = () => new Promise(resolve => setImmediate(resolve))

async function check() {
  const options = vm.runInNewContext(fs.readFileSync('static_utils/voiceOptions.js', 'utf8')
    .replace(/export const /g, 'const ') + '\n;({DEFAULT_VOICE_ID,VOICE_OPTIONS,VOICE_META_MAP})')
  const catalog = JSON.parse(fs.readFileSync('tests/fixtures/backend-contracts/speech_voices.json', 'utf8'))
  assert.equal(catalog.defaultVoiceId, options.DEFAULT_VOICE_ID)
  assert.equal(catalog.voices.length, options.VOICE_OPTIONS.length)
  assert.equal(new Set(catalog.voices.map(voice => voice.voice)).size, catalog.voices.length)
  for (const option of options.VOICE_OPTIONS) {
    const preset = catalog.voices.find(voice => voice.id === option.value)
    assert.ok(preset, `missing provider mapping for ${option.label}`)
    assert.equal(preset.label, option.label)
    assert.equal(preset.description, option.desc)
  }
  const store = { chatAbout:{ chatVoice:'默认' } }, speechCalls = []
  const requestSpeech = vm.runInNewContext(fs.readFileSync('request/speech.js', 'utf8')
    .replace(/^import .*\n/gm, '').replace('export function ', 'function ') + '\n synthesizeSpeech',
    { ...options, store, startHttpBinary(path, body) { speechCalls.push({ path, body }); return {} } })
  requestSpeech({ conversationId:'c', messageId:'m' })
  assert.equal(speechCalls.at(-1).body.voiceId, options.DEFAULT_VOICE_ID)
  for (const option of options.VOICE_OPTIONS) {
    store.chatAbout = { chatVoice:option.value }
    requestSpeech({ conversationId:'c', messageId:'m' })
    assert.equal(speechCalls.at(-1).path, '/speech')
    assert.equal(speechCalls.at(-1).body.voiceId, option.value, 'every request reads the latest saved local voice')
    assert.equal(Object.keys(speechCalls.at(-1).body).sort().join(','), 'conversationId,messageId,voiceId')
  }
  const previousVoice = speechCalls.at(-1).body.voiceId
  store.chatAbout = { chatVoice:'unknown-legacy-voice' }
  requestSpeech({ conversationId:'c', messageId:'m' })
  assert.equal(speechCalls.at(-1).body.voiceId, options.DEFAULT_VOICE_ID)
  assert.equal(speechCalls.at(-2).body.voiceId, previousVoice, 'voice changes do not mutate an in-flight request')
  let definition
  const requests = [], audioList = [], writes = [], deleted = [], notices = [], errors = []
  const source = fs.readFileSync('components/_self/yb-read-aloud/index.js', 'utf8').replace(/^import .*\n/gm, '')
  const files = { writeFile(options) { writes.push(options); queueMicrotask(() => options.success()) },
    unlink(options) { deleted.push(options.filePath) } }
  const wx = { env:{ USER_DATA_PATH:'/user' }, getFileSystemManager:() => files,
    createInnerAudioContext(options) {
      assert.equal(options.useWebAudioImplement, false)
      const handlers = {}
      const audio = { currentTime:0, duration:100, paused:true, handlers, calls:[],
        get playbackRate() { return this._rate || 1 },
        set playbackRate(value) { this._rate = value; this.calls.push(`rate:${value}`) },
        play() { this.calls.push('play'); this.effectiveRate = this.playbackRate; this.paused = false; handlers.Play?.() },
        pause() { this.calls.push('pause'); this.paused = true; if (!this.deferPause) handlers.Pause?.() },
        stop() { this.stopped = true }, destroy() { this.destroyed = true }, seek(value) { this.position = value; this.currentTime = value } }
      for (const event of ['Play', 'Pause', 'TimeUpdate', 'Ended', 'Error']) audio[`on${event}`] = fn => { handlers[event] = fn }
      audioList.push(audio)
      return audio
    } }
  vm.runInNewContext(source, { Component(value) { definition = value }, wx,
    require: name => name.endsWith('behavior') ? {} : { t:(_, key) => key },
    synthesizeSpeech(item) {
      const request = { item, abort() { this.aborted = true } }
      request.promise = new Promise((resolve, reject) => { request.resolve = resolve; request.reject = reject })
      requests.push(request); return request
    } })
  const component = { ...definition.methods, data:{ ...definition.data }, properties:{ language:'中文' },
    setData(patch) { Object.assign(this.data, patch) }, triggerEvent(name, data) { errors.push({ name, data }) },
    selectComponent:() => ({ show(message) { notices.push(message) }, hide() { notices.push('hide') } }) }
  definition.lifetimes.attached.call(component)
  const item = { conversationId:'c', messageId:'m' }
  const first = component.play(item)
  assert.equal(component.data.loading, true)
  assert.equal(component.data.elapsed, '00:00')
  requests[0].resolve(new ArrayBuffer(8)); await first
  assert.equal(component.data.loading, false)
  assert.equal(component.data.paused, false)
  const audio = audioList[0]
  assert.match(audio.src, /\.mp3$/)
  audio.currentTime = 70.9; audio.handlers.TimeUpdate()
  assert.equal(component.data.elapsed, '01:10')
  component.togglePlayback(); assert.equal(component.data.paused, true)
  component.togglePlayback(); assert.equal(component.data.paused, false)
  audio.deferPause = true
  audio.calls.length = 0
  component.cycleRate()
  assert.equal(component.data.rate, 1.25)
  assert.deepEqual(audio.calls, ['pause'], 'wait for native pause before applying a new rate')
  assert.equal(audio.effectiveRate, 1)
  audio.handlers.Pause()
  assert.deepEqual(audio.calls, ['pause', 'rate:1.25', 'play'])
  assert.equal(audio.effectiveRate, 1.25)
  assert.equal(audio.currentTime, 70.9, 'rate changes keep the playback position')
  assert.equal(component.data.paused, false)
  audio.deferPause = false
  component.togglePlayback()
  audio.calls.length = 0
  component.cycleRate()
  assert.deepEqual(audio.calls, ['rate:1.5'], 'changing rate while paused must not resume playback')
  assert.equal(component.data.paused, true)
  component.togglePlayback()
  assert.equal(audio.effectiveRate, 1.5)
  audio.deferPause = true
  audio.calls.length = 0
  component.cycleRate(); component.cycleRate()
  assert.deepEqual(audio.calls, ['pause'], 'rapid taps share one native pause')
  audio.handlers.Pause()
  assert.equal(audio.effectiveRate, 2, 'resume with the latest selected rate')
  component.cycleRate()
  component.togglePlayback()
  audio.calls.length = 0
  audio.handlers.Pause()
  assert.deepEqual(audio.calls, ['rate:0.75'], 'an explicit pause cancels automatic rate-change resume')
  assert.equal(component.data.paused, true)
  component.togglePlayback()
  assert.equal(audio.effectiveRate, 0.75)
  audio.deferPause = false
  component.seek({ currentTarget:{ dataset:{ offset:-15 } } }); assert.equal(audio.position, 55.900000000000006)
  audio.currentTime = 99; component.seek({ currentTarget:{ dataset:{ offset:15 } } }); assert.equal(audio.position, 100)
  audio.currentTime = 1; component.seek({ currentTarget:{ dataset:{ offset:-15 } } }); assert.equal(audio.position, 0)
  audio.handlers.Ended(); assert.equal(component.data.paused, true)
  assert.equal(notices.at(-1), 'hide', 'natural playback completion starts the shared 100ms exit')
  assert.equal(audio.destroyed, true); assert.equal(deleted[0], audio.src)
  const ignored = component.play(item)
  definition.pageLifetimes.hide.call(component)
  requests.at(-1).resolve(new ArrayBuffer(8)); await ignored
  assert.equal(audioList.length, 1, 'page hide must prevent late playback')
  const old = component.play(item), oldRequest = requests.at(-1)
  const latest = component.play({ ...item, messageId:'latest' })
  oldRequest.resolve(new ArrayBuffer(8)); await old
  requests.at(-1).resolve(new ArrayBuffer(8)); await latest
  audio.handlers.Error(); assert.equal(errors.length, 0, 'old audio events must be ignored')
  const latestAudio = audioList.at(-1)
  latestAudio.deferPause = true
  component.cycleRate()
  component.stop()
  latestAudio.calls.length = 0
  latestAudio.handlers.Pause()
  assert.deepEqual(latestAudio.calls, [], 'late native pause must not revive stopped playback')
  const resumed = component.play({ ...item, messageId:'resumed' })
  requests.at(-1).resolve(new ArrayBuffer(8)); await resumed
  const resumedAudio = audioList.at(-1)
  const hideCount = notices.filter(value => value === 'hide').length
  audio.handlers.Ended()
  assert.equal(notices.filter(value => value === 'hide').length, hideCount, 'late ended events must not close a newer playback')
  assert.equal(component._audio, resumedAudio)
  resumedAudio.handlers.Error(); assert.equal(errors.at(-1).data.message, 'speech.failed')
  const pending = component.play(item)
  requests.at(-1).reject({ statusCode:413 }); await pending
  assert.equal(errors.at(-1).data.message, 'speech.tooLong')
  const writing = component.play(item)
  let finishWrite
  files.writeFile = options => { finishWrite = options }
  requests.at(-1).resolve(new ArrayBuffer(8)); await tick()
  component.stop(); finishWrite.success(); await writing
  assert.ok(deleted.includes(finishWrite.filePath), 'late file write must be cleaned')
  const detached = component.play(item)
  definition.lifetimes.detached.call(component)
  requests.at(-1).resolve(new ArrayBuffer(8)); await detached
  assert.equal(audioList.length, 3)
  assert.ok(requests.some(request => request.aborted))
  const markup = fs.readFileSync('components/_self/yb-read-aloud/index.wxml', 'utf8')
  assert.match(markup, /duration="\{\{0\}\}"/)
  assert.doesNotMatch(markup, /height-rpx=/, 'playback uses the same shared capsule height as all reminders')
  assert.match(markup, /loading \? 'icon-loading_flow_iconfont speech-loading'/)
  assert.match(markup, /speech-time[^>]*>\{\{elapsed\}\}/, 'the time label does not show synthesis text')
  assert.match(fs.readFileSync('components/_self/yb-read-aloud/index.wxss', 'utf8'), /speech-loading[^}]*animation:speech-spin 1\.5s linear infinite/)
  assert.match(fs.readFileSync('components/_self/yb-read-aloud/index.wxss', 'utf8'), /speech-rate[^}]*white-space:nowrap/, 'decimal speed labels stay on one line')
  for (const icon of ['play_circle_line','pause_circle_line','fast_rewind_line','fast_forward_line','icon-x']) assert.ok(markup.includes(icon))
  assert.doesNotMatch(markup, /▶|Ⅱ|↶|↷|speech-seconds/, 'official glyphs replace the temporary symbols')
  const host = fs.readFileSync('components/_self/yb-chat-view/index.js', 'utf8')
  assert.match(markup, /resume-on-replace="\{\{true\}\}"/)
  assert.doesNotMatch(markup, /bind:replaced="stop"/, 'temporary notices must not stop playback')
  const replacement = { ...definition.methods, data:{ ...definition.data }, properties:component.properties,
    setData:component.setData, triggerEvent:component.triggerEvent, selectComponent:component.selectComponent }
  definition.lifetimes.attached.call(replacement)
  const beforeReplacement = requests.length
  const replacedPlay = replacement.play({ ...item, messageId:'replaced' })
  assert.equal(requests.length, beforeReplacement + 1)
  const replacedRequest = requests.at(-1)
  assert.equal(replacedRequest.aborted, undefined)
  const beforeReplacedAudio = audioList.length
  files.writeFile = options => { writes.push(options); queueMicrotask(() => options.success()) }
  replacedRequest.resolve(new ArrayBuffer(8)); await replacedPlay
  assert.equal(audioList.length, beforeReplacedAudio + 1, 'synthesis continues while its capsule is covered')
  const coveredAudio = replacement._audio
  coveredAudio.currentTime = 23.5; coveredAudio.handlers.TimeUpdate()
  assert.equal(replacement.data.elapsed, '00:23', 'covered playback keeps the time label current for restoration')
  assert.equal(coveredAudio.stopped, undefined)
  assert.equal(replacedRequest.aborted, undefined)
  definition.lifetimes.detached.call(replacement)
  assert.match(host, /detail.action === 'readAloud'[\s\S]*?#readAloud'\)\?\.play\(detail.item\)/)
  assert.match(host, /leaveConversation\(save = true\)\{\s*this.selectComponent\('#readAloud'\)\?\.stop\(\)/)
  console.log('readAloud: controls, native audio, time/rate/seek, file cleanup, cancellation and late callback guards passed')
}
check().catch(error => { console.error(error); process.exitCode = 1 })
