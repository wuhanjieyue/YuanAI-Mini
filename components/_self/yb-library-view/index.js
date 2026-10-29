import { rpx2px } from '../../../static_utils/otherUtils'
const { prepareSearchClose } = require('../../../static_utils/searchAnimation')
const i18nBehavior = require('../../../static_utils/i18n/behavior')
const assetListBehavior = require('../../../static_utils/assetListBehavior')
import { listStorageFiles } from '../../../request/request'
import debounce from '../../../static_utils/debounce'
const { messages } = require('../../../static_utils/i18n/index')
const { shared, timing, spring, runOnJS, Easing } = wx.worklet
const KEYBOARD_GAP = 12
const SEARCH_ACTION_DURATION = 220
const ANIMATION_DURATION = 160

Component({
  behaviors: [i18nBehavior, assetListBehavior],
  properties: {
    storageCategory: { type: String, value: 'all' },
    storageNavigationId: { type: Number, value: 0 },
    conversationScope: { type: Boolean, value: false },
    conversationFiles: { type: Array, value: [] },
    conversationLoading: { type: Boolean, value: false },
    featureTitle: { type: String, value: '' },
    sheetHeight: { type: Number, value: 0 }
  },
  observers: {
    language() { this.syncCopy() },
    storageNavigationId() {
      if (this._searchAssets) this.openStorageCategory()
    },
    conversationFiles() {
      if (this.properties.conversationScope) this.loadScopedAssets()
    },
    conversationLoading(value) {
      if (this.properties.conversationScope) this.setData({ loading:value, showSkeleton:value && !this.data.items.length, refreshing:false })
    }
  },
  data: {
    assetSource: 'library',
    activeCategory: 'all',
    query: '',
    inputFocus: false,
    viewMode: 'grid',
    origin: '',
    filterMenuOpen: false,
    sourceMenuOpen: false,
    navHeight: 120,
    categories: [
      { id: 'all', name: '全部' },
      { id: 'image', name: '图片' },
      { id: 'document', name: '文档' },
      { id: 'favorites', name: '收藏' }
    ]
  },

  lifetimes: {
    attached() {
      this.syncCopy()
      this._searchAssets = debounce(() => this.loadAssetPage(true))
      const system = wx.getWindowInfo()
      const screenWidth = system.screenWidth
      const storedKeyboardHeight = wx.getStorageSync('keyHeight')
      this._keyboardHeightTmp = storedKeyboardHeight || system.screenHeight * 0.5
      this._keyboardOffset = shared(0)
      // Parent route transforms change measured bounds, not the 100vh layout viewport.
      this._libraryViewportHeight = shared(this.properties.sheetHeight || system.windowHeight)
      this._searchActionProgress = shared(0)
      this._searchCloseKeyboardHeight = shared(0)
      this._searchCloseProgress = shared(0)
      this._searchActionActive = false
      this._sourceProgress = shared(0)
      this._sourceScale = shared(0)
      this._filterInset = shared(0)
      if (this.properties.conversationScope) this.setData({ navHeight: rpx2px(140, screenWidth) })
      this.openStorageCategory()

      wx.nextTick(() => {
        if (this._assetDetached) return
        const sourceHeader = rpx2px(112, screenWidth)
        const sourceOptions = rpx2px(220, screenWidth)
        this.applyAnimatedStyle('.library-menu-base', () => {
          'worklet'
          return { transform: `scale(${1 - this._filterInset.value})` }
        })
        this.applyAnimatedStyle('.library-source-panel', () => {
          'worklet'
          return {
            height: `${sourceHeader + sourceOptions * this._sourceProgress.value}px`,
            transform: `scale(${1 + this._sourceScale.value})`
          }
        })
        this.applyAnimatedStyle('.library-source-options', () => {
          'worklet'
          return { opacity: this._sourceProgress.value }
        })
        const clearSize = rpx2px(96, screenWidth)
        const clearSlot = rpx2px(112, screenWidth)
        this.applyAnimatedStyle('.library-search-row', () => {
          'worklet'
          return { transform: `translateY(${-this._keyboardOffset.value}px)` }
        })
        this.applyAnimatedStyle('.library-scroll', () => {
          'worklet'
          const viewportHeight = this._libraryViewportHeight.value
          return {
            height: viewportHeight > 0
              ? `${Math.max(0, viewportHeight - this._keyboardOffset.value)}px`
              : '100%'
          }
        })
        this.applyAnimatedStyle('.library-search', () => {
          'worklet'
          return { right: `${clearSlot * this._searchActionProgress.value}px` }
        })
        this.applyAnimatedStyle('.library-clear', () => {
          'worklet'
          const progress = this._searchActionProgress.value
          return {
            width: `${clearSize * progress}px`,
            height: `${clearSize * progress}px`,
            opacity: `${progress}`,
            transform: `translateY(-50%) scale(${0.86 + progress * 0.14})`
          }
        })

      })
    },
    detached() { this._filterOpening = false; this._searchAssets?.cancel(); this.selectComponent('#filterMenu')?.close() }
  },
  pageLifetimes: { hide() { this.closeFilterMenu() } },

  methods: {
    async openFilterMenu() {
      if (this.data.actionsOpen || this._assetDetached) return
      this._filterOpening = true
      const keyboardVisible = this._keyboardOffset.value > 0
      this._sourceProgress.value = 0
      this._sourceScale.value = 0
      this._filterInset.value = 0
      this._sourceExpanded = false
      this._sourceTransition = (this._sourceTransition || 0) + 1
      this.setData({ filterMenuOpen: true, sourceMenuOpen: false, actionsOpen: true, inputFocus: false })
      this.triggerEvent('actionschange', { open: true })
      wx.hideKeyboard()
      this.animateKeyboardOffset(0)
      // Like the knowledge add menu, measure after the row returns from the keyboard.
      if (keyboardVisible) await new Promise(resolve => setTimeout(resolve, ANIMATION_DURATION))
      if (this._assetDetached || !this._filterOpening) return
      let opened = false
      try { opened = await this.selectComponent('#filterMenu').open() }
      catch (_) { return }
      finally { if (!opened && this._filterOpening) this.filterMenuClosed() }
    },
    closeFilterMenu() {
      this._filterOpening = false
      if (!this.selectComponent('#filterMenu')?.close() && this.data.filterMenuOpen) this.filterMenuClosed()
    },
    filterMenuClosed() {
      this._filterOpening = false
      if (this._assetDetached) return
      this.setData({ filterMenuOpen: false, sourceMenuOpen: false, actionsOpen: false })
      this.triggerEvent('actionschange', { open: false })
    },
    handleFilterMask() {
      if (this._sourceExpanded) this.toggleSourceMenu()
      else this.selectComponent('#filterMenu').close()
    },
    handleFilterCard() {},
    toggleSourceMenu() {
      const open = this._sourceExpanded = !this._sourceExpanded
      const transition = this._sourceTransition = (this._sourceTransition || 0) + 1
      if (open) this.setData({ sourceMenuOpen: true })
      const finish = this.finishSourceClose.bind(this, transition)
      this._sourceProgress.value = timing(open ? 1 : 0, { duration: ANIMATION_DURATION }, finished => {
        'worklet'
        if (finished && !open) runOnJS(finish)()
      })
      this._sourceScale.value = open ? spring(0.05, { velocity: 5, mass: 0.8 }) : timing(0, { duration: ANIMATION_DURATION })
      this._filterInset.value = open ? spring(0.05, { velocity: 5, mass: 0.8 }) : timing(0, { duration: ANIMATION_DURATION })
    },
    finishSourceClose(transition) {
      if (!this._assetDetached && transition === this._sourceTransition) this.setData({ sourceMenuOpen: false })
    },
    selectViewMode(e) {
      const viewMode = e.currentTarget.dataset.id
      if (!['grid', 'list'].includes(viewMode)) return
      this.setData({ viewMode })
      this.selectComponent('#filterMenu').close()
    },
    selectOrigin(e) {
      const value = e.currentTarget.dataset.id
      if (!['uploaded', 'generated'].includes(value)) return
      this._searchAssets.cancel()
      this.setData({ origin: this.data.origin === value ? '' : value }, () => this.loadAssetPage(true))
      this.selectComponent('#filterMenu').close()
    },
    chatAsset(e) { this.triggerEvent('chatAsset', e.detail) },
    handleNavHeightChange(e) {
      const height = e.detail.height
      if (Number.isFinite(height) && height > 0 && height !== this.data.navHeight) this.setData({ navHeight: height })
    },
    openStorageCategory() {
      if (this.properties.conversationScope) {
        this.loadScopedAssets()
        return
      }
      const category = this.properties.storageCategory
      if (!['all', 'image', 'document', 'favorites'].includes(category)) return
      this._searchAssets.cancel()
      this.invalidateAssets()
      this.animateSearchAction(false)
      this.animateKeyboardOffset(0)
      this.setData({ activeCategory: category, query: '', inputFocus: false }, () => this.loadAssetPage(true, { force: this.properties.storageNavigationId > 0 }))
    },
    syncCopy() {
      const copy = messages(this.properties.language).library
      this.setData({
        categories: [
          { id: 'all', name: copy.all }, { id: 'image', name: copy.images }, { id: 'document', name: copy.documents },
          ...(!this.properties.conversationScope ? [{ id: 'favorites', name: copy.favorites }] : [])
        ]
      })
    },
    async fetchAssetPage({ cursor, cacheOwnerKey, ifUpdateTime }) {
      const page = await listStorageFiles({ category: this.data.activeCategory, query: this.data.query, origin: this.data.origin, cursor, cacheOwnerKey, ifUpdateTime })
      return { ...page, items: page.files }
    },
    openLeft() {
      this.triggerEvent(this.properties.conversationScope ? 'close' : 'openLeft')
    },
    loadScopedAssets() {
      this._assetVersion = (this._assetVersion || 0) + 1
      const category = this.data.activeCategory
      const query = this.data.query.trim().toLowerCase()
      const items = (this.properties.conversationFiles || []).filter(item =>
        (!this.data.origin || item.origin === this.data.origin) &&
        (category === 'all' || (category === 'image' ? item.attachmentType === 'image' : item.attachmentType !== 'image')) &&
        (!query || [item.name || item.displayName || '', ...(Array.isArray(item.tags) ? item.tags : [])]
          .some(value => typeof value === 'string' && value.toLowerCase().includes(query))))
      this.setData({ items:this.mergeAssetImageState(items), hasMore:false, nextCursor:'', loading:this.properties.conversationLoading, showSkeleton:this.properties.conversationLoading && !items.length, failed:false, refreshing:false })
      if (items.length) this.ensureAssetImages()
    },

    selectCategory(e) {
      const id = this.properties.conversationScope ? e.currentTarget.dataset.id : e.detail.id
      if (!this.data.categories.some(category => category.id === id) || id === this.data.activeCategory || this.data.actionsOpen) return
      this._searchAssets.cancel()
      this.setData({ activeCategory: id }, () => this.properties.conversationScope ? this.loadScopedAssets() : this.loadAssetPage(true))
    },

    handleSearch(e) {
      const query = e.detail?.value || ''
      this.animateSearchAction(query.length > 0)
      this.setData({ query })
      this.invalidateAssets()
      if (this.properties.conversationScope) this.loadScopedAssets()
      else this._searchAssets()
    },

    animateSearchAction(active) {
      if (!active && this._searchCloseKeyboardHeight.value > 0) return
      if (active) this._searchCloseKeyboardHeight.value = 0
      if (!this._searchActionProgress || this._searchActionActive === active) return
      this._searchActionActive = active
      this._searchActionProgress.value = timing(active ? 1 : 0, {
        duration: SEARCH_ACTION_DURATION,
        easing: Easing.ease
      })
    },

    animateKeyboardOffset(value) {
      if (this._searchCloseKeyboardHeight.value > 0 || this._keyboardOffset?.value === Math.max(0, value)) return
      if (!this._keyboardOffset) return
      this._keyboardOffset.value = timing(Math.max(0, value), {
        duration: ANIMATION_DURATION,
        easing: Easing.ease
      })
    },

    handleSearchFocus() {
      this._searchCloseKeyboardHeight.value = 0
      this.animateKeyboardOffset(this._keyboardHeightTmp + KEYBOARD_GAP)
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
      const height = Math.max(0, Number(e.detail?.height) || 0)
      if (height > 0) {
        this._keyboardHeightTmp = height
        wx.setStorage({ key: 'keyHeight', data: height })
        this.animateKeyboardOffset(height + KEYBOARD_GAP)
      } else {
        this.animateKeyboardOffset(0)
      }
    },

    clearSearch() {
      this._searchAssets.cancel()
      prepareSearchClose(this, true)
      this.setData({ query: '', inputFocus: false }, () => {
        wx.hideKeyboard()
        if (this.properties.conversationScope) this.loadScopedAssets()
        else this.loadAssetPage(true)
      })
    }
  }
})
