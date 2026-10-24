const { toLocale } = require('./i18n/index')
const { getAttachmentPresentation, getFileIconClass, getFileIconType } = require('./chatAttachment')

function formatDateTime(value) {
  const date = new Date(value || '')
  const pad = value => String(value).padStart(2, '0')
  return Number.isFinite(date.getTime()) ? `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}` : ''
}

function presentAsset(item, copy, language) {
  const iconType = getFileIconType(item)
  const ratio = Number.isFinite(item.width) && item.width > 0 && Number.isFinite(item.height) && item.height > 0
    ? item.height / item.width : 1
  return {
    ...item,
    isImage: item.attachmentType === 'image',
    // Two columns within 750rpx, with 32rpx side padding and a 28rpx gap.
    cardHeight: item.attachmentType === 'image' ? 329 * ratio : 297,
    displayName: (toLocale(language) === 'en-US' && item.titleEn) || item.title || (item.sampleKey ? copy.create.samples[item.sampleKey] : '') || item.name || (item.attachmentType === 'image' ? copy.assets.generatedImage : copy.common.file),
    typeLabel: item.extension ? getAttachmentPresentation(item).typeLabel : copy.common.file,
    iconType, iconClass: getFileIconClass(item),
    dateLabel: formatDateTime(item.uploadedAt || item.createdAt),
    loadFailed: !!item.loadFailed
  }
}

module.exports = { presentAsset, formatDateTime }
