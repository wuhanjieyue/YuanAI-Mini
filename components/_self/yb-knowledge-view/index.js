const { showErrorNotice } = require('../../../static_utils/errorNotice')
const { prepareSearchClose } = require('../../../static_utils/searchAnimation')
const i18nBehavior = require('../../../static_utils/i18n/behavior')
const assetListBehavior = require('../../../static_utils/assetListBehavior')
const { messages } = require('../../../static_utils/i18n/index')
const { presentAsset } = require('../../../static_utils/assetPresentation')
const { normalizeSelectedFile, PICKER_FILE_EXTENSIONS } = require('../../../static_utils/chatAttachment')
const { listKnowledge, importKnowledge, retryKnowledge } = require('../../../request/knowledge')
import { uploadCloudFiles } from '../../../request/request'
import { store } from '../../../store/index'
const { shared, timing, Easing } = wx.worklet
const ANIMATION_DURATION = 160

Component({
  behaviors: [i18nBehavior, assetListBehavior],
  data: {
    assetSource: 'knowledge', activeCategory: 'all', categories: [], query: '', inputFocus: false,
    navHeight: 120, addMenuOpen: false
  },
  observers: { language() { this.syncCopy() } },
  lifetimes: {
    attached() {
      const system = wx.getWindowInfo()
      const unit = system.windowWidth / 750
      const viewportHeight = system.windowHeight
      this._keyboardHeightTmp = wx.getStorageSync('keyHeight') || system.screenHeight * 0.5
      this._keyboardOffset = shared(0)
      this._searchActionProgress = shared(0)
      this._searchCloseKeyboardHeight = shared(0)
      this._searchCloseProgress = shared(0)
      this._knowledgeEpoch = store.assetCacheEpoch
      this._knowledgeVisible = true
      this._pickSequence = 0
      this.syncCopy()
      this.loadAssetPage(true)
      wx.nextTick(() => {
        if (this._assetDetached) return
        this.applyAnimatedStyle('.knowledge-search-row', () => {
          'worklet'
          return { transform: `translateY(${-this._keyboardOffset.value}px)` }
        })
        this.applyAnimatedStyle('.knowledge-scroll', () => {
          'worklet'
          return { height: `${Math.max(0, viewportHeight - this._keyboardOffset.value)}px` }
        })
        this.applyAnimatedStyle('.knowledge-search', () => {
          'worklet'
          return { right: `${112 * unit * this._searchActionProgress.value}px` }
        })
        this.applyAnimatedStyle('.knowledge-clear', () => {
          'worklet'
          const progress = this._searchActionProgress.value
          return {
            width: `${96 * unit * progress}px`, height: `${96 * unit * progress}px`, opacity: `${progress}`,
            transform: `translateY(-50%) scale(${0.86 + progress * 0.14})`
          }
        })
      })
    },
    detached() {
      clearTimeout(this._knowledgePoll)
      this._pendingAddAction = null
      this._addOpening = false
      this.selectComponent('#addMenu')?.close()
    }
  },
  pageLifetimes: {
    hide() { this._knowledgeVisible = false; clearTimeout(this._knowledgePoll); this.closeAddMenu() },
    show() { this._knowledgeVisible = true; this.loadAssetPage(true) }
  },
  methods: {
    openLeft() { this.triggerEvent('openLeft') },
    chatAsset(e) { this.triggerEvent('chatAsset', e.detail) },
    openChunks(e) {
      if (this._openingChunks || this.data.actionsOpen || this._openingAsset || Date.now() < (this._suppressAssetTapUntil || 0)) return
      const item = this.data.items.find(item => item.id === e.currentTarget.dataset.id)
      if (!item) return
      this._openingChunks = true
      wx.hideKeyboard()
      wx.navigateTo({
        url: '/mdPackage/pages/knowledgeChunks/index?id=' + encodeURIComponent(item.id),
        routeType: 'settingRouterBuilder', routeOptions: { stacked: true },
        complete: () => { this._openingChunks = false }
      })
    },
    assetDescriptor() { return { source: 'knowledge' } },
    syncCopy() {
      const copy = messages(this.properties.language)
      this.setData({ categories: [
        { id: 'all', name: copy.library.all }, { id: 'file', name: copy.common.file }, { id: 'image', name: copy.common.image }
      ] })
    },
    handleNavHeightChange(e) {
      if (Number.isFinite(e.detail.height) && e.detail.height > 0) this.setData({ navHeight: e.detail.height })
    },
    async loadAssetPage(reset = true) {
      if (this._assetDetached || !reset && (this._knowledgeBusy || !this.data.hasMore)) return
      if (this._knowledgeEpoch !== store.assetCacheEpoch) {
        this._knowledgeEpoch = store.assetCacheEpoch
        this._pendingImportIds = null
        this.setData({ items:[], query:'', activeCategory:'all' })
      }
      const epoch = store.assetCacheEpoch
      const version = ++this._assetVersion
      const current = () => !this._assetDetached && epoch === store.assetCacheEpoch && version === this._assetVersion
      this._knowledgeBusy = true
      this.setData({ loading:true, showSkeleton:!this.data.items.length || !reset, failed:false })
      try {
        const page = await listKnowledge({ category:this.data.activeCategory, query:this.data.query,
          cursor:reset ? '' : this.data.nextCursor, limit:20 })
        if (!current()) return
        const copy = messages(this.properties.language)
        const english = ['英文', 'English', 'en-US'].includes(this.properties.language)
        const labels = english
          ? { queued:'Queued', importing:'Parsing', indexing:'Indexing', ready:'Ready', failed:'Failed', deleting:'Removing' }
          : { queued:'待导入', importing:'解析中', indexing:'索引中', ready:'可检索', failed:'处理失败', deleting:'移除中' }
        const stages = english ? {} : { queued:'等待处理', uploading:'上传至索引服务', image_upload:'上传至解析服务', image_parsing:'图片解析', parsing:'文档解析', chunking:'分块处理', embedding:'向量化', extracting:'提取事件与实体', publishing:'发布索引', indexing:'构建索引', waiting_retry:'等待重试' }
        const rows = (reset ? page.items : [...this.data.items, ...page.items]).map(item => ({
          ...presentAsset(item, copy, this.properties.language),
          knowledgeStatus:labels[item.status] || item.status,
          knowledgeDetail:item.fallbackFrom ? (english ? 'Local parser fallback' : '已回退本机解析')
            : item.status === 'ready' ? `${item.chunkCount} ${english ? 'chunks' : '个分块'}` : item.error || stages[item.stage] || item.stage || ''
        }))
        this.setData({ items:this.mergeAssetImageState(rows), hasMore:page.hasMore, nextCursor:page.nextCursor })
      } catch (error) {
        if (current()) this.setData({ failed:true })
      } finally {
        if (version === this._assetVersion) this._knowledgeBusy = false
        if (current()) {
          this.setData({ loading:false, showSkeleton:false, refreshing:false })
          clearTimeout(this._knowledgePoll)
          if (this._knowledgeVisible && this.data.items.some(item => ['queued','importing','indexing'].includes(item.status))) {
            this._knowledgePoll = setTimeout(() => this.loadAssetPage(true), 5000)
          }
        }
      }
    },
    async retryAssets() {
      if (this._pendingImportIds) {
        try { await importKnowledge(this._pendingImportIds); this._pendingImportIds = null }
        catch (error) { showErrorNotice({ title:error.message }); return }
      }
      return this.loadAssetPage(true)
    },
    async retryDocument(e) {
      try { await retryKnowledge(e.currentTarget.dataset.id); await this.loadAssetPage(true) }
      catch (error) { showErrorNotice({ title:error.message }) }
    },
    ensureAssetImages() { return Promise.resolve(!this._assetDetached) },
    selectCategory(e) {
      const id = e.detail.id
      if (!['all', 'file', 'image'].includes(id) || this.data.actionsOpen || id === this.data.activeCategory) return
      this.setData({ activeCategory: id }, () => this.loadAssetPage())
    },
    handleSearch(e) {
      const query = e.detail.value || ''
      this.animateSearchAction(query.length > 0)
      this.setData({ query }, () => this.loadAssetPage())
    },
    animateSearchAction(active) {
      if (!active && this._searchCloseKeyboardHeight.value > 0) return
      if (active) this._searchCloseKeyboardHeight.value = 0
      if (this._searchActionProgress) this._searchActionProgress.value = timing(active ? 1 : 0, { duration: 220, easing: Easing.ease })
    },
    animateKeyboardOffset(value) {
      if (this._searchCloseKeyboardHeight.value > 0 || this._keyboardOffset?.value === Math.max(0, value)) return
      if (this._keyboardOffset) this._keyboardOffset.value = timing(Math.max(0, value), { duration: ANIMATION_DURATION, easing: Easing.ease })
    },
    handleSearchFocus() {
      this._searchCloseKeyboardHeight.value = 0
      this.animateKeyboardOffset(this._keyboardHeightTmp + 12)
    },
    handleSearchBlur() {
      this.setData({ inputFocus: false })
      this.animateKeyboardOffset(0)
    },
    handleSearchKeyboardUpdate(e) {
      'worklet'
      const startHeight = this._searchCloseKeyboardHeight.value
      if (startHeight <= 0) return
      const height = Math.max(0, e.detail.height)
      const progress = Math.min(1, height / startHeight)
      this._keyboardOffset.value = height + 12 * progress
      if (height === 0) this._searchCloseKeyboardHeight.value = 0
    },
    handleSearchKeyboardHeightChange(e) {
      const height = Math.max(0, Number(e.detail.height) || 0)
      if (height > 0) {
        this._keyboardHeightTmp = height
        wx.setStorage({ key: 'keyHeight', data: height })
      }
      this.animateKeyboardOffset(height ? height + 12 : 0)
    },
    clearSearch() {
      prepareSearchClose(this, true)
      this.setData({ query: '', inputFocus: false }, () => this.loadAssetPage())
      wx.hideKeyboard()
    },
    async openAddMenu() {
      if (this.data.actionsOpen || this._addOpening || this.data.loading || this._knowledgeUploading) return
      this._addOpening = true
      const keyboardVisible = this._keyboardOffset.value > 0
      this.setData({ addMenuOpen: true, inputFocus: false })
      this.assetActionsChanged({ detail: { open: true } })
      wx.hideKeyboard()
      this.animateKeyboardOffset(0)
      // Measure the fixed add button after the search row returns from the keyboard.
      if (keyboardVisible) await new Promise(resolve => setTimeout(resolve, ANIMATION_DURATION))
      if (this._assetDetached || !this._addOpening) return
      let opened = false
      try { opened = await this.selectComponent('#addMenu').open() }
      catch (_) { return }
      finally { if (!opened && this._addOpening) this.addMenuClosed() }
    },
    closeAddMenu() {
      this._pendingAddAction = null
      this._addOpening = false
      if (!this.selectComponent('#addMenu')?.close() && this.data.addMenuOpen) this.addMenuClosed()
    },
    selectAddAction(e) {
      const action = e.currentTarget.dataset.action
      if (!this._addOpening || this._pendingAddAction || !['image', 'note', 'file'].includes(action)) return
      this._pendingAddAction = action
      this.selectComponent('#addMenu').close()
    },
    addMenuClosed() {
      if (this._assetDetached) return
      const action = this._pendingAddAction
      this._pendingAddAction = null
      this._addOpening = false
      this.setData({ addMenuOpen: false })
      this.assetActionsChanged({ detail: { open: false } })
      if (action === 'note') showErrorNotice({ title: messages(this.properties.language).assets.unavailable })
      else if (action) this.chooseKnowledgeFiles(action)
    },
    chooseKnowledgeFiles(action) {
      if (this._picking || this._knowledgeUploading || this._assetDetached || !['image', 'file'].includes(action)) return
      this._picking = true
      const epoch = store.assetCacheEpoch
      const current = () => !this._assetDetached && epoch === store.assetCacheEpoch
      const fail = error => {
        if (current() && !/cancel/i.test(error.errMsg || error.message || '')) {
          showErrorNotice({ title: messages(this.properties.language).knowledge.chooseFailed })
        }
      }
      const options = {
        count: 9,
        success: async result => {
          if (!current()) return
          const files = result.tempFiles.map(file => normalizeSelectedFile({ ...file, fileType:action === 'image' ? 'image' : 'file' }))
            .filter(file => file.previewPath)
          if (!files.length) return
          this._knowledgeUploading = true
          wx.showLoading({ title:messages(this.properties.language).common.loading, mask:true })
          try {
            const uploaded = await uploadCloudFiles(files.map(file => ({ filePath:file.previewPath,
              fileName:file.name, ext:file.extension, size:file.size, mimeType:file.mimeType,
              dir:action === 'image' ? 'uploads/image' : 'uploads/file' })))
            if (!current()) return
            this._pendingImportIds = uploaded.map(file => file.assetId)
            await importKnowledge(this._pendingImportIds)
            if (!current()) return
            this._pendingImportIds = null
            this.setData({ query:'', activeCategory:'all' })
            await this.loadAssetPage(true)
          } catch (error) {
            if (current()) { this.setData({ failed:true }); showErrorNotice({ title:error.message }) }
          } finally { this._knowledgeUploading = false; wx.hideLoading() }
        },
        fail,
        complete: () => { this._picking = false }
      }
      try {
        if (action === 'file') wx.chooseMessageFile({ ...options, type: 'file', extension: PICKER_FILE_EXTENSIONS })
        else wx.chooseMedia({ ...options, mediaType: ['image'], sourceType: ['album'] })
      } catch (error) { this._picking = false; fail(error) }
    },
    localAssetsChanged() { this.loadAssetPage(true) }
  }
})
