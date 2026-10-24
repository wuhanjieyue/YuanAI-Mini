const { bindPageTheme, unbindPageTheme, syncThemeNavigation } = require('../../../static_utils/themeBinding')
const { messages } = require('../../../static_utils/i18n/index')
const { store } = require('../../../store/index')
const { getKnowledgeChunk } = require('../../../request/knowledge')
const { static: parseMarkdown } = require('../../components/towxmlstream/index')

Page({
  data: { i18n: messages('中文'), title: '', article: null, loading: true, failed: false, error: '' },

  onLoad(options) {
    this._alive = true
    this._epoch = store.assetCacheEpoch
    this._options = options
    bindPageTheme(this)
    this.setData({ i18n: messages(store.applicationSettings.language) })
    this.loadChunk()
  },

  onShow() {
    syncThemeNavigation(this)
    if (this._epoch !== store.assetCacheEpoch) {
      this.setData({ article: null, title: '', loading: false, failed: true, error: this.data.i18n.knowledge.unavailable })
    }
  },

  onUnload() { this._alive = false; unbindPageTheme(this) },

  async loadChunk() {
    if (this._loading || !this._alive || this._epoch !== store.assetCacheEpoch) return
    this._loading = true
    this.setData({ loading: true, failed: false, error: '' })
    try {
      const { documentId, id, revision } = this._options
      const chunk = await getKnowledgeChunk(documentId, id, Number(revision))
      if (!this._alive || this._epoch !== store.assetCacheEpoch) return
      this.setData({ title: chunk.heading, article: parseMarkdown(chunk.content, 'markdown', { theme: this.data.effectiveTheme }) })
    } catch (error) {
      if (this._alive && this._epoch === store.assetCacheEpoch) this.setData({ failed: true, error: error.message || this.data.i18n.common.loadFailed })
    } finally {
      this._loading = false
      if (this._alive && this._epoch === store.assetCacheEpoch) this.setData({ loading: false })
    }
  },

  closePage() { wx.navigateBack() }
})
