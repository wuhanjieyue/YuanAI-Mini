function layoutContent(rect, height, windowHeight, safeTop, menuHeight, safeBottom) {
  const gap = 12
  const bottom = Math.min(windowHeight, safeBottom) - gap
  const available = Math.max(1, bottom - safeTop - menuHeight - gap)
  const scale = Math.min(1, available / height)
  const displayedHeight = height * scale
  const top = Math.max(safeTop, Math.min(rect.top - 15, bottom - menuHeight - gap - displayedHeight))
  return { scale, top, menuTop: top + displayedHeight + gap }
}
module.exports = { layoutContent }
