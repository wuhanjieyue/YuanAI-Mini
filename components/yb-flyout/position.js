const DEFAULT_TOP_OFFSET_PX = 12

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback
}

function clamp(value, min, max) {
  if (max <= min) return min
  return Math.min(Math.max(value, min), max)
}

function rpxToPx(value, windowWidth) {
  return Math.floor(finite(windowWidth) / 750 * finite(value))
}

function normalizeRect(rect = {}) {
  rect = rect || {}
  const left = finite(rect.left)
  const top = finite(rect.top)
  const width = Math.max(0, finite(rect.width, finite(rect.right, left) - left))
  const height = Math.max(0, finite(rect.height, finite(rect.bottom, top) - top))
  return { left, top, width, height }
}

function normalizeWindowMetrics(info = {}) {
  const windowWidth = finite(info.windowWidth || info.screenWidth, 375)
  const windowHeight = finite(info.windowHeight || info.screenHeight, 800)
  const screenTop = finite(info.screenTop, 0)
  const safeArea = info.safeArea || {}
  const safeTop = clamp(finite(safeArea.top, screenTop) - screenTop, 0, windowHeight)
  const safeBottom = clamp(finite(safeArea.bottom, windowHeight + screenTop) - screenTop, safeTop, windowHeight)
  return { windowWidth, windowHeight, safeTop, safeBottom }
}

