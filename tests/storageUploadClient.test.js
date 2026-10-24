const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { getMessageAttachments } = require('../static_utils/chatAttachment')

const stored = { type:'attachment', attachmentType:'image', fileID:'prefix/wxapp/uploads/image.png', extension:'png' }
assert.equal(getMessageAttachments([stored])[0].src, '')
assert.equal(getMessageAttachments([{ ...stored, url:'https://cos.example/image.png' }])[0].src, 'https://cos.example/image.png')
assert.equal(getMessageAttachments([{ ...stored, previewPath:'/tmp/image.png' }])[0].src, '/tmp/image.png')

function client(timeout = 120000, busyOnce = false) {
  const calls = []
  const tasks = []
  const listeners = {}
  const wx = { uploadFile(options) {
    const task = { options, aborted: false, abort() { this.aborted = true } }
    tasks.push(task)
    return task
  } }
  const context = { wx, Promise, Date,
    setTimeout: (callback, ms) => setTimeout(callback, ms === 3000 ? 1 : Math.min(ms, timeout)), clearTimeout,
    ASSET_LIST_INVALIDATED: 'invalidated', CHAT_SESSION_RESET: 'chatSessionReset',
    eventBus: { emit() {}, on(name, callback) { listeners[name] = callback } },
    callHttp: async (_, event) => {
      calls.push(event.funName)
      if (event.funName === 'prepareStorageUpload') {
        assert.equal(event.uploadTimeoutSeconds, 120)
        if (busyOnce && calls.filter(name => name === 'prepareStorageUpload').length === 1) {
          return { result: { code: 400, msg: 'busy', data: { errorCode: 'STORAGE_BUSY' } } }
        }
        return { result: { code: 200, data: { uploadToken: `token-${tasks.length}`,
          uploads: event.files.map((_, index) => ({ objectKey: `prefix/wxapp/uploads/${tasks.length}-${index}`, uploadUrl: 'https://cos.example/', formData: { key: `prefix/wxapp/uploads/${tasks.length}-${index}` } })) } } }
      }
      if (event.funName === 'completeStorageUpload') return { result: { code: 200,
        data: { files: event.fileIDs.map(() => ({ size: 1, id: 'asset' })) } } }
      if (event.funName === 'cancelStorageUpload') return { result: { code: 200, data: null } }
      throw Error(`Unexpected request: ${event.funName}`)
    }
  }
  const source = fs.readFileSync(require.resolve('../request/request.js'), 'utf8')
    .replace(/^import .*$/gm, '').replace(/^export /gm, '')
  vm.runInNewContext(`${source}\nthis.uploadCloudFiles = uploadCloudFiles`, context)
  return { ...context, calls, tasks, listeners }
}

const file = name => ({ filePath: `/tmp/${name}.png`, fileName: `${name}.png`,
  dir: 'uploads/image', ext: 'png', size: 1 })
const tick = () => new Promise(resolve => setImmediate(resolve))

;(async () => {
  const firstClient = client()
  const first = firstClient.uploadCloudFiles([file('first')])
  await tick()
  const second = firstClient.uploadCloudFiles([file('second')])
  await tick()
  assert.equal(firstClient.tasks.length, 1, 'second upload must wait for the first')
  firstClient.tasks[0].options.success({ statusCode: 200 })
  await first
  await tick()
  assert.equal(firstClient.tasks.length, 2)
  firstClient.tasks[1].options.success({ statusCode: 200 })
  await second
  assert.deepEqual(firstClient.calls, ['prepareStorageUpload', 'completeStorageUpload',
    'prepareStorageUpload', 'completeStorageUpload'])

  const switched = client()
  const active = switched.uploadCloudFiles([file('active')])
  await tick()
  const queued = switched.uploadCloudFiles([file('queued')])
  switched.listeners.chatSessionReset({ reason: 'account-changed' })
  switched.tasks[0].options.success({ statusCode: 200 })
  await active
  await assert.rejects(queued, /账号已切换/)
  assert.equal(switched.tasks.length, 1)

  const timed = client(10)
  const expired = timed.uploadCloudFiles([file('expired')])
  await assert.rejects(expired, /超时/)
  assert.equal(timed.tasks[0].aborted, true)
  assert.deepEqual(timed.calls, ['prepareStorageUpload', 'cancelStorageUpload'])
  const retried = timed.uploadCloudFiles([file('retry')])
  await tick()
  timed.tasks[1].options.success({ statusCode: 200 })
  await retried
  const busy = client(50, true)
  const waiting = busy.uploadCloudFiles([file('busy')])
  await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(busy.tasks.length, 1)
  busy.tasks[0].options.success({ statusCode: 200 })
  await waiting
  assert.deepEqual(busy.calls, ['prepareStorageUpload', 'prepareStorageUpload', 'completeStorageUpload'])
  const rejected = client()
  const denied = rejected.uploadCloudFiles([file('denied')])
  await tick()
  rejected.tasks[0].options.success({ statusCode: 403, data: '<Error>AccessDenied</Error>' })
  await assert.rejects(denied, /文件上传失败/)
  assert.deepEqual(rejected.calls, ['prepareStorageUpload', 'cancelStorageUpload'])
  console.log('storageUploadClient: serial upload, busy retry, timeout abort, cancel, retry and COS rejection passed')
})().catch(error => { console.error(error); process.exitCode = 1 })
