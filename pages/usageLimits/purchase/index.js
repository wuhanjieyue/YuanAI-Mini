const { showNotice } = require('../../../static_utils/errorNotice')
const { bindPageTheme, unbindPageTheme, syncThemeNavigation } = require('../../../static_utils/themeBinding')
const { messages } = require('../../../static_utils/i18n/index')
const { store } = require('../../../store/index')
const { runOnJS } = wx.worklet
import { payBillingOrder, waitBillingOrder } from '../../../request/billing'

Page({
  data: { i18n: messages('中文'), screenHeight: 0, sheetSize: 0.3, amountYuan: 30, grantPoints: 2000, purchasing: false },

  onLoad() {
    bindPageTheme(this)
    const { screenHeight, screenWidth } = wx.getWindowInfo()
    this.setData({
      i18n: messages(store.applicationSettings.language),
      screenHeight,
      sheetSize: 0.3 + 72 * screenWidth / 750 / screenHeight
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
  },

  async purchase() {
    if (this.data.purchasing) return
    const copy = this.data.i18n.usageLimits
    this._purchaseRequestId ||= 'points_' + Date.now() + '_' + Math.random().toString(36).slice(2, 12)
    this.setData({ purchasing: true })
    try {
      const order = await payBillingOrder('points_purchase', 30, this._purchaseRequestId)
      if (this._unloaded) return
      const status = order.status === 'paid' ? { fulfilled: true } : await waitBillingOrder(order.orderId, () => !this._unloaded)
      if (this._unloaded) return
      showNotice({ title: status.fulfilled ? copy.paymentConfirmed : copy.paymentPending })
      if (status.fulfilled) this._purchaseRequestId = null
    } catch (error) {
      if (!this._unloaded && !String(error.errMsg || '').includes('cancel')) {
        wx.showModal({ title: copy.buyCredits,
          content: error.code === 'PAYMENT_UNAVAILABLE' ? copy.purchaseUnavailable : error.message || copy.purchaseUnavailable,
          showCancel: false, confirmText: this.data.i18n.common.done })
      }
    } finally {
      if (!this._unloaded) this.setData({ purchasing: false })
    }
  }
})
