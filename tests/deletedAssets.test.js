const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { mergeGeneratedImages, visibleGeneratedImages } = require('../static_utils/generatedImages')
const { getMessageAttachments } = require('../static_utils/chatAttachment')

const fileID = 'cloud://env/old-image'
const image = { artifactId:'old', width:512, height:512, url:'https://example.com/image', status:'completed', fileID }
const [removed] = mergeGeneratedImages(mergeGeneratedImages([], [image]), [{ ...image, url:'', status:'unavailable', unavailableReason:'storage_deleted' }])
assert.equal(removed.status, 'unavailable')
assert.equal(removed.url, '')
assert.equal(removed.unavailableReason, 'storage_deleted')
assert.equal(mergeGeneratedImages([], [{ ...image, url:'', status:'failed' }])[0].unavailableReason, undefined)
assert.equal(getMessageAttachments([{ type:'attachment', attachmentType:'file', fileID, unavailableReason:'storage_deleted' }])[0].unavailableReason, 'storage_deleted')

const source = fs.readFileSync('static_utils/filePreview.js', 'utf8')
const route = source.slice(source.indexOf('function openStorageUpgrade('), source.indexOf('\nfunction openDocument('))
const calls = []
const context = { wx: { navigateTo: options => calls.push(options) } }
vm.createContext(context)
vm.runInContext(`${route}\nopenStorageUpgrade();`, context)
assert.equal(calls[0].url, '/pages/upgrade/index')
assert.equal(calls[0].routeType, 'settingRouterBuilder')
assert.equal(calls[0].routeOptions.stacked, true)

const chatSource = fs.readFileSync('components/_self/yb-chat-view/index.js', 'utf8')
const noticeSource = chatSource.slice(chatSource.indexOf('  showUploadFailure('), chatSource.indexOf('  /**', chatSource.indexOf('  showUploadFailure(')))
const previewSource = chatSource.slice(chatSource.indexOf('  async previewMessageAttachment('), chatSource.indexOf('  markDeletedMessageAssets('))
const { messages, t } = require('../static_utils/i18n')
const { artifactAttachmentDetail } = require('../static_utils/chatArtifacts')
let shown, hidden = 0, navigated = 0
const hostContext = { t, openStorageUpgrade() { navigated++ }, previewStorageFile() { assert.fail('deleted file must not be downloaded') } }
vm.runInNewContext(`this.methods = {${noticeSource}${previewSource}}`, hostContext)
const host = { ...hostContext.methods, properties:{ language:'中文' }, data:{},
  setData(patch, callback) { Object.assign(this.data, patch); callback?.() },
  selectComponent: () => ({ show(message) { shown = message }, hide() { hidden++ } }) }
const deletedFile = { type:'attachment', attachmentType:'file', artifactId:'deleted_file', unavailableReason:'storage_deleted', status:'unavailable' }
for (const detail of [{ attachment:deletedFile }, artifactAttachmentDetail([deletedFile], 'artifact://deleted_file')]) {
  host.previewMessageAttachment({ detail })
  assert.equal(shown, messages('中文').assets.fileDeleted)
  assert.equal(host.data.deletedAssetNotice, true)
  assert.equal(navigated, 0, 'card and Markdown clicks only show the notice')
}
host.openStorageUpgrade()
assert.equal(navigated, 1, 'only the capsule action opens the subscription page')
assert.equal(hidden, 1)
host.showUploadFailure('上传超限')
assert.equal(host.data.deletedAssetNotice, false, 'upload notices restore the close button')
assert.equal(shown, '上传超限')
host._destroyed = true
host.openDeletedMessageAsset()
assert.equal(shown, '上传超限', 'detached chat does not reopen a notice')

