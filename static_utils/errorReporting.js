const { showErrorNotice } = require('./errorNotice')
import settingRouterBuilder, { SETTING_ROUTE_TYPE } from '../static_router/settingRouter'
import upRouterBuilder from '../static_router/upPageRouter'
const { store } = require('../store/index')
const { reaction } = require('mobx-miniprogram')
const { messages } = require('./i18n/index')

export function createShakeDetector() {
  let previous = null, peak = null, count = 0, started = 0, lastPeak = 0, cooldown = 0
  return (sample, now = Date.now()) => {
    const vector = [sample.x, sample.y, sample.z]
    if (!vector.every(Number.isFinite)) return false
    const before = previous
    if (before && now - before.time < 80) return false
    previous = { vector, time: now }
    if (!before || now - before.time > 250 || now < cooldown) {
      peak = null; count = 0
      return false
    }
    const delta = vector.map((value, i) => value - before.vector[i])
    // Require repeated strong reversals; one bump or slow rotation must not open a sheet.
    if (Math.hypot(...vector) < 2.2 || Math.hypot(...delta) < 2.8 || now - lastPeak < 80) return false
    if (now - started > 1000) { count = 0; peak = null }
    if (peak && delta.reduce((sum, value, i) => sum + value * peak[i], 0) >= 0) return false
    if (!count) started = now
    peak = delta; lastPeak = now; count++
    if (count < 4) return false
    cooldown = now + 15000; count = 0; peak = null
    return true
  }
}

let foreground = false, running = false, dispose = null, opening = false, sensorVersion = 0
let detector = createShakeDetector()
const listener = sample => {
  if (!foreground || !running || !store.shakeToReport) return
  if (getCurrentPages().some(page => page.route === 'pages/reportError/index')) return
  if (getCurrentPages().slice(-1)[0]?.renderer === 'webview') return
  if (detector(sample)) openErrorReport('shake')
}
function syncSensor() {
  const enabled = foreground && store.shakeToReport
  if (enabled === running) return
  running = enabled
  const version = ++sensorVersion
  detector = createShakeDetector()
  if (enabled) {
    if (!wx.startAccelerometer || !wx.onAccelerometerChange) { running = false; return }
    wx.onAccelerometerChange(listener)
    wx.startAccelerometer({ interval: 'game', fail: () => {
      if (version !== sensorVersion) return
      running = false
      wx.offAccelerometerChange?.(listener)
    } })
  } else {
    wx.offAccelerometerChange?.(listener)
    wx.stopAccelerometer?.({})
  }
}
export function setReportForeground(value) {
  foreground = !!value
  if (!dispose) dispose = reaction(() => store.shakeToReport, syncSensor)
  syncSensor()
}
export function openErrorReport(source = 'manual') {
  const pages = getCurrentPages()
  if (opening || pages.some(page => page.route === 'pages/reportError/index')) return
  const route = pages[pages.length - 1]?.route || ''
  opening = true
  const stacked = source !== 'shake'
  if (stacked) settingRouterBuilder()
  else upRouterBuilder()
  wx.navigateTo({
    url: `/pages/reportError/index?source=${source}&route=${encodeURIComponent(route)}`,
    routeType: stacked ? SETTING_ROUTE_TYPE : 'upRouterBuilder',
    ...(stacked ? { routeOptions: { stacked: true } } : {}),
    fail: () => showErrorNotice({ title: messages(store.applicationSettings.language).common.loadFailed }),
    complete: () => { opening = false }
  })
}
