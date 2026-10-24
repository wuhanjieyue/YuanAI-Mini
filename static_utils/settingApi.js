import { startDataExport, deleteAccount as requestDeleteAccount } from '../request/userData'
import eventBus from './eventBus'
import {
  getUser,
  getSettings,
  loginByPhoneCode,
  logout,
  saveSettingsDomain
} from '../request/request'
import {
  archiveAllConversations,
  deleteAllConversations,
  getModelCatalog
} from '../request/chatStream'

const BATCH_SAVE_WAIT = 400
const BATCHED_DOMAINS = {
  applicationSettings: true,
  chatAbout: true,
  suggest: true,
  notification: true,
  dataControl: true
}
const pendingDomainSaves = {}

function showErrorToast(message) {
  wx.showToast({
    title: message || '请求失败',
    icon: 'none',
    duration: 2500
  })
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function mergeChanges(target = {}, changes = {}) {
  const next = Object.assign({}, target)
  Object.keys(changes || {}).forEach((key) => {
    const value = changes[key]
    next[key] = isPlainObject(value) && isPlainObject(next[key])
      ? mergeChanges(next[key], value)
      : value
  })
  return next
}

function unwrapCloudResult(requestPromise, { silent = false } = {}) {
  return requestPromise.then((res) => {
    const body = res && res.result ? res.result : {}
    if (body.code === 200) {
      return body.data
    }
    throw new Error(body.msg || '请求失败')
  }).catch((error) => {
    if (!silent) showErrorToast(error.message)
    throw error
  })
}

function flushDomainSave(domain) {
  const pending = pendingDomainSaves[domain]
  if (!pending) return

  if (pending.inFlight) {
    pending.timer = null
    pending.flushAfterCurrent = true
    return
  }

  const changes = pending.changes
  const requests = pending.requests
  pending.changes = {}
  pending.requests = []
  pending.timer = null
  pending.inFlight = true
  pending.flushAfterCurrent = false

  const silent = requests.every((item) => item.options.silent)
  unwrapCloudResult(saveSettingsDomain(domain, changes), { silent })
    .then((data) => requests.forEach((item) => item.resolve(data)))
    .catch((error) => requests.forEach((item) => item.reject(error)))
    .finally(() => {
      pending.inFlight = false
      if (!pending.requests.length) {
        delete pendingDomainSaves[domain]
        return
      }
      if (pending.flushAfterCurrent || !pending.timer) {
        if (pending.timer) clearTimeout(pending.timer)
        pending.timer = setTimeout(() => flushDomainSave(domain), 0)
      }
    })
}

function queueDomainSave(domain, changes, options = {}) {
  return new Promise((resolve, reject) => {
    const pending = pendingDomainSaves[domain] || {
      changes: {},
      requests: [],
      timer: null,
      inFlight: false,
      flushAfterCurrent: false
    }
    pending.changes = mergeChanges(pending.changes, changes)
    pending.requests.push({ resolve, reject, options })

    if (pending.timer) clearTimeout(pending.timer)
    pending.flushAfterCurrent = false
    pending.timer = setTimeout(() => flushDomainSave(domain), BATCH_SAVE_WAIT)
    pendingDomainSaves[domain] = pending
  })
}

function updateDomain(domain, changes, options = {}) {
  if (BATCHED_DOMAINS[domain] && !options.immediate) {
    return queueDomainSave(domain, changes, options)
  }
  return unwrapCloudResult(saveSettingsDomain(domain, changes), options)
}

export function fetchSettingsBootstrap(options = {}) {
  return unwrapCloudResult(getSettings(), { silent: options.silent !== false })
}

export function fetchAccountSummary(options = {}) {
  return unwrapCloudResult(getUser(), { silent: options.silent !== false })
    .then((data) => data && data.user ? data.user : null)
}

export function fetchModelCatalog(options = {}) {
  return getModelCatalog().then((res) => {
    if (res && res.code === 200) return res.data
    throw new Error(res?.msg || '模型目录加载失败')
  }).catch((error) => {
    if (!options.silent) showErrorToast(error.message)
    throw error
  })
}

export function hasAccountSessionChanged(currentUser = {}, nextUser = {}) {
  const currentKey = currentUser.login ? `user:${currentUser.userId || currentUser.phone || ''}` : 'guest'
  const nextKey = nextUser.login ? `user:${nextUser.userId || nextUser.phone || ''}` : 'guest'
  return currentKey !== nextKey
}

export function loginWithPhoneCode(code) {
  return unwrapCloudResult(loginByPhoneCode(code))
}

export function logoutAccount(options = {}) {
  return unwrapCloudResult(logout(), { silent: options.silent === true })
}

// ─── 个性化设置 ───

export function savePersonalization(draft) {
  return updateDomain('personalization', {
    basicTone: draft.basicTone,
    traits: draft.traits,
    customInstruction: draft.customInstruction,
    nickName: draft.nickName,
    occupation: draft.occupation,
    detail: draft.detail,
    useSavedMemory: !!draft.useSavedMemory,
    useChatHistory: !!draft.useChatHistory
  })
}

// ─── 数据控制 ───

export function updateDataControlSwitch(key, value) {
  return updateDomain('dataControl', {
    [key]: !!value
  }, { silent: true })
}

export function archiveAllChats() {
  return archiveAllConversations()
}

export function deleteAllChats() {
  return deleteAllConversations()
}

export function exportUserData() {
  return startDataExport()
}

export function deleteAccount() {
  return requestDeleteAccount()
}

// ─── 通知设置 ───

export function updateNotification(category, channel, enabled) {
  return updateDomain('notification', {
    [category]: {
      [channel]: !!enabled
    }
  })
}

// ─── 应用设置 ───

export function updateApplicationSettings(settings) {
  return updateDomain('applicationSettings', {
    language: settings.language,
    appearance: settings.appearance,
    pointColor: settings.pointColor,
    hapticFeedback: !!settings.hapticFeedback,
    autoSpell: !!settings.autoSpell
  })
}

export function updateVoice(voiceId) {
  return updateDomain('chatAbout', {
    chatVoice: voiceId
  })
}

export function updateSuggest(suggest = {}) {
  const changes = {}
  ;['autoComplete', 'trendingSearch', 'followUpSuggest'].forEach((key) => {
    if (typeof suggest[key] === 'boolean') changes[key] = suggest[key]
  })
  return updateDomain('suggest', changes).then(result => {
    if (typeof changes.trendingSearch === 'boolean') eventBus.emit('dailyRecommendationSettingsSaved')
    return result
  })
}
