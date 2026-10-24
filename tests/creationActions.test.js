const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const read = path => fs.readFileSync(require.resolve('../' + path), 'utf8')
const i18n = require('../static_utils/i18n')
const store = { assetCacheEpoch: 4 }
let definition
const calls = [], events = []
let download = async () => '/tmp/image.png', save = async () => {}, remove = async () => {}, favorite = async () => {}, renewals = 0
let platform = 'ios', share = options => options.success()
let importKnowledge = async () => {}
let membership = async () => ({ added: false })
const wx = { nextTick: callback => callback(),
showShareImageMenu: options => { calls.push(['share', options]); share(options) },
saveImageToPhotosAlbum: async options => { calls.push(['save', options]); await save() },
shareFileMessage: options => { calls.push(['shareFile', options]); share(options) },
saveFileToDisk: options => { calls.push(['saveFile', options]); share(options) },
getDeviceInfo: () => ({ platform }),
showToast: options => calls.push(['toast', options]) }
vm.runInNewContext(read('components/_self/yb-asset-actions/index.js').replace(/^import .*$/gm, ''), {
  Component: value => { definition = value }, require: name => name.endsWith('i18n/index') ? i18n : name.endsWith('filePreview') ? { resolvePreviewFile: item => item.previewPath || download(), previewStorageFile: async (item, options) => calls.push(['original', item, options]) } : name.endsWith('chatAttachment') ? require('../static_utils/chatAttachment') : name.endsWith('/knowledge') ? { getKnowledgeMembership:id => membership(id), importKnowledge:async ids => { calls.push(['knowledgeImport', Array.from(ids)]); await importKnowledge() }, renameKnowledge:async (id,name) => calls.push(['knowledgeRename',id,name]), removeKnowledge:async id => calls.push(['knowledgeRemove',id]) } : {}, wx, store,
  renewAssetUrls: async items => { renewals++; return items },
  downloadStorageFile: (...args) => download(...args),
  deleteCloudFile: id => { calls.push(['delete', id]); return remove() },
  renameCreatedImage: async (id, name) => calls.push(['rename', id, name]),
  setStorageFileFavorite: async (id, value) => { calls.push(['favorite', id, value]); await favorite() },
  renameStorageFile: async (id, name) => calls.push(['renameFile', id, name])
})
let noticeText = ''
const notice = { show(message) { noticeText = message }, hide() { noticeText = '' } }
const view = { ...definition.methods, properties: { language: '中文' }, data: { ...definition.data }, 
  setData(patch, callback) { Object.assign(this.data, patch); callback?.() },
  triggerEvent: (name, detail) => events.push([name, detail]),
  createSelectorQuery: () => ({ select() { return this }, boundingClientRect(callback) { this.callback = callback; return this }, exec() { this.callback({ top: 40, left: 20 }) } }),
  selectComponent: id => id === '#assetNotice' ? notice : ({ show() { calls.push(['dialog']) }, close() {} }) }
definition.lifetimes.attached.call(view)
const item = { id: 'creation_1', fileID: 'original.png', url: 'https://cos.test/image.png', displayName: '作品', isImage: true,
  name: '作品.png', extension: 'png', mimeType: 'image/png', size: 42 }
