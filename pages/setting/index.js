import { getDataExport, getAccountDeletion, shareDataExport } from '../../request/userData'
import { openErrorReport } from '../../static_utils/errorReporting'
const { memorySections } = require('../../static_utils/longTermMemoryView')
import { getStorageUsage } from '../../request/request'
import { getBillingSummary } from '../../request/billing'
const { billingView } = require('../../static_utils/billingView')
const { storageView } = require('../../static_utils/storageView')
const { bindPageTheme, unbindPageTheme, syncThemeNavigation } = require('../../static_utils/themeBinding')
// pages/setting/index.js
import { createStoreBindings } from 'mobx-miniprogram-bindings'
import { store, DEFAULT_PERSONALIZATION, DEFAULT_USER } from '../../store/index'
import {
  AnimationStatus,
  GestureState,
  clamp,
  Curves,
  bottomSheetSuspendedCurve
} from '../../static_utils/routerUtil.js'
import { VOICE_OPTIONS, VOICE_META_MAP, DEFAULT_VOICE_ID } from '../../static_utils/voiceOptions'
const { DEFAULT_POINT_COLOR, POINT_COLOR_OPTIONS, POINT_COLOR_META_MAP } = require('../../static_utils/accentColor')
const { messages, t } = require('../../static_utils/i18n/index')
import {
  fetchAccountSummary,
  loginWithPhoneCode,
  logoutAccount,
  archiveAllChats,
  deleteAllChats,
  exportUserData,
  deleteAccount,
  savePersonalization,
  updateApplicationSettings,
  updateDataControlSwitch,
  updateNotification,
  updateSuggest,
  updateVoice
} from '../../static_utils/settingApi'
import { buildUserFromAccountSummary, initAppData } from '../../static_utils/appDataInit.js'
import eventBus, { CHAT_SESSION_RESET } from '../../static_utils/eventBus'
import { triggerHaptic } from '../../static_utils/haptic'
import { deleteLongTermMemory, getLongTermMemory, refreshLongTermMemory as requestLongTermMemoryRefresh } from '../../request/chatStream'
import settingRouterBuilder, {
  getSettingSheetMetrics,
  SETTING_ROUTE_DURATION,
  SETTING_ROUTE_TYPE
} from '../../static_router/settingRouter'

const { shared, timing } = wx.worklet

const MIN_FLING_VELOCITY = 500
const CLOSE_PROGRESS_THRESHOLD = 0.6
const PANEL_CLOSE_THRESHOLD = 0.35
const AI_MODEL_NAME = 'YuanAI'
const PANEL_FLING_VELOCITY = 800
const PANEL_DURATION = 300
const DEFAULT_LANGUAGE = '中文'
const DEFAULT_APPEARANCE = '系统'
const DEFAULT_CHAT_VOICE = '默认'
const SAVE_PANEL_KEYS = ['personalization', 'memory']
const SETTINGS_STORAGE_KEYS = ['applicationSettings', 'chat', 'suggest', 'personalization', 'dataControl', 'notification']
const DATA_CONTROL_ACTION_API_MAP = {
  archive_all: archiveAllChats,
  delete_all: deleteAllChats,
  export_data: exportUserData,
  delete_account: deleteAccount
}
const SECONDARY_SCROLL_HANDLERS = [
  'personalizationScroll',
  'memoryScroll',
  'longTermMemoryScroll',
  'notificationScroll',
  'notificationDetailScroll',
  'dataControlScroll',
  'archiveScroll',
  'storageScroll',
  'usageLimitsScroll'
]
const SHEET_SCROLL_HANDLERS = ['scroll', ...SECONDARY_SCROLL_HANDLERS]

const ABOUT_PAGE_PATHS = {
  report_error: '/pages/reportError/index',
  help_center: '/pages/helpCenter/index',
  terms_of_use: '/mdPackage/pages/terms/index',
  privacy_policy: '/mdPackage/pages/privacy/index'
}

// --- Personalization data ---

const PERSONALIZATION_TRAITS = [
  { key: 'gentle', nameKey: 'personalization.traitNames.gentle' },
  { key: 'warm', nameKey: 'personalization.traitNames.warm' },
  { key: 'headings', nameKey: 'personalization.traitNames.headings' },
  { key: 'emoji', nameKey: 'personalization.traitNames.emoji' }
]

function createPersonalizationDraft() {
  return { ...DEFAULT_PERSONALIZATION, traits: { ...DEFAULT_PERSONALIZATION.traits } }
}

// --- Route helpers ---

function getRouteProgress(routeContext) {
  'worklet'
  if (!routeContext) return 1
  if (
    routeContext.userGestureInProgress.value ||
    routeContext.primaryAnimationStatus.value === AnimationStatus.reverse
  ) {
    return routeContext.primaryAnimation.value
  }
  return 1
}

function getScrollScale(routeContext) {
  'worklet'
  const s = getRouteProgress(routeContext)
  return 0.9 + 0.1 * (s < 0.6 ? 0.5 : s)
}

function shouldRestoreRoute(primaryAnimationValue, velocity) {
  'worklet'
  if (Math.abs(velocity) >= MIN_FLING_VELOCITY) {
    return velocity <= 0
  }
  return primaryAnimationValue > CLOSE_PROGRESS_THRESHOLD
}

function glassToggleStyle(value) {
  'worklet'
  return {
    opacity: `${value}`,
    transform: `scale(${value > 0.01 ? 1 : 0})`,
    pointerEvents: value > 0.5 ? 'auto' : 'none'
  }
}

function resolveScrollResponse(scrollTopValue, pointerEvent, routeContext, startPan) {
  'worklet'
  const { primaryAnimation } = routeContext || {}
  if (!primaryAnimation) return true
  if (primaryAnimation.value < 1) return false

  const shouldScroll = !(scrollTopValue <= 0 && pointerEvent.deltaY > 0)
  startPan.value = !shouldScroll
  return shouldScroll
}

function updateScrollPosition(scrollTopValue, evt) {
  'worklet'
  scrollTopValue.value = evt.detail?.scrollTop || 0
}

function normalizeDataControlDialogAnchor(rect) {
  if (!rect) return rect

  // Data-control rows are inside the half-screen sheet, while the confirm
  // dialog is a sibling fixed layer whose origin is the page viewport.
  const { topInset } = getSettingSheetMetrics()
  return {
    ...rect,
    top: rect.top - topInset
  }
}

// --- Setting options ---

const LANGUAGE_OPTIONS = [
  { labelKey: 'settings.language.options.zhCN', value: '中文' },
  { labelKey: 'settings.language.options.enUS', value: 'English' }
  // { label: '日本語', value: '日本語' },
  // { label: '한국어', value: '한국어' },
  // { label: 'Français', value: 'Français' },
  // { label: 'Deutsch', value: 'Deutsch' },
  // { label: 'Español', value: 'Español' },
  // { label: 'Português', value: 'Português' },
  // { label: 'Русский', value: 'Русский' },
  // { label: 'Italiano', value: 'Italiano' },
  // { label: 'Nederlands', value: 'Nederlands' },
  // { label: 'Türkçe', value: 'Türkçe' },
  // { label: 'العربية', value: 'العربية' },
  // { label: 'हिन्दी', value: 'हिन्दी' },
  // { label: 'ไทย', value: 'ไทย' },
  // { label: 'Tiếng Việt', value: 'Tiếng Việt' },
  // { label: 'Bahasa Indonesia', value: 'Bahasa Indonesia' },
  // { label: 'Bahasa Melayu', value: 'Bahasa Melayu' },
  // { label: 'Filipino', value: 'Filipino' },
  // { label: 'Polski', value: 'Polski' },
  // { label: 'Čeština', value: 'Čeština' },
  // { label: 'Svenska', value: 'Svenska' },
  // { label: 'Dansk', value: 'Dansk' },
  // { label: 'Norsk', value: 'Norsk' }
]

const APPEARANCE_OPTIONS = [
  { labelKey: 'settings.appearance.system', descKey: 'settings.appearance.systemDesc', value: '系统' },
  { labelKey: 'settings.appearance.dark', descKey: 'settings.appearance.darkDesc', value: '深色' },
  { labelKey: 'settings.appearance.light', descKey: 'settings.appearance.lightDesc', value: '浅色' }
]

const LANGUAGE_VALUES = LANGUAGE_OPTIONS.map((item) => item.value)
const APPEARANCE_VALUES = APPEARANCE_OPTIONS.map((item) => item.value)

function localizeOptions(language, options) {
  return options.map((option) => ({
    ...option,
    label: t(language, option.labelKey),
    desc: option.descKey ? t(language, option.descKey) : option.desc
  }))
}

function localizeVoiceOptions(language) {
  const labels = messages(language).settings.voiceOptions
  return VOICE_OPTIONS.map((option, index) => ({ ...option, ...labels[index] }))
}

function localizeAccentOptions(language) {
  const labels = messages(language).settings.accentOptions
  return POINT_COLOR_OPTIONS.map((option, index) => ({ ...option, label: labels[index] }))
}

function selectedLabel(options, value) {
  return options.find((option) => option.value === value)?.label || value
}

