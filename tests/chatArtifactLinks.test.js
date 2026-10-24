const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { parseArtifactLink, artifactAttachmentDetail, deliveredAttachment, messageCopyText } = require('../static_utils/chatArtifacts')
const { mergeGeneratedImages, visibleGeneratedImages } = require('../static_utils/generatedImages')
const towxml = require('../mdPackage/components/towxmlstream/index')

const image = { type:'artifact', artifactType:'image', artifactId:'image_1', assetId:'image_storage',
  fileID:'owned/image.png', name:'出行海报.png', mimeType:'image/png', width:504, height:896,
  status:'completed', displayMode:'markdown', url:'https://expired.example/image.png', urlExpiresAt:1 }
const file = { type:'attachment', attachmentType:'file', artifactId:'file_1', assetId:'file_storage',
  fileID:'owned/guide.md', name:'出行指南.md', status:'completed', mimeType:'text/markdown' }
const parts = [image, file]
const onlineFile = { ...file, url:'https://files.example/guide.md?signature=confirmed', urlExpiresAt:Date.now()+600000 }
assert.equal(artifactAttachmentDetail([onlineFile], onlineFile.url).attachment.assetId, file.assetId)
assert.equal(artifactAttachmentDetail([onlineFile], onlineFile.url + '&forged=1'), null)
assert.equal(artifactAttachmentDetail(parts, onlineFile.url), null, 'online links are bound to this message metadata')
assert.equal(artifactAttachmentDetail([{...onlineFile, status:'failed'}], onlineFile.url), null)
const removedFile = { ...onlineFile, status:'unavailable', unavailableReason:'storage_deleted', previewPath:'wxfile://forged' }
for (const link of [onlineFile.url, 'artifact://file_1']) {
  const removedDetail = artifactAttachmentDetail([removedFile], link)
  assert.equal(removedDetail.attachment.unavailableReason, 'storage_deleted')
  assert.equal(removedDetail.attachment.previewPath, '')
  assert.equal(removedDetail.attachments.length, 0)
}
assert.equal(deliveredAttachment(removedFile), null, 'a deletion notice never makes the file downloadable')
assert.equal(artifactAttachmentDetail([removedFile], 'artifact://another_message'), null)
for (const [source, expected] of [
  ['正文 ![老虎](https://files.example/tiger.png) 与 [说明](https://files.example/a.md?signature=secret)', '正文 老虎 与 说明'],
  ['[文件](artifact://file_1)', '文件'],
  ['[**标题**](<https://example.com/a_(b)> "说明")，**正文**', '**标题**，**正文**'],
  ['`[代码](https://example.com)`', '`[代码](https://example.com)`'],
  ['```md\n[示例](https://example.com)\n```\n[下载](https://example.com/file)', '```md\n[示例](https://example.com)\n```\n下载'],
]) assert.equal(messageCopyText(source), expected)
let actionsDefinition
vm.runInNewContext(fs.readFileSync(require.resolve('../mdPackage/components/assisAct/index'), 'utf8')
  .replace(/^import .*$/gm, 'const triggerHaptic = () => {}'), {
  Component:value => { actionsDefinition = value },
  require:name => name === '../../../static_utils/i18n/behavior' ? {} : require(`../static_utils/${name.slice('../../../static_utils/'.length)}`),
})
let copiedMessage
actionsDefinition.methods.copy.call({data:{item:{content:`![老虎](https://files.example/tiger.png)\n[说明](${onlineFile.url})`}},
  triggerEvent(name, detail) { assert.equal(name, 'copy'); copiedMessage=detail.content }})
