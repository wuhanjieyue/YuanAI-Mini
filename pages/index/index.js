const { bindPageTheme, unbindPageTheme, syncThemeNavigation } = require('../../static_utils/themeBinding')
// pages/index/index.js
import { createStoreBindings } from 'mobx-miniprogram-bindings'
import { store } from '../../store/index'
import routeBuilder from '../leftpage/router'
import upRouterBuilder from '../../static_router/upPageRouter'
import settingRouterBuilder from '../../static_router/settingRouter'
import tryItRouterBuilder, { TRY_IT_ROUTE_TYPE } from '../../static_router/tryItRouter'
import appInit from '../../static_utils/appInit'
import initShareValue from './initShareValue'
import { createConversationShare, importConversationShare, updateConversationPin, archiveConversation, deleteConversation } from '../../request/chatStream'

const {
  DEFAULT_POINT_COLOR,
  getAccentStyle
} = require('../../static_utils/accentColor')
const {
  HOME_FEATURES,
  normalizeHomeFeature
} = require('../../static_utils/homeFeature')
const { CHAT_MODE_IDS } = require('../../static_utils/chatModes')
const { t } = require('../../static_utils/i18n/index')
const { shared, timing, runOnJS } = wx.worklet

const GestureState = {
  BEGIN: 1,
  ACTIVE: 2,
  END: 3,
  CANCELLED: 4,
}

const HORIZONTAL_INTENT_RATIO = 1.5
const FAST_SWIPE_MIN_PROGRESS = 0.12

function clamp(v, lower, upper) {
  'worklet'
  if (v < lower) return lower
  if (v > upper) return upper
  return v
}

const app = getApp()
const DEFAULT_ACCENT_STYLE = getAccentStyle(DEFAULT_POINT_COLOR)

