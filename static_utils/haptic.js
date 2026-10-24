export function triggerHaptic(enabled, type = 'medium') {
  if (!enabled) return
  wx.vibrateShort({ type })
}
