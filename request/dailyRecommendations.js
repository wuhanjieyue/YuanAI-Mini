import { store } from '../store/index'
import { getDailyRecommendations } from './chatStream'
import eventBus, { CHAT_SESSION_RESET } from '../static_utils/eventBus'

let epoch = 0
let foreground = false
let pending = null
let completedDay = ''
let ownerKey = ''
const dayKey = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
function enabled() { return store.suggest?.trendingSearch !== false }
function randomThree(items, current = []) {
  const pool = items.slice()
  for (let index = pool.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1))
    ;[pool[index], pool[swap]] = [pool[swap], pool[index]]
  }
  const next = pool.slice(0, 3)
  if (pool.length > 3 && next.every(item => current.some(old => old.id === item.id))) {
    next[2] = pool.find(item => !current.some(old => old.id === item.id))
  }
  return next
}
function apply(data) {
  if (!data || typeof data.ownerKey !== 'string') throw Error('Missing recommendation owner')
  if (ownerKey && ownerKey !== data.ownerKey) throw Error('Recommendation owner changed')
  ownerKey = data.ownerKey
  const cached = store.dailyRecommendationCache
  const items = Array.isArray(data.items) && data.items.length >= 3 ? data.items :
    (data.enabled && cached.ownerKey === ownerKey ? cached.items : [])
  store.setDailyRecommendations({ ownerKey, accountId: store.user?.login ? store.user.userId : '', day: data.generatedDay || cached.day || '', items: items || [] })
  if (data.generatedDay === data.day && data.status === 'completed') completedDay = data.day
}
function request(start, force = false) {
  if (!foreground || !enabled()) return Promise.resolve()
  if (pending) return pending
  if (start && !force && completedDay === dayKey()) return Promise.resolve()
  const version = epoch
  const task = getDailyRecommendations(start, force).then(result => {
    if (version !== epoch) return
    const data = result.data
    apply(data)
    return data
  }).catch(() => {
    // Keep the last result; only a later foreground entry or explicit re-enable retries.
  }).finally(() => { if (pending === task) pending = null })
  pending = task
  return task
}
export const dailyRecommendations = {
  setForeground(value) {
    const entering = value && !foreground
    foreground = value
    if (entering) {
      const cached = store.dailyRecommendationCache
      if (enabled() && store.user?.login && store.user.userId && cached.accountId === store.user.userId && cached.items?.length >= 3) {
        ownerKey = cached.ownerKey
        store.setDailyRecommendations(cached)
      }
      request(true)
    }
  },
  refresh(force = false) { return request(true, force) },
  shuffle() {
    const items = store.dailyRecommendationCache.items || []
    if (items.length < 3) return false
    store.setRecommendationItems(randomThree(items, store.recommendationItems))
    return true
  }
}
eventBus.on('dailyRecommendationSettingsSaved', () => {
  if (enabled()) dailyRecommendations.refresh()
})
eventBus.on(CHAT_SESSION_RESET, ({ reason } = {}) => {
  if (!['login', 'logout', 'account-refresh'].includes(reason)) return
  epoch++; pending = null; completedDay = ''; ownerKey = ''; foreground = false
  store.clearDailyRecommendations()
})
