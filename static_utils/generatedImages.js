// Structured generated-image cards share their geometry across streaming and history.
function mergeGeneratedImages(current, updates) {
  const images = (current || []).slice()
  for (const item of (Array.isArray(updates) ? updates : []).slice(0, 18)) {
    if (!item || !/^[A-Za-z0-9_-]{1,128}$/.test(item.artifactId)) continue
    const hasDimensions = Number.isInteger(item.width) && Number.isInteger(item.height) &&
      item.width >= 1 && item.height >= 1 && item.width <= 8192 && item.height <= 8192 &&
      item.width / item.height >= 1 / 8 && item.width / item.height <= 8
    if (!hasDimensions && !item.unavailableReason) continue
    const index = images.findIndex((image) => image.artifactId === item.artifactId)
    const previous = images[index]
    // A delayed start/failure event must not replace an already delivered image.
    if (previous && previous.status === 'completed' && item.status !== 'completed' && !item.unavailableReason) continue
    const width = previous ? previous.width : hasDimensions ? item.width : 360
    const height = previous ? previous.height : hasDimensions ? item.height : 360
    const widthVw = previous?.widthVw || (!hasDimensions || item.unavailableReason && item.widthVw === 48 ? 48 : 75)
    const url = typeof item.url === 'string' && /^https:\/\//.test(item.url) ? item.url : ''
    const scale = Math.min((widthVw * 7.5 - 56) / width, (widthVw * height / width * 7.5 - 56) / height)
    const image = {
      ...item, type: 'artifact', artifactType: 'image', width, height, url,
      displayMode: previous?.displayMode === undefined ? item.displayMode : previous.displayMode,
      assetId: item.assetId || previous?.assetId,
      fileID: item.fileID || previous?.fileID,
      status: item.unavailableReason ? 'unavailable' : item.status === 'generating' ? 'generating' : url ? 'completed' : 'failed',
      widthVw, heightVw: widthVw * height / width,
      canvasWidthRpx: width * scale, canvasHeightRpx: height * scale
    }
    if (index >= 0) images[index] = image
    else if (images.length < 18) images.push(image)
  }
  return images
}

function finishGeneratedImages(images) {
  return (images || []).map((item) => item.status === 'generating' ? { ...item, status: 'failed' } : item)
}

function visibleGeneratedImages(images, settled = false, imageSources = [], referencedIds = []) {
  // Signed URL renewal does not change which delivered image the body displays.
  const sourceKey = value => String(value || '').split(/[?#]/)[0]
  const embedded = new Set(imageSources.map(sourceKey))
  return (images || []).filter(item => item && !referencedIds.includes(item.artifactId) &&
    !(item.status === 'completed' && item.url && embedded.has(sourceKey(item.url))) &&
    (item.displayMode === undefined || item.displayMode === 'inline' ||
    (settled && item.displayMode === 'markdown' && (item.unavailableReason || item.status === 'completed' && item.url) &&
      !embedded.has(sourceKey(item.url)))))
}

module.exports = { mergeGeneratedImages, finishGeneratedImages, visibleGeneratedImages }
