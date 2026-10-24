const DOCUMENT_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'rtf'])
const TEXT_EXTENSIONS = new Set(['md', 'markdown', 'txt', 'json', 'csv'])
const FILE_ICON_TYPES = {
  image: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp', 'heic', 'tif', 'tiff'],
  pdf: ['pdf'], word: ['doc', 'docx', 'rtf'], spreadsheet: ['xls', 'xlsx', 'csv', 'ods'],
  presentation: ['ppt', 'pptx', 'odp'], text: ['txt', 'log'], markdown: ['md', 'markdown'],
  code: ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'go', 'rs', 'rb', 'php', 'vue', 'html', 'css', 'json', 'yaml', 'yml', 'xml', 'sql', 'sh', 'ini', 'toml', 'conf', 'properties'],
  archive: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'],
  audio: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'], video: ['mp4', 'mov', 'webm', 'mkv', 'avi']
}

function getFileIconType(file = {}) {
  const extension = getFileExtension(file)
  return Object.keys(FILE_ICON_TYPES).find(type => FILE_ICON_TYPES[type].includes(extension)) ||
    (String(file.mimeType || '').startsWith('image/') ? 'image' : 'other')
}

const FILE_ICON_CLASSES = {
  pdf: 'icon-pdf', word: 'icon-word', spreadsheet: 'icon-spreadsheet',
  presentation: 'icon-presentation', text: 'icon-text', markdown: 'icon-markdown',
  code: 'icon-code', archive: 'icon-archive1', audio: 'icon-video',
  video: 'icon-video', other: 'icon-other'
}

function getFileIconClass(file = {}) {
  return FILE_ICON_CLASSES[getFileIconType(file)] || 'icon-other'
}
const ANALYZABLE_FILE_EXTENSIONS = [
  'txt', 'doc', 'docx', 'pdf', 'xls', 'xlsx', 'md', 'ppt', 'pptx',
  'jpg', 'jpeg', 'png', 'gif', 'bmp'
]
const ANALYZABLE_FILE_EXTENSION_SET = new Set(ANALYZABLE_FILE_EXTENSIONS)
const PICKER_FILE_EXTENSIONS = ANALYZABLE_FILE_EXTENSIONS.flatMap(extension => [extension, extension.toUpperCase()])

function getFilePath(file = {}) {
  return file.tempFilePath || file.path || file.previewPath || ''
}

function getFileExtension(file = {}) {
  if (typeof file.extension === 'string' && /^[a-zA-Z0-9]+$/.test(file.extension)) {
    return file.extension.toLowerCase()
  }
  const source = file.name || getFilePath(file)
  const match = String(source || '').match(/\.([a-zA-Z0-9]+)(?:\?|$)/)
  return match ? match[1].toLowerCase() : ''
}

function isImageFile(file = {}) {
  const mimeType = file.mimeType || (String(file.type || '').includes('/') ? file.type : '')
  return file.fileType === 'image' || file.type === 'image' || String(mimeType).startsWith('image/')
}

function normalizeSelectedFile(file = {}) {
  const previewPath = getFilePath(file)
  const attachmentType = isImageFile(file) ? 'image' : 'file'
  const extension = getFileExtension(file) || (attachmentType === 'image' ? 'jpg' : '')
  const pathName = previewPath.split('/').pop() || ''
  const name = file.name || pathName || (attachmentType === 'image' ? `图片.${extension}` : '文件')
  const mimeType = file.mimeType || (String(file.type || '').includes('/') ? file.type : '')
  return Object.assign({}, file, {
    fileType: attachmentType,
    previewPath,
    name,
    extension,
    mimeType,
    size: Number.isFinite(Number(file.size)) ? Number(file.size) : 0,
    iconClass: getFileIconClass(file)
  })
}

function isSupportedChatAttachment(file = {}) {
  return ANALYZABLE_FILE_EXTENSION_SET.has(getFileExtension(file))
}

function createAttachmentPart(file, fileID) {
  const normalized = normalizeSelectedFile(file)
  return {
    type: 'attachment',
    attachmentType: normalized.fileType,
    fileID,
    name: normalized.name,
    extension: normalized.extension,
    mimeType: normalized.mimeType,
    size: normalized.size
  }
}

function getAttachmentPresentation(part = {}) {
  const extension = String(part.extension || getFileExtension(part)).toLowerCase()
  const iconClass = getFileIconClass(part)
  if (TEXT_EXTENSIONS.has(extension)) {
    return {
      iconClass,
      colorClass: 'attachment-icon-text',
      typeLabel: extension === 'md' || extension === 'markdown' ? 'Markdown' : extension.toUpperCase()
    }
  }
  if (DOCUMENT_EXTENSIONS.has(extension)) {
    return {
      iconClass,
      colorClass: 'attachment-icon-document text-main-l1',
      typeLabel: extension.toUpperCase()
    }
  }
  return {
    iconClass,
    colorClass: 'attachment-icon-other',
    typeLabel: extension ? extension.toUpperCase() : '文件'
  }
}

function getMessageAttachments(contentParts) {
  if (!Array.isArray(contentParts)) return []
  return contentParts
    .filter((part) => part && part.type === 'attachment')
    .map((part) => Object.assign({}, part, getAttachmentPresentation(part), { src: part.unavailableReason ? '' : (part.url || part.previewPath || '') }))
}

function buildMessageContentParts(feature, attachmentParts = [], skillParts = []) {
  return [
    ...(feature ? [{ type: 'feature', value: feature }] : []),
    ...skillParts,
    ...attachmentParts
  ]
}

module.exports = {
  FILE_ICON_TYPES,
  FILE_ICON_CLASSES,
  getFileIconType,
  getFileIconClass,
  ANALYZABLE_FILE_EXTENSIONS,
  PICKER_FILE_EXTENSIONS,
  DOCUMENT_EXTENSIONS,
  TEXT_EXTENSIONS,
  getFileExtension,
  isImageFile,
  normalizeSelectedFile,
  isSupportedChatAttachment,
  createAttachmentPart,
  getAttachmentPresentation,
  getMessageAttachments,
  buildMessageContentParts
}
