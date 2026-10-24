import { listArchivedConversations, unarchiveConversation, deleteArchivedConversation } from '../../../request/chatStream'
import { store } from '../../../store/index'
import { triggerHaptic } from '../../../static_utils/haptic'
import debounce from '../../../static_utils/debounce'
import { rpx2px } from '../../../static_utils/otherUtils'
const { groupArchivedConversations } = require('./archiveGroups')
const { filterVisibleConversations } = require('../../../static_utils/chatModes')
const { prepareSearchClose } = require('../../../static_utils/searchAnimation')
const i18nBehavior = require('../../../static_utils/i18n/behavior')

const { shared, timing, Easing } = wx.worklet
const PAGE_SIZE = 100
const KEYBOARD_GAP = 12
const SEARCH_ACTION_DURATION = 220
const SEARCH_DEBOUNCE_DELAY = 1000
const ANIMATION_DURATION = 160

Component({
  properties: {
    theme: { type: String, value: 'light' }, themeStyle: { type: String, value: '' } },
  behaviors: [i18nBehavior],
  observers: {
    language() {
      if (this.data.conversations?.length) this.syncGroups()
    }
  },
  data: {
    query: '',
    appliedQuery: '',
    inputFocus: false,
    conversations: [],
    groups: [],
    nextOffset: 0,
    hasMore: true,
    loading: true,
    failed: false,
    requestStatus: 'loading'
  },

  lifetimes: {
    attached() {
      const settingPage = this.selectOwnerComponent()
      this._scrollTop = settingPage.archiveScrollTop
      this._startPan = settingPage.startPan
      this._primaryAnimation = settingPage.routeContext.primaryAnimation
      const system = wx.getWindowInfo()
      const screenWidth = system.screenWidth
      const storedKeyboardHeight = wx.getStorageSync('keyHeight')
      this._keyboardHeightTmp = storedKeyboardHeight || system.screenHeight * 0.5
      this._requestVersion = 0
      this._loadingRequestVersion = null
      this._searchConversations = debounce(this.executeSearch, SEARCH_DEBOUNCE_DELAY)
      this._keyboardOffset = shared(0)
      this._archiveViewportHeight = shared(0)
      this._searchActionProgress = shared(0)
      this._searchCloseKeyboardHeight = shared(0)
      this._searchCloseProgress = shared(0)
      this._searchActionActive = false

      wx.nextTick(() => {
        const clearSize = rpx2px(96, screenWidth)
        const clearSlot = rpx2px(112, screenWidth)
        const statusBottom = rpx2px(180, screenWidth)
        this.applyAnimatedStyle('.archived-search-row', () => {
          'worklet'
          return { transform: `translateY(${-this._keyboardOffset.value}px)` }
        })
        this.applyAnimatedStyle('.archived-scroll', () => {
          'worklet'
          const viewportHeight = this._archiveViewportHeight.value
          return {
            height: viewportHeight > 0
              ? `${Math.max(0, viewportHeight - this._keyboardOffset.value)}px`
              : '100%'
          }
        })
        this.applyAnimatedStyle('.archived-status-layer', () => {
          'worklet'
          return { bottom: `${statusBottom + this._keyboardOffset.value}px` }
        })
        this.applyAnimatedStyle('.archived-search', () => {
          'worklet'
          return { right: `${clearSlot * this._searchActionProgress.value}px` }
        })
        this.applyAnimatedStyle('.archived-clear', () => {
          'worklet'
          const progress = this._searchActionProgress.value
          return {
            width: `${clearSize * progress}px`,
            height: `${clearSize * progress}px`,
            opacity: `${progress}`,
            transform: `translateY(-50%) scale(${0.86 + progress * 0.14})`
          }
        })

        this.createSelectorQuery()
          .select('.archived-page')
          .boundingClientRect((rect) => {
            if (rect?.height > 0) this._archiveViewportHeight.value = rect.height
          })
          .exec()
      })
      this.loadPage(true)
    },

    detached() {
      this._detached = true
      this._requestVersion += 1
      this._activeFlyout?.close()
      this._searchConversations?.cancel()
    }
  },

  methods: {
    openActions(e) {
      if (this._activeFlyout || this._actionBusy) return
      const { id, selector } = e.currentTarget.dataset
      if (!this.data.conversations.some(item => item.conversationId === id)) return
      const flyout = this.selectComponent(selector)
      if (!flyout) return
      this._activeFlyout = flyout
      this._activeConversationId = id
      this.createSelectorQuery().select('.archived-status-layer').boundingClientRect(async (boundary) => {
        if (this._detached || this._activeFlyout !== flyout) return
        const opened = await flyout.open(undefined, boundary)
        if (!opened && this._activeFlyout === flyout) this.clearAction()
        if (opened) triggerHaptic(store.applicationSettings?.hapticFeedback, 'heavy')
      }).exec()
    },

    chooseAction(e) {
      if (!this._activeFlyout || this._actionBusy) return
      const action = e.currentTarget.dataset.action
      if (['view', 'unarchive', 'delete'].includes(action)) {
        this._actionBusy = true
        this._pendingAction = { action, conversationId: this._activeConversationId }
      }
      this._activeFlyout.close()
    },

    handleActionsHidden() {
      const pending = this._pendingAction
      this._pendingAction = null
      this.clearAction()
      if (pending?.action === 'view') {
        this._actionBusy = false
        if (!this._detached) this.triggerEvent('viewconversation', { conversationId: pending.conversationId })
      } else if (pending) this.applyArchiveAction(pending)
    },

    clearAction() {
      this._activeFlyout = null
      this._activeConversationId = ''
    },

    async applyArchiveAction({ action, conversationId }) {
      try {
        const request = action === 'unarchive' ? unarchiveConversation : deleteArchivedConversation
        await request({ conversationId })
        store.resetChatHistory()
        if (action === 'delete') store.removeChatMessageCacheEntry(conversationId)
        if (this._detached) return
        this.removeConversationFromView(conversationId)
        this.triggerEvent('conversationchanged', { conversationId, action })
      } catch (error) {
        if (!this._detached) wx.showToast({ title: error?.message || this.data.i18n.archive.actionFailed, icon: 'none' })
      } finally {
        this._actionBusy = false
      }
    },

    removeConversationFromView(conversationId) {
      const conversations = this.data.conversations || []
      if (!conversations.some(item => item.conversationId === conversationId)) return
      this.setData({
        conversations: conversations.filter(item => item.conversationId !== conversationId),
        nextOffset: Math.max(0, (this.data.nextOffset || 0) - 1)
      }, () => this.syncGroups())
    },

    refreshConversations() {
      // Invalidate in-flight pages and reset offsets after the server list changes.
      this._requestVersion += 1
      this._searchConversations.cancel()
      const keyword = this.data.query.trim()
      this.setData({ appliedQuery: keyword, conversations: [], groups: [], nextOffset: 0, hasMore: true, loading: true, failed: false, requestStatus: 'loading' })
      return this.loadPage(true, keyword)
    },

    syncGroups() {
      this.setData({ groups: groupArchivedConversations(this.data.conversations, '', Date.now(), this.properties.language) })
    },

    async loadPage(reset = false, keyword = this.data.appliedQuery || '') {
      if ((!reset && !this.data.hasMore) || (
        this.data.loading && this._loadingRequestVersion === this._requestVersion
      )) return
      const requestVersion = this._requestVersion
      this._loadingRequestVersion = requestVersion
      this.setData({ loading: true, failed: false, requestStatus: 'loading' })
      try {
        const offset = reset ? 0 : this.data.nextOffset
        const res = await listArchivedConversations({ pageSize: PAGE_SIZE, offset, keyword })
        if (requestVersion !== this._requestVersion) return
        const data = res?.data || {}
        const page = filterVisibleConversations(data.conversations)
        const conversations = filterVisibleConversations(reset ? page : this.data.conversations.concat(page))
        this.setData({
          conversations,
          groups: groupArchivedConversations(conversations, '', Date.now(), this.properties.language),
          nextOffset: typeof data.nextOffset === 'number' ? data.nextOffset : conversations.length,
          hasMore: data.hasMore === true,
          loading: false,
          failed: false,
          requestStatus: 'success'
        })
      } catch (error) {
        if (requestVersion === this._requestVersion) this.setData({ loading: false, failed: true, requestStatus: 'error' })
      } finally {
        if (this._loadingRequestVersion === requestVersion) this._loadingRequestVersion = null
      }
    },

    handleSearch(e) {
      this._activeFlyout?.close()
      this.clearAction()
      const query = e.detail?.value || ''
      this.animateSearchAction(query.length > 0)
      this._requestVersion += 1
      if (!query) {
        this._searchConversations.cancel()
        this.setData({
          query: '',
          appliedQuery: '',
          conversations: [],
          groups: [],
          nextOffset: 0,
          hasMore: true,
          loading: true,
          failed: false,
          requestStatus: 'loading'
        }, () => this.loadPage(true, ''))
        return
      }
      this.setData({
        query,
        appliedQuery: '',
        conversations: [],
        groups: [],
        nextOffset: 0,
        hasMore: false,
        loading: true,
        failed: false,
        requestStatus: 'loading'
      })
      this._searchConversations(query)
    },

    executeSearch(value = '') {
      if (value !== this.data.query) return
      const keyword = String(value || '').trim()
      if (!keyword) {
        this.setData({
          appliedQuery: '',
          conversations: [],
          groups: [],
          nextOffset: 0,
          hasMore: true,
          loading: true,
          failed: false,
          requestStatus: 'loading'
        }, () => this.loadPage(true, ''))
        return
      }
      this.setData({ appliedQuery: keyword }, () => {
        if (value === this.data.query) this.loadPage(true, keyword)
      })
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
      this._activeFlyout?.close()
      this.clearAction()
      this._requestVersion += 1
      this._searchConversations.cancel()
      prepareSearchClose(this)
      this.setData({
        query: '',
        appliedQuery: '',
        inputFocus: false,
        conversations: [],
        groups: [],
        nextOffset: 0,
        hasMore: true,
        loading: true,
        failed: false,
        requestStatus: 'loading'
      }, () => {
        this.loadPage(true, '')
        wx.hideKeyboard()
      })
    },

    shouldScrollViewResponse(pointerEvent) {
      'worklet'
      if (this._primaryAnimation.value < 1) return false
      const shouldScroll = !(this._scrollTop.value <= 0 && pointerEvent.deltaY > 0)
      this._startPan.value = !shouldScroll
      return shouldScroll
    },

    handleScrollUpdate(evt) {
      'worklet'
      this._scrollTop.value = evt.detail?.scrollTop || 0
    },

    handleScroll() {
      this._activeFlyout?.close()
    },

    loadMore() {
      this.loadPage(false, this.data.appliedQuery || '')
    }
  }
})
