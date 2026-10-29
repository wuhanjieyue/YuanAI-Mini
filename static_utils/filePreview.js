const { showErrorNotice } = require('./errorNotice')
const { resolveAssetUrls, downloadStorageFile } = require('../request/request')
const { TEXT_EXTENSIONS, getFileExtension, isImageFile } = require('./chatAttachment')
const { messages } = require('./i18n/index')

const OFFICE_PREVIEW_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'])

function getAssetId(item) {
  return item && (item.assetId || item.id) || ''
}

function getAssetName(item) {
  return item && (item.displayName || item.name) || '文件'
}

function isImageAsset(item) {
  return Boolean(item && (item.attachmentType === 'image' || item.isImage === true || isImageFile(item)))
}

function showPreviewFailed(language) {
  showErrorNotice({ title: messages(language).assets.previewFailed })
}

function openStorageUpgrade() {
  wx.navigateTo({ url: '/pages/upgrade/index', routeType: 'settingRouterBuilder', routeOptions: { stacked: true } })
}

function openDocument(filePath, extension) {
  return new Promise((resolve, reject) => {
    wx.openDocument({
      filePath,
      fileType: extension,
      showMenu: true,
      success: resolve,
      fail: reject,
    })
  })
}

function openTextPreview(item, extension) {
  return new Promise((resolve, reject) => {
    wx.navigateTo({
      url: '/mdPackage/pages/filePreview/index',
      routeType: 'settingRouterBuilder',
      success: result => {
        result.eventChannel.emit('previewFile', {
          attachment: item,
          name: getAssetName(item),
          extension,
        })
        resolve()
      },
      fail: reject,
    })
  })
}

async function resolvePreviewFile(item) {
  if (item?.unavailableReason) throw new Error('File unavailable')
  const localPath = item?.previewPath
  if (localPath && !/^cloud:\/\//i.test(localPath)) return localPath
  const selectedId = getAssetId(item)
  if (!selectedId || !item.fileID) throw new Error('Missing file ID')
  if (typeof item.url === 'string' && /^https:\/\/[^\s<>"\\\x00-\x1f]+$/.test(item.url)
      && Number.isFinite(item.urlExpiresAt) && item.urlExpiresAt > Date.now()) {
    return downloadStorageFile(item.url)
  }
  const data = await resolveAssetUrls({ source: 'library', ids: [selectedId] })
  const signed = (Array.isArray(data.items) ? data.items : []).find(value => value.id === selectedId)
  if (!signed || signed.fileID !== item.fileID || !signed.url) throw new Error('Missing file URL')
  return downloadStorageFile(signed.url)
}

async function previewStorageFile(item, options = {}) {
  const language = options.language
  const extension = getFileExtension(item || {})
  const isImage = isImageAsset(item)
  const isOffice = OFFICE_PREVIEW_EXTENSIONS.has(extension)
  const isText = TEXT_EXTENSIONS.has(extension) || String(item?.mimeType || '').startsWith('text/')

  if (!isImage && !isOffice && !isText) {
    showErrorNotice({ title: messages(language).assets.previewUnsupported })
    return false
  }

  const showLoading = !isText && !item?.artifactId

  wx.hideKeyboard()
  if (showLoading) wx.showLoading({ title: messages(language).common.loading, mask: true })
  try {
    if (isText && !isImage && !isOffice) {
      await openTextPreview(item, extension)
      return true
    }
    if (isOffice) {
      await openDocument(await resolvePreviewFile(item), extension)
      return true
    }
    // A just-sent attachment is visible before its cloud storage record exists.
    const localPath = item?.previewPath
    if (localPath && !/^cloud:\/\//i.test(localPath)) {
      await new Promise((resolve, reject) => {
        wx.previewImage({ current: localPath, urls: [localPath], success: resolve, fail: reject })
      })
      return true
    }
    const candidates = [item].concat(Array.isArray(options.relatedItems) ? options.relatedItems : [])
      .filter(candidate => isImageAsset(candidate) && getAssetId(candidate))
    const ids = [...new Set(candidates.map(getAssetId).filter(Boolean))]
    const selectedId = getAssetId(item)
    const data = await resolveAssetUrls({ source: 'library', ids })
    const signedById = new Map((Array.isArray(data.items) ? data.items : []).map(value => [value.id, value]))
    const signed = signedById.get(selectedId)
    if (!signed || signed.fileID !== item.fileID || !signed.url) throw new Error('Missing file URL')

    const urls = candidates
      .map(candidate => signedById.get(getAssetId(candidate)))
      .filter(value => value && value.url)
      .map(value => value.url)
    await new Promise((resolve, reject) => {
      wx.previewImage({ current: signed.url, urls, success: resolve, fail: reject })
    })
    return true
  } catch (error) {
    showPreviewFailed(language)
    return false
  } finally {
    if (showLoading) wx.hideLoading()
  }
}

module.exports = {
  previewStorageFile,
  resolvePreviewFile,
  openStorageUpgrade,
}
