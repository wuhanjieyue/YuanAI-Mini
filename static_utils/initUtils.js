const initUtils = {
  /**
   * 小程序更新方法
   */
  versionUpdate() {
    if (!wx.canIUse("getUpdateManager")) {
      wx.showModal({
        content: "当前微信版本过低，无法使用该功能，请升级到最新微信版本后重试。",
        showCancel: false
      })
      return false
    }

    const updateManager = wx.getUpdateManager()
    updateManager.onUpdateReady(() => {
      wx.showModal({
        title: "更新",
        content: "新版本已准备好，马上重启更新？",
        success: ({ confirm }) => {
          if (confirm) updateManager.applyUpdate()
        }
      })
    })

    updateManager.onUpdateFailed(() => {
      wx.showModal({
        content: "版本更新失败，请将小程序从最近列表中删除后重试。如果还不行，请与门店伙伴联系",
        showCancel: false
      })
    })

    return true
  },

}

export default initUtils;
