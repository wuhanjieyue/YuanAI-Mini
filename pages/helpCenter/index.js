const { bindPageTheme, unbindPageTheme, syncThemeNavigation } = require('../../static_utils/themeBinding')
const { HELP_MARKDOWN } = require('./content')
const { messages } = require('../../static_utils/i18n/index')
import { createStoreBindings } from 'mobx-miniprogram-bindings'
import { store } from '../../store/index'

Page({
  data: { i18n: messages('中文'), helpArticle: { role: 'assistant', content: HELP_MARKDOWN } },

  onLoad() {
    bindPageTheme(this)
    this.storeBindings = createStoreBindings(this, {
      store,
      fields: {
        i18n: (state) => messages(state.applicationSettings?.language)
      }
    })
  },

  onShow() {
    syncThemeNavigation(this)
  },

  onUnload() {
    unbindPageTheme(this)
    if (this.storeBindings) this.storeBindings.destroyStoreBindings()
  },

  closePage() {
    wx.navigateBack()
  }
})
