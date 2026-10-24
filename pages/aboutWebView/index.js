const { bindPageTheme, unbindPageTheme, syncThemeNavigation } = require('../../static_utils/themeBinding')

Page({
  onShow() { syncThemeNavigation(this) },
  onUnload() { unbindPageTheme(this) },
  data: {
    url: ''
  },

  onLoad(options) {
    bindPageTheme(this)
    wx.setNavigationBarTitle({ title: decodeURIComponent(options.title || '') })
    this.setData({
      url: decodeURIComponent(options.url || '')
    })
  }
})