assert.equal(copiedMessage, '老虎\n说明', 'stream, history and archive share the same action-bar copy projection')
assert.equal(parseArtifactLink('artifact://image_1'), 'image_1')
for (const target of ['artifact://', 'artifact://../image_1', 'artifact://image_1?token=x',
  'artifact://image_1#x', 'artifact://%69mage_1', 'artifact://image_1/', 'ARTIFACT://image_1',
  'https://example.com/image_1', 'javascript:alert(1)', `artifact://${'a'.repeat(129)}`, null]) {
  assert.equal(parseArtifactLink(target), '', `reject ${target}`)
  assert.equal(artifactAttachmentDetail(parts, target), null)
}
assert.equal(artifactAttachmentDetail(parts, 'artifact://another_message'), null, 'a reference cannot look outside this message')
assert.equal(artifactAttachmentDetail([], 'artifact://image_1'), null)
for (const patch of [{ status:'generating' }, { status:'failed' }, { status:'unknown' },
  { unavailableReason:'storage_deleted' }, { assetId:'' }, { fileID:'' }, { type:'text' }]) {
  assert.equal(artifactAttachmentDetail([{ ...image, ...patch }], 'artifact://image_1'), null)
}
const imageDetail = artifactAttachmentDetail([{ ...image, previewPath:'wxfile://forged' }, file], 'artifact://image_1')
assert.equal(imageDetail.attachment.attachmentType, 'image')
assert.equal(imageDetail.attachment.assetId, 'image_storage')
assert.equal(imageDetail.attachment.previewPath, '', 'references must use owned storage renewal')
assert.equal(artifactAttachmentDetail(parts, 'artifact://file_1').attachment.name, '出行指南.md')

function flatten(node) { return [node, ...(node.children || []).flatMap(flatten)] }
for (const render of [towxml, towxml.static]) {
  for (const option of [{images:[onlineFile]}, {files:[onlineFile]}, {images:[removedFile]}, {files:[removedFile]}]) {
    const linked = flatten(render(`[指南](${onlineFile.url})`, 'markdown', option)).find(node => node.artifactLink)
    assert.equal(linked.tag, 'span', 'HTTPS files keep the existing inline hyperlink appearance')
    assert.equal(linked.artifactText, '指南')
    assert.equal(linked.attrs.href, onlineFile.url)
    const external = flatten(render('[其他](https://files.example/another.md)', 'markdown', option))
    assert.equal(external.some(node => node.artifactLink), false, 'a URL cannot claim another message or unconfirmed file')
  }
  const imageUrl = 'https://example.com/generated/image_1.png'
  const embedded = flatten(render(`![出行海报](${imageUrl})\n\n[指南](artifact://file_1)`, 'markdown'))
  assert.equal(embedded.find(node => node.attrs?.src === imageUrl)?.tag, 'img',
    'delivered HTTPS images render inline through the normal Markdown image path')
  assert.equal(embedded.filter(node => node.artifactLink).length, 1,
    'the file keeps its owned artifact-link interaction')
  const result = flatten(render('附件：[**出行海报**](artifact://image_1) 和 [指南](artifact://file_1)。[网站](https://example.com)', 'markdown'))
  const links = result.filter(node => node.artifactLink)
  assert.equal(links.length, 2)
  assert.equal(links[0].tag, 'span', 'artifact links never become native navigators')
  assert.equal(links[0].artifactText, '出行海报')
  assert.equal(links[0].attrs.href, 'artifact://image_1')
  assert.ok(result.some(node => node.tag === 'navigator' && node.attrs.href === 'https://example.com'))
  const invalid = flatten(render('<a href="artifact://image_1?x=1">伪造链接</a>', 'html')).find(node => node.artifactLink)
  assert.equal(invalid.tag, 'span')
  assert.equal(invalid.attrs.href, undefined)
  assert.equal(flatten(render('`[海报](artifact://image_1)`', 'markdown')).filter(node => node.artifactLink).length, 0)
}

const merged = mergeGeneratedImages([], [image, { ...image, artifactId:'inline_1', displayMode:'inline' },
  { ...image, artifactId:'legacy_1', displayMode:undefined }, { ...image, artifactId:'unrecognized', displayMode:'other' }])
assert.equal(merged.length, 4, 'message state preserves Markdown-only metadata')
assert.deepEqual(visibleGeneratedImages(merged).map(part => part.artifactId), ['inline_1', 'legacy_1'])
assert.equal(artifactAttachmentDetail(merged, 'artifact://image_1').attachment.assetId, image.assetId)
assert.equal(mergeGeneratedImages(merged, [{ ...image, displayMode:undefined }])[0].displayMode, 'markdown',
  'a late update cannot turn a Markdown image into a card')
const renewedImage = mergeGeneratedImages(merged, [{ artifactId:image.artifactId, width:image.width, height:image.height,
  status:'completed', url:'https://fresh.example/image_storage' }])[0]
assert.equal(renewedImage.assetId, image.assetId)
assert.equal(renewedImage.fileID, image.fileID)
assert.equal(renewedImage.displayMode, 'markdown', 'URL refresh retains artifact identity and its display mode')

