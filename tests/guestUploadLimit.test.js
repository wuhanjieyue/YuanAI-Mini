const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { t } = require('../static_utils/i18n')

const source = fs.readFileSync('components/_self/yb-chat-view/index.js', 'utf8')
const fileList = fs.readFileSync('components/yb-file-list/index.wxml', 'utf8')
assert.match(fileList, /item\.uploadStatus === 'selected'.*class="delete-button\b[^\"]*"/)
const start = source.indexOf('  attachmentSelectionError(files = []){')
const end = source.indexOf('  async deleteFile(e){', start)
assert.ok(start >= 0 && end > start)
const max = 5 * 1024 * 1024
let uploads = 0
const context = {
  GUEST_UPLOAD_LIMIT_BYTES: max,
  isSupportedChatAttachment: () => true,
  getFileExtension: require('../static_utils/chatAttachment').getFileExtension,
  normalizeSelectedFile: file => require('../static_utils/chatAttachment').normalizeSelectedFile({path:'/tmp/file.pdf', ...file}),
  formatFileSize: size => String(size),
  t,
  chatRuntime: { epoch:0 },
  deleteCloudFile: async () => {},
  wx: { showToast() {} }
}
const selectionMethods = vm.runInNewContext(`({${source.slice(start, end)}})`, context)
const addSelectedFiles = selectionMethods.addSelectedFiles
const resolveStart = source.indexOf('    resolveTurnFiles(files){')
const resolveEnd = source.indexOf('    sendCreationPrompt(', resolveStart)
const resolveTurnFiles = vm.runInNewContext(`({${source.slice(resolveStart, resolveEnd)}}).resolveTurnFiles`, context)
const deleteStart = source.indexOf('  async deleteFile(e){')
const deleteEnd = source.indexOf('  showUploadFailure(', deleteStart)
const deleteFile = vm.runInNewContext(`({${source.slice(deleteStart, deleteEnd)}}).deleteFile`, context)

function view(login) {
  return {
    data:{ user:{ login }, files:[] }, properties:{ language:'中文' },
    attachmentSelectionError:selectionMethods.attachmentSelectionError,
    _destroyed:false, _conversationLoadVersion:0, notice:'',
    showUploadFailure(message) { this.notice = message },
    draftContext() { return { epoch:0, version:0 } },
    setData(patch) { Object.assign(this.data, patch) },
    selectComponent() { return { showFun() {}, hideFun() {} } },
    async uploadSelectedFiles(files) {
      uploads++
      return files.map(file => ({ ...file, fileID:'cloud://test/file', uploadStatus:'uploaded' }))
    },
    updateDraftFiles(_context, update) { this.data.files = update(this.data.files) }
  }
}

async function check() {
  const guest = view(false)
  await addSelectedFiles.call(guest, [{ size:max + 1 }])
  assert.match(guest.notice, /5 MB/)
  assert.equal(uploads, 0)
  assert.equal(guest.data.files.length, 0)

  guest.notice = ''
  await addSelectedFiles.call(guest, [{ size:3 * 1024 * 1024 }, { size:3 * 1024 * 1024 }])
  assert.match(guest.notice, /5 MB/, 'the guest limit covers the complete upload batch')
  assert.equal(uploads, 0)

  const boundary = view(false)
  await addSelectedFiles.call(boundary, [{ size:max }])
  assert.equal(uploads, 0, 'selection only creates a local draft')
  assert.equal(boundary.data.files[0].uploadStatus, 'selected')
  await deleteFile.call(boundary, { detail:{ index:0 } })
  assert.equal(boundary.data.files.length, 0, 'an unsent draft can be removed without a cloud request')
  await addSelectedFiles.call(boundary, [{ size:max }])
  const sent = await resolveTurnFiles.call(boundary, boundary.data.files)
  assert.equal(uploads, 1, 'upload starts after send')
  assert.equal(sent[0].fileID, 'cloud://test/file')

  const signedIn = view(true)
  await addSelectedFiles.call(signedIn, [{ size:max + 1 }])
  assert.equal(uploads, 1, 'the guest guard does not change signed-in selection limits')
  const mixed = await resolveTurnFiles.call(signedIn, [{ fileID:'cloud://existing' }, ...signedIn.data.files])
  assert.equal(uploads, 2)
  assert.equal(mixed[0].fileID, 'cloud://existing')
  assert.equal(mixed[1].fileID, 'cloud://test/file')

  const MB = 1024 * 1024
  for(const [name, limit] of [['photo.jpg',20],['notes.txt',20],['REPORT.PDF',50]]){
    const accepted = view(true)
    addSelectedFiles.call(accepted, [{name, size:limit * MB}])
    assert.equal(accepted.data.files.length, 1, `${name} accepts its exact boundary`)
    const rejected = view(true)
    addSelectedFiles.call(rejected, [{name, size:limit * MB + 1}])
    assert.match(rejected.notice, new RegExp(`${limit} MB`))
    assert.equal(rejected.data.files.length, 0, `${name} is rejected before upload`)
  }
  const accumulated = view(false)
  addSelectedFiles.call(accumulated, [{size:3 * MB}])
  addSelectedFiles.call(accumulated, [{size:3 * MB}])
  assert.equal(accumulated.data.files.length, 1, 'guest limit includes previously selected files')
  assert.match(accumulated.notice, /5 MB/)
}

check().catch(error => { console.error(error); process.exitCode = 1 })
