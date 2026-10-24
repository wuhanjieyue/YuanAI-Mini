import { store, DEFAULT_USER } from '../store/index.js'
import { fetchAccountSummary, fetchSettingsBootstrap, fetchModelCatalog, hasAccountSessionChanged } from './settingApi.js'
import eventBus, { CHAT_SESSION_RESET } from './eventBus.js'
const { normalizeModeSelection } = require('./modelCatalog')

let syncPromise = null
let syncVersion = 0
let synced = false
let modelCatalogPromise = null
let modelCatalogVersion = 0
let modelCatalogSynced = !!store.modelCatalog?.models?.length

eventBus.on(CHAT_SESSION_RESET, ({ reason } = {}) => {
  if (!['login', 'logout', 'account-refresh'].includes(reason)) return
  modelCatalogVersion += 1
  modelCatalogPromise = null
  modelCatalogSynced = false
  synced = false
  if (reason !== 'account-refresh') { syncVersion += 1; syncPromise = null }
})

function mergeObject(current = {}, incoming = {}) {
  const next = Object.assign({}, current)
  Object.keys(incoming || {}).forEach((key) => {
    const value = incoming[key]
    next[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? mergeObject(next[key], value)
      : value
  })
  return next
}

function applySettings(payload) {
  const settings = payload && payload.settings
  if (!settings) return

  store.setApplicationSettings(mergeObject(store.applicationSettings, settings.applicationSettings))
  store.setChatAbout(mergeObject(store.chatAbout, settings.chatAbout))
  store.setSuggest(mergeObject(store.suggest, settings.suggest))
  store.setPersonalization(mergeObject(store.personalization, settings.personalization))
  store.setNotification(mergeObject(store.notification, settings.notification))
  store.setDataControl(mergeObject(store.dataControl, settings.dataControl))
}

export function buildUserFromAccountSummary(summary = {}) {
  if (!summary || !summary.login) return { ...DEFAULT_USER }
  const nextUser = Object.assign({}, DEFAULT_USER, summary)
  nextUser.nickName = typeof summary.nickName === 'string' ? summary.nickName : ''
  nextUser.userName = typeof summary.userName === 'string' ? summary.userName : ''
  nextUser.email = summary.email || ''
  nextUser.phone = summary.phone || ''
  nextUser.login = true
  return nextUser
}

function applyAccount(summary) {
  if (!summary) return
  const nextUser = buildUserFromAccountSummary(summary)
  if (hasAccountSessionChanged(store.user, nextUser)) {
    store.resetAssetListCache()
    store.resetChatHistory()
    store.resetChatMessageCache()
    if (typeof store.resetChatRuns === 'function') store.resetChatRuns()
    applyModelCatalog(Object.assign({}, store.modelCatalog, {
      accessPlan: nextUser.login ? 'user' : 'guest'
    }))
    store.setWorkModelSelection(normalizeModeSelection(store.modelCatalog, 'work'))
    eventBus.emit(CHAT_SESSION_RESET, { reason: 'account-refresh', reloadHistory: true })
  }
  store.setUser(nextUser)
}

function applyModelCatalog(modelCatalog) {
  if (!modelCatalog || !Array.isArray(modelCatalog.models)) return
  store.setModelCatalog(modelCatalog)
  const selection = normalizeModeSelection(store.modelCatalog, 'work', store.workModelSelection)
  if (selection.modelId !== store.workModelSelection.modelId || selection.effortId !== store.workModelSelection.effortId) {
    store.setWorkModelSelection(selection)
  }
}

export function loadModelCatalog({ force = false, silent = true } = {}) {
  if (!force && modelCatalogSynced && store.modelCatalog?.models?.length) return Promise.resolve(store.modelCatalog)
  if (!force && modelCatalogPromise) return modelCatalogPromise

  const version = ++modelCatalogVersion
  const request = fetchModelCatalog({ silent }).then((modelCatalog) => {
    if (version === modelCatalogVersion) {
      applyModelCatalog(modelCatalog)
      modelCatalogSynced = true
    }
    return modelCatalog
  }).catch((error) => {
    if (version === modelCatalogVersion) modelCatalogSynced = false
    throw error
  }).finally(() => {
    if (modelCatalogPromise === request) modelCatalogPromise = null
  })

  modelCatalogPromise = request
  return request
}

export function initAppData({ force = false, silent = true } = {}) {
  if (!force && syncPromise) return syncPromise
  const avatarExpired = store.user?.avatarFileID && Number(store.user?.avatarUrlExpiresAt || 0) <= Date.now() + 30000
  if (!force && synced && !avatarExpired) return Promise.resolve({ cached: true })

  synced = false
  const version = ++syncVersion
  const request = (async () => {
    const [accountResult] = await Promise.allSettled([fetchAccountSummary({ silent })])
    if (version !== syncVersion) return { stale: true }
    if (accountResult.status !== 'fulfilled') return { accountResult }
    applyAccount(accountResult.value)
    const [settingsResult, modelCatalogResult] = await Promise.allSettled([
      fetchSettingsBootstrap({ silent }), loadModelCatalog({ force, silent })
    ])
    if (version !== syncVersion) return { stale: true }
    if (settingsResult.status === 'fulfilled') applySettings(settingsResult.value)
    synced = settingsResult.status === 'fulfilled' && modelCatalogResult.status === 'fulfilled'
    return { accountResult, settingsResult, modelCatalogResult }
  })() .finally(() => {
    if (syncPromise === request) syncPromise = null
  })

  syncPromise = request
  return request
}
