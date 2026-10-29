const { showErrorNotice } = require('./errorNotice')
const { assetContext, assetContextCurrent, cachedAssetEntry, assetRecentlyChecked, saveAssetEntry, requestAssetPage, renewAssetUrls } = require('../request/assetCache')
const eventBusModule = require('./eventBus')
const eventBus = eventBusModule.default
const { ASSET_LIST_INVALIDATED, CHAT_SESSION_RESET } = eventBusModule
const { presentAsset } = require('./assetPresentation')
const { messages } = require('./i18n/index')
const { previewStorageFile } = require('./filePreview')

module.exports = Behavior({
  properties: { themeStyle: { type: String, value: '' } },
  data: {
    items: [], loading: false, showSkeleton: false, failed: false, hasMore: false, nextCursor: '', refreshing: false,
    actionsOpen: false, selectedId: '', gridPadding: [8, 16, 16, 16], gridGap: 14
  },
  observers: {
    language(language) {
      this.setData({ items: this.data.items.map(item => presentAsset(item, messages(language), language)) })
    }
  },
  lifetimes: {
    attached() {
      this._assetVersion = 0
      this._assetDetached = false
      this._assetInvalidated = ({ source }) => {
        if (source === this.assetDescriptor().source) {
          if (this.properties.conversationScope) this.triggerEvent('refreshscopedfiles')
          else this.loadAssetPage(true, { force: true })
        }
      }
      this._assetAccountReset = () => { this._assetDisplayKey = ''; this.invalidateAssets(); this.loadAssetPage(true) }
      eventBus.on(ASSET_LIST_INVALIDATED, this._assetInvalidated)
      eventBus.on(CHAT_SESSION_RESET, this._assetAccountReset)
      const width = wx.getWindowInfo().windowWidth
      const unit = width / 750
      this.setData({ gridPadding: [16 * unit, 32 * unit, 32 * unit, 32 * unit], gridGap: 28 * unit })
    },
    detached() {
      this._assetDetached = true
      eventBus.off(ASSET_LIST_INVALIDATED, this._assetInvalidated)
      eventBus.off(CHAT_SESSION_RESET, this._assetAccountReset)
      this._assetVersion += 1
      this.selectComponent('#assetActions')?.close()
      this.triggerEvent('actionschange', { open: false })
    }
  },
  pageLifetimes: {
    hide() { this._assetHidden = true; this.selectComponent('#assetActions')?.close() },
    show() { if (this._assetHidden) { this._assetHidden = false; this.loadAssetPage(true) } }
  },
  methods: {
    assetDescriptor() {
      return this.data.assetSource === 'library'
        ? { source: 'library', category: this.data.activeCategory, query: this.data.query || '', origin: this.data.origin || '' }
        : { source: this.data.activeTab === 'mine' ? 'mine' : 'templates', category: this.data.activeTab, query: this.data.query || '' }
    },
    invalidateAssets() {
      this._assetVersion += 1
      this._assetBusy = false
      this.setData({ items: [], hasMore: false, nextCursor: '', loading: true, showSkeleton: true, failed: false })
    },
    mergeAssetImageState(items) {
      const previous = new Map(this.data.items.map(item => [item.id, item]))
      return items.map(item => {
        const old = previous.get(item.id)
        if (!old || old.fileID !== item.fileID) return item
        const asset = presentAsset({ ...item, width: old.width || item.width, height: old.height || item.height }, messages(this.properties.language), this.properties.language)
        return old.url === item.url && old.loaded ? { ...asset, loaded: true, loadFailed: false } : asset
      })
    },
    applyAssetPages(pages) {
      const seen = new Set()
      const items = pages.flatMap(page => page.items).filter(item => {
        if (seen.has(item.id)) return false
        seen.add(item.id); return true
      }).map(item => presentAsset(item, messages(this.properties.language), this.properties.language))
      const last = pages[pages.length - 1]
      this.setData({ items: this.mergeAssetImageState(items), hasMore: !!last?.hasMore, nextCursor: last?.nextCursor || '', showSkeleton: false })
    },
    async loadAssetPage(reset = false, { force = false } = {}) {
      if (this.properties.conversationScope) return this.loadScopedAssets()
      if (this._assetDetached || (!reset && (this._assetBusy || !this.data.hasMore))) return
      this._assetRetryReset = reset
      const descriptor = this.assetDescriptor()
      const displayKey = JSON.stringify(descriptor)
      if (displayKey !== this._assetDisplayKey) {
        this.invalidateAssets()
        this._assetEntry = null
        this._assetDisplayKey = displayKey
      }
      const version = ++this._assetVersion
      this._assetBusy = true
      this.setData({ loading: true, failed: false, showSkeleton: !this._assetEntry || !reset })
      const current = () => !this._assetDetached && version === this._assetVersion
      try {
        const context = await assetContext(descriptor.source, descriptor.category, descriptor.query, descriptor.origin)
        if (!current()) return
        this._assetContext = context
        let entry = reset ? cachedAssetEntry(context) : this._assetEntry
        if (reset && entry) {
          this._assetEntry = entry
          this.applyAssetPages(entry.pages)
        }
        if (!(reset && entry && !force && assetRecentlyChecked(context))) {
          const options = { cursor: reset ? '' : this.data.nextCursor }
          if (reset && entry && !force) Object.assign(options, { cacheOwnerKey: context.ownerKey, ifUpdateTime: entry.update_time })
          let page
          try { page = await requestAssetPage(context, value => this.fetchAssetPage(value), options) }
          catch (error) {
            if (error.errorCode !== 'ASSET_LIST_CHANGED') throw error
            page = await requestAssetPage(context, value => this.fetchAssetPage(value), { cursor: '' })
            reset = true
          }
          if (!current() || !assetContextCurrent(context)) return
          if (!page.notModified) {
            if (!Array.isArray(page.items) || page.items.some(item => !item || typeof item.id !== 'string' || !item.id)) throw Error('Invalid asset list')
            entry = { ownerKey: context.ownerKey, update_time: page.update_time,
              savedAt: reset ? Date.now() : entry.savedAt, pages: reset ? [page] : [...entry.pages, page] }
          }
          if (!entry) throw Error('Missing cached asset page')
          this._assetEntry = entry
          saveAssetEntry(context, entry)
          this.applyAssetPages(entry.pages)
        }
        const images = await renewAssetUrls(this.data.items)
        if (current() && assetContextCurrent(context)) this.setData({ items: this.mergeAssetImageState(images) })
      } catch (error) {
        if (current()) this.setData({ failed: true, items: this.data.items.map(item => item.isImage && !item.loaded ? { ...item, loadFailed: true } : item) })
      } finally {
        if (current()) {
          this._assetBusy = false
          this.setData({ loading: false, showSkeleton: false, refreshing: false })
        }
      }
    },
    loadMoreAssets() { return this.properties.conversationScope ? undefined : this.loadAssetPage(false) },
    retryAssets() { return this.loadAssetPage(this._assetRetryReset !== false, { force: true }) },
    refreshAssets() {
      if (this.data.actionsOpen) return
      this._searchAssets?.cancel()
      this.setData({ refreshing: true })
      if (this.properties.conversationScope) {
        this.triggerEvent('refreshscopedfiles')
        return
      }
      return this.loadAssetPage(true, { force: true })
    },
    async ensureAssetImages(force = false) {
      const version = this._assetVersion
      try {
        const items = await renewAssetUrls(this.data.items, force)
        if (this._assetDetached || version !== this._assetVersion) return false
        this.setData({ items: this.mergeAssetImageState(items) })
        return true
      } catch (_) {
        if (!this._assetDetached && version === this._assetVersion) this.setData({ items: this.data.items.map(item => item.isImage && !item.loaded ? { ...item, loadFailed: true } : item) })
        return false
      }
    },
    async openAssetActions(e) {
      if (this.data.actionsOpen || this._openingAsset) return
      const { id, index } = e.currentTarget.dataset
      let item = this.data.items.find(item => item.id === id)
      if (!item) return
      if (item.isImage) {
        if (!await this.ensureAssetImages(!!item.loadFailed)) return
        item = this.data.items.find(item => item.id === id)
        if (!item?.url) return
      }
      this._openingAsset = true
      this._suppressAssetTapUntil = Date.now() + 800
      const version = this._assetVersion
      this.createSelectorQuery().select(`#asset-${index}`).boundingClientRect(async rect => {
        try {
          if (!rect || this._assetDetached || version !== this._assetVersion) return
          wx.hideKeyboard()
          await this.selectComponent('#assetActions')?.open(item, rect, item.sampleKey ? 'sample' : this.data.assetSource)
        } finally { this._openingAsset = false }
      }).exec()
    },
    assetActionsChanged(e) {
      this.setData({ actionsOpen: e.detail.open, selectedId: e.detail.lifted ? e.detail.id : '' })
      if (!e.detail.open) this._suppressAssetTapUntil = Date.now() + 300
      this.triggerEvent('actionschange', { open: e.detail.open })
    },
    async previewAsset(e) {
      if (this._previewingAsset || this.data.actionsOpen || this._openingAsset || Date.now() < (this._suppressAssetTapUntil || 0)) return
      let item = this.data.items.find(item => item.id === e.currentTarget.dataset.id)
      if (!item) return
      if (!item.isImage) return this.previewDocumentAsset(item)
      if (!await this.ensureAssetImages(!!item.loadFailed)) return
      item = this.data.items.find(item => item.id === e.currentTarget.dataset.id)
      if (!item?.url) return
      const images = this.data.items.filter(item => item.isImage && item.url && !item.loadFailed)
      const version = this._assetVersion
      const showError = () => showErrorNotice({ title: messages(this.properties.language).assets.imageUnavailable })
      this._previewingAsset = true
      try {
        const urls = images.map(image => image.url)
        if (this._assetDetached || version !== this._assetVersion || this.data.actionsOpen || this._openingAsset) return
        wx.previewImage({ current: urls[images.indexOf(item)], urls, fail: showError })
      } catch (error) {
        if (!this._assetDetached && version === this._assetVersion) showError()
      } finally { this._previewingAsset = false }
    },
    async previewDocumentAsset(item) {
      if (this._previewingAsset) return
      this._previewingAsset = true
      try {
        return await previewStorageFile(item, { language: this.properties.language })
      } finally {
        this._previewingAsset = false
      }
    },
    assetImageLoaded(e) {
      const { width, height } = e.detail || {}
      const dimensions = Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0 ? { width, height } : {}
      this.updateAssetImage(e, { ...dimensions, loaded: true, loadFailed: false })
    },
    assetImageFailed(e) { this.updateAssetImage(e, { loaded: false, loadFailed: true }) },
    updateAssetImage(e, patch) {
      if (this._assetDetached) return
      const index = this.data.items.findIndex(item => item.id === e.currentTarget.dataset.id && item.url === e.currentTarget.dataset.url)
      if (index >= 0) this.setData({ [`items[${index}]`]: presentAsset({ ...this.data.items[index], ...patch }, messages(this.properties.language), this.properties.language) })
    }
  }
})
