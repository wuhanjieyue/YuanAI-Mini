// components/_self/yb-left-center/index.js
import { createStoreBindings } from 'mobx-miniprogram-bindings'
import { store } from '../../../store/index'
import settingRouterBuilder from '../../../static_router/settingRouter'
import eventBus, { CHAT_SESSION_RESET } from '../../../static_utils/eventBus'
import debounce from '../../../static_utils/debounce'
import { triggerHaptic } from '../../../static_utils/haptic'
import {
  archiveConversation as archiveConversationRequest,
  deleteConversation as deleteConversationRequest,
  getConversationsStatus,
  listConversations,
  renameConversation as renameConversationRequest,
  updateConversationPin
} from '../../../request/chatStream'
const {
  DEFAULT_POINT_COLOR,
  getAccentStyle
} = require('../../../static_utils/accentColor')
const { HOME_FEATURES } = require('../../../static_utils/homeFeature')
const { filterVisibleConversations } = require('../../../static_utils/chatModes')
const i18nBehavior = require('../../../static_utils/i18n/behavior')
const { t } = require('../../../static_utils/i18n/index')
const { shared, timing } = wx.worklet
const PAGE_SIZE = 25
const PINNED_PAGE_SIZE = 5
const SEARCH_FEATURES_ANIMATION_DURATION = 300
const SEARCH_CHAT_TOP_PADDING_REDUCTION = 32
const SEARCH_DEBOUNCE_DELAY = 1000
const DEFAULT_ACCENT_STYLE = getAccentStyle(DEFAULT_POINT_COLOR)
const HISTORY_LOADING_REQUEST = 'drawerHistoryLoadingRequest'
const HISTORY_LOADING_CHANGE = 'drawerHistoryLoadingChange'
const CONVERSATION_ACTIONS = [
  { label: '置顶', value: 'pin', icon: 'icon-pin' },
  { label: '重命名', value: 'rename', icon: 'icon-rename' },
  { label: '归档', value: 'archive', icon: 'icon-archive' },
  { label: '删除', value: 'delete', icon: 'icon-delete', tone: 'danger' }
]