let decodeDefinition
global.Component = definition => { decodeDefinition = definition }
require('../mdPackage/components/towxmlstream/decode')
delete global.Component
const events = []
const decoder = { data:{ contextId:'' }, triggerEvent(name, detail, options) { events.push({ name, detail, options }) } }
const parsedLink = flatten(towxml.static('[海报](artifact://image_1)', 'markdown')).find(node => node.artifactLink)
decodeDefinition.methods.invokeEvent.call(decoder, 'tap', [{ currentTarget:{ dataset:{ data:parsedLink } } }])
assert.deepEqual(events.pop(), { name:'artifactlink', detail:{ link:'artifact://image_1' }, options:{ bubbles:true, composed:true } })
decodeDefinition.methods.invokeEvent.call(decoder, 'tap', [{ currentTarget:{ dataset:{ data:{ attrs:{ href:'https://example.com' } } } } }])
assert.equal(events.length, 0, 'ordinary hyperlinks keep the existing event path')

function loadComponent(relative) {
  let definition
  vm.runInNewContext(fs.readFileSync(require.resolve(relative), 'utf8'), {
    Component:value => { definition = value },
    require:name => name === '../../../static_utils/i18n/behavior' ? {} :
      name === '../towxmlstream/index' ? towxml :
      name.startsWith('../../../static_utils/') ? require(`../static_utils/${name.slice('../../../static_utils/'.length)}`) : {},
    wx:{ worklet:{ shared:value => ({ value }), spring:value => value, timing:value => value },
      showToast:options => events.push({ name:'toast', detail:options }) },
    getApp:() => ({ globalData:{ durationTime:250 } }),
  })
  return definition
}
const streamDefinition = loadComponent('../mdPackage/components/assisStream/index')
const doneDefinition = loadComponent('../mdPackage/components/assisDone/index')
const imageDefinition = loadComponent('../mdPackage/components/generatedImages/index')
const cardInstance = { data:{ cards:[] }, setData(patch, callback) { Object.assign(this.data, patch); callback?.() }, animateEntrance() {} }
imageDefinition.observers['images, content, settled, referencedIds, turnStatus'].call(cardInstance, merged)
assert.deepEqual(Array.from(cardInstance.data.cards, item => item.artifactId), ['inline_1', 'legacy_1'],
  'the actual card observer hides both pending and completed Markdown images')
imageDefinition.observers['images, content, settled, referencedIds, turnStatus'].call(cardInstance, [{ ...image, status:'generating', url:'' }])
assert.equal(cardInstance.data.cards.length, 0, 'autonomous image creation does not insert a loading card')
const projectCards = (parts, body, settled = true, status = '', references = []) => {
  imageDefinition.observers['images, content, settled, referencedIds, turnStatus'].call(cardInstance, parts, body, settled, references, status)
  return Array.from(cardInstance.data.cards, item => item.artifactId)
}
assert.deepEqual(projectCards([image], '图片已交付。'), ['image_1'])
assert.deepEqual(projectCards([image, image], ''), ['image_1'])
assert.deepEqual(projectCards([image], '', false), [])
const inlineImage = { ...image, displayMode:'inline' }
assert.deepEqual(projectCards([inlineImage], ''), ['image_1'])
assert.deepEqual(projectCards([inlineImage], '![图](' + image.url + ')'), [], 'both modes use the Markdown card once embedded')
assert.deepEqual(visibleGeneratedImages([inlineImage], false, [], ['image_1']), [],
  'the real typewriter transfers the card as soon as its image placeholder is mounted')
assert.deepEqual(visibleGeneratedImages([inlineImage], false), [inlineImage],
  'a received future Markdown link cannot hide the card before the typewriter reaches it')
for (const body of ['![图](' + image.url + ')', '![图][p]\n\n[p]: ' + image.url,
  '<img src="' + image.url + '">', '![图](' + image.url + '?renewed=1)'])
  assert.deepEqual(projectCards([image], body), [])
for (const body of ['[图](' + image.url + ')', '\x60![图](' + image.url + ')\x60',
  '\x60\x60\x60\n![图](' + image.url + ')\n\x60\x60\x60'])
  assert.deepEqual(projectCards([image], body), ['image_1'])
for (const status of ['generating', 'failed', 'unknown'])
  assert.deepEqual(projectCards([{ ...image, status }], ''), [])