function buildStaticSets(language) {
  return {
    customSets: [
      { key:'personalization', name:t(language, 'settings.personalization'), icon:'icon-individuation', rightSet:true },
      { key:'memory', name:t(language, 'settings.memory'), icon:'icon-study', rightSet:true },
      { key:'plugins', name:t(language, 'common.plugin'), icon:'icon-classify', rightSet:true }
    ],
    accountSets: [
      { key:'phone', name:t(language, 'settings.phone'), icon:'icon-phone', rightValue:true },
      { key:'subscription', name:t(language, 'settings.subscription'), icon:'icon-upgrade', rightValue:true },
      { key:'upgrade_pro', name:t(language, 'settings.upgrade'), icon:'icon-upgrade' },
      { key:'usage_limits', name:t(language, 'usageLimits.title'), icon:'icon-gauge', rightSet:true }
    ],
    aboutSets: [
      { key:'report_error', name:t(language, 'about.report'), icon:'icon-edit-pen' },
      { key:'help_center', name:t(language, 'about.help'), icon:'icon-question' },
      { key:'terms_of_use', name:t(language, 'about.terms'), icon:'icon-document' },
      { key:'privacy_policy', name:t(language, 'about.privacy'), icon:'icon-lock' }
    ],
    personalizationTraits:PERSONALIZATION_TRAITS.map((item) => ({ ...item, name:t(language, item.nameKey) }))
  }
}

function normalizeLanguageValue(value) {
  if (value === '中文（简体）') {
    return DEFAULT_LANGUAGE
  }
  return LANGUAGE_VALUES.includes(value) ? value : DEFAULT_LANGUAGE
}

function normalizeAppearanceValue(value) {
  return APPEARANCE_VALUES.includes(value) ? value : DEFAULT_APPEARANCE
}

function normalizePointColorValue(value) {
  return POINT_COLOR_META_MAP[value] ? value : DEFAULT_POINT_COLOR
}

function normalizeApplicationSettings(settings = {}) {
  return Object.assign({}, settings, {
    language: normalizeLanguageValue(settings.language),
    appearance: normalizeAppearanceValue(settings.appearance),
    pointColor: normalizePointColorValue(settings.pointColor)
  })
}

function normalizeChatVoiceValue(value) {
  if (!value || value === DEFAULT_CHAT_VOICE) return DEFAULT_VOICE_ID
  return VOICE_META_MAP[value] ? value : DEFAULT_VOICE_ID
}

function mergePersonalizationSettings(current = DEFAULT_PERSONALIZATION, incoming = {}) {
  const next = Object.assign({}, current, incoming)
  next.traits = Object.assign({}, current.traits || DEFAULT_PERSONALIZATION.traits, incoming.traits || {})
  return next
}

function isSameApplicationSettings(source = {}, target = {}) {
  return ['language', 'appearance', 'pointColor', 'hapticFeedback', 'autoSpell']
    .every((key) => source[key] === target[key])
}

