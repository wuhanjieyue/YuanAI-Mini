import { callHttp } from './http'

let location = { country: '中国' }
let initialized = false
let pending = null
let acquired = false

// Module state is deliberately never persisted: one fuzzy lookup per app launch.
export function initLocation() {
  if (initialized) return pending || Promise.resolve(location)
  initialized = true
  pending = (async () => {
    if (typeof wx.getFuzzyLocation !== 'function') return location
    try {
      const coords = await new Promise((resolve, reject) => wx.getFuzzyLocation({
        type: 'gcj02', success: resolve, fail: reject
      }))
      const { statusCode, result } = await callHttp('/user', {
        funName: 'resolveLocation', longitude: coords.longitude, latitude: coords.latitude
      })
      if (statusCode === 200 && result.code === 200 && result.data?.location) {
        location = result.data.location
        acquired = true
      }
    } catch (_) {
      // Denial or provider failure keeps the explicit country fallback.
    }
    return location
  })()
  return pending
}

export function currentLocation() { return { ...location } }


export function clearLocation() { location = { country: '中国' }; acquired = false }

export function syncLocationPermission() {
  if (!acquired || typeof wx.getSetting !== 'function') return
  wx.getSetting({ success: result => {
    if (result.authSetting['scope.userFuzzyLocation'] === false) clearLocation()
  } })
}