const archiveSource = fs.readFileSync('mdPackage/pages/archivedChat/index.js', 'utf8')
const archiveContext = { openStorageUpgrade() { navigated++ } }
vm.runInNewContext('this.methods = {' + archiveSource.slice(archiveSource.indexOf('  openDeletedMessageAsset()'), archiveSource.indexOf('  onShow()')) + '}', archiveContext)
const archive = { ...archiveContext.methods, data:{ i18n:messages('中文') }, selectComponent:host.selectComponent }
archive.openDeletedMessageAsset()
assert.equal(shown, messages('中文').assets.fileDeleted)
assert.equal(navigated, 1)
archive.openStorageUpgrade()
assert.equal(navigated, 2)
for (const path of ['components/_self/yb-chat-view/index.wxml', 'mdPackage/pages/archivedChat/index.wxml']) {
  const markup = fs.readFileSync(path, 'utf8')
  assert.match(markup, /slot="suffix"[^>]*catch:tap="openStorageUpgrade"/)
  assert.match(markup, /i18n\.assets\.getMoreStorage/)
  assert.match(markup, /icon-arrow-right/)
}

const attachments = fs.readFileSync('mdPackage/components/messageAttachments/index.wxml', 'utf8')
const generated = fs.readFileSync('mdPackage/components/generatedImages/index.wxml', 'utf8')
assert.match(attachments, /item\.unavailableReason[\s\S]*i18n\.assets\.spaceInsufficient/)
assert.match(attachments, /i18n\.assets\.fileDeleted/)
assert.match(generated, /item\.unavailableReason[\s\S]*icon-image1[\s\S]*i18n\.assets\.imageDeleted/)
assert.doesNotMatch(generated, /<view wx:if="\{\{item\.unavailableReason\}\}"[^>]*catch:tap/)
console.log('deletedAssets: card/Markdown notices and explicit subscription actions passed')

// Deleted images retain body placement and dimensions; absent geometry uses exactly 360rpx.
const towxml = require('../mdPackage/components/towxmlstream/index')
const flatten = node => [node, ...(node.children || []).flatMap(flatten)]
for (const render of [towxml, towxml.static]) {
  const metadata = { ...image, type:'artifact', artifactType:'image', status:'unavailable',
    displayMode:'markdown', unavailableReason:'storage_deleted', url:'', width:504, height:896 }
  const body = 'before\n\n![deleted](artifact://old)\n\nafter'
  const nodes = flatten(render(body, 'markdown', { images:[metadata] }))
  const embedded = nodes.find(node => node.generatedImage)?.generatedImage
  assert.equal(embedded?.artifactId, 'old', 'stable deleted reference remains in the original body slot')
  const [card] = mergeGeneratedImages([], [embedded])
  assert.equal(card.width, 504); assert.equal(card.height, 896)
  assert.equal(card.heightVw, 75 * 896 / 504)
  assert.equal(card.status, 'unavailable')
  assert.equal(visibleGeneratedImages([card], true, [], ['old']).length, 0, 'avoid duplicate body and tail placeholders')
  const withoutSize = { ...metadata, width:undefined, height:undefined }
  const fallbackNode = flatten(render(body, 'markdown', { images:[withoutSize] })).find(node => node.generatedImage)
  const [fallback] = mergeGeneratedImages([], [fallbackNode.generatedImage])
  assert.equal(fallback.widthVw * 7.5, 360)
  assert.equal(fallback.heightVw * 7.5, 360)
  assert.equal(visibleGeneratedImages([{...fallback, displayMode:'markdown'}], true).length, 1,
    'legacy replies without a body reference still show the deleted placeholder')
}
console.log('deleted images: body references, original geometry, 360rpx fallback and deduplication passed')

const userImageBranch = attachments.slice(attachments.indexOf('<view wx:if="{{images.length}}"'))
assert.match(userImageBranch, /i18n\.assets\.deleted/)
assert.doesNotMatch(userImageBranch, /icon-image1|360rpx/)
const userImageStyles = fs.readFileSync('mdPackage/components/messageAttachments/index.wxss', 'utf8')
assert.match(userImageStyles, /\.attachment-image\s*\{[^}]*width:\s*80px;[^}]*height:\s*80px;/)
let attachmentDefinition
vm.runInNewContext(fs.readFileSync('mdPackage/components/messageAttachments/index.js', 'utf8'), {
  Component: value => { attachmentDefinition = value }, require: () => ({})
})
let imagePreviewed = false
attachmentDefinition.methods.previewFile.call({ data:{ images:[{ unavailableReason:'storage_deleted' }] },
  triggerEvent() { imagePreviewed = true } }, { currentTarget:{ dataset:{ kind:'image', index:0 } } })
assert.equal(imagePreviewed, false, 'deleted user image is a fixed-size label, not a recovery action')
