const { presentAsset } = require('./assetPresentation')
const { deliveredAttachment } = require('./chatArtifacts')
const { messages } = require('./i18n/index')

function collectConversationFiles(chatMessages = [], language = '中文') {
  const files = new Map()
  for (const message of chatMessages) {
    const parts = [...(Array.isArray(message?.attachments) ? message.attachments : []),
      ...(Array.isArray(message?.contentParts) ? message.contentParts : [])]
    for (const rawPart of parts) {
      const part = rawPart?.type === 'attachment' && !rawPart.artifactId ? rawPart : deliveredAttachment(rawPart)
      if (!part?.fileID || part.unavailableReason || files.has(part.fileID)) continue
      const assetId = part.assetId || ''
      if (!assetId) continue
      files.set(part.fileID, presentAsset({
        id: assetId, assetId, source: 'library', origin: message.role === 'assistant' ? 'generated' : 'uploaded', fileID: part.fileID,
        name: part.name || '', extension: part.extension || '', size: part.size || 0,
        attachmentType: part.attachmentType || 'file', mimeType: part.mimeType || '',
        uploadedAt: message.createdAt || '', url: '', urlExpiresAt: 0
      }, messages(language), language))
    }
  }
  return [...files.values()]
}

module.exports = { collectConversationFiles }
