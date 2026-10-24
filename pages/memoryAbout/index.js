const { bindPageTheme, unbindPageTheme, syncThemeNavigation } = require('../../static_utils/themeBinding')
const { messages } = require('../../static_utils/i18n/index')
const { store } = require('../../store/index')
const { runOnJS } = wx.worklet

Page({
  data: { i18n: messages('中文'), screenHeight: 0 },
  onLoad() {
    bindPageTheme(this)
    this.setData({
      i18n: messages(store.applicationSettings.language),
      screenHeight: wx.getWindowInfo().screenHeight
    })
  },
  onShow() { syncThemeNavigation(this) },
  onUnload() { this._unloaded = true; unbindPageTheme(this) },
  onSizeUpdate(e) {
    'worklet'
    if (e.size <= 0.01) runOnJS(this.closePage.bind(this))()
  },
  closePage() {
    if (this._closing || this._unloaded) return
    this._closing = true
    wx.navigateBack({ fail: () => { this._closing = false } })
  }
})