const act = async (action, selected = item, source = 'creation') => {
  if (action !== 'share') return view.handleAssetAction({ detail: { action, item: selected, source, epoch: store.assetCacheEpoch } })
  view._epoch = store.assetCacheEpoch
  view._opening = true
  view.setData({ item: selected, source })
  view.syncActions()
  await view.prepareShare(selected, source)
  view.chooseAction({ currentTarget: { dataset: { action } } })
}
;(async () => {
  await act('share')
  assert.equal(calls.at(-1)[0], 'share')
  assert.equal(calls.at(-1)[1].path, '/tmp/image.png')
  assert.equal(calls.at(-1)[1].needShowEntrance, false)
  await act('save')
  assert.equal(noticeText, '图片已保存')
  assert.equal(calls.at(-1)[1].filePath, '/tmp/image.png')
  assert.equal(view.data.originTop, 40)
  assert.equal(view.data.originLeft, 20)
  view.clearAssetResult(); assert.equal(noticeText, '')
  save = async () => { throw { errMsg: 'saveImageToPhotosAlbum:fail auth deny' } }
  await act('save'); assert.match(noticeText, /允许保存到相册/)
  await act('chat')
  const attachment = events.find(([name]) => name === 'chatAsset')[1].files[0]
  assert.equal(attachment.tempFilePath, '/tmp/image.png')
  assert.equal(attachment.fileID, undefined, 'draft removal must never delete the original creation')
  assert.equal(attachment.extension, 'png')
  await act('rename'); assert.equal(view.data.assetDialogName, '作品')
  await view.confirmAssetAction({ detail: { value: '新作品' } })
  assert.deepEqual(calls.at(-1), ['rename', 'creation_1', '新作品'])
  await act('delete'); assert.equal(view.data.assetDialogMessage, '“作品”将被永久删除，不可恢复。')
  view.closeAssetDialog(); assert.notEqual(calls.at(-1)[0], 'delete', 'cancel never deletes')
  await act('delete'); await view.confirmAssetAction({ detail: {} })
  assert.deepEqual(calls.at(-1), ['delete', 'original.png'])
  assert.equal(noticeText, '已删除')
  remove = async () => { throw Error('COS failed') }
  await act('delete'); await view.confirmAssetAction({ detail: {} })
  assert.match(noticeText, /删除失败/)
  await act('rename'); store.assetCacheEpoch++
  const count = calls.length
  await view.confirmAssetAction({ detail: { value: 'wrong owner' } }); assert.equal(calls.length, count)
  let finish
  download = () => new Promise(resolve => { finish = resolve })
  view._epoch = store.assetCacheEpoch
  const pending = view.prepareShare(item, 'creation'); await new Promise(resolve => setImmediate(resolve))
  view._detached = true; finish('/tmp/late.png'); await pending
  view.shareAsset()
  assert.equal(calls.length, count, 'detached view never opens a late native share menu')

  const actions = { ...definition.methods, properties: { language: '中文' }, data: { item: { ...item }, source: 'creation' },
    setData(patch) { Object.assign(this.data, patch) }, triggerEvent: (name, detail) => events.push([name, detail]),
    selectComponent: () => ({ close() { return true } }),
    handleAssetAction: e => events.push(['action', e.detail]) }
  actions.syncActions(); assert.equal(actions.data.actions.length, 5)
  assert.ok(!actions.data.actions.some(action => action.id === 'knowledge'), 'creation menu has no knowledge import')
  assert.ok(!actions.data.actions.some(action => action.id === 'move'))
  actions._opening = true; actions._epoch = store.assetCacheEpoch
  actions.chooseAction({ currentTarget: { dataset: { action: 'save' } } })
  assert.notEqual(events.at(-1)[0], 'action', 'execute after flyout closes')
  actions.afterClose(); assert.equal(events.at(-1)[1].action, 'save')
  actions.data.source = 'library'; actions.data.knowledgeAdded = false; actions.syncActions()
  assert.ok(!actions.data.actions.some(action => action.id === 'move'))
  assert.equal(actions.data.actions[1].id, 'favorite', 'favorite is the second action, including for images')
  assert.equal(actions.data.actions[1].glyph, '\ue7db', 'reuse icon-tag_line')
  assert.equal(actions.data.actions[1].text, '添加到收藏夹')
  assert.equal(actions.data.actions[2].id, 'knowledge', 'knowledge follows favorites')
  assert.equal(actions.data.actions[2].glyph, '\ue7dc', 'reuse icon-package_2_line')
  assert.equal(actions.data.actions[2].text, '添加到知识库')
  actions._opening = true; actions._epoch = store.assetCacheEpoch
  actions.chooseAction({ currentTarget: { dataset: { action: 'knowledge' } } })
  assert.equal(actions._pendingAction.action, 'knowledge', 'import waits for menu exit')
  actions.afterClose(); assert.equal(events.at(-1)[1].action, 'knowledge')
  actions.data.item = { ...item, favorite: true }; actions.syncActions()
  assert.equal(actions.data.actions[1].text, '从收藏中移除')
  view._detached = false
  await act('favorite', item, 'library')
  assert.deepEqual(calls.at(-1), ['favorite', item.id, true])
  assert.equal(noticeText, '已添加到收藏夹')
  await act('favorite', { ...item, favorite: true }, 'library')
  assert.deepEqual(calls.at(-1), ['favorite', item.id, false])
  assert.equal(noticeText, '已从收藏中移除')
  favorite = async () => { throw Error('unavailable') }
  await act('favorite', item, 'library'); assert.match(noticeText, /添加收藏失败/)
  await act('favorite', { ...item, favorite: true }, 'library'); assert.match(noticeText, /移除收藏失败/)
  favorite = async () => { store.assetCacheEpoch++ }
  view.clearAssetResult()
  await act('favorite', item, 'library'); assert.equal(noticeText, '', 'late response cannot notify another account')
  favorite = async () => {}
  const document = { ...item, isImage: false, attachmentType: 'file', extension: 'pdf', name: 'report', displayName: 'report', mimeType: 'application/pdf' }
  actions.data.item = document; actions.syncActions()
  assert.equal(actions.data.actions.length, 6)
  assert.ok(!actions.data.actions.some(action => action.id === 'save'), 'documents offer sharing, never saving')
  assert.equal(actions.data.actions[1].id, 'favorite')
  for (const file of [item, { ...document, id: 'file_pdf' }]) {
    view.setData({ item: file, source: 'library', knowledgeAdded: false })
    await act('knowledge', file, 'library')
    assert.deepEqual(calls.at(-1), ['knowledgeImport', [file.id]], 'reuse the existing asset id without uploading')
    assert.equal(noticeText, '已添加到知识库')
    assert.equal(view.data.actions[2].text, '已添加到知识库')
    assert.equal(view.data.actions[2].disabled, true)
    const imported = calls.length
    await act('knowledge', file, 'library')
    assert.equal(calls.length, imported, 'successful imports cannot be repeated')
  }
  view.data.knowledgeAdded = false
  importKnowledge = async () => { throw Error('格式不支持') }
  await act('knowledge', document, 'library'); assert.equal(noticeText, '格式不支持')
  importKnowledge = async () => { throw Error() }
  await act('knowledge', document, 'library'); assert.equal(noticeText, '添加到知识库失败，请重试')
  for (const invalidation of ['account', 'detach']) {
    let finishImport
    importKnowledge = () => new Promise(resolve => { finishImport = resolve })
    view.clearAssetResult()
    const pendingImport = act('knowledge', document, 'library')
    await new Promise(setImmediate)
    const once = calls.length
    await act('knowledge', document, 'library')
    assert.equal(calls.length, once, 'in-flight imports reject double taps')
    if (invalidation === 'account') store.assetCacheEpoch++
    else definition.lifetimes.detached.call(view)
    finishImport(); await pendingImport
    assert.equal(noticeText, '', 'late import results cannot notify another account or detached view')
    assert.equal(view._operationBusy, false)
    view._detached = false
  }
  importKnowledge = async () => {}
  const beforeForeignImport = calls.length
  await act('knowledge', document, 'creation')
  assert.equal(calls.length, beforeForeignImport, 'only library assets can be imported')
  view._detached = false; download = async () => '/tmp/report.pdf'
  await act('share', document, 'library')
  assert.equal(calls.at(-1)[0], 'shareFile')
  assert.equal(calls.at(-1)[1].fileName, 'report.pdf')
  assert.equal(calls.at(-1)[1].filePath, '/tmp/report.pdf')
  await act('chat', document, 'library')
  const fileDraft = events.at(-1)[1].files[0]
  assert.equal(fileDraft.fileType, 'file'); assert.equal(fileDraft.fileID, undefined)
  await act('chat', { ...document, extension: 'zip' }, 'library')
  assert.equal(calls.at(-1)[0], 'toast', 'unsupported input formats keep the existing validation')
  await act('rename', document, 'library')
  await view.confirmAssetAction({ detail: { value: 'renamed.pdf' } })
  assert.deepEqual(calls.at(-1), ['renameFile', 'creation_1', 'renamed.pdf'])
  const nativeCount = calls.length
  await act('save', document, 'library')
  assert.equal(calls.length, nativeCount)
  const local = { ...item, id: 'knowledge-image', status:'ready', fileID: '', previewPath: '/tmp/knowledge.jpg' }
  const previousRenewals = renewals
  await act('share', local, 'knowledge')
  assert.equal(calls.at(-1)[1].path, '/tmp/knowledge.jpg')
  await act('chat', local, 'knowledge')
  assert.equal(events.at(-1)[1].files[0].tempFilePath, '/tmp/knowledge.jpg')
  assert.equal(events.at(-1)[1].files[0].fileType, 'image')
  assert.equal(events.at(-1)[1].knowledgeDocumentIds, undefined)
  await act('chat', { ...local, status:'indexing' }, 'knowledge')
  assert.equal(events.at(-1)[1].files[0].tempFilePath, '/tmp/knowledge.jpg', 'attachment chat does not require an indexed document')
  assert.equal(renewals, previousRenewals, 'knowledge never renews remote URLs')
  await act('rename', local, 'knowledge')
  const localRenameCalls = calls.length
  await view.confirmAssetAction({ detail: { value: '本地重命名.jpg' } })
  assert.equal(calls.length, localRenameCalls + 1); assert.equal(calls.at(-1)[0], 'knowledgeRename')
  assert.equal(events.at(-1)[0], 'statechange')
  const localRename = events.findLast(([name]) => name === 'localchange')[1]
  assert.equal(localRename.action, 'rename')
  await act('delete', local, 'knowledge')
  assert.match(view.data.assetDialogMessage, /原文件仍保留/)
  const localDeleteCalls = calls.length
  await view.confirmAssetAction({ detail: {} })
  assert.equal(calls.length, localDeleteCalls + 1); assert.equal(calls.at(-1)[0], 'knowledgeRemove')
  assert.equal(events.findLast(([name]) => name === 'localchange')[1].action, 'delete')
  actions.data.source = 'knowledge'; actions.syncActions()
  assert.equal(actions.data.actions[1].id, 'original')
  assert.equal(actions.data.actions[1].icon, 'icon-document')
  assert.equal(actions.data.actions[1].text, '查看原文')
  await act('original', local, 'knowledge')
  assert.equal(calls.at(-1)[0], 'original')
  assert.equal(calls.at(-1)[1], local)
  assert.ok(!actions.data.actions.some(action => action.id === 'favorite'))
  assert.ok(!actions.data.actions.some(action => action.id === 'knowledge'))
  assert.equal(actions.data.actions.at(-1).text, '从知识库中删除')
  actions._opening = true; actions._pendingAction = null
  actions.chooseAction({ currentTarget: { dataset: { action: 'rename' } } }); actions.afterClose()
  assert.equal(events.at(-1)[0], 'action'); assert.equal(events.at(-1)[1].source, 'knowledge')
  await act('delete', document, 'library')
  const deleteCount = calls.length
  definition.pageLifetimes.hide.call(view)
  await view.confirmAssetAction({ detail: {} })
  assert.equal(calls.length, deleteCount, 'leaving a page invalidates pending destructive confirmations')

  const membershipView = () => ({ ...view, _detached: false, _opening: false, _operationBusy: false,
    data: { ...definition.data }, selectComponent: id => id === '#assetNotice' ? notice : { open: async () => true, close: () => true } })
  const member = membershipView()
  let finishMembership
  membership = id => { assert.equal(id, document.id); return new Promise(resolve => { finishMembership = resolve }) }
  await member.open(document, {}, 'library')
  assert.equal(member.data.actions[2].disabled, true, 'membership checks disable import while pending')
  member.chooseAction({ currentTarget: { dataset: { action: 'knowledge' } } })
  assert.equal(member._pendingAction, null, 'disabled taps cannot close the menu or queue import')
  finishMembership({ added: true }); await new Promise(setImmediate)
  assert.equal(member.data.actions[2].text, '已添加到知识库')
  assert.equal(member.data.actions[2].disabled, true)
  member.chooseAction({ currentTarget: { dataset: { action: 'knowledge' } } })
  assert.equal(member._pendingAction, null)
  member.afterClose()
  membership = async () => ({ added: false })
  await member.open(document, {}, 'library')
  assert.equal(member.data.actions[2].text, '添加到知识库')
  assert.equal(member.data.actions[2].disabled, false, 'removed membership is checked again on reopening')
  member.chooseAction({ currentTarget: { dataset: { action: 'knowledge' } } })
  assert.equal(member._pendingAction.action, 'knowledge', 'removed files can be added again')
  member.afterClose()
  await new Promise(setImmediate)
  assert.deepEqual(calls.at(-1), ['knowledgeImport', [document.id]])
  assert.equal(member.data.actions[2].text, '已添加到知识库')
  assert.equal(member.data.actions[2].disabled, true)
  membership = async () => { throw Error() }
  await member.open(document, {}, 'library')
  assert.equal(member.data.actions[2].disabled, true, 'failed checks never enable unknown membership')
  assert.equal(noticeText, '无法确认知识库状态，请重新打开菜单')
  member.afterClose()
  for (const invalidation of ['account', 'detach', 'reopen']) {
    membership = () => new Promise(resolve => { finishMembership = resolve })
    const current = membershipView()
    await current.open(document, {}, 'library')
    if (invalidation === 'account') store.assetCacheEpoch++
    else if (invalidation === 'detach') definition.lifetimes.detached.call(current)
    else {
      current.afterClose()
      membership = async () => ({ added: false })
      await current.open({ ...document, id: 'other-file' }, {}, 'library')
    }
    const before = current.data.knowledgeAdded
    finishMembership({ added: true }); await new Promise(setImmediate)
    assert.equal(current.data.knowledgeAdded, before, 'late membership checks cannot change a different account, view or menu')
    current.afterClose()
  }
  membership = async () => ({ added: false })
  const menuTemplate = read('components/_self/yb-asset-actions/index.wxml')
  assert.match(menuTemplate, /item\.disabled \? 'text-l2' : 'text-l0'/)
  assert.match(menuTemplate, /item\.disabled \? 'none' : 'asset-pressed'/)
  assert.match(menuTemplate, /aria-disabled="\{\{item\.disabled \|\|/)
  assert.match(menuTemplate, /aria-label="\{\{item\.text\}\}"/)
  assert.match(menuTemplate, /class="asset-menu-label ft32">\{\{item\.text\}\}/)
  assert.doesNotMatch(menuTemplate, /preparingFile/)

  // Native export must happen synchronously inside the tap, before flyout close.
  for (const [source, isImage, device] of [
    ['library', false, 'ios'], ['knowledge', false, 'ios'], ['library', false, 'mac'],
    ['library', false, 'windows'], ['library', true, 'ios'], ['knowledge', true, 'ios'], ['creation', true, 'ios'],
    ['library', true, 'mac'], ['knowledge', true, 'windows']
  ]) {
    const order = [], selected = isImage ? item : document
    let finishPreparation, nativeReply, tapping = false
    download = () => new Promise(resolve => { finishPreparation = resolve })
    platform = device
    share = options => { assert.equal(tapping, true, 'native API must retain the original tap'); order.push('native'); nativeReply = options }
    const v = { ...view, _detached: false, _opening: false, _operationBusy: false, _pendingAction: null,
      data: { ...definition.data },
      selectComponent: id => id === '#assetNotice' ? notice : {
        open: async () => { order.push('open'); return true },
        close: () => { order.push('close'); return true }
      } }
    await v.open(selected, {}, source)
    assert.deepEqual(order, ['open'], 'preparation must not delay popup animation')
    const beforeReady = calls.length
    v.clearAssetResult()
    v.chooseAction({ currentTarget: { dataset: { action: 'share' } } })
    assert.equal(calls.length, beforeReady, 'early taps cannot invoke native export or queue an automatic share')
    assert.equal(noticeText, '', 'early taps remain silent')
    assert.deepEqual(order, ['open'], 'early taps keep the menu open')
    finishPreparation('/tmp/prepared-file'); await new Promise(setImmediate)
    assert.equal(v.data.sharePreparing, false)
    tapping = true
    v.chooseAction({ currentTarget: { dataset: { action: 'share' } } })
    tapping = false
    assert.deepEqual(order, ['open', 'native', 'close'], 'retain flyout close while invoking native export before it')
    assert.equal(calls.at(-1)[0], device !== 'ios' ? 'saveFile' : isImage ? 'share' : 'shareFile')
    const once = calls.length
    v.chooseAction({ currentTarget: { dataset: { action: 'share' } } })
    v.afterClose()
    assert.equal(calls.length, once, 'repeated taps and afterclose cannot share twice')
    assert.equal(v._operationBusy, true, 'native callback owns completion')
    view.clearAssetResult()
    nativeReply.fail({ errMsg: 'share:fail cancel' })
    assert.equal(v._operationBusy, false)
    assert.equal(noticeText, '', 'cancellation remains silent')

    download = async () => { throw Error('network failed') }
    await v.open(selected, {}, source); await new Promise(setImmediate)
    assert.equal(v._shareFile.failed, true)
    const failedDownload = calls.length
    v.chooseAction({ currentTarget: { dataset: { action: 'share' } } })
    assert.equal(noticeText, '文件下载失败，请重试')
    assert.equal(calls.length, failedDownload)
    await new Promise(setImmediate)
    download = async () => '/tmp/retry-file'
    await v.prepareShare(selected, source)
    tapping = true; v.chooseAction({ currentTarget: { dataset: { action: 'share' } } }); tapping = false
    nativeReply.fail({ errMsg: 'share:fail unsupported' })
    assert.equal(noticeText, device === 'ios' ? '分享失败，请重试' : '文件下载失败，请重试')
    v.afterClose()

    await v.open(selected, {}, source); await new Promise(setImmediate)
    const oldOwner = calls.length
    store.assetCacheEpoch++
    v.chooseAction({ currentTarget: { dataset: { action: 'share' } } })
    assert.equal(calls.length, oldOwner, 'prepared paths cannot be shared after an account change')
    v.afterClose()
  }
  share = options => options.success()
  platform = 'ios'

  let page
  const pageSource = read('pages/index/index.js')
  vm.runInNewContext('Page({' + pageSource.slice(pageSource.indexOf('  startAssetChat(e)'), pageSource.indexOf('  finishCreationTurn()')) + '})', {
    Page: value => { page = value }, store, wx, HOME_FEATURES: { CHAT: 'chat' }
  })
  let resets = 0, selected
  const chat = { resetChatSession() { resets++ }, addSelectedFiles(files) { selected = files } }
  page.startAssetChat.call({ setData(_patch, callback) { callback() }, getChatView: () => chat }, { detail: { epoch: store.assetCacheEpoch, files: [attachment] } })
  assert.equal(resets, 1); assert.equal(selected[0], attachment)

  const invalidations = [], requests = []
  const api = { callHttp: async (_path, params) => { requests.push(params); return { result: { code: 200, data: params.funName === 'deleteCloudFile'
    ? { fileList: [{ fileID: params.fileID, status: -1 }] } : {} } } }, eventBus: { emit(name, detail) { invalidations.push(detail.source) }, on() {} }, ASSET_LIST_INVALIDATED: 'assets', CHAT_SESSION_RESET: 'reset' }
  vm.runInNewContext(read('request/request.js').replace(/^import .*$/gm, '').replace(/^export /gm, ''), api)
  await assert.rejects(api.deleteCloudFile('original.png'), /文件删除失败/)
  await api.setStorageFileFavorite('file_1', true)
  assert.equal(requests.at(-1).funName, 'setStorageFileFavorite')
  assert.equal(requests.at(-1).id, 'file_1'); assert.equal(requests.at(-1).favorite, true)
  assert.deepEqual(invalidations.slice(-2), ['library', 'mine'])
  api.callHttp = async () => { throw Error('network') }
  await assert.rejects(api.setStorageFileFavorite('file_1', false), /network/)
  assert.deepEqual(invalidations.slice(-2), ['library', 'mine'])
  const markup = read('components/yb-confirm-dialog/index.wxml')
  assert.ok(markup.indexOf('aria-label="{{cancelText}}"') < markup.indexOf('aria-label="{{confirmText}}"'))
  console.log('creationActions: native actions, animation, permissions, dialogs, draft attachment and owner/lifecycle guards passed')
})().catch(error => { console.error(error); process.exitCode = 1 })
