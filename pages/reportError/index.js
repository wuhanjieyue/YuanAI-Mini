const { getSettingSheetMetrics } = require('../../static_router/settingRouter')
const { bindPageTheme, unbindPageTheme, syncThemeNavigation } = require('../../static_utils/themeBinding')
const { store } = require('../../store/index')
const { messages, t } = require('../../static_utils/i18n/index')
const { submitErrorReport } = require('../../request/errorReports')
const { runOnJS } = wx.worklet
const AI_MODEL_NAME = 'YuanAI'

Page({
  data: {
    i18n: messages('中文'), content: '', canSend: false, sending: false, locked: false,
    shakeToReport: true, stacked: true, prompt: false, sheetHeight: 0, error: '',
    reviewNotice: ''
  },
  onLoad(options = {}) {
    bindPageTheme(this)
    const language = store.applicationSettings.language
    this._source = options.source === 'shake' ? 'shake' : 'manual'
    this._requestId = `report_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`
    const device = wx.getDeviceInfo(), system = wx.getAppBaseInfo()
    let route = options.route || ''
    try { route = decodeURIComponent(route) } catch (_) { route = '' }
    this._context = {
      route: /^[A-Za-z0-9_/-]{0,160}$/.test(route) ? route : '',
      source: this._source,
      platform: (device.platform || '').slice(0, 32), system: (device.system || '').slice(0, 80),
      model: (device.model || '').slice(0, 80), SDKVersion: (system.SDKVersion || '').slice(0, 32),
      version: (system.version || '').slice(0, 32),
      appVersion: (wx.getAccountInfoSync().miniProgram.version || '').slice(0, 32)
    }
    this.setData({
      i18n: messages(language), shakeToReport: store.shakeToReport,
      reviewNotice: t(language, 'report.reviewNotice', { app: AI_MODEL_NAME }),
      stacked: this._source !== 'shake',
      prompt: this._source === 'shake',
      sheetHeight: this._source === 'shake' ? wx.getWindowInfo().screenHeight * 0.45 : getSettingSheetMetrics().sheetHeight
    })
  },
  onReady() { this.fitPromptHeight() },
  fitPromptHeight() {
    if (!this.data.prompt || this._unloaded) return
    this.createSelectorQuery().select('.report-prompt-card').boundingClientRect(rect => {
      if (!rect || !rect.height || this._unloaded || !this.data.prompt) return
      const sheetHeight = Math.min(Math.ceil(rect.height + 4), wx.getWindowInfo().screenHeight * 0.85)
      if (Math.abs(sheetHeight - this.data.sheetHeight) > 1) this.setData({ sheetHeight })
    }).exec()
  },
  onShow() { syncThemeNavigation(this) },
  onUnload() { this._unloaded = true; unbindPageTheme(this) },
  onSizeUpdate(e) {
    'worklet'
    if (e.size <= 0.01) runOnJS(this.closePage.bind(this))()
  },
  showForm() {
    this.setData({ prompt: false, sheetHeight: wx.getWindowInfo().screenHeight * 0.85 })
  },
  handleInput(e) {
    if (this.data.sending || this._pending) return
    this.setData({ content: e.detail.value, canSend: !!e.detail.value.trim(), error: '' })
  },
  toggleShake(e) {
    try {
      store.setShakeToReport(!!e.detail.value)
      this.setData({ shakeToReport: store.shakeToReport })
    } catch (_) {
      this.setData({ shakeToReport: store.shakeToReport, error: this.data.i18n.common.loadFailed })
    }
  },
  async handleSend() {
    if (this.data.sending || !this.data.content.trim()) return
    // Keep the exact payload after an uncertain network result so retry is idempotent.
    this._pending = this._pending || { requestId: this._requestId, content: this.data.content.trim(), context: this._context }
    this.setData({ sending: true, locked: true, error: '' })
    try {
      await submitErrorReport(this._pending)
      if (this._unloaded) return
      wx.showToast({ title: this.data.i18n.common.sent, icon: 'success' })
      this.setData({ sending: false })
      this.closePage()
    } catch (_) {
      if (!this._unloaded) this.setData({ sending: false, error: this.data.i18n.report.failed })
    }
  },
  closePage() {
    if (this._closing || this._unloaded) return
    this._closing = true
    wx.navigateBack({ fail: () => { this._closing = false } })
  }
})