Page({
  syncNormalizedApplicationSettings(chatAbout = this.data.chatAbout) {
    const currentSettings = this.data.applicationSettings || {}
    const normalizedSettings = normalizeApplicationSettings(currentSettings)
    if (!isSameApplicationSettings(currentSettings, normalizedSettings)) {
      this.setApplicationSettings(normalizedSettings)
    }
    this.syncApplicationSets(normalizedSettings, chatAbout)
  },

  syncApplicationSets(settings = this.data.applicationSettings, chatAbout = this.data.chatAbout) {
    const applicationSettings = normalizeApplicationSettings(settings || {})
    const voiceValue = normalizeChatVoiceValue(chatAbout && chatAbout.chatVoice)
    const pointColorMeta = POINT_COLOR_META_MAP[applicationSettings.pointColor] || POINT_COLOR_META_MAP[DEFAULT_POINT_COLOR]
    const languageOptions = LANGUAGE_OPTIONS.map((option) => ({
      ...option,
      label: t(applicationSettings.language, option.labelKey)
    }))
    const appearanceOptions = localizeOptions(applicationSettings.language, APPEARANCE_OPTIONS)
    const voiceOptions = localizeVoiceOptions(applicationSettings.language)
    const accentOptions = localizeAccentOptions(applicationSettings.language)

    this.setData({
      applicationSettings,
      i18n: messages(applicationSettings.language),
      customSectionTitle: t(applicationSettings.language, 'settings.sections.custom', { app:AI_MODEL_NAME }),
      miniProgramLabel: t(applicationSettings.language, 'settings.miniProgramVersion', { version:this.data.appInfo?.appName || '' }),
      ...buildStaticSets(applicationSettings.language),
      applicationSets: [
        {
          key: 'language',
          name: t(applicationSettings.language, 'settings.language.title'),
          icon: 'icon-world',
          type: 'selector',
          value: applicationSettings.language,
          selectedValue: applicationSettings.language,
          options: languageOptions,
          interactive: true,
          scrollable: true
        },
        {
          key: 'appearance',
          name: t(applicationSettings.language, 'settings.appearance.title'),
          icon: 'icon-sun',
          type: 'selector',
          value: selectedLabel(appearanceOptions, applicationSettings.appearance),
          selectedValue: applicationSettings.appearance,
          options: appearanceOptions,
          interactive: true,
          scrollable: true
        },
        {
          key: 'chatVoice',
          name: t(applicationSettings.language, 'settings.sound'),
          icon: 'icon-voice',
          type: 'selector',
          value: selectedLabel(voiceOptions, voiceValue),
          selectedValue: voiceValue,
          options: voiceOptions,
          interactive: true,
          scrollable: true
        },
        {
          key: 'pointColor',
          name: t(applicationSettings.language, 'settings.accentColor'),
          icon: 'icon-color',
          type: 'accent',
          value: selectedLabel(accentOptions, applicationSettings.pointColor),
          accentColor: pointColorMeta.color,
          accentStyle: pointColorMeta.dotStyle,
          selectedValue: applicationSettings.pointColor,
          options: accentOptions,
          interactive: true,
          scrollable: true
        },
        {
          key: 'hapticFeedback',
          name: t(applicationSettings.language, 'settings.haptics'),
          icon: 'icon-mouse',
          type: 'switch',
          checked: !!applicationSettings.hapticFeedback
        },
        {
          key: 'autoSpell',
          name: t(applicationSettings.language, 'settings.autocorrect'),
          icon: 'icon-text_check',
          type: 'switch',
          checked: !!applicationSettings.autoSpell
        },
        {
          key: 'notification',
          name: t(applicationSettings.language, 'notification.title'),
          icon: 'icon-notification',
          type: 'link',
          rightSet: true
        },
        {
          key: 'data_control',
          name: t(applicationSettings.language, 'settings.dataControls'),
          icon: 'icon-document',
          type: 'link',
          rightSet: true
        },
        {
          key: 'storage',
          name: t(applicationSettings.language, 'storage.title'),
          icon: 'icon-archive',
          type: 'link',
          rightSet: true
        }
      ]
    })
    const saveLabel = t(applicationSettings.language, 'common.save')
    if (this._saveLabelText !== saveLabel) {
      this._saveLabelText = saveLabel
      wx.nextTick(() => this.measureSaveLabel())
    }
  },

  syncSuggestSets(suggest = this.data.suggest || {}) {
    const language = this.data.applicationSettings?.language
    const normalizedSuggest = Object.assign({
      autoComplete: true,
      trendingSearch: true,
      followUpSuggest: true
    }, this.data.suggest || {}, suggest || {})
    this.setData({
      suggest: normalizedSuggest,
      suggestSets: [
        {
          key: 'auto_complete',
          name: t(language, 'settings.autocomplete'),
          icon: 'icon-image-create',
          type: 'switch',
          checked: normalizedSuggest.autoComplete !== false
        },
        {
          key: 'trending_search',
          name: t(language, 'settings.trending'),
          icon: 'icon-trending-up',
          type: 'switch',
          checked: normalizedSuggest.trendingSearch !== false
        },
        {
          key: 'followup_suggest',
          name: t(language, 'settings.followUps'),
          icon: 'icon-advice',
          type: 'switch',
          checked: normalizedSuggest.followUpSuggest !== false
        }
      ]
    })
  },

  handleAppSwitchChange(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    const checked = !!e.detail.value
    triggerHaptic(key === 'hapticFeedback' || this.data.applicationSettings?.hapticFeedback, 'light')
    const applicationSettings = Object.assign({}, this.data.applicationSettings, { [key]: checked })
    this.setApplicationSettings(applicationSettings)
    this.syncApplicationSets(applicationSettings)
    updateApplicationSettings(applicationSettings).catch(() => {})
  },

  handleSuggestSwitchChange(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    const checked = !!e.detail.value
    triggerHaptic(this.data.applicationSettings?.hapticFeedback, 'light')
    const SUGGEST_KEY_MAP = {
      auto_complete: 'autoComplete',
      trending_search: 'trendingSearch',
      followup_suggest: 'followUpSuggest'
    }
    const storeKey = SUGGEST_KEY_MAP[key]
    if (!storeKey) return
    const suggest = Object.assign({}, this.data.suggest, { [storeKey]: checked })
    this.setSuggest(suggest)
    this.syncSuggestSets(suggest)
    updateSuggest({ [storeKey]: checked }).catch(() => {})
  },

  // --- Panel animation setup ---

  initPanelAnimations() {
    const rpx = this._screenWidth / 750
    const screenWidth = this._screenWidth

    this.applyAnimatedStyle('.header-back-btn', () => {
      'worklet'
      return glassToggleStyle(this.panelProgress.value * (1 - this._hideBack.value))
    })

    this.applyAnimatedStyle('.header-primary-title', () => {
      'worklet'
      return { opacity: `${1 - this.panelProgress.value}` }
    })

    this.applyAnimatedStyle('.header-secondary-title', () => {
      'worklet'
      return { opacity: `${this.panelProgress.value}` }
    })

    this.applyAnimatedStyle('.header-action-btn', () => {
      'worklet'
      const label = this.panelProgress.value * this._showSave.value * (1 - this._saveMorph.value)
      const padding = (22 + 30 * label) * rpx
      return {
        paddingLeft: `${padding}px`,
        paddingRight: `${padding}px`
      }
    })

    this.applyAnimatedStyle('.header-save-label-wrap', () => {
      'worklet'
      const visible = this.panelProgress.value * this._showSave.value * (1 - this._saveMorph.value)
      return { width: `${this._saveLabelWidth.value * visible}px`, opacity: `${visible}` }
    })

    this.applyAnimatedStyle('.header-action-icon-wrap', () => {
      'worklet'
      const label = this.panelProgress.value * this._showSave.value * (1 - this._saveMorph.value)
      return { width: `${48 * rpx * (1 - label)}px`, opacity: `${1 - label}` }
    })

    this.applyAnimatedStyle('.header-close-icon', () => {
      'worklet'
      const save = this.panelProgress.value * this._showSave.value
      const more = this.panelProgress.value * this._showMore.value
      return { opacity: `${1 - Math.max(save, more)}` }
    })

    this.applyAnimatedStyle('.header-more-icon', () => {
      'worklet'
      return { opacity: `${this.panelProgress.value * this._showMore.value}` }
    })

    this.applyAnimatedStyle('.header-save-status-icon', () => {
      'worklet'
      return { opacity: `${this.panelProgress.value * this._showSave.value * this._saveMorph.value}` }
    })

    this.applyAnimatedStyle('.primary-scroll', () => {
      'worklet'
      const p = this.panelProgress.value
      const scale = 1 - 0.05 * p
      const tx = -screenWidth * 0.3 * p
      return {
        transform: `translateX(${tx}px)`
      }
    })

    this.applyAnimatedStyle('.secondary-panel', () => {
      'worklet'
      const p = this.panelProgress.value
      return {
        transform: `translateX(${(1 - p) * 100}%)`
      }
    })
  },

  initLongTermMemoryAnimations() {
    if (this._longTermMemoryAnimationsInited) return
    this._longTermMemoryAnimationsInited = true

    const screenWidth = this._screenWidth

    this.applyAnimatedStyle('.memory-panel-base', () => {
      'worklet'
      const p = this.longTermMemoryProgress.value
      return {
        transform: `translateX(${-screenWidth * 0.3 * p}px)`
      }
    })

    this.applyAnimatedStyle('.long-term-memory-panel', () => {
      'worklet'
      const p = this.longTermMemoryProgress.value
      return {
        transform: `translateX(${(1 - p) * 100}%)`
      }
    })
  },

  initNotificationDetailAnimations() {
    if (this._notificationDetailAnimationsInited) return
    this._notificationDetailAnimationsInited = true

    const screenWidth = this._screenWidth

    this.applyAnimatedStyle('.notification-panel-base', () => {
      'worklet'
      const p = this.notificationDetailProgress.value
      return {
        transform: `translateX(${-screenWidth * 0.3 * p}px)`
      }
    })

    this.applyAnimatedStyle('.notification-detail-panel', () => {
      'worklet'
      const p = this.notificationDetailProgress.value
      return {
        transform: `translateX(${(1 - p) * 100}%)`
      }
    })
  },

  initArchiveDetailAnimations() {
    if (this._archiveDetailAnimationsInited) return
    this._archiveDetailAnimationsInited = true

    const screenWidth = this._screenWidth
    this.applyAnimatedStyle('.data-control-panel-base', () => {
      'worklet'
      return { transform: `translateX(${-screenWidth * 0.3 * this.archiveDetailProgress.value}px)` }
    })
    this.applyAnimatedStyle('.archived-chats-panel', () => {
      'worklet'
      return { transform: `translateX(${(1 - this.archiveDetailProgress.value) * 100}%)` }
    })
  },

  data: {
    user: { ...store.user },
    avatarSource: '',
    avatarLoaded: false,
    avatarLoadFailed: false,
    aiName: AI_MODEL_NAME,
    i18n: messages(DEFAULT_LANGUAGE),
    customSectionTitle: t(DEFAULT_LANGUAGE, 'settings.sections.custom', { app:AI_MODEL_NAME }),
    miniProgramLabel: '',
    // Panel state
    activePanel: '',
    panelTitle: '',
    panelShowSave: false,
    headerAction: 'close',
    saveButtonState: 'idle',
    storageLoading: false,
    storageError: false,
    storageUsage: null,
    usageLimitsLoading: false,
    usageLimitsPercent: '0.0',
    usageLimitsLifetime: false,
    usageLimitsEnabled: false,
    usageLimitsError: '',
    usageLimitsPackagePoints: 0,
    usageLimitsPurchasedPoints: 0,
    usageLimitsPending: 0,
    usageLimitsReserved: '0',
    usageLimitsReset: '',
    panelConfigKey: '',
    notificationDetailKey: '',
    exportState: { status: 'idle' },
    deletionStatus: 'idle',
    dataControlConfirm: {
      message: '',
      danger: false,
      confirmTone: '',
      messageAlign: 'center'
    },
    longTermMemoryUpdatedAt: '',
    longTermMemoryLoading: false,
    longTermMemoryCanRefresh: false,
    longTermMemorySections: [],
    longTermMemoryItems: [],
    longTermMemoryRevision: null,
    longTermMemorySnapshotKey: null,
    longTermMemoryNextCursor: null,
    longTermMemoryRefreshing: false,
    longTermMemoryLoadingMore: false,
    longTermMemoryDeleting: false,
    longTermMemoryError: '',

    sheetScrollHandlers: SHEET_SCROLL_HANDLERS,
    secondaryScrollHandlers: SECONDARY_SCROLL_HANDLERS,
    longTermMemoryScrollTopValue: 0,
    personalizationDraft: createPersonalizationDraft(),
    personalizationTraits: buildStaticSets(DEFAULT_LANGUAGE).personalizationTraits,
    // Setting data
    customSets: [
      {
        key: 'personalization',
        name: t(DEFAULT_LANGUAGE, 'settings.personalization'),
        icon: 'icon-individuation',
        rightSet: true
      },
      {
        key: 'memory',
        name: t(DEFAULT_LANGUAGE, 'settings.memory'),
        icon: 'icon-study',
        rightSet: true
      },
      {
        key: 'plugins',
        name: t(DEFAULT_LANGUAGE, 'common.plugin'),
        icon: 'icon-classify',
        rightSet: true
      }
    ],
    accountSets: [
      // {
      //   key: 'email',
      //   name: '电子邮件',
      //   icon: 'icon-email',
      //   rightValue: true
      // },
      {
        key: 'phone',
        name: t(DEFAULT_LANGUAGE, 'settings.phone'),
        icon: 'icon-phone',
        rightValue: true
      },
      {
        key: 'subscription',
        name: t(DEFAULT_LANGUAGE, 'settings.subscription'),
        icon: 'icon-upgrade',
        rightValue: true
      },
      {
        key: 'upgrade_pro',
        name: t(DEFAULT_LANGUAGE, 'settings.upgrade'),
        icon: 'icon-upgrade'
      },
      {
        key: 'usage_limits',
        name: t(DEFAULT_LANGUAGE, 'usageLimits.title'),
        icon: 'icon-gauge',
        rightSet: true
      }
    ],
    applicationSets: [
      {
        key: 'language',
        name: t(DEFAULT_LANGUAGE, 'settings.language.title'),
        icon: 'icon-world',
        type: 'selector',
        value: DEFAULT_LANGUAGE,
        interactive: true
      },
      {
        key: 'appearance',
        name: t(DEFAULT_LANGUAGE, 'settings.appearance.title'),
        icon: 'icon-sun',
        type: 'selector',
        value: DEFAULT_APPEARANCE,
        interactive: true
      },
      {
        key: 'pointColor',
        name: t(DEFAULT_LANGUAGE, 'settings.accentColor'),
        icon: 'icon-color',
        type: 'accent',
        value: DEFAULT_POINT_COLOR,
        accentColor: POINT_COLOR_META_MAP[DEFAULT_POINT_COLOR].color,
        accentStyle: POINT_COLOR_META_MAP[DEFAULT_POINT_COLOR].dotStyle,
        interactive: true
      },
      {
        key: 'hapticFeedback',
        name: t(DEFAULT_LANGUAGE, 'settings.haptics'),
        icon: 'icon-mouse',
        type: 'switch',
        checked: true
      },
      {
        key: 'autoSpell',
        name: t(DEFAULT_LANGUAGE, 'settings.autocorrect'),
        icon: 'icon-text_check',
        type: 'switch',
        checked: true
      },
      {
        key: 'notification',
        name: t(DEFAULT_LANGUAGE, 'notification.title'),
        icon: 'icon-notification',
        type: 'link',
        rightSet: true
      },
      {
        key: 'data_control',
        name: t(DEFAULT_LANGUAGE, 'settings.dataControls'),
        icon: 'icon-document',
        type: 'link',
        rightSet: true
      },
      {
        key: 'storage',
        name: t(DEFAULT_LANGUAGE, 'storage.title'),
        icon: 'icon-archive',
        type: 'link',
        rightSet: true
      }
    ],
    suggestSets: [
      {
        key: 'auto_complete',
        name: t(DEFAULT_LANGUAGE, 'settings.autocomplete'),
        icon: 'icon-image-create',
        type: 'switch',
        checked: true
      },
      {
        key: 'trending_search',
        name: t(DEFAULT_LANGUAGE, 'settings.trending'),
        icon: 'icon-trending-up',
        type: 'switch',
        checked: true
      },
      {
        key: 'followup_suggest',
        name: t(DEFAULT_LANGUAGE, 'settings.followUps'),
        icon: 'icon-advice',
        type: 'switch',
        checked: true
      }
    ],
    aboutSets: [
      {
        key: 'report_error',
        name: t(DEFAULT_LANGUAGE, 'about.report'),
        icon: 'icon-edit-pen'
      },
      {
        key: 'help_center',
        name: t(DEFAULT_LANGUAGE, 'about.help'),
        icon: 'icon-question'
      },
      {
        key: 'terms_of_use',
        name: t(DEFAULT_LANGUAGE, 'about.terms'),
        icon: 'icon-document'
      },
      {
        key: 'privacy_policy',
        name: t(DEFAULT_LANGUAGE, 'about.privacy'),
        icon: 'icon-lock'
      }
    ]
  },

  onLoad() {
    bindPageTheme(this)
    settingRouterBuilder()

    this.routeContext = wx.router.getRouteContext(this)
    const { sheetHeight } = getSettingSheetMetrics()
    this.dragExtent = shared(Math.max(sheetHeight, 1))
    this.scrollTop = shared(0)
    this.startPan = shared(false)

    // Panel shared values
    this.panelProgress = shared(0)
    this.longTermMemoryProgress = shared(0)
    this.notificationDetailProgress = shared(0)
    this.archiveDetailProgress = shared(0)
    this.isPanelOpen = shared(false)
    this._showSave = shared(0)
    this._saveMorph = shared(0)
    this._showMore = shared(0)
    this._hideBack = shared(0)
    this.personalizationScrollTop = shared(0)
    this.memoryScrollTop = shared(0)
    this.longTermMemoryScrollTop = shared(0)
    this.notificationScrollTop = shared(0)
    this.notificationDetailScrollTop = shared(0)
    this.dataControlScrollTop = shared(0)
    this.archiveScrollTop = shared(0)
    this.storageScrollTop = shared(0)
    this.usageLimitsScrollTop = shared(0)
    this._screenWidth = wx.getWindowInfo().screenWidth
    this._saveLabelWidth = shared(56 * this._screenWidth / 750)

    this.storeBindings = createStoreBindings(this, {
      store,
      fields: ['user', 'appInfo', 'settings', 'applicationSettings', 'chatAbout', 'suggest', 'personalization', 'notification', 'dataControl'],
      actions: ['setUser', 'resetChatHistory', 'resetChatMessageCache', 'resetChatRuns', 'resetAssetListCache', 'setApplicationSettings', 'setChatAbout', 'setPersonalization', 'setSuggest', 'setNotification', 'setDataControl']
    })
    this.storeBindings.updateStoreBindings()

    this.syncAvatarLoading()
    this.syncNormalizedApplicationSettings(this.data.chatAbout)
    this.syncSuggestSets()
    this.refreshRemoteData({ silent: true })

    this.applyAnimatedStyle('.scrollable-content', () => {
      'worklet'
      return { transform: `scaleX(${getScrollScale(this.routeContext)})` }
    })

    this.applyAnimatedStyle('.move-bg', () => {
      'worklet'
      return { width: `${getScrollScale(this.routeContext) * 100}%` }
    })

    this.initPanelAnimations()
  },

  refreshRemoteData({ silent = true, stopRefresh = false, force = false } = {}) {
    return initAppData({ silent, force }).finally(() => {
      this.syncAvatarLoading()
      this.syncNormalizedApplicationSettings(store.chatAbout)
      this.syncSuggestSets(store.suggest)
      if (stopRefresh) {
        wx.stopPullDownRefresh()
      }
    })
  },

  clearSettingsStorage() {
    SETTINGS_STORAGE_KEYS.forEach((key) => wx.removeStorageSync(key))
  },

  resetChatForAccount(reason) {
    this.resetAssetListCache()
    this.resetChatHistory()
    this.resetChatMessageCache()
    this.resetChatRuns()
    eventBus.emit(CHAT_SESSION_RESET, { reason, reloadHistory: true })
  },

  async handleGetPhoneNumber(e) {
    const { errMsg, code } = e.detail || {}
    if (errMsg !== 'getPhoneNumber:ok' || !code) {
      wx.showToast({ title: this.data.i18n.auth.phoneAuthIncomplete, icon: 'none' })
      return
    }

    wx.showLoading({ title: this.data.i18n.auth.loggingIn, mask: true })
    try {
      const result = await loginWithPhoneCode(code)
      if (result && result.user) {
        this.resetChatForAccount('login')
        this.setUser(buildUserFromAccountSummary(result.user))
      }
      await this.refreshRemoteData({ force: true, silent: true })
      wx.hideLoading()
      wx.showToast({ title: this.data.i18n.auth.loggedIn, icon: 'success' })
    } catch (error) {
      wx.hideLoading()
      wx.showToast({ title: error.message || this.data.i18n.auth.loginFailed, icon: 'none' })
    }
  },

  async handleLogout() {
    if (!this.data.user || !this.data.user.login) return

    wx.showLoading({ title: this.data.i18n.auth.loggingOut, mask: true })
    try {
      await logoutAccount({ silent: true })
      this.clearSettingsStorage()
      this.resetChatForAccount('logout')
      this.setUser({ ...DEFAULT_USER })
      await this.refreshRemoteData({ force: true, silent: true })
      wx.hideLoading()
      wx.showToast({ title: this.data.i18n.auth.loggedOut, icon: 'success' })
    } catch (error) {
      wx.hideLoading()
      wx.showToast({ title: error.message || this.data.i18n.auth.logoutFailed, icon: 'none' })
    }
  },

  tapLoginCard() {
    if (!this.data.user || !this.data.user.login) return

    wx.navigateTo({
      url: '/pages/profilePage/index',
      routeType: 'upRouterBuilder',
      events: {
        profileUpdated: ({ user }) => {
          if (user) {
            this.setUser(buildUserFromAccountSummary(user))
            wx.nextTick(() => this.syncAvatarLoading())
          }
        }
      }
    })
  },

  syncAvatarLoading() {
    const avatarSource = this.data.user?.avatarUrl || '/static/logs/glog.png'
    if (this._avatarSourceInitialized && avatarSource === this.data.avatarSource) return
    this._avatarSourceInitialized = true
    this.setData({ avatarSource, avatarLoaded: !avatarSource, avatarLoadFailed: false })
  },

  handleAvatarLoad(e) {
    if (e.currentTarget.dataset.src !== this.data.avatarSource) return
    this.setData({ avatarLoaded: true, avatarLoadFailed: false })
  },

  handleAvatarError(e) {
    if (e.currentTarget.dataset.src !== this.data.avatarSource) return
    this.setData({ avatarLoaded: false, avatarLoadFailed: true })
  },

  // --- Sheet vertical drag handlers ---

  handleScrollUpdate(evt) {
    'worklet'
    this.scrollTop.value = evt.detail?.scrollTop || 0
  },

  handlePersonalizationScrollUpdate(evt) {
    'worklet'
    updateScrollPosition(this.personalizationScrollTop, evt)
  },

  handleMemoryScrollUpdate(evt) {
    'worklet'
    updateScrollPosition(this.memoryScrollTop, evt)
  },

  handleLongTermMemoryScrollUpdate(evt) {
    'worklet'
    updateScrollPosition(this.longTermMemoryScrollTop, evt)
  },

  handleNotificationScrollUpdate(evt) {
    'worklet'
    updateScrollPosition(this.notificationScrollTop, evt)
  },

  handleNotificationDetailScrollUpdate(evt) {
    'worklet'
    updateScrollPosition(this.notificationDetailScrollTop, evt)
  },

  handleDataControlScrollUpdate(evt) {
    'worklet'
    updateScrollPosition(this.dataControlScrollTop, evt)
  },

  handleStorageScrollUpdate(evt) {
    'worklet'
    updateScrollPosition(this.storageScrollTop, evt)
  },

  shouldStorageScrollViewResponse(pointerEvent) {
    'worklet'
    return resolveScrollResponse(this.storageScrollTop.value, pointerEvent, this.routeContext, this.startPan)
  },

  handleUsageLimitsScrollUpdate(evt) {
    'worklet'
    updateScrollPosition(this.usageLimitsScrollTop, evt)
  },

  shouldUsageLimitsScrollViewResponse(pointerEvent) {
    'worklet'
    return resolveScrollResponse(this.usageLimitsScrollTop.value, pointerEvent, this.routeContext, this.startPan)
  },

  async loadStorageUsage() {
    const requestId = this._storageRequestId = (this._storageRequestId || 0) + 1
    this.setData({ storageLoading: true, storageError: false, storageUsage: null })
    try {
      const usage = storageView(await getStorageUsage())
      if (requestId !== this._storageRequestId || this.data.activePanel !== 'storage') return
      this.setData({ storageUsage: usage, storageLoading: false })
    } catch (error) {
      if (requestId !== this._storageRequestId || this.data.activePanel !== 'storage') return
      this.setData({ storageLoading: false, storageError: true })
    }
  },

  openStorageCategory(e) {
    const category = e.currentTarget.dataset.category
    if (!['image', 'document'].includes(category) || this._openingStorageCategory) return
    this._openingStorageCategory = true
    const channel = this.getOpenerEventChannel()
    const pages = getCurrentPages()
    const fromDrawer = pages[pages.length - 2]?.route === 'pages/leftpage/index'
    wx.navigateBack({
      delta: fromDrawer ? 2 : 1,
      success: () => channel.emit('openStorageCategory', { category }),
      complete: () => { this._openingStorageCategory = false }
    })
  },

  shouldPanResponse() {
    'worklet'
    return this.startPan.value
  },

  shouldPanAccept() {
    'worklet'
    return true
  },

  shouldScrollViewResponse(pointerEvent) {
    'worklet'
    return resolveScrollResponse(this.scrollTop.value, pointerEvent, this.routeContext, this.startPan)
  },

  shouldPersonalizationScrollViewResponse(pointerEvent) {
    'worklet'
    return resolveScrollResponse(this.personalizationScrollTop.value, pointerEvent, this.routeContext, this.startPan)
  },

  shouldMemoryScrollViewResponse(pointerEvent) {
    'worklet'
    return resolveScrollResponse(this.memoryScrollTop.value, pointerEvent, this.routeContext, this.startPan)
  },

  shouldLongTermMemoryScrollViewResponse(pointerEvent) {
    'worklet'
    return resolveScrollResponse(this.longTermMemoryScrollTop.value, pointerEvent, this.routeContext, this.startPan)
  },

  shouldNotificationScrollViewResponse(pointerEvent) {
    'worklet'
    return resolveScrollResponse(this.notificationScrollTop.value, pointerEvent, this.routeContext, this.startPan)
  },

  shouldNotificationDetailScrollViewResponse(pointerEvent) {
    'worklet'
    return resolveScrollResponse(this.notificationDetailScrollTop.value, pointerEvent, this.routeContext, this.startPan)
  },

  shouldDataControlScrollViewResponse(pointerEvent) {
    'worklet'
    return resolveScrollResponse(this.dataControlScrollTop.value, pointerEvent, this.routeContext, this.startPan)
  },

  handleDragStart() {
    'worklet'
    this.startPan.value = true
    const { startUserGesture } = this.routeContext || {}
    if (startUserGesture) {
      startUserGesture()
    }
  },

  handleDragUpdate(delta) {
    'worklet'
    const { primaryAnimation } = this.routeContext || {}
    if (!primaryAnimation) {
      return
    }
    primaryAnimation.value = clamp(primaryAnimation.value - delta, 0.0, 1.0)
  },

  handleDragEnd(velocity) {
    'worklet'
    this.startPan.value = false
    const {
      primaryAnimation,
      stopUserGesture,
      userGestureInProgress,
      didPop
    } = this.routeContext || {}

    if (!primaryAnimation || !stopUserGesture || !didPop || !userGestureInProgress?.value) {
      return
    }

    const t = primaryAnimation.value
    if (shouldRestoreRoute(t, velocity)) {
      const remainingFraction = 1.0 - t
      const duration = Math.max(1, Math.floor(SETTING_ROUTE_DURATION * remainingFraction))
      const easing = bottomSheetSuspendedCurve(t, Curves.decelerateEasing)
      primaryAnimation.value = timing(1.0, { duration, easing }, () => {
        'worklet'
        stopUserGesture()
      })
      return
    }

    const duration = Math.max(1, Math.floor(SETTING_ROUTE_DURATION * t))
    primaryAnimation.value = timing(0.0, { duration, easing: Curves.easeOutCubic }, () => {
      'worklet'
      stopUserGesture()
      didPop()
    })
  },

  handleVerticalDrag(evt) {
    'worklet'
    if (evt.state === GestureState.BEGIN) {
      this.handleDragStart()
    } else if (evt.state === GestureState.ACTIVE) {
      const extent = this.dragExtent.value || 1
      const delta = evt.deltaY / extent
      this.handleDragUpdate(delta)
    } else if (evt.state === GestureState.END) {
      this.handleDragEnd(evt.velocityY)
    } else if (evt.state === GestureState.CANCELLED) {
      this.handleDragEnd(0.0)
    }
  },

  // --- Panel horizontal drag handler ---

  handlePanelDrag(evt) {
    'worklet'
    const activeSubProgress = this.longTermMemoryProgress.value > 0.01
      ? this.longTermMemoryProgress
      : this.notificationDetailProgress.value > 0.01
        ? this.notificationDetailProgress
        : this.archiveDetailProgress.value > 0.01
          ? this.archiveDetailProgress
          : null

    if (activeSubProgress) {
      if (evt.state === GestureState.ACTIVE) {
        const delta = evt.deltaX / this._screenWidth
        activeSubProgress.value = clamp(activeSubProgress.value - delta, 0, 1)
      } else if (evt.state === GestureState.END || evt.state === GestureState.CANCELLED) {
        const velocity = evt.state === GestureState.END ? evt.velocityX : 0
        if (velocity > PANEL_FLING_VELOCITY || activeSubProgress.value < PANEL_CLOSE_THRESHOLD) {
          const duration = Math.max(1, Math.floor(PANEL_DURATION * activeSubProgress.value))
          activeSubProgress.value = timing(0, { duration, easing: Curves.easeOutCubic })
        } else {
          const remaining = 1 - activeSubProgress.value
          const duration = Math.max(1, Math.floor(PANEL_DURATION * remaining))
          activeSubProgress.value = timing(1, { duration, easing: Curves.easeOutCubic })
        }
      }
      return
    }

    if (evt.state === GestureState.ACTIVE) {
      const delta = evt.deltaX / this._screenWidth
      this.panelProgress.value = clamp(this.panelProgress.value - delta, 0, 1)
    } else if (evt.state === GestureState.END || evt.state === GestureState.CANCELLED) {
      const velocity = evt.state === GestureState.END ? evt.velocityX : 0
      if (velocity > PANEL_FLING_VELOCITY || this.panelProgress.value < PANEL_CLOSE_THRESHOLD) {
        const duration = Math.max(1, Math.floor(PANEL_DURATION * this.panelProgress.value))
        this.panelProgress.value = timing(0, { duration, easing: Curves.easeOutCubic })
        this.isPanelOpen.value = false
        this.longTermMemoryProgress.value = 0
        this.notificationDetailProgress.value = 0
        this.archiveDetailProgress.value = 0
      } else {
        const remaining = 1 - this.panelProgress.value
        const duration = Math.max(1, Math.floor(PANEL_DURATION * remaining))
        this.panelProgress.value = timing(1, { duration, easing: Curves.easeOutCubic })
      }
    }
  },

  // --- Panel open / close ---

  resetLongTermMemoryScrollPosition(callback) {
    this.longTermMemoryScrollTop.value = 0
    this.setData({ longTermMemoryScrollTopValue: 1 }, () => {
      this.setData({ longTermMemoryScrollTopValue: 0 }, callback)
    })
  },

  setHeaderAction(action) {
    if (this.data.headerAction === action) return
    this.setData({ headerAction: action })
    this._showSave.value = timing(action === 'save' ? 1 : 0, { duration: 220, easing: Curves.easeOutCubic })
    this._showMore.value = timing(action === 'more' ? 1 : 0, { duration: 220, easing: Curves.easeOutCubic })
  },

  handleHeaderAction() {
    if (!this.isPanelOpen.value || this.data.headerAction === 'close') {
      this.closePage()
    } else if (this.data.headerAction === 'save') {
      this.savePanel()
    } else {
      this.selectComponent('#longTermMemoryMore')?.open()
    }
  },

  openPanel(key, title, showSave) {
    this._saveMorph.value = 0
    this._saveButtonToken = (this._saveButtonToken || 0) + 1
    this.clearSaveButtonTimer()
    this.clearLongTermMemoryTimer()
    this.clearSubPanelCloseWatcher()
    clearTimeout(this._usageLimitsLoadingTimer)
    this._usageLimitsLoadingTimer = null
    this._storageRequestId = (this._storageRequestId || 0) + 1
    this.setData({
      activePanel: key,
      panelTitle: title,
      panelShowSave: showSave,
      usageLimitsLoading: key === 'usage_limits',
      saveButtonState: 'idle',
      panelConfigKey: key,
      notificationDetailKey: '',
      personalizationDraft: SAVE_PANEL_KEYS.includes(key)
        ? mergePersonalizationSettings(createPersonalizationDraft(), this.data.personalization)
        : this.data.personalizationDraft
    }, () => {
      this.setHeaderAction(showSave ? 'save' : 'close')
      this._hideBack.value = 0
      this.longTermMemoryProgress.value = 0
      this.notificationDetailProgress.value = 0
      this.archiveDetailProgress.value = 0
      this.isPanelOpen.value = true
      if (key === 'storage') {
        this.storageScrollTop.value = 0
        this.loadStorageUsage()
      }
      if (key === 'usage_limits') {
        this.usageLimitsScrollTop.value = 0
        this.loadBillingUsage()
      }
      if (key === 'data_control') {
        this.refreshDataActions()
        this._archiveDetailAnimationsInited = false
      }
      if (key === 'memory') {
        wx.nextTick(() => this.initLongTermMemoryAnimations())
      }
      if (key === 'notification') {
        wx.nextTick(() => this.initNotificationDetailAnimations())
      }
      this.panelProgress.value = timing(1, { duration: PANEL_DURATION, easing: Curves.fastOutSlowIn })
    })
  },

  closePanel() {
    this._saveMorph.value = 0
    this._saveButtonToken = (this._saveButtonToken || 0) + 1
    this.clearSaveButtonTimer()
    clearTimeout(this._usageLimitsLoadingTimer)
    this._usageLimitsLoadingTimer = null
    this._storageRequestId = (this._storageRequestId || 0) + 1
    const closingPanel = this.data.activePanel
    this.clearLongTermMemoryTimer()
    this.clearSubPanelCloseWatcher()
    this.panelProgress.value = timing(0, { duration: PANEL_DURATION, easing: Curves.easeOutCubic })
    this.isPanelOpen.value = false
    this.setHeaderAction('close')
    this.notificationDetailProgress.value = 0
    this.longTermMemoryProgress.value = 0
    this.archiveDetailProgress.value = 0
    if (closingPanel === 'data_control') {
      this._archiveDetailAnimationsInited = false
    }
    setTimeout(() => {
      if (this.data.activePanel === closingPanel && !this.isPanelOpen.value) {
        this._hideBack.value = 0
        if (closingPanel === 'memory') this._longTermMemoryAnimationsInited = false
        this.setData({
          activePanel: '',
          panelTitle: '',
          panelShowSave: false,
          saveButtonState: 'idle',
          panelConfigKey: '',
          notificationDetailKey: '',
          longTermMemoryLoading: false,
          longTermMemorySections: [],
          longTermMemoryScrollTopValue: 0
        })
      }
    }, PANEL_DURATION + 50)
  },

  goBackPanel() {
    if (this.data.panelConfigKey === 'archived_chats') {
      this.archiveDetailProgress.value = timing(0, { duration: PANEL_DURATION, easing: Curves.easeOutCubic })
      setTimeout(() => this.finishArchiveDetailBack(), PANEL_DURATION + 50)
      return
    }
    if (this.data.panelConfigKey && this.data.panelConfigKey.startsWith('notification_')) {
      this.notificationDetailProgress.value = timing(0, { duration: PANEL_DURATION, easing: Curves.easeOutCubic })
      setTimeout(() => this.finishNotificationDetailBack(), PANEL_DURATION + 50)
      return
    }
    if (this.data.panelConfigKey === 'long_term_memory') {
      this.clearLongTermMemoryTimer()
      this.longTermMemoryProgress.value = timing(0, { duration: PANEL_DURATION, easing: Curves.easeOutCubic })
      setTimeout(() => this.finishLongTermMemoryBack(), PANEL_DURATION + 50)
      return
    }
    this.closePanel()
  },

  async savePanel() {
    if (SAVE_PANEL_KEYS.includes(this.data.activePanel) && !this._saveInFlight && this.data.saveButtonState === 'idle') {
      const draft = this.data.personalizationDraft
      const panel = this.data.activePanel
      const token = this._saveButtonToken
      let saved = false
      this._saveInFlight = true
      this.setData({ saveButtonState: 'saving' }, () => {
        if (this._saveButtonToken === token) {
          this._saveMorph.value = timing(1, { duration: 220, easing: Curves.easeOutCubic })
        }
      })
      try {
        await savePersonalization(draft)
        saved = true
        this.setPersonalization(draft)
        wx.showToast({ title: this.data.i18n.common.saved, icon: 'success' })
      } catch (error) {
        // savePersonalization already reports the request error.
      } finally {
        this._saveInFlight = false
        if (this._saveButtonToken === token && this.data.activePanel === panel && this.data.panelConfigKey === panel) {
          if (!saved) {
            this.setData({ saveButtonState: 'idle' }, () => {
              this._saveMorph.value = timing(0, { duration: 220, easing: Curves.easeOutCubic })
            })
            return
          }
          this.setData({ saveButtonState: 'done' })
          this.clearSaveButtonTimer()
          this._saveButtonTimer = setTimeout(() => {
            this._saveButtonTimer = null
            if (this._saveButtonToken === token && this.data.activePanel === panel && this.data.panelConfigKey === panel) {
              this.setData({ saveButtonState: 'idle' }, () => {
                this._saveMorph.value = timing(0, { duration: 220, easing: Curves.easeOutCubic })
              })
            }
          }, 1500)
        }
      }
    }
  },

  clearSaveButtonTimer() {
    if (this._saveButtonTimer) clearTimeout(this._saveButtonTimer)
    this._saveButtonTimer = null
  },

  measureSaveLabel() {
    if (!this._saveLabelWidth) return
    this.createSelectorQuery().select('.header-save-label').boundingClientRect((rect) => {
      if (rect?.width > 0) this._saveLabelWidth.value = rect.width
    }).exec()
  },

  // --- Personalization handlers ---

  updateDraft(field, value) {
    const nextDraft = { ...this.data.personalizationDraft, [field]: value }
    this.setData({ personalizationDraft: nextDraft })
  },

  handlePersonalizationOptionChange(e) {
    const { field, value } = e.detail || {}
    if (!field || !value) return
    triggerHaptic(this.data.applicationSettings?.hapticFeedback, 'light')

    if (field === 'basicTone') {
      this.updateDraft('basicTone', value)
      return
    }

    if (!PERSONALIZATION_TRAITS.some((item) => item.key === field)) return
    this.updateDraft('traits', {
      ...this.data.personalizationDraft.traits,
      [field]: value
    })
  },

  handleDraftInput(e) {
    const field = e.currentTarget?.dataset?.field || e.detail?.field
    if (!field) return
    this.updateDraft(field, e.detail?.value)
  },

  handleDraftSwitch(e) {
    const field = e.currentTarget?.dataset?.field || e.detail?.field
    if (!field) return
    this.updateDraft(field, !!e.detail?.value)
  },

  openLongTermMemory() {
    this.initLongTermMemoryAnimations()
    this.longTermMemoryProgress.value = 0
    this.clearLongTermMemoryTimer()
    this.resetLongTermMemoryScrollPosition(() => {
      this.setData({
        panelConfigKey: 'long_term_memory',
        panelTitle: this.data.i18n.memory.title,
        panelShowSave: false,
        longTermMemoryUpdatedAt: '', longTermMemoryRevision: null,
        longTermMemoryLoading: true, longTermMemoryLoadingMore: false, longTermMemoryRefreshing: false,
        longTermMemoryError: '', longTermMemoryNextCursor: null,
        longTermMemoryItems: [], longTermMemorySections: []
      }, () => {
        this.setHeaderAction('more')
        this.longTermMemoryProgress.value = timing(1, { duration: PANEL_DURATION, easing: Curves.fastOutSlowIn })
        this.startSubPanelCloseWatcher('memory')
        this.loadLongTermMemory()
      })
    })
  },

  startSubPanelCloseWatcher(type) {
    this.clearSubPanelCloseWatcher()
    const progress = type === 'memory'
      ? this.longTermMemoryProgress
      : type === 'archive'
        ? this.archiveDetailProgress
        : this.notificationDetailProgress
    let ready = false
    this._subPanelCloseReadyTimer = setTimeout(() => {
      ready = true
    }, PANEL_DURATION + 50)
    this._subPanelCloseWatcher = setInterval(() => {
      const panelConfigKey = this.data.panelConfigKey || ''
      if ((type === 'memory' && panelConfigKey !== 'long_term_memory') ||
        (type === 'notification' && !panelConfigKey.startsWith('notification_')) ||
        (type === 'archive' && panelConfigKey !== 'archived_chats')) {
        this.clearSubPanelCloseWatcher()
        return
      }

      const value = progress.value
      if (!ready || value > 0.01) return

      if (type === 'memory') {
        this.finishLongTermMemoryBack()
      } else if (type === 'archive') {
        this.finishArchiveDetailBack()
      } else {
        this.finishNotificationDetailBack()
      }
    }, 50)
  },

  clearSubPanelCloseWatcher() {
    if (this._subPanelCloseReadyTimer) {
      clearTimeout(this._subPanelCloseReadyTimer)
      this._subPanelCloseReadyTimer = null
    }
    if (this._subPanelCloseWatcher) {
      clearInterval(this._subPanelCloseWatcher)
      this._subPanelCloseWatcher = null
    }
  },

  finishLongTermMemoryBack() {
    if (this.data.panelConfigKey !== 'long_term_memory') return
    this.clearSubPanelCloseWatcher()
    this.clearLongTermMemoryTimer()
    this.setData({
      panelConfigKey: 'memory',
      panelTitle: this.data.i18n.settings.memory,
      panelShowSave: true,
      longTermMemoryLoading: false,
      longTermMemorySections: []
    })
    this.setHeaderAction('save')
  },

  finishNotificationDetailBack() {
    if (!this.data.panelConfigKey || !this.data.panelConfigKey.startsWith('notification_')) return
    this.clearSubPanelCloseWatcher()
    this.setData({
      panelConfigKey: 'notification',
      panelTitle: t(this.data.applicationSettings?.language, 'notification.title'),
      notificationDetailKey: ''
    })
  },

  finishArchiveDetailBack() {
    if (this.data.panelConfigKey !== 'archived_chats') return
    this.clearSubPanelCloseWatcher()
    this.setData({ panelConfigKey: 'data_control', panelTitle: this.data.i18n.settings.dataControls })
  },

  async loadLongTermMemory() {
    if (this.data.longTermMemoryDeleting) return
    this.clearLongTermMemoryTimer()
    return this.pollLongTermMemory(this._longTermMemoryPollingToken)
  },

  applyLongTermMemory(data, append = false) {
    if (data.schemaVersion !== 2 || !Array.isArray(data.items)) throw new Error(this.data.i18n.memory.unavailable)
    const language = this.data.applicationSettings?.language
    const sameVersion = this.data.longTermMemoryRevision === data.revision && this.data.longTermMemorySnapshotKey === data.snapshotKey
    const items = append ? [...this.data.longTermMemoryItems, ...data.items]
      : sameVersion && this.data.longTermMemoryItems.length > data.items.length ? this.data.longTermMemoryItems : data.items
    this.setData({
      longTermMemoryItems: items, longTermMemorySections: memorySections(items, language),
      longTermMemoryRevision: data.revision, longTermMemorySnapshotKey: data.snapshotKey,
      longTermMemoryNextCursor: !append && sameVersion && items !== data.items ? this.data.longTermMemoryNextCursor : data.nextCursor,
      longTermMemoryUpdatedAt: ['queued', 'running'].includes(data.refresh.status) ? this.data.i18n.memory.generating : this.data.i18n.memory.updatedNow,
      longTermMemoryRefreshing: ['queued', 'running'].includes(data.refresh.status),
      longTermMemoryCanRefresh: data.enabled && data.refresh.canRefresh,
      longTermMemoryError: '',
      longTermMemoryLoading: ['queued', 'running'].includes(data.refresh.status), longTermMemoryLoadingMore: false
    })
  },

  async pollLongTermMemory(pollingToken) {
    try {
      const result = await getLongTermMemory()
      if (pollingToken !== this._longTermMemoryPollingToken || this.data.panelConfigKey !== 'long_term_memory' || !this.isPanelOpen.value) return
      this.applyLongTermMemory(result.data)
      if (result.data.enabled && (['queued', 'running', 'failed'].includes(result.data.refresh.status) || result.data.refresh.hasMore)) this.scheduleLongTermMemoryPoll(pollingToken)
    } catch (error) {
      if (pollingToken !== this._longTermMemoryPollingToken || this.data.panelConfigKey !== 'long_term_memory' || !this.isPanelOpen.value) return
      this.setData({ longTermMemoryLoading: false, longTermMemoryError: error?.message || this.data.i18n.memory.tryLater })
      wx.showToast({ title: this.data.longTermMemoryError, icon: 'none' })
    }
  },

  async loadMoreLongTermMemory() {
    if (!this.data.longTermMemoryNextCursor || this.data.longTermMemoryLoadingMore || this.data.longTermMemoryDeleting) return
    const token = this._longTermMemoryPollingToken
    const cursor = this.data.longTermMemoryNextCursor
    this.setData({ longTermMemoryLoadingMore: true })
    try {
      const result = await getLongTermMemory({ cursor })
      if (token !== this._longTermMemoryPollingToken || this.data.panelConfigKey !== 'long_term_memory' || !this.isPanelOpen.value) return
      if (cursor !== this.data.longTermMemoryNextCursor) return
      this.applyLongTermMemory(result.data, true)
    } catch (error) {
      if (token !== this._longTermMemoryPollingToken) return
      this.setData({ longTermMemoryLoadingMore: false, longTermMemoryError: error?.message || this.data.i18n.memory.tryLater })
      wx.showToast({ title: this.data.longTermMemoryError, icon: 'none' })
      if (Number(error?.statusCode) === 409) {
        this.setData({ longTermMemoryRevision: null })
        await this.loadLongTermMemory()
      }
    }
  },

  clearLongTermMemoryTimer() {
    if (this._longTermMemoryTimer) clearTimeout(this._longTermMemoryTimer)
    this._longTermMemoryTimer = null
    this._longTermMemoryPollingToken = (this._longTermMemoryPollingToken || 0) + 1
  },

  scheduleLongTermMemoryPoll(pollingToken) {
    if (pollingToken !== this._longTermMemoryPollingToken || this.data.panelConfigKey !== 'long_term_memory' || !this.isPanelOpen.value) return
    if (this._longTermMemoryTimer) clearTimeout(this._longTermMemoryTimer)
    this._longTermMemoryTimer = setTimeout(() => {
      this._longTermMemoryTimer = null
      this.pollLongTermMemory(pollingToken)
    }, 10000)
  },

  handleLongTermMemoryAction(e) {
    const action = e.currentTarget?.dataset?.action
    this.selectComponent('#longTermMemoryMore')?.close()
    if (action === 'about') {
      wx.navigateTo({ url: '/pages/memoryAbout/index', routeType: 'upRouterBuilder' })
      return
    }
    if (action === 'refresh') {
      if (!this.data.longTermMemoryCanRefresh || this.data.longTermMemoryLoading) return
      this.refreshLongTermMemory()
      return
    }
    if (action === 'delete') {
      wx.nextTick(() => this.selectComponent('#memoryDeleteConfirmDialog')?.show())
    }
  },

  async refreshLongTermMemory() {
    if (this.data.longTermMemoryRefreshing || this.data.longTermMemoryDeleting || !this.data.longTermMemoryCanRefresh) return
    this.clearLongTermMemoryTimer()
    const pollingToken = this._longTermMemoryPollingToken
    this.setData({ longTermMemoryLoading: true, longTermMemoryRefreshing: true, longTermMemoryLoadingMore: false, longTermMemoryCanRefresh: false,
      longTermMemoryError: '' })
    try {
      const result = await requestLongTermMemoryRefresh()
      if (pollingToken !== this._longTermMemoryPollingToken || this.data.panelConfigKey !== 'long_term_memory' || !this.isPanelOpen.value) return
      this.applyLongTermMemory(result.data)
      if (result.data.enabled && (['queued', 'running', 'failed'].includes(result.data.refresh.status) || result.data.refresh.hasMore)) this.scheduleLongTermMemoryPoll(pollingToken)
    } catch (error) {
      if (pollingToken !== this._longTermMemoryPollingToken) return
      this.setData({ longTermMemoryLoading: false, longTermMemoryRefreshing: false, longTermMemoryError: error?.message || this.data.i18n.memory.tryLater })
      await this.pollLongTermMemory(pollingToken)
    }
  },

  async handleMemoryDeleteConfirm() {
    if (this.data.longTermMemoryDeleting) return
    this.clearLongTermMemoryTimer()
    this.setData({ longTermMemoryDeleting: true, longTermMemoryRefreshing: false, longTermMemoryLoadingMore: false })
    try {
      await deleteLongTermMemory()
      const draft = { ...this.data.personalizationDraft, useSavedMemory: false }
      this.setPersonalization(draft)
      this.setData({ personalizationDraft: draft, longTermMemoryDeleting: false,
        longTermMemoryRevision: null, longTermMemorySections: [], longTermMemoryItems: [],
        longTermMemoryNextCursor: null, longTermMemoryCanRefresh: false, longTermMemoryError: '' })
      if (this.data.panelConfigKey === 'long_term_memory' && this.isPanelOpen.value) await this.loadLongTermMemory()
      wx.showToast({ title: this.data.i18n.memory.deleted, icon: 'success' })
    } catch (error) {
      this.setData({ longTermMemoryDeleting: false, longTermMemoryError: error?.message || this.data.i18n.memory.deleteFailed })
      wx.showToast({ title: this.data.longTermMemoryError, icon: 'none' })
    }
  },

  handleNotificationNavigate(e) {
    const { key, title } = e.detail || {}
    if (!key || !title) return
    this.initNotificationDetailAnimations()
    this.notificationDetailProgress.value = 0
    this.setData({ panelConfigKey: key, panelTitle: title, notificationDetailKey: key }, () => {
      this.notificationDetailProgress.value = timing(1, { duration: PANEL_DURATION, easing: Curves.fastOutSlowIn })
      this.startSubPanelCloseWatcher('notification')
    })
  },

  handleNotificationChange(e) {
    const { category, channel, enabled, notification } = e.detail || {}
    if (!category || !channel || !notification) return
    this.setNotification(notification)
    updateNotification(category, channel, enabled).catch(() => {})
  },

  handleArchivedChatsNavigate() {
    this.archiveScrollTop.value = 0
    this.archiveDetailProgress.value = 0
    this.setData({ panelConfigKey: 'archived_chats', panelTitle: this.data.i18n.archive.title }, () => {
      this.initArchiveDetailAnimations()
      this.archiveDetailProgress.value = timing(1, { duration: PANEL_DURATION, easing: Curves.fastOutSlowIn })
      this.startSubPanelCloseWatcher('archive')
    })
  },

  handleDataControlChange(e) {
    const { key, checked, dataControl } = e.detail || {}
    if (!key || !dataControl) return
    this.setDataControl(dataControl)
    updateDataControlSwitch(key, checked).catch(() => {})
  },

  async refreshDataActions() {
    clearTimeout(this._dataActionTimer)
    const version = this._dataActionVersion = (this._dataActionVersion || 0) + 1
    const account = `${!!store.user?.login}:${store.user?.userId || ''}`
    const results = await Promise.allSettled([getDataExport(), getAccountDeletion()])
    if (this._unloaded || this._settingsVisible === false || version !== this._dataActionVersion ||
        account !== `${!!store.user?.login}:${store.user?.userId || ''}`) return
    const [exportResult, deleteResult] = results
    const values = {}
    if (exportResult.status === 'fulfilled') {
      values.exportState = exportResult.value
      if (exportResult.value.status === 'failed' && ['starting', 'queued', 'running'].includes(this.data.exportState?.status)) {
        this.selectComponent('#dataActionNotice')?.show(this.data.i18n.dataControls.exportFailed)
      }
    }
    if (deleteResult.status === 'fulfilled') {
      values.deletionStatus = deleteResult.value.status
      if (values.deletionStatus === 'completed' && store.user?.login) {
        this.clearSettingsStorage()
        this.resetChatForAccount('logout')
        this.setUser({ ...DEFAULT_USER })
        this.setData({ exportState: { status: 'idle' }, deletionStatus: 'idle' })
        this.closePanel()
        this.selectComponent('#dataActionNotice')?.show(this.data.i18n.dataControls.accountDeleted)
        await this.refreshRemoteData({ force: true, silent: true })
        return
      }
    }
    this.setData(values)
    if (['starting', 'queued', 'running'].includes(this.data.exportState?.status) || this.data.deletionStatus === 'deleting') {
      this._dataActionTimer = setTimeout(() => this.refreshDataActions(), 3000)
    }
  },

  async handleExportTap() {
    if (['starting', 'queued', 'running'].includes(this.data.exportState?.status)) {
      this.selectComponent('#dataActionNotice')?.show(this.data.i18n.dataControls.exporting)
      return
    }
    if (this.data.exportState?.status !== 'completed' || this._sharingExport) return
    this._sharingExport = true
    try {
      await shareDataExport(this.data.exportState)
    } catch (error) {
      if (!this._unloaded && !/cancel/i.test(error?.errMsg || '')) {
        this.selectComponent('#dataActionNotice')?.show(error.message || this.data.i18n.common.operationFailed)
        this.refreshDataActions()
      }
    } finally { this._sharingExport = false }
  },

  handleDeletionTap() {
    this.selectComponent('#dataActionNotice')?.show(this.data.i18n.dataControls.deletingAccount)
  },

  async handleDataControlAction(e) {
    const action = e.detail?.action
    if (action === 'export_data' || action === 'delete_account') {
      const exporting = action === 'export_data'
      if (exporting && ['starting', 'queued', 'running', 'completed'].includes(this.data.exportState?.status)) {
        this.handleExportTap()
        return
      }
      if (!exporting && this.data.deletionStatus === 'deleting') { this.handleDeletionTap(); return }
      this._dataActionVersion = (this._dataActionVersion || 0) + 1
      this.setData(exporting ? { exportState: { status: 'starting' } } : { deletionStatus: 'deleting' })
      const account = `${!!store.user?.login}:${store.user?.userId || ''}`
      try {
        const result = await DATA_CONTROL_ACTION_API_MAP[action]()
        if (this._unloaded || account !== `${!!store.user?.login}:${store.user?.userId || ''}`) return
        this.setData(exporting ? { exportState: result } : { deletionStatus: result.status })
        if (!exporting && result.status === 'deleting') this.setUser({ ...store.user, deletionStatus: 'deleting' })
      } catch (error) {
        if (this._unloaded || account !== `${!!store.user?.login}:${store.user?.userId || ''}`) return
        this.selectComponent('#dataActionNotice')?.show(error.message || this.data.i18n.common.operationFailed)
      }
      if (!this._unloaded) this.refreshDataActions()
      return
    }
    const apiFn = DATA_CONTROL_ACTION_API_MAP[action]
    if (!apiFn) return
    apiFn().then(() => {
      if (action === 'archive_all' || action === 'delete_all') {
        this.resetChatForAccount(action)
      }
      wx.showToast({
        title:action === 'archive_all' ? this.data.i18n.archive.archived : action === 'delete_all' ? this.data.i18n.archive.deleted : this.data.i18n.archive.completed,
        icon:'success'
      })
    }).catch(() => {
      if (action === 'delete_all') this.resetChatForAccount(action)
      wx.showToast({ title:this.data.i18n.common.operationFailed, icon:'error' })
    })
  },

  handleDataControlConfirmRequest(e) {
    const { rect: rawRect, title, centered, confirmText, message, danger, confirmTone, messageAlign } = e.detail || {}
    const rect = normalizeDataControlDialogAnchor(rawRect)
    if (!rect) return
    this.setData({
      dataControlConfirm: {
        title: title || '', centered: !!centered, confirmText: confirmText || this.data.i18n.common.confirm,
        message: message || '',
        danger: !!danger,
        confirmTone: confirmTone || '',
        messageAlign: messageAlign || 'center'
      }
    }, () => {
      const dialog = this.selectComponent('#dataControlConfirmDialog')
      if (dialog) dialog.show(rect)
    })
  },

  handleDataControlConfirm() {
    const dataControl = this.selectComponent('#dataControlSection')
    if (dataControl) dataControl.handleConfirmAction()
  },

  // --- About navigation ---

  tapAboutItem(e) {
    const { key } = e.currentTarget.dataset
    this.openAboutPage(key)
  },

  viewArchivedConversation(e) {
    const conversationId = e.detail?.conversationId
    if (!conversationId || this._openingArchiveView) return
    this._openingArchiveView = true
    wx.navigateTo({
      url: `/mdPackage/pages/archivedChat/index?conversationId=${encodeURIComponent(conversationId)}`,
      routeType: SETTING_ROUTE_TYPE,
      routeOptions: { stacked: true },
      events: {
        unarchived: detail => {
          this.selectComponent('#archivedChats')?.refreshConversations()
          this.archivedConversationChanged({ detail: { ...detail, action: 'unarchive' } })
        }
      },
      fail: () => wx.showToast({ title: this.data.i18n.common.loadFailed, icon: 'none' }),
      complete: () => { this._openingArchiveView = false }
    })
  },

  openQuotaPurchase() {
    if (this._openingQuotaPurchase || this.data.usageLimitsLoading || this._unloaded) return
    this._openingQuotaPurchase = true
    wx.navigateTo({
      url: '/pages/usageLimits/purchase/index',
      routeType: 'upRouterBuilder',
      fail: () => wx.showToast({ title: this.data.i18n.common.loadFailed, icon: 'none' }),
      complete: () => { this._openingQuotaPurchase = false }
    })
  },

  openUpgradePage() {
    if (this._openingUpgradePage || store.user?.subscription === 'pro') return
    this._openingUpgradePage = true
    wx.navigateTo({
      url: '/pages/upgrade/index',
      routeType: SETTING_ROUTE_TYPE,
      routeOptions: { stacked: true },
      complete: () => { this._openingUpgradePage = false }
    })
  },

  async refreshMembership() {
    const userId = store.user?.userId
    if (!store.user?.login || !userId) return
    const token = this._membershipLoadToken = (this._membershipLoadToken || 0) + 1
    try {
      const summary = await fetchAccountSummary({ silent: true })
      if (this._unloaded || token !== this._membershipLoadToken ||
          !store.user?.login || store.user.userId !== userId || !summary?.login || summary.userId !== userId) return
      if (summary.subscription === 'pro' || summary.subscription === 'basic') {
        this.setUser({ ...store.user, subscription: summary.subscription })
      }
    } catch (error) {
      console.warn('membership_refresh_failed', error?.name || 'Error')
    }
  },

  async loadBillingUsage() {
    const token = this._billingLoadToken = (this._billingLoadToken || 0) + 1
    const userId = this.data.user?.userId || ''
    this.setData({ usageLimitsLoading: true, usageLimitsError: '' })
    try {
      const summary = await getBillingSummary()
      if (this._unloaded || token !== this._billingLoadToken || (this.data.user?.userId || '') !== userId) return
      this.setData({ ...billingView(summary, this.data.applicationSettings?.language), usageLimitsLoading: false })
    } catch (error) {
      if (this._unloaded || token !== this._billingLoadToken || (this.data.user?.userId || '') !== userId) return
      this.setData({ ...billingView(null, this.data.applicationSettings?.language), usageLimitsLoading: false,
        usageLimitsError: error.message || this.data.i18n.usageLimits.loadFailed })
    }
  },

  openAboutPage(key) {
    if (key === 'report_error') { openErrorReport(); return }
    const url = ABOUT_PAGE_PATHS[key]
    if (!url || this._openingAboutPage) return
    this._openingAboutPage = true
    wx.navigateTo({
      url,
      routeType: SETTING_ROUTE_TYPE,
      routeOptions: { stacked: true },
      complete: () => { this._openingAboutPage = false }
    })
  },

  archivedConversationChanged(e) {
    this.getOpenerEventChannel().emit('archivedConversationChanged', e.detail)
  },

  // --- Navigation ---

  closePage() {
    wx.navigateBack()
  },

  tapSetItem(e) {
    const { name, key, rightSet } = e.currentTarget.dataset

    if (key === 'upgrade_pro') {
      this.openUpgradePage()
      return
    }

    if (key === 'plugins') {
      if (this._openingPlugins) return
      this._openingPlugins = true
      const channel = this.getOpenerEventChannel()
      wx.navigateBack({
        success: () => channel.emit('selectFeature', { feature: 'plugins' }),
        complete: () => { this._openingPlugins = false }
      })
      return
    }

    if (!rightSet) return
    const showSave = SAVE_PANEL_KEYS.includes(key)
    this.openPanel(key, name, showSave)
  },

  handleApplicationOptionChange(e) {
    const { key, value } = e.currentTarget.dataset
    if (!key || !value) return
    triggerHaptic(this.data.applicationSettings?.hapticFeedback, 'light')

    if (key === 'chatVoice') {
      const chatAbout = Object.assign({}, this.data.chatAbout, { chatVoice: value })
      this.setChatAbout(chatAbout)
      this.syncApplicationSets(undefined, chatAbout)
      updateVoice(value).catch(() => {})
    } else {
      if (!['language', 'appearance', 'pointColor'].includes(key)) return

      const applicationSettings = normalizeApplicationSettings(Object.assign({}, this.data.applicationSettings, {
        [key]: value
      }))

      this.setApplicationSettings(applicationSettings)
      this.setData({ applicationSettings }, () => {
        this.syncApplicationSets(applicationSettings)
        if (key === 'language') this.syncSuggestSets()
      })
      updateApplicationSettings(applicationSettings).catch(() => {})
    }

    this.selectComponent(`#applicationPop-${key}`)?.close()
  },

  onReady() { this.measureSaveLabel() },

  onShow() {
    this._settingsVisible = true
    if (this.data.activePanel === 'data_control' || store.user?.deletionStatus === 'deleting') this.refreshDataActions()
    syncThemeNavigation(this)
    this.refreshMembership()
    this.syncAvatarLoading()
    if (this.data.activePanel === 'storage') this.loadStorageUsage()
    if (this.data.activePanel === 'usage_limits') this.loadBillingUsage()
    if (this.data.panelConfigKey === 'long_term_memory') this.loadLongTermMemory()
    this.syncNormalizedApplicationSettings(this.data.chatAbout)
    this.syncSuggestSets()
  },

  onHide() {
    this._settingsVisible = false
    clearTimeout(this._dataActionTimer)
    this.clearLongTermMemoryTimer()
  },

  onUnload() {
    clearTimeout(this._dataActionTimer)
    this._dataActionVersion = (this._dataActionVersion || 0) + 1
    this._unloaded = true
    this._billingLoadToken = (this._billingLoadToken || 0) + 1
    this._saveButtonToken = (this._saveButtonToken || 0) + 1
    this.clearSaveButtonTimer()
    clearTimeout(this._usageLimitsLoadingTimer)
    this._usageLimitsLoadingTimer = null
    this._storageRequestId = (this._storageRequestId || 0) + 1
    unbindPageTheme(this)
    this.clearLongTermMemoryTimer()
    this.clearSubPanelCloseWatcher()
    if (this.storeBindings) {
      this.storeBindings.destroyStoreBindings()
    }
  },

  onPullDownRefresh() {
    this.refreshRemoteData({ silent: false, stopRefresh: true, force: true })
  },

  onReachBottom() {},

  onShareAppMessage() {}
})