Component({
  behaviors: [i18nBehavior],

  /**
   * 组件的属性列表
   */
  properties: {
    currentFeature: {
      type: String,
      value: HOME_FEATURES.CHAT
    },
    temporaryMode: {
      type: Boolean,
      value: false
    },
    historyController: {
      type: Boolean,
      value: true
    }
  },
  observers: {
    'initialLoadingConversations, loadingMoreConversations, conversationLoadFailed': function () {
      if(this.data.historyController) this.publishHistoryLoading()
    },
    language(language) {
      this.setData({ conversationActions: [
        { label: t(language, 'chat.pin'), value: 'pin', icon: 'icon-pin' },
        { label: t(language, 'sidebar.rename'), value: 'rename', icon: 'icon-rename' },
        { label: t(language, 'chat.archive'), value: 'archive', icon: 'icon-archive' },
        { label: t(language, 'common.delete'), value: 'delete', icon: 'icon-delete', tone: 'danger' }
      ] })
    },
    'chatHistory.conversations': function (conversations) {
      this.syncRecentConversations(conversations)
    },
    pinnedChatHistory: function () {
      wx.nextTick(() => {
        if(this._searchSections) {
          this.measureSearchSection({
            key: 'pinned',
            selector: '.pinned-section',
            measureSelector: '.pinned-content'
          })
        }
        this.syncRecentConversations(this.getCachedConversations())
      })
    }
  },
  lifetimes:{
    attached(){
      this._conversationVersion = 0
      this._recentRequestVersion = 0
      this._pinnedRequestVersion = 0
      this._searchRequestVersion = 0
      this._searchConversations = debounce(this.executeSearch, SEARCH_DEBOUNCE_DELAY)
      this.storeBindings = createStoreBindings(this, {
        store, 
        fields: {
          user: 'user',
          chatHistory: 'chatHistory',
          chatRuns: 'chatRuns',
          unreadConversations: 'unreadConversations',
          pinnedChatHistory: 'pinnedChatHistory',
          pinnedConversations: (state) => filterVisibleConversations(state.pinnedChatHistory?.conversations),
          pinnedNextOffset: (state) => state.pinnedChatHistory?.nextOffset || 0,
          pinnedHasMore: (state) => state.pinnedChatHistory?.hasMore === true,
          applicationSettings: 'applicationSettings',
          effectiveTheme: (state) => state.effectiveTheme,
          temporaryAccentStyle: (state) => getAccentStyle(DEFAULT_POINT_COLOR, state.effectiveTheme),
          accentStyle: (state) => getAccentStyle(state.applicationSettings?.pointColor, state.effectiveTheme)
        },
        actions: ['setChatHistory', 'setPinnedChatHistory'],
      })
      this.storeBindings.updateStoreBindings()
      this.syncRecentConversations(this.getCachedConversations())

      const menuRect = wx.getMenuButtonBoundingClientRect()
      const bottom = menuRect?.bottom ? menuRect.bottom + 8 : 128
      this._normalChatTopPadding = bottom
      this._searchChatTopPadding = Math.max(0, bottom - SEARCH_CHAT_TOP_PADDING_REDUCTION)
      this._chatTopPadding = shared(bottom)
      this.setData({ searchHeight: menuRect?.height || 0, titleHeight: bottom })

      this._chatSessionResetHandler = ({ reloadHistory } = {}) => {
        if(reloadHistory && this.data.historyController) this.refreshConversations()
      }
      eventBus.on(CHAT_SESSION_RESET, this._chatSessionResetHandler)
      this._historyLoadingHandler = this.data.historyController
        ? this.publishHistoryLoading.bind(this)
        : (state) => this.setData(state)
      eventBus.on(this.data.historyController ? HISTORY_LOADING_REQUEST : HISTORY_LOADING_CHANGE, this._historyLoadingHandler)
      if(!this.data.historyController) eventBus.emit(HISTORY_LOADING_REQUEST)

      settingRouterBuilder()
    },
    ready(){
      const paddingReady = new Promise((resolve) => this.applyAnimatedStyle('.chat-view', () => {
        'worklet'
        return { paddingTop: `${this._chatTopPadding.value}px` }
      }, {}, resolve))
      Promise.all([paddingReady, this.initSearchFeaturesAnimation()]).then(() => {
        if(this._detached) return
        this._contentReady = true
        this.triggerEvent('contentready')
      })

      this.initConversations()
    },
    detached(){
      this._detached = true
      this._searchConversations?.cancel()
      eventBus.off(CHAT_SESSION_RESET, this._chatSessionResetHandler)
      eventBus.off(this.data.historyController ? HISTORY_LOADING_REQUEST : HISTORY_LOADING_CHANGE, this._historyLoadingHandler)
      this.storeBindings.destroyStoreBindings()
    }
  },
  /**
   * 组件的初始数据
   */
  data: {
    searchHeight: 0,
    titleHeight: 128,
    chatHistory: { conversations: [], nextOffset: 0, hasMore: true },
    pinnedChatHistory: { conversations: [], nextOffset: 0, hasMore: false },
    conversationActions: CONVERSATION_ACTIONS,
    searchQuery: '',
    appliedSearchQuery: '',
    pinnedConversations: [],
    pinnedNextOffset: 0,
    pinnedHasMore: false,
    loadingPinnedConversations: false,
    recentConversations: [],
    activeConversationId: '',
    initialLoadingConversations: false,
    loadingMoreConversations: false,
    conversationLoadFailed: false,
    searchLoading: false,
    searchLoadFailed: false,
    temporaryAccentStyle: DEFAULT_ACCENT_STYLE
  },

  /**
   * 组件的方法列表
   */
  methods: {
    publishHistoryLoading(){
      const { initialLoadingConversations, loadingMoreConversations, conversationLoadFailed } = this.data
      eventBus.emit(HISTORY_LOADING_CHANGE, { initialLoadingConversations, loadingMoreConversations, conversationLoadFailed })
    },

    initSearchFeaturesAnimation(){
      this._searchSections = {}
      return Promise.all([
        { key: 'features', selector: '.feature-actions' },
        { key: 'pinned', selector: '.pinned-section', measureSelector: '.pinned-content' },
        { key: 'recentTitle', selector: '.recent-title' }
      ].map((section) => this.measureSearchSection(section)))
    },

    measureSearchSection(section){
      return new Promise((resolve) => this.createSelectorQuery()
        .select(section.measureSelector || section.selector)
        .boundingClientRect((rect) => {
          if(this._detached) return resolve()
          const height = rect?.height || 0
          const current = this._searchSections[section.key]
          if (current) {
            if (current.height === height) return resolve()
            current.height = height
            if (!this.data.searchQuery) {
              current.heightValue.value = this._contentReady
                ? timing(height, { duration: SEARCH_FEATURES_ANIMATION_DURATION })
                : height
            }
            return resolve()
          }

          const expanded = !this.data.searchQuery
          const heightValue = shared(expanded ? height : 0)
          const opacityValue = shared(expanded ? 1 : 0)
          this._searchSections[section.key] = { height, heightValue, opacityValue }
          this.applyAnimatedStyle(section.selector, () => {
            'worklet'
            return {
              height: `${heightValue.value}px`,
              opacity: `${opacityValue.value}`
            }
          }, {}, resolve)
        })
        .exec())
    },

    setSearchFeaturesVisible(visible){
      Object.values(this._searchSections || {}).forEach((section) => {
        section.heightValue.value = timing(
          visible ? section.height : 0,
          { duration: SEARCH_FEATURES_ANIMATION_DURATION }
        )
        section.opacityValue.value = timing(
          visible ? 1 : 0,
          { duration: SEARCH_FEATURES_ANIMATION_DURATION }
        )
      })
    },

    setSearchChatTopPadding(searching){
      if (!this._chatTopPadding) return
      this._chatTopPadding.value = timing(
        searching ? this._searchChatTopPadding : this._normalChatTopPadding,
        { duration: SEARCH_FEATURES_ANIMATION_DURATION }
      )
    },

    handleSearchInput(e){
      const value = e.detail?.value || ''
      const wasSearching = Boolean(this.data.searchQuery)
      this._searchRequestVersion += 1
      if (!value) {
        this._searchConversations.cancel()
        this.setData({
          searchQuery: '',
          appliedSearchQuery: '',
          searchLoading: false,
          searchLoadFailed: false
        }, () => this.syncRecentConversations(this.getCachedConversations()))
        this.setSearchFeaturesVisible(true)
        this.setSearchChatTopPadding(false)
        return
      }
      this.setData({
        searchQuery: value,
        searchLoadFailed: false,
        recentConversations: [],
        searchLoading: true
      })
      this.setSearchFeaturesVisible(!value)
      if (!wasSearching) this.setSearchChatTopPadding(true)
      this._searchConversations(value)
    },

    clearSearch(){
      this._searchRequestVersion += 1
      this._searchConversations.cancel()
      this.setData({
        searchQuery: '',
        appliedSearchQuery: '',
        searchLoading: false,
        searchLoadFailed: false
      }, () => {
        this.syncRecentConversations(this.getCachedConversations())
      })
      this.setSearchFeaturesVisible(true)
      this.setSearchChatTopPadding(false)
    },

    openSet(){
      triggerHaptic(this.data.applicationSettings?.hapticFeedback, 'light')
      wx.navigateTo({
        url: '/pages/setting/index',
        routeType: "settingRouterBuilder",
        events: {
          selectFeature: ({ feature }) => {
            this.triggerEvent('selectfeature', { feature })
            this.triggerEvent('requestclose')
          },
          openStorageCategory: ({ category }) => this.triggerEvent('openstoragecategory', { category }),
          archivedConversationChanged: () => this.refreshConversations()
        }
      });
    },

    getCachedConversations(){
      return filterVisibleConversations(this.data.chatHistory?.conversations)
    },

    getCachedPinnedConversations(){
      return filterVisibleConversations(this.data.pinnedChatHistory?.conversations)
    },

    getConversation(conversationId){
      return [
        ...(this.data.pinnedConversations || []),
        ...(this.data.recentConversations || []),
        ...this.getCachedConversations()
      ].find((item) => item.conversationId === conversationId) || null
    },

    replaceConversationInViews(conversationId, conversation){
      const history = this.data.chatHistory || {}
      const recentCache = this.getCachedConversations()
      const wasInRecent = recentCache.some((item) => item.conversationId === conversationId)
      const currentPinned = this.data.pinnedConversations || []
      const wasInPinned = currentPinned.some((item) => item.conversationId === conversationId)
      const pinnedHistory = this.data.pinnedChatHistory || {}
      const pinnedOffset = typeof pinnedHistory.nextOffset === 'number'
        ? pinnedHistory.nextOffset
        : currentPinned.length
      const isPinned = Boolean(conversation.pinnedAt)
      const nextRecentCache = isPinned
        ? recentCache.filter((item) => item.conversationId !== conversationId)
        : wasInRecent
          ? recentCache.map((item) => item.conversationId === conversationId ? conversation : item)
          : wasInPinned
            ? [conversation, ...recentCache]
            : recentCache
      const nextPinned = isPinned
        ? wasInPinned
          ? currentPinned.map((item) => item.conversationId === conversationId ? conversation : item)
          : [conversation, ...currentPinned]
        : currentPinned.filter((item) => item.conversationId !== conversationId)
      const nextOffset = isPinned && wasInRecent
        ? Math.max(0, (history.nextOffset || 0) - 1)
        : !isPinned && wasInPinned && !wasInRecent
          ? (history.nextOffset || 0) + 1
          : history.nextOffset
      const nextPinnedOffset = isPinned && !wasInPinned
        ? pinnedOffset + 1
        : !isPinned && wasInPinned
          ? Math.max(0, pinnedOffset - 1)
          : pinnedOffset

      this.setChatHistory({ ...history, conversations: nextRecentCache, nextOffset: nextOffset || 0 })
      this.setPinnedChatHistory({
        ...pinnedHistory,
        conversations: nextPinned,
        latestModifiedAt: '',
        nextOffset: nextPinnedOffset
      })
      const updates = {}
      if (this.data.searchQuery) {
        updates.recentConversations = (this.data.recentConversations || []).map((item) => (
          item.conversationId === conversationId ? conversation : item
        ))
      }
      if(Object.keys(updates).length) this.setData(updates)
    },

    removeConversationFromViews(conversationId){
      store.removeUnreadConversation(conversationId)
      store.removeChatRun(conversationId)
      const history = this.data.chatHistory || {}
      const recentCache = this.getCachedConversations()
      const wasInRecent = recentCache.some((item) => item.conversationId === conversationId)
      const wasInPinned = (this.data.pinnedConversations || []).some((item) => item.conversationId === conversationId)
      const conversations = recentCache.filter((item) => item.conversationId !== conversationId)
      const pinnedHistory = this.data.pinnedChatHistory || {}
      const pinnedConversations = (this.data.pinnedConversations || []).filter((item) => item.conversationId !== conversationId)
      const pinnedOffset = typeof pinnedHistory.nextOffset === 'number'
        ? pinnedHistory.nextOffset
        : (this.data.pinnedConversations || []).length
      this.setChatHistory({
        ...history,
        conversations,
        nextOffset: wasInRecent ? Math.max(0, (history.nextOffset || 0) - 1) : history.nextOffset
      })
      this.setPinnedChatHistory({
        ...pinnedHistory,
        conversations: pinnedConversations,
        latestModifiedAt: '',
        nextOffset: wasInPinned ? Math.max(0, pinnedOffset - 1) : pinnedOffset
      })
      if(this.data.searchQuery) {
        this.setData({
          recentConversations: (this.data.recentConversations || []).filter((item) => item.conversationId !== conversationId)
        })
      }
      if (wasInPinned) this.refreshConversations()
    },

    syncRecentConversations(allConversations = [], force = false){
      if (this.data.searchQuery && !force) return
      const conversations = filterVisibleConversations(allConversations).filter((item) => (
        item
        && !item.pinnedAt
        && !(this.data.pinnedConversations || []).some((pinned) => pinned.conversationId === item.conversationId)
      ))
      const updates = {}

      const current = this.data.recentConversations || []
      const structureChanged = current.length !== conversations.length
        || conversations.some((item, index) => current[index]?.conversationId !== item.conversationId)
      if (structureChanged) {
        updates.recentConversations = conversations
      } else {
        conversations.forEach((item, index) => {
          if (JSON.stringify(current[index]) !== JSON.stringify(item)) {
            updates[`recentConversations[${index}]`] = item
          }
        })
      }

      if (Object.keys(updates).length) this.setData(updates)
    },

    saveConversationPage(data = {}, append = false){
      const history = this.data.chatHistory || {}
      const current = append && history.ownerKey === data.ownerKey ? this.getCachedConversations() : []
      const page = filterVisibleConversations(data.conversations)
      const seen = {}
      const conversations = current.concat(page).filter((item) => {
        const id = item && item.conversationId
        if (!id || seen[id]) return false
        seen[id] = true
        return true
      })

      this.setChatHistory({
        ownerKey: data.ownerKey || '',
        conversations,
        latestModifiedAt: data.latestModifiedAt || '',
        pageSize: PAGE_SIZE,
        nextOffset: typeof data.nextOffset === 'number' ? data.nextOffset : conversations.length,
        hasMore: typeof data.hasMore === 'boolean' ? data.hasMore : conversations.length > current.length && page.length >= PAGE_SIZE
      })
    },

    savePinnedPage(data = {}, append = false){
      const ownerKey = data.ownerKey || ''
      const history = this.data.pinnedChatHistory || {}
      const current = append && history.ownerKey === ownerKey
        ? this.getCachedPinnedConversations()
        : []
      const page = filterVisibleConversations(data.conversations)
      const seen = {}
      const conversations = current.concat(page).filter((item) => {
        const id = item && item.conversationId
        if (!id || seen[id]) return false
        seen[id] = true
        return true
      })
      const nextHistory = {
        ownerKey,
        conversations,
        latestModifiedAt: data.latestModifiedAt || '',
        pageSize: PINNED_PAGE_SIZE,
        nextOffset: typeof data.nextOffset === 'number' ? data.nextOffset : conversations.length,
        hasMore: data.hasMore === true
      }
      this.setPinnedChatHistory(nextHistory)
      wx.nextTick(() => {
        this.measureSearchSection({
          key: 'pinned',
          selector: '.pinned-section',
          measureSelector: '.pinned-content'
        })
        this.syncRecentConversations(this.getCachedConversations())
      })
    },

    async loadPinnedFirstPage(){
      const version = this._conversationVersion
      const requestVersion = ++this._pinnedRequestVersion
      this._loadingPinnedFirstPage = true
      this._loadingMorePinnedConversations = false
      this.setData({ loadingPinnedConversations: true })
      try {
        const res = await listConversations({ pageSize: PINNED_PAGE_SIZE, offset: 0, pinned: true })
        if (version !== this._conversationVersion || requestVersion !== this._pinnedRequestVersion) return
        this.savePinnedPage(res?.data || {}, false)
      } catch (error) {
      } finally {
        if (version === this._conversationVersion && requestVersion === this._pinnedRequestVersion) {
          this._loadingPinnedFirstPage = false
          this.setData({ loadingPinnedConversations: false })
        }
      }
    },

    async loadMorePinnedConversations(){
      if(this.data.searchQuery) return
      if(!this.data.historyController) {
        this.triggerEvent('loadmorepinnedconversations')
        return
      }
      if (
        this._loadingPinnedFirstPage
        || this._loadingMorePinnedConversations
        || this.data.loadingPinnedConversations
        || this.data.pinnedHasMore === false
      ) return

      const version = this._conversationVersion
      const requestVersion = this._pinnedRequestVersion
      const pinnedHistory = this.data.pinnedChatHistory || {}
      this._loadingMorePinnedConversations = true
      this.setData({ loadingPinnedConversations: true })
      try {
        const offset = typeof pinnedHistory.nextOffset === 'number'
          ? pinnedHistory.nextOffset
          : this.getCachedPinnedConversations().length
        const res = await listConversations({ pageSize: PINNED_PAGE_SIZE, offset, pinned: true })
        if (version !== this._conversationVersion || requestVersion !== this._pinnedRequestVersion) return
        const data = res?.data || {}
        if (pinnedHistory.ownerKey && data.ownerKey && pinnedHistory.ownerKey !== data.ownerKey) {
          await this.loadPinnedFirstPage()
          return
        }
        this.savePinnedPage(data, true)
      } catch (error) {
      } finally {
        if (version === this._conversationVersion && requestVersion === this._pinnedRequestVersion) {
          this._loadingMorePinnedConversations = false
          this.setData({ loadingPinnedConversations: false })
        }
      }
    },

    async loadFirstPage(showLoading = false){
      const version = this._conversationVersion
      const requestVersion = ++this._recentRequestVersion
      this._loadingFirstPage = true
      this._loadingMoreConversations = false
      if (this.data.loadingMoreConversations) this.setData({ loadingMoreConversations: false })
      if (showLoading) {
        this.setData({
          initialLoadingConversations: true,
          conversationLoadFailed: false
        })
      }

      try {
        const res = await listConversations({ pageSize: PAGE_SIZE, offset: 0, pinned: false })
        if (version !== this._conversationVersion || requestVersion !== this._recentRequestVersion) return
        this.saveConversationPage(res?.data || {}, false)
      } catch (error) {
        if (showLoading && version === this._conversationVersion && requestVersion === this._recentRequestVersion) {
          this.setData({ conversationLoadFailed: true })
        }
      } finally {
        if (version === this._conversationVersion && requestVersion === this._recentRequestVersion) {
          this._loadingFirstPage = false
          if (this.data.initialLoadingConversations) this.setData({ initialLoadingConversations: false })
        }
      }
    },

    initConversations(){
      if(!this.data.historyController) return
      const history = this.data.chatHistory || {}
      const pinnedHistory = this.data.pinnedChatHistory || {}
      if (!pinnedHistory.ownerKey) this.loadPinnedFirstPage()
      if (!history.ownerKey) this.loadFirstPage(true)
      if (history.ownerKey || pinnedHistory.ownerKey) this.checkConversationStatus()
    },

    async checkConversationStatus(){
      if (this._checkingConversationStatus) return
      const version = this._conversationVersion
      this._checkingConversationStatus = true
      try {
        const res = await getConversationsStatus()
        if (version !== this._conversationVersion) return
        const status = res?.data || {}
        const history = this.data.chatHistory || {}
        const pinnedHistory = this.data.pinnedChatHistory || {}
        const recentChanged = history.ownerKey
          && ((status.ownerKey || '') !== history.ownerKey
            || (status.latestModifiedAt || '') !== (history.latestModifiedAt || ''))
        const pinnedChanged = pinnedHistory.ownerKey
          && ((status.ownerKey || '') !== pinnedHistory.ownerKey
            || (status.latestModifiedAt || '') !== (pinnedHistory.latestModifiedAt || ''))
        await Promise.all([
          recentChanged ? this.loadFirstPage(false) : null,
          pinnedChanged ? this.loadPinnedFirstPage() : null
        ])
      } catch (error) {
      } finally {
        if (version === this._conversationVersion) this._checkingConversationStatus = false
      }
    },

    async loadMoreConversations(){
      if(this.data.searchQuery) return
      if(!this.data.historyController) {
        this.triggerEvent('loadmoreconversations')
        return
      }
      const history = this.data.chatHistory || {}
      if (this._loadingFirstPage || this._loadingMoreConversations || this.data.initialLoadingConversations || history.hasMore === false) return

      const version = this._conversationVersion
      const requestVersion = this._recentRequestVersion
      this._loadingMoreConversations = true
      this.setData({ loadingMoreConversations: true })
      try {
        const offset = typeof history.nextOffset === 'number' ? history.nextOffset : this.getCachedConversations().length
        const res = await listConversations({ pageSize: PAGE_SIZE, offset, pinned: false })
        if (version !== this._conversationVersion || requestVersion !== this._recentRequestVersion) return
        const data = res?.data || {}
        if (history.ownerKey && data.ownerKey && history.ownerKey !== data.ownerKey) {
          await this.loadFirstPage(false)
          return
        }
        this.saveConversationPage(data, true)
      } catch (error) {
      } finally {
        if (version === this._conversationVersion && requestVersion === this._recentRequestVersion) {
          this._loadingMoreConversations = false
          this.setData({ loadingMoreConversations: false })
        }
      }
    },

    refreshConversations(){
      const historyController = this.data.historyController
      if(historyController) {
        this._conversationVersion += 1
        this._loadingFirstPage = false
        this._checkingConversationStatus = false
        this._loadingMoreConversations = false
        this._loadingPinnedFirstPage = false
        this._loadingMorePinnedConversations = false
      }
      this._searchRequestVersion += 1
      this._searchConversations.cancel()
      this.setData({
        searchQuery: '',
        appliedSearchQuery: '',
        searchLoading: false,
        searchLoadFailed: false,
        loadingPinnedConversations: false,
        initialLoadingConversations: false,
        loadingMoreConversations: false,
        conversationLoadFailed: false
      }, () => {
        this.setSearchFeaturesVisible(true)
        this.setSearchChatTopPadding(false)
        if(!historyController) {
          this.triggerEvent('refreshconversations')
          return
        }
        this.loadFirstPage(!this.getCachedConversations().length && !this.getCachedPinnedConversations().length)
        this.loadPinnedFirstPage()
      })
    },

    openConversationActions(e){
      const conversationId = e.currentTarget.dataset.id
      if(!conversationId) return

      const conversation = this.getConversation(conversationId)
      const options = this.data.conversationActions.map((item) => (
        item.value === 'pin'
          ? { ...item, label: conversation?.pinnedAt ? t(this.properties.language, 'chat.unpin') : t(this.properties.language, 'chat.pin') }
          : item
      ))
      const index = e.currentTarget.dataset.index
      const selector = `#conversation-${index}`
      this.setData({ activeConversationId: conversationId }, () => {
        this.createSelectorQuery()
          .select(selector)
          .boundingClientRect((rect) => {
            if (!rect) {
              this.setData({ activeConversationId: '' })
              return
            }
            this.triggerEvent('openconversationactions', {
              conversationId,
              options,
              rect
            }, {})
          })
          .exec()
      })
    },

    async executeSearch(value = ''){
      if (value !== this.data.searchQuery) return
      const keyword = String(value || '').trim()
      const requestVersion = this._searchRequestVersion
      if (!keyword) {
        this.setData({
          appliedSearchQuery: '',
          searchLoading: false,
          searchLoadFailed: false
        })
        this.syncRecentConversations(this.getCachedConversations(), true)
        return
      }

      this.setData({
        appliedSearchQuery: keyword,
        recentConversations: [],
        searchLoading: true,
        searchLoadFailed: false
      })
      try {
        const res = await listConversations({ pageSize: PAGE_SIZE, offset: 0, keyword })
        if (requestVersion !== this._searchRequestVersion || value !== this.data.searchQuery) return
        const data = res?.data || {}
        this.setData({
          recentConversations: filterVisibleConversations(data.conversations),
          searchLoading: false,
          searchLoadFailed: false
        })
      } catch (error) {
        if (requestVersion !== this._searchRequestVersion || value !== this.data.searchQuery) return
        this.setData({
          recentConversations: [],
          searchLoading: false,
          searchLoadFailed: true
        })
      }
    },

    selectConversation(e){
      const conversationId = e.currentTarget.dataset.id
      if(!conversationId) return
      this.triggerEvent('selectconversation', { conversationId }, {})
    },

    async pinConversation(conversationId){
      if(!conversationId) return
      const current = this.getConversation(conversationId)
      if(!current) return
      const pinned = !current.pinnedAt
      try {
        const res = await updateConversationPin({ conversationId, pinned })
        const conversation = res?.data?.conversation
        if(!conversation) throw new Error(t(this.properties.language, pinned ? 'sidebar.pinFailed' : 'sidebar.unpinFailed'))
        this.replaceConversationInViews(conversationId, conversation)
        this.refreshConversations()
      } catch (error) {
        wx.showToast({ title: error?.message || t(this.properties.language, pinned ? 'sidebar.pinFailed' : 'sidebar.unpinFailed'), icon: 'none' })
      }
    },

    async renameConversation(conversationId, title){
      if(!conversationId || !title) return
      try {
        const res = await renameConversationRequest({ conversationId, title })
        const conversation = res?.data?.conversation
        if(!conversation) throw new Error(t(this.properties.language, 'sidebar.renameFailed'))
        this.replaceConversationInViews(conversationId, conversation)
        this.triggerEvent('conversationrenamed', { conversationId, title: conversation.title })
      } catch (error) {
        wx.showToast({ title: error?.message || t(this.properties.language, 'sidebar.renameFailed'), icon: 'none' })
      }
    },

    async deleteConversation(conversationId){
      if(!conversationId) return
      try {
        await deleteConversationRequest({ conversationId })
        this.removeConversationFromViews(conversationId)
        this.triggerEvent('conversationdeleted', { conversationId })
      } catch (error) {
        wx.showToast({ title: error?.message || t(this.properties.language, 'sidebar.deleteFailed'), icon: 'none' })
      }
    },

    async archiveConversation(conversationId){
      if(!conversationId) return
      try {
        await archiveConversationRequest({ conversationId })
        this.removeConversationFromViews(conversationId)
        this.triggerEvent('conversationarchived', { conversationId })
      } catch (error) {
        wx.showToast({ title: error?.message || t(this.properties.language, 'sidebar.archiveFailed'), icon: 'none' })
      }
    },

    openFeature(e){
      this.triggerEvent('selectfeature', { feature: e.currentTarget.dataset.feature })
      this.triggerEvent('requestclose')
    },

    startNewConversation(){
      const shouldReset = this.data.currentFeature === HOME_FEATURES.CHAT
      this.triggerEvent('selectfeature', { feature: HOME_FEATURES.CHAT })
      if(shouldReset){
        eventBus.emit(CHAT_SESSION_RESET, { reason: 'new-chat', reloadHistory: false })
      }
      this.triggerEvent('requestclose')
    },

    closeConversationActions(){
      this.setData({ activeConversationId: '' })
    },

    closePage(){
      this.triggerEvent('requestclose')
    }
  }
})
