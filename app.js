import { initLocation, syncLocationPermission } from './request/location'
import { setReportForeground } from './static_utils/errorReporting'
import { store } from './store/index'
const { readSystemTheme } = require('./static_utils/theme')
import appInit from './static_utils/appInit'
import { initAppData } from './static_utils/appDataInit.js'
import initUtils from './static_utils/initUtils.js'
import { updateChatFeedback } from './request/chatStream'
import { chatRuntime } from './request/chatRuntime'
import { dailyRecommendations } from './request/dailyRecommendations'


App({
  globalData: {
    su_init: false,
    su_system: {},
    su_menu: {},
    durationTime:160 //动画时长

  },
  
  initChatRuntime() {
    return initAppData().then(result => {
      this._chatReady = result.cached || result.accountResult?.status === 'fulfilled'
      chatRuntime.setForeground(this._chatReady && this._foreground !== false)
      const settingsReady = result.cached || result.settingsResult?.status === 'fulfilled'
      dailyRecommendations.setForeground(this._chatReady && settingsReady && this._foreground !== false)
    }).catch(() => {})
  },

  onThemeChange({ theme }) { store.setSystemTheme(theme) },
  onShow() {
    syncLocationPermission()
    setReportForeground(true)
    store.setSystemTheme(readSystemTheme())
    this._foreground = true
    this.initChatRuntime()
  },
  onHide() { setReportForeground(false); this._foreground = false; chatRuntime.setForeground(false); dailyRecommendations.setForeground(false) },
  onLaunch(){
    initLocation()
    store.setSystemTheme(readSystemTheme())
    wx.yuanAI = wx.yuanAI || {}
    wx.yuanAI.chatRuntime = chatRuntime
    wx.yuanAI.updateChatFeedback = updateChatFeedback
    appInit(this)
    wx.onNetworkStatusChange(({ isConnected }) => chatRuntime.setOnline(isConnected))
    wx.getNetworkType({ success: ({ networkType }) => chatRuntime.setOnline(networkType !== 'none') })
    this.initChatRuntime()
    if (wx.getDeviceInfo().platform !== 'devtools') initUtils.versionUpdate()
  },

})
