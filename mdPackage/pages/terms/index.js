const { bindPageTheme, unbindPageTheme, syncThemeNavigation } = require('../../../static_utils/themeBinding')
const { static: parseMarkdown } = require('../../components/towxmlstream/index')
const { TERMS_MARKDOWN } = require('./content')

Page({
  data: { article: null },

  onLoad() {
    this._alive = true
    bindPageTheme(this)
    wx.nextTick(() => {
      if (!this._alive) return
      this.setData({ article: parseMarkdown(TERMS_MARKDOWN, 'markdown', { theme: this.data.effectiveTheme }) })
    })
  },

  onShow() {
    syncThemeNavigation(this)
  },

  onUnload() {
    this._alive = false
    unbindPageTheme(this)
  },

  closePage() {
    wx.navigateBack()
  }
})