const second = { ...image, artifactId:'image_2', url:'https://example.com/second.png' }
assert.deepEqual(projectCards([image, second], '![图](' + image.url + ')'), ['image_2'])
const versions = [inlineImage, {...second,displayMode:'inline'}]
const finalBody = '最终海报。\n\n![最终版](' + second.url + ')'
const storedVersions = JSON.stringify(versions)
assert.deepEqual(projectCards(versions,finalBody,false,'running'),['image_1','image_2'],
  'intermediate and final images stay in their timeline slots during generation')
assert.deepEqual(projectCards(versions,finalBody,false,'completed'),['image_1','image_2'],
  'a received final response cannot hide images before its Markdown is rendered')
assert.deepEqual(projectCards(versions,finalBody,true,'completed'),[],
  'successful delivery keeps only the final body images and hides unselected intermediate versions')
assert.deepEqual(projectCards([inlineImage],finalBody,true,'completed',['image_2']),[],
  'a prior tool slot also hides its draft when another slot supplies the rendered final image')
for(const status of ['running','failed','cancelling','cancelled','']){
  assert.deepEqual(projectCards(versions,finalBody,true,status),['image_1'],
    `${status || 'legacy'} messages retain unreferenced images alongside body image deduplication`)
}
for(const body of ['', '海报已生成。', '[下载最终版](' + second.url + ')',
  '`![最终版](' + second.url + ')`', '![外部参考](https://example.com/reference.png)']){
  assert.deepEqual(projectCards(versions,body,true,'completed'),['image_1','image_2'],
    'image-only delivery and bodies without generated-image references preserve their artifacts')
}
assert.equal(JSON.stringify(versions),storedVersions,'final selection never deletes stored image metadata')
assert.equal(artifactAttachmentDetail(versions,'artifact://image_1').attachment.assetId,image.assetId,
  'an intermediate version remains available to owned artifact preview and later editing')
const coveredCards = { ...imageDefinition.methods, data:{ ...imageDefinition.data, cards:[] },
  setData(patch, callback) {
    for (const [key,value] of Object.entries(patch)) {
      const cardPath = /^cards\[(\d+)\]$/.exec(key)
      if (cardPath) this.data.cards[Number(cardPath[1])] = value
      else this.data[key] = value
    }
    callback?.()
  }, animateEntrance() {} }
const inlinePending = { ...image, displayMode:'inline', status:'generating', url:'' }
imageDefinition.observers['images, content, settled, referencedIds, turnStatus'].call(coveredCards, [inlinePending])
const heightBeforeCover = coveredCards.data.listHeight
for (let index=0; index<3; index++) {
  imageDefinition.pageLifetimes.hide.call(coveredCards)
  assert.equal(coveredCards.data.pageHidden, true)
  assert.equal(coveredCards.data.cards[0].artifactId, image.artifactId)
  assert.equal(coveredCards.data.listHeight, heightBeforeCover, 'covered loading cards retain their geometry')
  imageDefinition.observers['images, content, settled, referencedIds, turnStatus'].call(coveredCards, [{ ...image, displayMode:'inline' }])
  assert.equal(coveredCards.data.pageHidden, true, 'delivery while covered cannot re-enable the Canvas')
  imageDefinition.methods.updateImage.call(coveredCards, {
    currentTarget:{ dataset:{ id:image.artifactId, url:image.url } },
  }, { loaded:true, loadFailed:false })
  imageDefinition.pageLifetimes.show.call(coveredCards)
  assert.equal(coveredCards.data.pageHidden, false)
  assert.equal(coveredCards.data.cards[0].loaded, true, 'return restores the delivered image without replaying loading')
}
const imageWxml = fs.readFileSync(require.resolve('../mdPackage/components/generatedImages/index.wxml'), 'utf8')
assert.match(imageWxml, /visibility:\s*\{\{pageHidden \? 'hidden' : 'visible'\}\}/,
  'page coverage hides card painting while retaining the list height')
assert.match(imageWxml, /<yb-dot-matrix-loading\s+wx:if="\{\{!pageHidden\}\}"/,
  'the native loading Canvas must unmount rather than only pause its frames')
const loadingDefinition = loadComponent('../components/yb-dot-matrix-loading/index')
let cancelledFrame
const loading = { ...loadingDefinition.methods, _running:true, _raf:7,
  _canvas:{ cancelAnimationFrame(id) { cancelledFrame=id } } }
