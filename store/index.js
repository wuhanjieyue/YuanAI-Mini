import { observable, action } from 'mobx-miniprogram'
const {
  EMPTY_CHAT_MESSAGE_CACHE,
  normalizeCache,
  touchCache,
  upsertCache,
  persistCacheWithEviction
} = require('../static_utils/chatMessageCache')
const { normalizeModelCatalog } = require('../static_utils/modelCatalog')

const { resolveTheme, normalizeTheme } = require('../static_utils/theme')

const CHAT_MESSAGE_CACHE_KEY = 'chatMessageCache'
const assetCache = require('../static_utils/assetListCache')

export const DEFAULT_PERSONALIZATION = {
  basicTone: '亲和友善',
  traits: { gentle: '默认', warm: '默认', headings: '默认', emoji: '默认' },
  customInstruction: '',
  nickName: '',
  occupation: '',
  detail: '',
  useSavedMemory: true,
  useChatHistory: true
}

export const DEFAULT_USER = {
  login: false,
  avatarUrl: '',
  nickName: '',
  userName: '',
  email: '',
  phone: '',
  subscription: 'basic'
}

const DEFAULT_APP_INFO = {
  appName: 'YuanAI',
  appVersion: '1.0.0(版权归属杰跃信息技术有限公司)'
}

const DEFAULT_APPLICATION_SETTINGS = {
  language: '中文', // 应用语言
  appearance: '系统', // 外观
  pointColor: '默认', // 重点色
  hapticFeedback: true, // 触觉反馈
  autoSpell: true // 自动更正拼写
}

const DEFAULT_CHAT_ABOUT = {
  chatLanguage: '中文（简体）', // 主要语言
  chatVoice: '默认' // 声音
}

const DEFAULT_SUGGEST = {
  autoComplete: true, // 自动完成
  trendingSearch: true, // 热门趋势搜索
  followUpSuggest: true // 跟进建议
}

const DEFAULT_SETTINGS = {
  autoKey: false, //启动时显示键盘
  hideKey: false // 发送时隐藏键盘
}

const DEFAULT_DATA_CONTROL = {
  improve_model: true,
  voice_record: false,
  voice_camera: false
}

const DEFAULT_NOTIFICATION = {
  reply: { wechat: true },
  group: { wechat: true },
  task: { wechat: true, sms: true },
  recommend: { wechat: true, sms: true },
  usage: { wechat: true, sms: true }
}

const DEFAULT_CHAT_HISTORY = {
  ownerKey: '',
  conversations: [],
  latestModifiedAt: '',
  pageSize: 25,
  nextOffset: 0,
  hasMore: true
}

