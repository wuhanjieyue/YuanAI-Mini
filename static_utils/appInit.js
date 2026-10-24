function appInit(appInstance) {
  const app = appInstance || getApp()
  if (app.globalData.su_init) return

  app.globalData.su_system = wx.getWindowInfo()
  app.globalData.su_menu = wx.getMenuButtonBoundingClientRect()
  app.globalData.su_init = true
}

export default appInit
