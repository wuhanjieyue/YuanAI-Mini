import { rpx2px } from '../../../static_utils/otherUtils'
const { prepareSearchClose } = require('../../../static_utils/searchAnimation')
const i18nBehavior = require('../../../static_utils/i18n/behavior')
const assetListBehavior = require('../../../static_utils/assetListBehavior')
const { messages } = require('../../../static_utils/i18n/index')
import { listCreatedImages, listCreateTemplates } from '../../../request/request'
import debounce from '../../../static_utils/debounce'
const { shared, timing, Easing } = wx.worklet
const KEYBOARD_GAP = 12
const SEARCH_ACTION_DURATION = 220
const ANIMATION_DURATION = 160

Component({
  behaviors: [i18nBehavior, assetListBehavior],
  data: { query: '', inputFocus: false, activeTab: 'templates', tabs: [], assetSource: 'creation', navHeight: 120, viewportHeight: '100%' },
  observers: {
    language() { this.syncCopy() }
  },
  lifetimes: {
    attached() {
      this.syncCopy()
      this._searchAssets = debounce(() => this.loadAssetPage(true))
      const system = wx.getWindowInfo()
      const screenWidth = system.screenWidth
      this._keyboardHeightTmp = wx.getStorageSync('keyHeight') || system.screenHeight * 0.5
      this._keyboardOffset = shared(0)
      this._createViewportHeight = shared(system.windowHeight)
      this._searchActionProgress = shared(0)
      this._searchCloseKeyboardHeight = shared(0)
      this._searchCloseProgress = shared(0)
      this._searchActionActive = false
      this.setData({
        viewportHeight: `${wx.getWindowInfo().windowHeight}px`
      })
      this.loadAssetPage(true)
      wx.nextTick(() => {
        if (this._assetDetached) return
        const clearSize = rpx2px(96, screenWidth)
        const clearSlot = rpx2px(112, screenWidth)
        this.applyAnimatedStyle('.create-search-row', () => {
          'worklet'
          return { transform: `translateY(${-this._keyboardOffset.value}px)` }
        })
        this.applyAnimatedStyle('.create-scroll', () => {
          'worklet'
          const viewportHeight = this._createViewportHeight.value
          return {
            height: viewportHeight > 0
              ? `${Math.max(0, viewportHeight - this._keyboardOffset.value)}px`
              : '100%'
          }
        })
        this.applyAnimatedStyle('.create-search', () => {
          'worklet'
          return { right: `${clearSlot * this._searchActionProgress.value}px` }
        })
        this.applyAnimatedStyle('.create-clear', () => {
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
    detached() { this._searchAssets?.cancel() }
  },
  methods: {
    chatAsset(e) { this.triggerEvent('chatAsset', e.detail) },
    syncCopy() {
      const copy = messages(this.properties.language).create
      this.setData({ tabs: ['templates', 'popular', 'mine'].map(id => ({ id, name: copy[id] })) })
    },
    handleNavHeightChange(e) {
      const height = e.detail.height
      if (Number.isFinite(height) && height > 0 && height !== this.data.navHeight) this.setData({ navHeight: height })
    },
    async fetchAssetPage({ cursor, cacheOwnerKey, ifUpdateTime }) {
      if (this.data.activeTab !== 'mine') return listCreateTemplates({ category: this.data.activeTab, query: this.data.query, cursor, cacheOwnerKey, ifUpdateTime })
      const page = await listCreatedImages({ query: this.data.query, cursor, cacheOwnerKey, ifUpdateTime })
      return { ...page, items: page.images }
    },
    selectTab(e) {
      const tab = e.detail.id
      if (!['templates', 'popular', 'mine'].includes(tab) || tab === this.data.activeTab || this.data.actionsOpen) return
      this._searchAssets.cancel()
      this.setData({ activeTab: tab }, () => this.loadAssetPage(true))
    },
    handleSearch(e) {
      const query = e.detail?.value || ''
      this.animateSearchAction(query.length > 0)
      this.setData({ query })
      this.invalidateAssets()
      this._searchAssets()
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
      this._searchActionProgress.value = this._searchCloseProgress.value * progress
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
      prepareSearchClose(this)
      this.setData({ query: '', inputFocus: false }, () => {
        wx.hideKeyboard()
        this.loadAssetPage(true)
      })
    },
    async openCreation(e) {
      if (this.data.activeTab === 'mine') return this.previewAsset(e)
      if (this.data.actionsOpen || this._openingAsset || Date.now() < (this._suppressAssetTapUntil || 0)) return
      let item = this.data.items.find(item => item.id === e.currentTarget.dataset.id)
      if (!item) return
      if (!await this.ensureAssetImages(!!item.loadFailed)) return
      item = this.data.items.find(item => item.id === e.currentTarget.dataset.id)
      if (!item?.url || this.data.actionsOpen) return
      this.triggerEvent('openCreation', { item })
    },
    openLeft() {
      this.triggerEvent('openLeft')
    }
  }
})