loadingDefinition.lifetimes.detached.call(loading)
assert.equal(cancelledFrame, 7, 'unmount cancels the native Canvas frame')
assert.equal(loading._running, false)
assert.equal(loading._raf, null)
for (const [definition, data] of [[streamDefinition, { generatedImages:[image], generatedFiles:[file] }],
  [doneDefinition, { item:{ contentParts:parts } }]]) {
  const instance = { data, properties:{ language:'中文' }, triggerEvent(name, detail) { events.push({ name, detail }) } }
  definition.methods.previewArtifact.call(instance, { detail:{ link:'artifact://image_1' } })
  assert.equal(events.pop().detail.attachment.assetId, 'image_storage')
  definition.methods.previewArtifact.call(instance, { detail:{ link:'artifact://from_another_message' } })
  assert.equal(events.pop().name, 'toast')
}
for (const [definition, data] of [[streamDefinition, { generatedImages:[], generatedFiles:[removedFile] }],
  [doneDefinition, { item:{ contentParts:[removedFile] } }]]) {
  const instance = { data, properties:{ language:'中文' }, triggerEvent(name, detail) { events.push({ name, detail }) } }
  definition.methods.previewArtifact.call(instance, { detail:{ link:'artifact://file_1' } })
  const event = events.pop()
  assert.equal(event.name, 'previewFile')
  assert.equal(event.detail.attachment.unavailableReason, 'storage_deleted', 'stream/history forward deletion to the host notice')
}
for (const path of ['../mdPackage/components/assisStream/index.wxml', '../mdPackage/components/assisDone/index.wxml',
  '../mdPackage/pages/archivedChat/index.wxml']) {
  const markup = fs.readFileSync(require.resolve(path), 'utf8')
  assert.match(markup, /catch:artifactlink="previewArtifact"/)
  for(const [card] of markup.matchAll(/<generated-images\b[^>]*>/g)){
    assert.match(card, /turn-status="\{\{(?:terminalStatus|item\.status)\}\}"/,
      'streaming, history and archive cards share successful delivery and stop handling')
  }
}
let archiveDefinition
vm.runInNewContext(fs.readFileSync(require.resolve('../mdPackage/pages/archivedChat/index'), 'utf8').replace(/^import .*$/gm, ''), {
  Page:definition => { archiveDefinition = definition },
  require:name => name === '../../../static_utils/chatArtifacts' ? require('../static_utils/chatArtifacts') :
    name === '../../../static_utils/i18n/index' ? require('../static_utils/i18n') : {},
  wx:{ showToast:options => events.push({ name:'toast', detail:options }) },
})

const opened = [], renewed = [], previewLoadingCalls = [], previewFailures = []
let renewalResponse = ids => ({ items:ids.map(id => ({ id,
  fileID:id === 'image_storage' ? image.fileID : file.fileID, url:`https://fresh.example/${id}` })) })