Page({
  data: {
    currentFeature: HOME_FEATURES.CHAT,
    storageCategory: 'all',
    storageNavigationId: 0,
    temporaryMode: false,
    shareLoading: false,
    archiveLoading: false,
    temporaryAccentStyle: DEFAULT_ACCENT_STYLE,
  },

  onLoad(options = {}) {
    bindPageTheme(this)
    appInit()
    initShareValue(this)

    this.storeBindings = createStoreBindings(this, {
      store,
      fields: {
        effectiveTheme: (state) => state.effectiveTheme,
        temporaryAccentStyle: (state) => getAccentStyle(DEFAULT_POINT_COLOR, state.effectiveTheme),
        accentStyle: (state) => getAccentStyle(state.applicationSettings?.pointColor, state.effectiveTheme),
        language: (state) => state.applicationSettings?.language || '中文'
      },
      actions: [],
    })

    this.initContainer()
    if (options.shareId && options.conversationId) {
      this._pendingShare = {
        shareId: options.shareId,
        conversationId: options.conversationId,
        turnId: options.turnId || ''
      }
    }
  },

  initContainer() {
    wx.pageTrans = shared(0)
    wx.pageScale = shared(1)
    wx.pageFilter = shared(0)
    wx.leftTrans = shared(0)
    wx.leftOp = shared(0)
    wx.drawerRouteVisible = shared(false)

    const screenWidth = app.globalData.su_system.screenWidth
    this.widthActual = shared(screenWidth * 0.7)
    this.leftActual = shared(screenWidth * 0.5)
    this.reasoningSliderOpen = shared(false)
    this.assetActionsOpen = shared(false)

    this.applyAnimatedStyle('.rightview', () => {
      'worklet'
      return {
        transform: `translateX(${wx.pageTrans.value}px) scale(${wx.pageScale.value})`,
        filter: `blur(${wx.pageFilter.value}px)`
      }
    }, { flush: 'sync' })

    this.applyAnimatedStyle('.leftview', () => {
      'worklet'
      return {
        zIndex: wx.leftOp.value > 0 ? 199 : 0,
        transform: `translateX(${wx.leftTrans.value}px)`,
        opacity: wx.drawerRouteVisible.value ? 0 : wx.leftOp.value,
        pointerEvents: wx.drawerRouteVisible.value || wx.leftOp.value === 0 ? 'none' : 'auto'
      }
    }, { flush: 'sync' })

    routeBuilder()
    upRouterBuilder()
    settingRouterBuilder()
    tryItRouterBuilder()
  },

  onShow() {
    syncThemeNavigation(this)
    this._openingLeftPage = false
    if(wx.pageTrans && wx.pageTrans.value > 0 && !wx.drawerRouteVisible.value) this.pageNavFun(false, 250)
    if(this._openTryItOnShow) {
      this._openTryItOnShow = false
      wx.nextTick(() => this.openCreateTryIt())
    }
    if(this._pendingShare && (!this._shareAwaitingLogin || store.user?.login)) wx.nextTick(() => this.resumeSharedConversation())
    if(this._pendingAssetChat) {
      const action = this._pendingAssetChat
      this._pendingAssetChat = null
      wx.nextTick(() => this.startAssetChat({ detail: action }))
    }
    if(this._pendingCreationTurn) wx.nextTick(() => this.finishCreationTurn())
    if(this._pendingSkillTrial) wx.nextTick(() => this.finishSkillTrial())
  },

  finishSkillTrial() {
    const action = this._pendingSkillTrial
    this._pendingSkillTrial = null
    if (!action || action.epoch !== store.assetCacheEpoch) return
    this.setData({ currentFeature: HOME_FEATURES.CHAT }, () => {
      wx.nextTick(() => {
        const chatView = this.getChatView()
        if (!chatView || action.epoch !== store.assetCacheEpoch) return
        chatView.resetChatSession()
        wx.nextTick(() => {
          if (action.epoch === store.assetCacheEpoch && this.getChatView() === chatView) action.kind === 'mcp' ? chatView.prefillMcp(action.item) : chatView.prefillSkill(action.item)
        })
      })
    })
  },

  startAssetChat(e) {
    const { epoch, files } = e.detail
    if (epoch !== store.assetCacheEpoch) return
    this.setData({ currentFeature: HOME_FEATURES.CHAT }, () => {
      wx.nextTick(() => {
        const chatView = this.getChatView()
        if (!chatView || epoch !== store.assetCacheEpoch) return
        chatView.resetChatSession()
        wx.nextTick(() => {
          if (epoch !== store.assetCacheEpoch || this.getChatView() !== chatView) return
          chatView.addSelectedFiles(files)
        })
      })
    })
  },

  finishCreationTurn() {
    const action = this._pendingCreationTurn
    if(!action) return
    this._pendingCreationTurn = null
    this.setData({ currentFeature:HOME_FEATURES.CHAT }, () => {
      wx.nextTick(() => {
        const chatView = this.getChatView()
        if(!chatView) return
        chatView.resetChatSession()
        wx.nextTick(() => chatView.sendCreationPrompt(action.prompt, action.files || []))
      })
    })
  },

  async resumeSharedConversation() {
    if (!this._pendingShare || this._importingShare) return
    this._importingShare = true
    try {
      const share = this._pendingShare
      const response = await importConversationShare(share)
      this._pendingShare = null
      this._shareAwaitingLogin = false
      this.loadConversation(response.data.conversationId)
      this.getLeftCenter()?.refreshConversations?.()
    } catch (error) {
      if (error.data?.errorCode === 'SHARE_LOGIN_REQUIRED') {
        this._shareAwaitingLogin = true
        this.openLoginPrompt()
      } else {
        this._pendingShare = null
        this._shareAwaitingLogin = false
        this.switchHomeFeature(HOME_FEATURES.CHAT)
      }
    } finally {
      this._importingShare = false
    }
  },

  onUnload() {
    unbindPageTheme(this)
    if(this.storeBindings) this.storeBindings.destroyStoreBindings()
  },

  getChatView() {
    return this.selectComponent('#chatView')
  },

  getLeftCenter() {
    return this.selectComponent('#leftCenter')
  },

  handleModeChange(e) {
    const temporaryMode = e?.detail?.modeId === CHAT_MODE_IDS.TEMPORARY
    if(temporaryMode === this.data.temporaryMode) return
    this.setData({ temporaryMode })
  },

  switchHomeFeature(value) {
    const requested = typeof value === 'string'
      ? value
      : (value?.detail?.feature || value?.feature)
    const currentFeature = normalizeHomeFeature(requested)
    if(currentFeature === this.data.currentFeature) return

    this.setData({ currentFeature })
  },

  loadConversation(value) {
    const conversationId = typeof value === 'string'
      ? value
      : (value?.detail?.conversationId || value?.conversationId)
    if(!conversationId) return

    this.setData({ currentFeature:HOME_FEATURES.CHAT }, () => {
      const chatView = this.getChatView()
      if(chatView) chatView.loadConversation(conversationId)
    })
  },

  refreshBranchConversations() {
    this.getLeftCenter()?.refreshConversations()
  },

  openFilePage(e) {
    const detail = e?.detail || e || {}
    const epoch = store.assetCacheEpoch
    wx.navigateTo({
      url: `/pages/filePage/index?feature=${encodeURIComponent(detail.feature || '')}&skillId=${encodeURIComponent(detail.skillId || '')}&thinking=${!!detail.thinking}&imging=${!!detail.imging}&searching=${!!detail.searching}&studying=${!!detail.studying}&action=${encodeURIComponent(detail.action || '')}`,
      routeType: 'upRouterBuilder',
      events: {
        selectFeature: (data) => {
          if (epoch !== store.assetCacheEpoch) return
          const chatView = this.getChatView()
          if (data.skill) chatView?.selectSkill(data.skill)
          else if(chatView && chatView.selectFeature) chatView.selectFeature(data.feature, data.tip)
          const input = detail.fromMention ? chatView?.selectComponent('#chatInput') : null
          if(input?.data.askText === '@') input.clearText()
        },
        addFile: (data) => {
          if (epoch !== store.assetCacheEpoch) return
          const chatView = this.getChatView()
          if(chatView && chatView.addSelectedFiles) chatView.addSelectedFiles(data.files)
        },
      }
    })
  },

  openSourcesPage(e){
    const citations = e.detail && e.detail.citations
    if(!Array.isArray(citations) || !citations.length) return
    wx.navigateTo({
      url:'/pages/sourcesPage/index',
      routeType:'upRouterBuilder',
      success:res => res.eventChannel.emit('showSources', { citations }),
      fail:error => {
        console.error('[sources] navigation failed', error)
        wx.showToast({ title:require('../../static_utils/i18n/index').t(this.data.language, 'common.loadFailed'), icon:'none' })
      }
    })
  },

  openReasoningPage(e) {
    const detail = e?.detail || {}
    const content = typeof detail.content === 'string' ? detail.content : ''
    const processTrace = Array.isArray(detail.processTrace) ? detail.processTrace : []
    if(!processTrace.length && !content.trim()) return
    const chatView = this.selectComponent('#chatView')
    if(detail.turnKey) chatView?.setProcessDetailVisible?.(true)

    wx.navigateTo({
      url: '/pages/reasoningPage/index',
      routeType: 'upRouterBuilder',
      fail: () => chatView?.setProcessDetailVisible?.(false),
      success: (res) => {
        res.eventChannel.emit('showReasoning', {
          content,
          durationText: typeof detail.durationText === 'string' ? detail.durationText : '',
          processTrace,
          processDurationMs:Number(detail.processDurationMs) || 0,
          status:detail.status || '',
          turnKey:detail.turnKey || '',
          stopped:detail.stopped === true
        })
      }
    })
  },

  openStorageCategory(e) {
    const category = (e?.detail || e)?.category
    if (!['image', 'document'].includes(category)) return
    this.setData({ currentFeature: HOME_FEATURES.LIBRARY, storageCategory: category, storageNavigationId: this.data.storageNavigationId + 1 })
    this.closeLeftPage()
  },

  openConversationFiles(e) {
    const detail = e.detail || {}
    wx.navigateTo({
      url: '/pages/conversationFiles/index',
      events: { chatAsset: action => { if (action.epoch === store.assetCacheEpoch) this._pendingAssetChat = action } },
      routeType: 'settingRouterBuilder',
      routeOptions: { stacked:true },
      success: res => res.eventChannel.emit('showConversationFiles', detail),
      fail: () => wx.showToast({ title:t(this.data.language, 'common.loadFailed'), icon:'none' })
    })
  },

  async handleConversationAction(e) {
    const { id, conversationId } = e.detail || {}
    if (!conversationId) return
    const leftCenter = this.getLeftCenter()
    const chatView = this.getChatView()
    if (id === 'pin') {
      const pinned = !chatView?.data.currentConversationPinned
      try {
        const result = await updateConversationPin({ conversationId, pinned })
        const conversation = result?.data?.conversation
        if (!conversation) throw new Error(t(this.data.language, pinned ? 'sidebar.pinFailed' : 'sidebar.unpinFailed'))
        leftCenter?.replaceConversationInViews(conversationId, conversation)
        leftCenter?.refreshConversations()
        if (chatView?.data.currentConversationId === conversationId) chatView.setData({ currentConversationPinned:!!conversation.pinnedAt })
      } catch (error) {
        wx.showToast({ title:error?.message || t(this.data.language, pinned ? 'sidebar.pinFailed' : 'sidebar.unpinFailed'), icon:'none' })
      }
      return
    }
    if (id !== 'archive' || this.data.archiveLoading) return
    this.setData({ archiveLoading:true })
    try {
      await archiveConversation({ conversationId })
      leftCenter?.removeConversationFromViews(conversationId)
      if (chatView?.data.currentConversationId === conversationId) {
        chatView.closeFeaturePopup()
        chatView.resetChatSession()
      }
    } catch (error) {
      wx.showToast({ title:error?.message || t(this.data.language, 'sidebar.archiveFailed'), icon:'none' })
    } finally {
      this.setData({ archiveLoading:false })
    }
  },

  deleteCurrentConversation(e) {
    const conversationId = e.detail?.conversationId
    if (!conversationId) return
    deleteConversation({ conversationId }).then(() => {
      this.getLeftCenter()?.removeConversationFromViews(conversationId)
    }).catch(error => {
      wx.showToast({ title:error?.message || t(this.data.language, 'sidebar.deleteFailed'), icon:'none' })
    })
  },

  openTaskEditor(e) {
    wx.navigateTo({
      url:'/pages/taskEdit/index',
      routeType:'settingRouterBuilder',
      events:{
        taskUpdated: update => this.selectComponent('#tasksView')?.updateTask(update),
        openTaskChat: data => this.loadConversation(data)
      },
      success: res => res.eventChannel.emit('editTask', e.detail),
      fail: () => wx.showToast({ title:t(this.data.language, 'common.loadFailed'), icon:'none' })
    })
  },

  openSet() {
    wx.navigateTo({
      url: '/pages/setting/index',
      routeType: 'settingRouterBuilder',
      events: {
        selectFeature: (data) => this.switchHomeFeature(data && data.feature),
        openStorageCategory: (data) => this.openStorageCategory(data),
        archivedConversationChanged: ({ action, conversationId }) => {
          this.selectComponent('yb-left-center')?.refreshConversations()
          const chatView = this.selectComponent('#chatView')
          if (action === 'delete' && chatView?.data?.currentConversationId === conversationId) chatView.resetChatSession()
        }
      }
    })
  },

  startSkillTrial(e) {
    const item = e.detail?.item
    if (!item?.id || !item.exampleMessage) return
    this._pendingSkillTrial = { item, kind:e.detail?.kind || 'skill', epoch:store.assetCacheEpoch }
    this.finishSkillTrial()
  },

  openSkill(e) {
    const id = e.detail?.id
    const kind = e.detail?.kind === 'mcp' ? 'mcp' : 'skill'
    if (this._openingSkill || !id) return
    const epoch = store.assetCacheEpoch
    this._openingSkill = true
    wx.navigateTo({
      url: `/mdPackage/pages/skillDetail/index?id=${encodeURIComponent(id)}${kind === 'mcp' ? '&kind=mcp' : ''}`,
      routeType: 'upRouterBuilder',
      events: {
        trySkill: item => { if (epoch === store.assetCacheEpoch) this._pendingSkillTrial = { item, kind, epoch } },
        skillRemoved: item => { if (epoch === store.assetCacheEpoch) this.selectComponent('#pluginsView')?.updateSkill(item) },
        cancelSkillTrial: () => { this._pendingSkillTrial = null }
      },
      fail: () => wx.showToast({ title: t(this.data.language, 'common.loadFailed'), icon: 'none' }),
      complete: () => { this._openingSkill = false }
    })
  },

  openCreation(e) {
    if (this._openingCreation || !e.detail?.item) return
    this._openingCreation = true
    wx.navigateTo({
      url: '/pages/createDetail/index',
      routeType: 'upRouterBuilder',
      events: {
        tryCreationPrompt: ({ prompt, files }) => { this._pendingCreationTurn = { prompt, files } }
      },
      success: res => res.eventChannel.emit('showCreation', e.detail.item),
      fail: () => wx.showToast({ title: require('../../static_utils/i18n/index').t(this.data.language, 'common.loadFailed'), icon: 'none' }),
      complete: () => { this._openingCreation = false }
    })
  },

  openCreateTryIt() {
    if (store.createIntroSeen || this._openingCreateIntro) return
    const pages = getCurrentPages()
    if(pages[pages.length - 1] !== this) {
      this._openTryItOnShow = true
      return
    }
    this._openingCreateIntro = true
    wx.navigateTo({
      url: '/pages/createTryIt/index',
      routeType: TRY_IT_ROUTE_TYPE,
      success: () => store.setCreateIntroSeen(),
      complete: () => { this._openingCreateIntro = false }
    })
  },

  openLoginPrompt() {
    if (this._openingLoginPrompt) return
    this._openingLoginPrompt = true
    wx.navigateTo({
      url: '/pages/loginPrompt/index',
      routeType: TRY_IT_ROUTE_TYPE,
      events: { loginSuccess: () => { this._shareAwaitingLogin = false } },
      fail: () => { this._pendingShare = null; this._shareAwaitingLogin = false },
      complete: () => { this._openingLoginPrompt = false }
    })
  },

  handleAssetActionsChange(e) {
    if (this.assetActionsOpen) this.assetActionsOpen.value = !!e.detail.open
  },

  goVoice() {
    wx.navigateTo({ url: '../voiceChat/index' })
  },

  shouldHorAccept() {
    'worklet'
    return !(this.reasoningSliderOpen.value || (this.assetActionsOpen && this.assetActionsOpen.value) || wx.homePressFlag.value || wx.homeContentShow.value === 1)
  },

  shouldHorResponse(evt) {
    'worklet'
    if(this.reasoningSliderOpen.value || (this.assetActionsOpen && this.assetActionsOpen.value) || wx.homePressFlag.value || wx.homeContentShow.value === 1) return false
    if(this.drawerGestureActive.value) return true
    return evt.deltaX > 0 && evt.deltaX >= Math.abs(evt.deltaY) * HORIZONTAL_INTENT_RATIO
  },

  handleReasoningSliderChange(e) {
    this.reasoningSliderOpen.value = !!(e.detail && e.detail.open)
  },

  onSwipeBack(evt) {
    'worklet'
    if (evt.state === GestureState.BEGIN) {
      this.drawerGestureActive.value = true
      this.lrhandleDragStart()
      return
    }
    if (evt.state === GestureState.ACTIVE) {
      this.lrhandleDragUpdate(evt.deltaX)
      return
    }
    if (evt.state === GestureState.END) {
      this.drawerGestureActive.value = false
      const velocity = evt.velocityX / this.widthActual.value
      this.lrhandleDragEnd(velocity)
      return
    }
    if (evt.state === GestureState.CANCELLED) {
      this.drawerGestureActive.value = false
      this.lrhandleDragEnd(0)
    }
  },

  setFoucs(focus) {
    const chatView = this.getChatView()
    if(chatView && chatView.setFoucs) chatView.setFoucs(focus)
  },

  lrhandleDragStart() {
    'worklet'
    runOnJS(this.setFoucs.bind(this))(false)
  },

  lrhandleDragUpdate(delta) {
    'worklet'
    wx.pageTrans.value = clamp(wx.pageTrans.value + delta, 0, this.widthActual.value)
    wx.pageScale.value = 1 - wx.pageTrans.value / this.widthActual.value / 10
    wx.pageFilter.value = clamp(50 * (wx.pageTrans.value / this.widthActual.value / 10), 0, 3)
    wx.leftTrans.value = wx.pageTrans.value * 5 / 7
    wx.leftOp.value = wx.leftTrans.value / this.leftActual.value
  },

  lrhandleDragEnd(velocity) {
    'worklet'
    const progress = wx.pageTrans.value / this.widthActual.value
    const duration = 250 * (1 - progress)
    const animateForward = velocity <= -1
      ? false
      : progress > 0.5 || (velocity >= 1 && progress >= FAST_SWIPE_MIN_PROGRESS)
    this.pageNavFun(animateForward, duration)
    if(animateForward) runOnJS(this.dyNavigate.bind(this))()
  },

  openLeft() {
    if(this._openingLeftPage) return
    this.pageNavFun(true, 250)
    this.dyNavigate()
  },

  dyNavigate() {
    if(this._openingLeftPage) return
    this._openingLeftPage = true
    this.getLeftCenter()?.checkConversationStatus()
    this.setFoucs(false)
    wx.navigateTo({
      url: `/pages/leftpage/index?feature=${this.data.currentFeature}&temporaryMode=${this.data.temporaryMode}`,
      routeType: 'leftRoute',
      events: {
        selectConversation: (data) => this.loadConversation(data && data.conversationId),
        selectFeature: (data) => this.switchHomeFeature(data && data.feature),
        openStorageCategory: (data) => this.openStorageCategory(data),
        refreshConversations: () => this.getLeftCenter()?.refreshConversations(),
        loadMoreConversations: () => this.getLeftCenter()?.loadMoreConversations(),
        loadMorePinnedConversations: () => this.getLeftCenter()?.loadMorePinnedConversations(),
        conversationRenamed: (data) => {
          const chatView = this.selectComponent('#chatView')
          if(chatView?.data?.currentConversationId === data?.conversationId) {
            chatView.setData({ currentConversationTitle: data.title })
          }
        },
        conversationDeleted: (data) => {
          const chatView = this.selectComponent('#chatView')
          if(chatView?.data?.currentConversationId === data?.conversationId) chatView.resetChatSession()
        },
        conversationArchived: (data) => {
          const chatView = this.selectComponent('#chatView')
          if(chatView?.data?.currentConversationId === data?.conversationId) chatView.resetChatSession()
        }
      },
      fail: () => {
        this._openingLeftPage = false
        this.pageNavFun(false, 250)
      }
    })
  },

  closeLeftPage() {
    this.pageNavFun(false, 250)
  },

  pageNavFun(animateForward, duration) {
    'worklet'
    wx.pageTrans.value = timing(animateForward ? this.widthActual.value : 0, { duration })
    wx.pageScale.value = timing(animateForward ? 0.9 : 1, { duration })
    wx.pageFilter.value = timing(animateForward ? 3 : 0, { duration })
    wx.leftOp.value = timing(animateForward ? 1 : 0, { duration })
    wx.leftTrans.value = timing(animateForward ? this.leftActual.value : 0, { duration })
  },

  onShareAppMessage(options = {}) {
    const fallback = { title: '元AI', path: '/pages/index/index' }
    if (options.from !== 'button') return fallback
    const data = options.target?.dataset || {}
    if (!['conversation', 'turn'].includes(data.shareScope) || !data.conversationId || this.data.temporaryMode) return fallback
    if (this.data.shareLoading) return fallback
    const title = this.getChatView()?.data?.currentConversationTitle || fallback.title
    const base = { title, path: fallback.path }
    this.setData({ shareLoading: true })
    let timer
    const promise = Promise.race([
      createConversationShare({ conversationId: data.conversationId, scope: data.shareScope, turnId: data.turnId || '' })
        .then(response => ({ title: response.data.title || title,
          path: `/pages/index/index?shareId=${encodeURIComponent(response.data.shareId)}&conversationId=${encodeURIComponent(data.conversationId)}${data.turnId ? `&turnId=${encodeURIComponent(data.turnId)}` : ''}` })),
      new Promise(resolve => { timer = setTimeout(() => resolve(null), 2500) })
    ]).then(result => {
      if (result) {
        if (data.shareScope === 'conversation') this.getChatView()?.closeConversationSharePopup(data.conversationId)
        return result
      }
      wx.showToast({ title: '对话分享未就绪，请重试', icon: 'none' })
      return base
    }).catch(() => {
      wx.showToast({ title: '对话分享失败，请重试', icon: 'none' })
      return base
    }).finally(() => {
      clearTimeout(timer)
      this.setData({ shareLoading: false })
    })
    return { ...base, promise }
  }
})