function calculatePosition(options = {}) {
  const metrics = options.windowMetrics || normalizeWindowMetrics(options.windowInfo)
  const { windowWidth, windowHeight, safeTop, safeBottom } = metrics
  const edgeGapPx = rpxToPx(Math.max(0, finite(options.edgeGapRpx, 24)), windowWidth)
  const safeGapPx = rpxToPx(Math.max(0, finite(options.safeGapRpx, 36)), windowWidth)
  const measuredBoundary = normalizeRect(options.boundaryRect)
  const hasBoundary = measuredBoundary.width > 0 && measuredBoundary.height > 0
  const boundaryLeft = hasBoundary ? clamp(measuredBoundary.left, 0, windowWidth) : 0
  const boundaryRight = hasBoundary
    ? clamp(measuredBoundary.left + measuredBoundary.width, boundaryLeft, windowWidth)
    : windowWidth
  const availableTop = hasBoundary ? clamp(measuredBoundary.top, safeTop, safeBottom) : safeTop
  const availableBottom = hasBoundary
    ? clamp(measuredBoundary.top + measuredBoundary.height, availableTop, safeBottom)
    : safeBottom
  const requestedWidthPx = rpxToPx(Math.max(0, finite(options.popupWidthRpx, 450)), windowWidth)
  const popupWidthPx = Math.min(requestedWidthPx, Math.max(0, boundaryRight - boundaryLeft - edgeGapPx * 2))
  const ratioValue = finite(options.maxHeightRatio, 0.6)
  const maxHeightRatio = ratioValue > 0 && ratioValue <= 1 ? ratioValue : 0.6
  const topBoundary = Math.min(availableBottom, availableTop + safeGapPx)
  const bottomBoundary = Math.max(topBoundary, availableBottom - safeGapPx)
  const maxPopupHeightPx = Math.max(0, Math.min(windowHeight * maxHeightRatio, bottomBoundary - topBoundary))
  const panelHeightPx = Math.min(Math.max(0, finite(options.measuredHeight)), maxPopupHeightPx)
  const anchor = normalizeRect(options.anchorRect)

  const centerX = anchor.left + anchor.width / 2
  const centerY = anchor.top + anchor.height / 2
  const above = options.anchorCentered && bottomBoundary - centerY < panelHeightPx
    && centerY - topBoundary > bottomBoundary - centerY
  let viewportTop = options.anchorCentered
    ? centerY - (above ? panelHeightPx : 0)
    : anchor.top + anchor.height - DEFAULT_TOP_OFFSET_PX
  if (viewportTop + panelHeightPx > bottomBoundary) viewportTop = bottomBoundary - panelHeightPx
  viewportTop = clamp(viewportTop, topBoundary, Math.max(topBoundary, bottomBoundary - panelHeightPx))

  const anchorRight = anchor.left + anchor.width
  const alignRight = anchor.left + anchor.width / 2 >= (boundaryLeft + boundaryRight) / 2
  const viewportLeft = clamp(
    options.anchorCentered ? centerX - popupWidthPx / 2 : alignRight ? anchorRight - popupWidthPx : anchor.left,
    boundaryLeft + edgeGapPx,
    Math.max(boundaryLeft + edgeGapPx, boundaryRight - popupWidthPx - edgeGapPx)
  )
  const portalRect = options.portalRect || {}

  const layout = {
    transformOrigin: `${clamp(centerX - viewportLeft, 0, popupWidthPx)}px ${clamp(centerY - viewportTop, 0, panelHeightPx)}px`,
    alignRight,
    availableTop,
    availableBottom,
    popupWidthPx,
    maxPopupHeightPx,
    panelHeightPx,
    viewportTop,
    viewportLeft,
    maskTopPx: -finite(portalRect.top),
    maskLeftPx: -finite(portalRect.left),
    panelTopPx: viewportTop,
    panelLeftPx: viewportLeft
  }
  if (!options.previewEnabled || !anchor.width || !anchor.height) return layout

  const availableHeight = bottomBoundary - topBoundary
  const gap = Math.min(rpxToPx(20, windowWidth), availableHeight * 0.05)
  if (options.previewHeightRatio > 0) {
    const requestedHeight = windowHeight * Math.min(1, options.previewHeightRatio)
    const fit = Math.min(1, Math.max(0, availableHeight - gap) / (requestedHeight + panelHeightPx))
    const previewHeight = requestedHeight * fit
    const menuHeight = panelHeightPx * fit
    const previewWidth = Math.min(rpxToPx(options.previewWidthRpx || options.popupWidthRpx, windowWidth),
      Math.max(0, boundaryRight - boundaryLeft - edgeGapPx * 2))
    const previewTop = clamp(centerY - previewHeight - gap / 2,
      topBoundary, bottomBoundary - previewHeight - gap - menuHeight)
    const previewLeft = clamp(centerX - previewWidth / 2,
      boundaryLeft + edgeGapPx, boundaryRight - edgeGapPx - previewWidth)
    const menuTop = previewTop + previewHeight + gap
    const menuLeft = clamp(alignRight ? previewLeft + previewWidth - popupWidthPx : previewLeft,
      boundaryLeft + edgeGapPx, boundaryRight - edgeGapPx - popupWidthPx)
    return Object.assign(layout, {
      panelHeightPx: menuHeight, maxPopupHeightPx: menuHeight,
      viewportTop: menuTop, viewportLeft: menuLeft, panelTopPx: menuTop, panelLeftPx: menuLeft,
      transformOrigin: `${clamp(centerX - menuLeft, 0, popupWidthPx)}px 0px`,
      preview: { left: previewLeft, top: previewTop, width: previewWidth, height: previewHeight }
    })
  }
  const menuHeight = Math.min(panelHeightPx, availableHeight * 0.55)
  const scale = Math.max(0, Math.min(1.08,
    (boundaryRight - boundaryLeft - edgeGapPx * 2) / anchor.width,
    (availableHeight - menuHeight - gap) / anchor.height))
  const previewWidth = anchor.width * scale
  const previewHeight = anchor.height * scale
  const belowRoom = bottomBoundary - centerY - previewHeight / 2
  const aboveRoom = centerY - previewHeight / 2 - topBoundary
  const menuAbove = belowRoom < menuHeight + gap && aboveRoom > belowRoom
  const previewTop = clamp(centerY - previewHeight / 2,
    topBoundary + (menuAbove ? menuHeight + gap : 0),
    bottomBoundary - previewHeight - (menuAbove ? 0 : menuHeight + gap))
  const previewLeft = clamp(centerX - previewWidth / 2, boundaryLeft + edgeGapPx, boundaryRight - edgeGapPx - previewWidth)
  const menuTop = menuAbove ? previewTop - gap - menuHeight : previewTop + previewHeight + gap
  const menuLeft = clamp(alignRight ? previewLeft + previewWidth - popupWidthPx : previewLeft,
    boundaryLeft + edgeGapPx, boundaryRight - edgeGapPx - popupWidthPx)
  return Object.assign(layout, {
    panelHeightPx: menuHeight, maxPopupHeightPx: menuHeight,
    viewportTop: menuTop, viewportLeft: menuLeft, panelTopPx: menuTop, panelLeftPx: menuLeft,
    transformOrigin: `${clamp(centerX - menuLeft, 0, popupWidthPx)}px ${menuAbove ? menuHeight : 0}px`,
    preview: { left: previewLeft, top: previewTop, width: previewWidth, height: previewHeight, scale }
  })
}

module.exports = {
  calculatePosition,
  clamp,
  finite,
  normalizeRect,
  normalizeWindowMetrics,
  rpxToPx
}
