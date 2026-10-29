const { showNotice } = require('../../static_utils/errorNotice')
const { bindPageTheme, unbindPageTheme, syncThemeNavigation } = require('../../static_utils/themeBinding')
const { messages } = require('../../static_utils/i18n/index')
import { createStoreBindings } from 'mobx-miniprogram-bindings'
import { store } from '../../store/index'
import { payBillingOrder, waitBillingOrder } from '../../request/billing'
import { initAppData } from '../../static_utils/appDataInit'

Page({
  data: {
    i18n: messages('中文'), purchasing: false, isPro: false
  },

  onLoad() {
    bindPageTheme(this)
    this.storeBindings = createStoreBindings(this, {
      store,
      fields: {
        isPro: (state) => state.user?.subscription === 'pro',
        i18n: (state) => messages(state.applicationSettings?.language)
      }
    })
  },

  onShow() {
    syncThemeNavigation(this)
    this.setData({ isPro: store.user?.subscription === 'pro' })
  },

  onUnload() {
    this._unloaded = true
    unbindPageTheme(this)
    if (this.storeBindings) this.storeBindings.destroyStoreBindings()
  },

  closePage() {
    wx.navigateBack()
  },

  async getPro() {
    if (store.user?.subscription === 'pro') return
    if (this.data.purchasing) return
    this._purchaseRequestId ||= 'pro_' + Date.now() + '_' + Math.random().toString(36).slice(2, 12)
    this.setData({ purchasing: true })
    try {
      const order = await payBillingOrder('pro_monthly', 36, this._purchaseRequestId)
      if (this._unloaded) return
      const status = order.status === 'paid' ? { fulfilled: true } : await waitBillingOrder(order.orderId, () => !this._unloaded)
      if (status.fulfilled) {
        this._purchaseRequestId = null
        await initAppData({ force: true })
      }
      if (!this._unloaded) showNotice({ title: status.fulfilled ? this.data.i18n.usageLimits.paymentConfirmed : this.data.i18n.usageLimits.paymentPending })
    } catch (error) {
      if (!this._unloaded && !String(error.errMsg || '').includes('cancel')) wx.showModal({
        title: this.data.i18n.upgrade.title,
        content: error.code === 'PAYMENT_UNAVAILABLE' ? this.data.i18n.upgrade.unavailable : error.message || this.data.i18n.upgrade.unavailable,
        showCancel: false, confirmText: this.data.i18n.common.done
      })
    } finally {
      if (!this._unloaded) this.setData({ purchasing: false })
    }
  }
})
