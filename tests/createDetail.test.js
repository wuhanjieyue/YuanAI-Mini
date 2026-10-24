const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const read = name => fs.readFileSync(path.join(root, name), 'utf8')
const wxml = read('pages/createDetail/index.wxml')
assert.match(wxml, /class="creation-image\b[^\"]*"[^>]*mode="aspectFill"/)
assert.match(wxml, /initial-child-size="{{sheetSize}}"/)
assert.match(wxml, /max-child-size="{{sheetSize}}"/)
assert.match(wxml, /max-lines="3" overflow="ellipsis"/)
assert.match(wxml, /associative-container="draggable-sheet"/)
assert.match(wxml, /class="creation-prompt-button\b[^\"]*"[^>]*bind:tap="tryPrompt"/)
assert.match(wxml, /data-source="camera" bind:tap="choosePhoto"/)
assert.match(wxml, /data-source="album" bind:tap="choosePhoto"/)
assert.match(wxml, /style="{{themeStyle \+ ';' \+ accentStyle \+ ';height:' \+ screenHeight \+ 'px;'}}"/)
const detailStyles = read('pages/createDetail/index.wxss')
assert.match(detailStyles, /padding-bottom: calc\(64rpx \+ env\(safe-area-inset-bottom\)\)/)
assert.match(wxml, /background:\s*var\(--accent-action-bg/)
assert.match(wxml, /color:\s*var\(--accent-action-text/)
let componentDefinition
vm.runInNewContext(read('components/_self/yb-create-view/index.js').replace(/^import .*$/gm, ''), {
  Component: value => { componentDefinition = value }, require: () => ({}), Date, wx: { worklet: {} }
})
let opened = 0, refreshed = 0
const component = { data: { items: [{ id: 'sample', url: 'https://example/image.jpg' }] },
  triggerEvent: (name, detail) => { assert.equal(name, 'openCreation'); assert.equal(detail.item.id, 'sample'); opened++ },
  ensureAssetImages: async force => { if (force) { refreshed++; return false } return true },
  refreshAssets: () => { refreshed++ } }
const tap = () => componentDefinition.methods.openCreation.call(component, { currentTarget: { dataset: { id: 'sample' } } })
assert.match(read('components/_self/yb-create-view/index.wxml'), /catch:tap="openCreation"/)
let definition, received, triedPrompt, chosenFiles, back = 0, shared = 0, downloads = 0
let finishDownload
const media = []
vm.runInNewContext(read('pages/createDetail/index.js').replace(/^import .*$/gm, ''), {
  Page: value => { definition = value },
  require: name => name.includes('themeBinding') ? { bindPageTheme() {}, unbindPageTheme() {}, syncThemeNavigation() {} } :
    name.includes('store') ? { store: { applicationSettings: { language: 'English' } } } : require('../static_utils/i18n'),
  getApp: () => ({ globalData: { su_system: { screenHeight: 844 } } }),
  renewAssetUrls: async items => items,
  downloadCreationImage: () => { downloads++; return new Promise(resolve => { finishDownload = resolve }) },
  wx: { worklet: { runOnJS: callback => callback }, getWindowInfo: () => ({ windowWidth: 375 }), navigateBack: () => { back++ },
    chooseMedia: options => media.push(options),
    showShareImageMenu: async ({ path, needShowEntrance }) => { assert.equal(path, 'tmp/image.jpg'); assert.equal(needShowEntrance, false); shared++ }, showToast() {} }
})
const page = { ...definition, data: { ...definition.data }, setData(patch) { Object.assign(this.data, patch) },
  getOpenerEventChannel: () => ({
    on(_event, callback) { received = callback },
    emit(event, detail) { assert.equal(event, 'tryCreationPrompt'); triedPrompt = detail.prompt; chosenFiles = detail.files }
  }) }
;(async () => {
  await tap(); assert.equal(opened, 1)
component.data.activeTab = 'mine'
component.previewAsset = async () => { refreshed++ }
await tap(); assert.equal(refreshed, 1); assert.equal(opened, 1)
component.data.activeTab = 'templates'; refreshed = 0
component.data.actionsOpen = true; await tap(); assert.equal(opened, 1)
component.data.actionsOpen = false; component._suppressAssetTapUntil = Date.now() + 1000; await tap(); assert.equal(opened, 1)
component._suppressAssetTapUntil = 0; component.data.items[0].loadFailed = true; await tap(); assert.equal(refreshed, 1)

  page.onLoad()
  assert.equal(page.data.sheetSize, 0.6 + 18 / 844)
  received({ title: '海报', titleEn: 'Poster', prompt: '花朵', promptEn: 'A flower', url: 'https://images.example/image.jpg' })
  assert.equal(page.data.item.title, 'Poster')
  assert.equal(page.data.item.prompt, 'A flower')
  page.tryPrompt(); assert.equal(triedPrompt, 'A flower'); assert.equal(back, 1)
  page._closing = false; page._actionPending = false; back = 0
  received({ title:'复古', prompt:'Edit my photo', supportsImageInput:true, url:'https://images.example/photo.jpg' })
  assert.equal(page.data.item.supportsImageInput,true)
  assert.equal(page.data.sheetSize, 0.6 + 152 * 0.5 / 844)
  page.choosePhoto({ currentTarget:{ dataset:{ source:'camera' } } })
  assert.deepEqual(Array.from(media[0].sourceType),['camera'])
  media[0].fail(); assert.equal(back,0)
  page.choosePhoto({ currentTarget:{ dataset:{ source:'album' } } })
  assert.deepEqual(Array.from(media[1].sourceType),['album'])
  media[1].success({ tempFiles:[{ tempFilePath:'/tmp/photo.jpg' }] })
  assert.equal(chosenFiles[0].tempFilePath,'/tmp/photo.jpg'); assert.equal(chosenFiles[0].fileType,'image'); assert.equal(back,1)
  page._closing = false; back = 0
  page.onSizeUpdate({ size: 0.6 }); assert.equal(back, 0)
  const first = page.shareImage(); await page.shareImage(); await Promise.resolve(); assert.equal(downloads, 1)
  finishDownload('tmp/image.jpg'); await first; assert.equal(shared, 1)
  assert.equal(page.data.sharing, false)
  const late = page.shareImage(); await Promise.resolve(); page.onUnload(); finishDownload('tmp/image.jpg'); await late
  assert.equal(shared, 1, 'do not open share UI after route destruction')
  page._unloaded = false
  page.onSizeUpdate({ size: 0 }); page.onSizeUpdate({ size: 0 }); assert.equal(back, 1)
  const requestSource = read('request/request.js')
  const downloadSource = requestSource.slice(requestSource.indexOf('export async function downloadCreationImage('), requestSource.indexOf('export function cleanupStorageFiles(')).replace('export ', '')
  let response = { statusCode: 200, tempFilePath: 'tmp/image.jpg' }
  const context = { wx: { downloadFile: options => { options.success(response); return { abort() {} } } } }
  vm.runInNewContext(downloadSource + '; this.download = downloadCreationImage', context)
  assert.equal(await context.download('https://images.example/image.jpg'), 'tmp/image.jpg')
  await assert.rejects(context.download('http://images.example/image.jpg'))
  response = { statusCode: 403, tempFilePath: 'tmp/error' }
  await assert.rejects(context.download('https://images.example/image.jpg'))
  console.log('createDetail: height cap, prompt clamp, localization, share race and close guard passed')
})().catch(error => { console.error(error); process.exitCode = 1 })
