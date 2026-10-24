const { bindPageTheme, unbindPageTheme, syncThemeNavigation } = require('../../../static_utils/themeBinding')
const { messages, t } = require('../../../static_utils/i18n/index')
const { store } = require('../../../store/index')
const { listKnowledgeChunks } = require('../../../request/knowledge')

Page({
  data: { i18n: messages('中文'), title: '', items: [], loading: false, failed: false, error: '', hasMore: true, nextCursor: '' },

  onLoad(options) {
    this._alive = true
    this._epoch = store.assetCacheEpoch
    this._documentId = options.id
    bindPageTheme(this)
    this.setData({ i18n: messages(store.applicationSettings.language) })
    this.loadChunks(true)
  },

  onShow() {
    syncThemeNavigation(this)
    if (this._epoch !== store.assetCacheEpoch) {
      this.setData({ items: [], loading: false, failed: true, error: this.data.i18n.knowledge.unavailable })
    }
  },

  onUnload() { this._alive = false; unbindPageTheme(this) },

  async loadChunks(reset = false) {
    if (!this._alive || this._epoch !== store.assetCacheEpoch || this.data.loading || !reset && !this.data.hasMore) return
    this.setData({ loading: true, failed: false, error: '' })
    try {
      const page = await listKnowledgeChunks(this._documentId, { cursor: reset ? '' : this.data.nextCursor, limit: 20 })
      if (!this._alive || this._epoch !== store.assetCacheEpoch) return
      const previous = reset ? [] : this.data.items
      const items = page.items.map((item, index) => ({ ...item,
        title: (item.preview || item.heading).replace(/\s+/g, ' ').trim() || t(store.applicationSettings.language, 'knowledge.chunkNumber', { number: previous.length + index + 1 }) }))
      this._revision = page.document.revision
      this.setData({ title: page.document.name, items: [...previous, ...items], hasMore: page.hasMore, nextCursor: page.nextCursor })
    } catch (error) {
      if (this._alive && this._epoch === store.assetCacheEpoch) this.setData({ failed: true, error: error.message || this.data.i18n.common.loadFailed })
    } finally {
      if (this._alive && this._epoch === store.assetCacheEpoch) this.setData({ loading: false })
    }
  },

  loadMore() { this.loadChunks() },
  retry() { this.loadChunks(true) },

  openChunk(e) {
    if (this._openingChunk || this._epoch !== store.assetCacheEpoch) return
    const item = this.data.items.find(item => item.id === e.currentTarget.dataset.id)
    if (!item) return
    this._openingChunk = true
    wx.navigateTo({
      url: `/mdPackage/pages/knowledgeChunk/index?documentId=${encodeURIComponent(this._documentId)}&id=${encodeURIComponent(item.id)}&revision=${this._revision}`,
      routeType: 'settingRouterBuilder', routeOptions: { stacked: true },
      complete: () => { this._openingChunk = false }
    })
  },

  closePage() { wx.navigateBack() }
})