const previewModule = { exports:{} }
vm.runInNewContext(fs.readFileSync(require.resolve('../static_utils/filePreview'), 'utf8'), {
  module:previewModule,
  require:name => name === '../request/request' ? {
    resolveAssetUrls:async request => { renewed.push(request); return renewalResponse(request.ids) },
    downloadStorageFile:async url => { opened.push({ download:url }); return 'wxfile://download/guide.md' },
  } : name === './chatAttachment' ? require('../static_utils/chatAttachment') : require('../static_utils/i18n'),
  wx:{ hideKeyboard() {}, showLoading() { previewLoadingCalls.push('show') }, hideLoading() { previewLoadingCalls.push('hide') },
    showToast:options => previewFailures.push(options),
    previewImage:options => { opened.push(options); options.success() },
    navigateTo:options => { opened.push(options); options.success({ eventChannel:{ emit(name, data) { opened.push({ name, data }) } } }) },
  },
})
;(async () => {
  const archive = { data:{ messages:[{ messageId:'current', contentParts:[image] }, { messageId:'other', contentParts:[file] }],
    i18n:{ assets:{ previewFailed:'无法预览' } } },
    previewMessageAttachment(event) { events.push({ name:'previewFile', detail:event.detail }) },
  }
  await archiveDefinition.previewArtifact.call(archive, { currentTarget:{ dataset:{ messageId:'current' } }, detail:{ link:'artifact://file_1' } })
  assert.equal(events.pop().name, 'toast', 'archive links cannot use another message artifact')
  await archiveDefinition.previewArtifact.call(archive, { currentTarget:{ dataset:{ messageId:'current' } }, detail:{ link:'artifact://image_1' } })
  assert.equal(events.pop().detail.attachment.assetId, image.assetId)
  const preview = previewModule.exports.previewStorageFile
  assert.equal(await preview(imageDetail.attachment, { relatedItems:imageDetail.attachments }), true)
  assert.equal(renewed[0].source, 'library')
  assert.equal(renewed[0].ids[0], 'image_storage')
  assert.equal(opened[0].current, 'https://fresh.example/image_storage', 'cached expired URLs are never used')
  assert.equal(await preview(artifactAttachmentDetail(parts, 'artifact://file_1').attachment), true)
  assert.equal(renewed.length, 1, 'the chat click opens the text preview before requesting an owned URL')
  assert.equal(opened[1].url, '/mdPackage/pages/filePreview/index')
  assert.equal(opened[2].name, 'previewFile')
  assert.equal(opened[2].data.name, file.name)
  assert.equal(opened[2].data.attachment.assetId, file.assetId)
  assert.equal(opened.some(item => item.download), false, 'no download starts in the conversation click handler')
  assert.equal(await previewModule.exports.resolvePreviewFile(opened[2].data.attachment), 'wxfile://download/guide.md')
  assert.equal(renewed[1].source, 'library')
  assert.equal(renewed[1].ids[0], file.assetId)
  assert.equal(opened[3].download, 'https://fresh.example/file_storage', 'the opened preview owns URL renewal and download')
  assert.equal(await preview(imageDetail.attachment), true)
  assert.equal(renewed.length, 3, 'each page resolution or native image activation gets an owned current address')
  assert.deepEqual(previewLoadingCalls, [], 'delivered files and Markdown artifact references never call either loading API')
  assert.equal(await preview({ ...file, artifactId:undefined }), true)
  assert.deepEqual(previewLoadingCalls, [], 'ordinary text uploads also wait inside the preview page')
  const resolutionsBeforeDirect = renewed.length
  assert.equal(await previewModule.exports.resolvePreviewFile(onlineFile), 'wxfile://download/guide.md')
  assert.equal(renewed.length, resolutionsBeforeDirect, 'fresh delivered HTTPS file URLs need no second resolution request')
  assert.equal(opened.at(-1).download, onlineFile.url)
  await previewModule.exports.resolvePreviewFile({...onlineFile, urlExpiresAt:1})
  assert.equal(renewed.length, resolutionsBeforeDirect + 1, 'expired addresses retain owner-checked renewal')
  await assert.rejects(previewModule.exports.resolvePreviewFile({...onlineFile, assetId:''}), /Missing file ID/)
  await assert.rejects(previewModule.exports.resolvePreviewFile({...onlineFile, unavailableReason:'storage_deleted'}), /File unavailable/)
  assert.equal(await preview({ ...imageDetail.attachment, artifactId:undefined }), true)
  assert.deepEqual(previewLoadingCalls, ['show', 'hide'], 'ordinary native image previews keep their existing loading behavior')
  previewLoadingCalls.length = 0
  renewalResponse = ids => ({ items:[{ id:ids[0], fileID:'another_owner/file.png', url:'https://fresh.example/wrong' }] })
  const before = opened.length
  assert.equal(await preview(imageDetail.attachment), false)
  assert.equal(opened.length, before, 'mismatched owned record never opens a URL')
  assert.deepEqual(previewLoadingCalls, [], 'a failed artifact preview cannot dismiss another loading overlay')
  assert.equal(previewFailures.length, 1, 'quiet previews still report failures')
  await assert.rejects(previewModule.exports.resolvePreviewFile(file), /Missing file URL/)
  assert.equal(opened.length, before, 'a forged text file identity is rejected before download')
  console.log('chatArtifactLinks: Markdown, navigation before renewal, owned downloads and image display modes passed')
})().catch(error => { console.error(error); process.exitCode = 1 })

const deletedImage = { ...image, status:'unavailable', unavailableReason:'storage_deleted', url:'' }
assert.deepEqual(projectCards([deletedImage], '', true), ['image_1'],
  'deleted Markdown images retain a standalone placeholder when the body has no image reference')
assert.deepEqual(projectCards([deletedImage], '![deleted](artifact://image_1)', true), [],
  'the original body slot takes over a deleted image without a duplicate tail card')
