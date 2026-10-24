function formatBytes(bytes) {
  if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('Invalid storage size')
  const unit = bytes >= 1024 ** 3 ? 'GB' : bytes >= 1024 ** 2 ? 'MB' : bytes >= 1024 ? 'KB' : 'B'
  const divisor = { GB: 1024 ** 3, MB: 1024 ** 2, KB: 1024, B: 1 }[unit]
  return `${Number((bytes / divisor).toFixed(2))} ${unit}`
}
function storageView(value) {
  const { usedBytes, quotaBytes, imageBytes, documentBytes } = value || {}
  if (![usedBytes, quotaBytes, imageBytes, documentBytes].every(n => Number.isSafeInteger(n) && n >= 0)
    || !quotaBytes || imageBytes + documentBytes !== usedBytes) throw new Error('Invalid storage usage')
  return {
    used: formatBytes(usedBytes), quota: formatBytes(quotaBytes),
    images: formatBytes(imageBytes), documents: formatBytes(documentBytes),
    percent: Math.min(100, usedBytes / quotaBytes * 100), overQuota: usedBytes > quotaBytes
  }
}
module.exports = { formatBytes, storageView }