const DEFAULT_PINNED_CHAT_HISTORY = {
  ownerKey: '',
  conversations: [],
  latestModifiedAt: '',
  pageSize: 5,
  nextOffset: 0,
  hasMore: false
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function cloneObject(value) {
  if (!isPlainObject(value)) return value

  const next = {}
  Object.keys(value).forEach((key) => {
    next[key] = cloneObject(value[key])
  })
  return next
}

function mergeObject(defaultValue, value) {
  const next = cloneObject(defaultValue)
  if (!isPlainObject(value)) return next

  Object.keys(value).forEach((key) => {
    next[key] = isPlainObject(next[key]) && isPlainObject(value[key])
      ? mergeObject(next[key], value[key])
      : cloneObject(value[key])
  })
  return next
}

function getStoredObject(key, defaultValue) {
  return mergeObject(defaultValue, wx.getStorageSync(key))
}

function persistObject(key, defaultValue, value) {
  const next = mergeObject(defaultValue, value)
  wx.setStorageSync(key, next)
  return next
}

function normalizeNotification(value) {
  const next = mergeObject(DEFAULT_NOTIFICATION, value)
  for (const category of ['task', 'recommend', 'usage']) {
    const prefs = isPlainObject(value) && value[category]
    if (isPlainObject(prefs) && prefs.sms === undefined && typeof prefs.email === 'boolean') {
      next[category].sms = prefs.email
    }
    delete next[category].email
  }
  return next
}

function normalizeApplicationSettings(value) {
  const next = mergeObject(DEFAULT_APPLICATION_SETTINGS, value)
  delete next.showOtherModels
  return next
}

function storedApplicationSettings() {
  const stored = wx.getStorageSync('applicationSettings')
  const next = normalizeApplicationSettings(stored)
  if (stored && Object.prototype.hasOwnProperty.call(stored, 'showOtherModels')) {
    wx.setStorageSync('applicationSettings', next)
  }
  return next
}

function normalizeWorkModelSelection(value = {}) {
  return {
    modelId: typeof value.modelId === 'string' ? value.modelId : '',
    effortId: typeof value.effortId === 'string' ? value.effortId : ''
  }
}

export const store = observable({
  dailyRecommendationCache: getStoredObject('dailyRecommendations_v1', { ownerKey: '', day: '', items: [] }),
  recommendationItems: [],
  setDailyRecommendations: action(function (value) {
    this.dailyRecommendationCache = value
    this.recommendationItems = value.items.slice(0, 3)
    try { wx.setStorageSync('dailyRecommendations_v1', value) } catch (_) {}
  }),
  setRecommendationItems: action(function (items) {
    this.recommendationItems = items
  }),
  clearDailyRecommendations: action(function () {
    this.dailyRecommendationCache = { ownerKey: '', day: '', items: [] }
    this.recommendationItems = []
    try { wx.removeStorageSync('dailyRecommendations_v1') } catch (_) {}
  }),
  shakeToReport: wx.getStorageSync('shakeToReport') !== false,
  setShakeToReport: action(function (enabled) {
    wx.setStorageSync('shakeToReport', !!enabled)
    this.shakeToReport = !!enabled
  }),
  createIntroSeen: wx.getStorageSync('createIntroSeen') === true,
  setCreateIntroSeen: action(function () {
    this.createIntroSeen = true
    wx.setStorageSync('createIntroSeen', true)
  }),
    systemTheme: 'light',
    setSystemTheme: action(function (theme) { this.systemTheme = normalizeTheme(theme) }),
    get effectiveTheme() { return resolveTheme(this.applicationSettings.appearance, this.systemTheme) },
   // 用户信息
  user: getStoredObject('user', DEFAULT_USER),

  setUser: action(function (user) {
    this.user = persistObject('user', DEFAULT_USER, user)
  }),

    appInfo: getStoredObject('appInfo', DEFAULT_APP_INFO),
    applicationSettings: storedApplicationSettings(),
    setApplicationSettings: action(function (applicationSettings) {
        this.applicationSettings = normalizeApplicationSettings(applicationSettings)
        wx.setStorageSync('applicationSettings', this.applicationSettings)
    }),

    modelCatalog: normalizeModelCatalog(),
    setModelCatalog: action(function (modelCatalog) {
      this.modelCatalog = normalizeModelCatalog(modelCatalog)
    }),

    workModelSelection: normalizeWorkModelSelection(wx.getStorageSync('workModelSelection')),
    setWorkModelSelection: action(function (selection) {
      this.workModelSelection = normalizeWorkModelSelection(selection)
      wx.setStorageSync('workModelSelection', this.workModelSelection)
    }),

    chatAbout: getStoredObject('chat', DEFAULT_CHAT_ABOUT),
    setChatAbout: action(function (chatAbout) {
      this.chatAbout = persistObject('chat', DEFAULT_CHAT_ABOUT, chatAbout)
    }),

    suggest: getStoredObject('suggest', DEFAULT_SUGGEST),
    setSuggest: action(function (suggest) {
      this.suggest = persistObject('suggest', DEFAULT_SUGGEST, suggest)
    }),

  settings: getStoredObject('settings', DEFAULT_SETTINGS),
  // 个性化设置
  personalization: getStoredObject('personalization', DEFAULT_PERSONALIZATION),
  setPersonalization: action(function (personalization) {
    this.personalization = persistObject('personalization', DEFAULT_PERSONALIZATION, personalization)
  }),

  // 数据控制开关
  dataControl: getStoredObject('dataControl', DEFAULT_DATA_CONTROL),
  setDataControl: action(function (dataControl) {
    this.dataControl = persistObject('dataControl', DEFAULT_DATA_CONTROL, dataControl)
  }),

  // 通知偏好
  notification: normalizeNotification(wx.getStorageSync('notification')),
  setNotification: action(function (notification) {
    this.notification = normalizeNotification(notification)
    wx.setStorageSync('notification', this.notification)
  }),

  assetListCache: assetCache.normalize(wx.getStorageSync(assetCache.KEY)),
  assetCacheEpoch: 0,
  setAssetListCache: action(function (value) {
    this.assetListCache = assetCache.normalize(value)
    try { wx.setStorageSync(assetCache.KEY, this.assetListCache) } catch (_) {
      // Keep the current in-memory view usable if the device storage quota is full.
      try { wx.removeStorageSync(assetCache.KEY) } catch (_) {}
    }
  }),
  resetAssetListCache: action(function () {
    this.assetCacheEpoch += 1
    this.setAssetListCache({ entries: Object.fromEntries(Object.entries(this.assetListCache.entries).filter(([, entry]) => entry.source === 'templates')) })
  }),

  chatHistory: getStoredObject('chatHistory', DEFAULT_CHAT_HISTORY),
  setChatHistory: action(function (chatHistory) {
    this.chatHistory = persistObject('chatHistory', DEFAULT_CHAT_HISTORY, chatHistory)
  }),
  pinnedChatHistory: getStoredObject('pinnedChatHistory', DEFAULT_PINNED_CHAT_HISTORY),
  setPinnedChatHistory: action(function (pinnedChatHistory) {
    this.pinnedChatHistory = persistObject('pinnedChatHistory', DEFAULT_PINNED_CHAT_HISTORY, pinnedChatHistory)
  }),
  resetChatHistory: action(function () {
    this.chatHistory = persistObject('chatHistory', DEFAULT_CHAT_HISTORY, {})
    this.pinnedChatHistory = persistObject('pinnedChatHistory', DEFAULT_PINNED_CHAT_HISTORY, {})
  }),

  chatMessageCache: normalizeCache(wx.getStorageSync(CHAT_MESSAGE_CACHE_KEY)),
  getChatMessageCacheEntry: action(function (conversationId) {
    const current = normalizeCache(this.chatMessageCache)
    const touched = touchCache(current, conversationId)
    if (!touched.entry) return null
    this.chatMessageCache = persistCacheWithEviction(
      touched.cache,
      (value) => wx.setStorageSync(CHAT_MESSAGE_CACHE_KEY, value),
      current,
      conversationId
    )
    return this.chatMessageCache.entries[conversationId] || null
  }),
  setChatMessageCacheEntry: action(function (entry) {
    const current = normalizeCache(this.chatMessageCache)
    const conversationId = entry && entry.conversationId
    this.chatMessageCache = persistCacheWithEviction(
      upsertCache(current, entry),
      (value) => wx.setStorageSync(CHAT_MESSAGE_CACHE_KEY, value),
      current,
      conversationId
    )
  }),
  removeChatMessageCacheEntry: action(function (conversationId) {
    const next = normalizeCache(this.chatMessageCache)
    delete next.entries[conversationId]
    next.lru = next.lru.filter(id => id !== conversationId)
    this.chatMessageCache = next
    try {
      wx.setStorageSync(CHAT_MESSAGE_CACHE_KEY, next)
    } catch (error) {
      wx.removeStorageSync(CHAT_MESSAGE_CACHE_KEY)
    }
  }),
  resetChatMessageCache: action(function () {
    try {
      wx.removeStorageSync(CHAT_MESSAGE_CACHE_KEY)
    } catch (error) {
    }
    this.chatMessageCache = normalizeCache(EMPTY_CHAT_MESSAGE_CACHE)
  }),

  // The server owns unread state; transport handles and timers stay outside MobX.
  chatOwnerKey: '',
  setChatOwnerKey: action(function (ownerKey) {
    if (this.chatOwnerKey === ownerKey) return
    this.chatOwnerKey = ownerKey
    this.unreadConversations = {}
  }),
  unreadConversations: {},
  setUnreadConversations: action(function (unread) { this.unreadConversations = { ...unread } }),
  get hasUnreadConversations() { return Object.keys(this.unreadConversations).length > 0 },
  removeUnreadConversation: action(function (conversationId) {
    if (!this.unreadConversations[conversationId]) return
    const unread = { ...this.unreadConversations }
    delete unread[conversationId]
    this.setUnreadConversations(unread)
  }),
  chatRuns: {},
  setChatRun: action(function (conversationId, run) {
    if (!conversationId) return
    this.chatRuns = { ...this.chatRuns, [conversationId]: { ...(run || {}) } }
  }),
  removeChatRun: action(function (conversationId) {
    if (!conversationId || !this.chatRuns[conversationId]) return
    const next = { ...this.chatRuns }
    delete next[conversationId]
    this.chatRuns = next
  }),
  resetChatRuns: action(function () {
    this.chatRuns = {}; this.chatOwnerKey = ''
    this.unreadConversations = {}
  }),
})
