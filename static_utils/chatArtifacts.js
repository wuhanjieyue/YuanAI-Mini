const ARTIFACT_LINK = /^artifact:\/\/([A-Za-z0-9_-]{1,128})$/

function parseArtifactLink(link) {
  const match = typeof link === 'string' && ARTIFACT_LINK.exec(link)
  return match ? match[1] : ''
}

function deliveredAttachment(part) {
  if (!part || part.status !== 'completed' || part.unavailableReason ||
      typeof part.assetId !== 'string' || !part.assetId ||
      typeof part.fileID !== 'string' || !part.fileID) return null
  const isImage = part.type === 'artifact' && part.artifactType === 'image'
  const isFile = part.type === 'attachment' && part.attachmentType === 'file'
  if (!isImage && !isFile) return null
  // Use the owned storage record; a Markdown reference cannot select a local path.
  return { ...part, attachmentType: isImage ? 'image' : 'file', previewPath: '' }
}

function artifactAttachmentDetail(contentParts, link) {
  const artifactId = parseArtifactLink(link)
  if (!Array.isArray(contentParts)) return null
  const part = contentParts.find(item => artifactId ? item?.artifactId === artifactId :
    typeof link === 'string' && /^https:\/\//.test(link) && item?.artifactId && item.url === link)
  if (part?.type === 'attachment' && part.attachmentType === 'file' && part.unavailableReason === 'storage_deleted') {
    return { attachment: { ...part, previewPath: '' }, attachments: [] }
  }
  const attachment = deliveredAttachment(part)
  if (!attachment) return null
  return { attachment, attachments: contentParts.map(deliveredAttachment).filter(Boolean) }
}

function messageCopyText(content) {
  // Keep code verbatim; remove destinations only from prose links and images.
  return String(content || '').split(/(`{3,}[^\n]*\n[\s\S]*?\n`{3,}|~{3,}[^\n]*\n[\s\S]*?\n~{3,}|`+[^`\n]*`+)/g)
    .map((part, index) => index % 2 ? part : part.replace(
      /!?\[((?:\\.|[^\]\\]|\[[^\]]*\])*)\]\(\s*<?(?:https?:\/\/|artifact:\/\/)(?:\\.|[^\s<>\\()]|\([^()]*\))+>?(?:\s+["'][^"']*["'])?\s*\)/gi,
      (_, title) => title.replace(/\\([\[\]\\])/g, '$1'))).join('')
}

module.exports = { parseArtifactLink, deliveredAttachment, artifactAttachmentDetail, messageCopyText }
