const { bindPageTheme, unbindPageTheme, syncThemeNavigation } = require('../../static_utils/themeBinding')
// pages/leftpage/index.js
const { shared, timing, runOnJS } = wx.worklet
import { createStoreBindings } from 'mobx-miniprogram-bindings'
import { store } from '../../store/index'
import { triggerHaptic } from '../../static_utils/haptic'
import { getConversationMessages } from '../../request/chatStream'
import { chatRuntime } from '../../request/chatRuntime'
import eventBus, { CHAT_SESSION_RESET } from '../../static_utils/eventBus'
import { DRAWER_WIDTH_RATIO, drawerCardStyle } from './router'
const { normalizeHistoryMessage } = require('../../static_utils/chatHistoryMessages')
const { normalizeHomeFeature } = require('../../static_utils/homeFeature')
const { messages, t } = require('../../static_utils/i18n/index')
const app = getApp()

const GestureState = {
  POSSIBLE: 0,
  BEGIN: 1,
  ACTIVE: 2,
  END: 3,
  CANCELLED: 4,
}

function clamp(v, lower, upper) {
  'worklet'
  if (v < lower) return lower
  if (v > upper) return upper
  return v
}

function conversationDialog(language, action = '') {
  const base = {
  title: '',
  message: '',
  inputMode: false,
  inputValue: '',
  danger: false,
  confirmText: t(language, 'common.confirm'),
  centered: true,
  messageAlign: 'center',
  mutedText: false,
  confirmTone: ''
  }
  const dialogs = {
    archive: {
    ...base,
    title: t(language, 'sidebar.archiveChat'),
    message: t(language, 'sidebar.archivePrompt'),
    confirmText: t(language, 'chat.archive'),
    centered: false,
    messageAlign: 'left',
    mutedText: true,
    confirmTone: 'danger'
  },
  rename: {
    ...base,
    title: t(language, 'sidebar.renameChat'),
    confirmText: t(language, 'common.save'),
    inputMode: true
  },
  delete: {
    ...base,
    title: t(language, 'sidebar.deleteChat'),
    message: t(language, 'sidebar.deletePrompt'),
    danger: true,
    confirmText: t(language, 'common.delete'),
    centered: false,
    messageAlign: 'left',
    mutedText: true,
    confirmTone: 'danger'
    }
  }
  return dialogs[action] || base
}

const CONVERSATION_ACTION_METHODS = {
  archive: 'archiveConversation',
  rename: 'renameConversation',
  delete: 'deleteConversation'
}

const ANCHORED_CONVERSATION_DIALOGS = new Set(['archive', 'delete'])

Page({

  /**
   * 页面的初始数据
   */
  data: {
    conversationActions: [],
    conversationPreview: [],
    conversationPreviewLoading: false,
    conversationPreviewFailed: false,
    currentFeature: 'chat',
    temporaryMode: false,
    conversationDialog: conversationDialog('中文')
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    bindPageTheme(this)
    this.setData({
      currentFeature: normalizeHomeFeature(options?.feature),
      temporaryMode: options?.temporaryMode === 'true'
    })
    this.storeBindings = createStoreBindings(this, {
      store, 
      fields: {
        settings:'settings',
        applicationSettings:'applicationSettings',
        i18n:(state) => messages(state.applicationSettings?.language)
      },
      actions: [],
    })
    this.storeBindings.updateStoreBindings()
    wx.nextTick(()=>{
      triggerHaptic(this.data.applicationSettings?.hapticFeedback, 'light')
    })

    this.widthActual = shared(app.globalData.su_system.screenWidth * DRAWER_WIDTH_RATIO)

    this.leftActual = shared(app.globalData.su_system.screenWidth * 0.5)

    this.customRouteContext = wx.router.getRouteContext(this) || {};
    this.eventChannel = this.getOpenerEventChannel()
    this._resetConversationPreviewHandler = () => {
      this.selectComponent('#conversationActions')?.close('api', true)
      this.clearConversationActionContext()
    }
    eventBus.on(CHAT_SESSION_RESET, this._resetConversationPreviewHandler)
  },

  shouldHorAccept(){
    'worklet';
    return wx.drawerRouteVisible.value && this.customRouteContext.primaryAnimationStatus.value === 3
  },
  shouldHorResponse(){
    'worklet';     
    return true
  },
  onSwipeBack(evt){
    'worklet';
    if (evt.state === GestureState.BEGIN) {
        return;
    } else if (evt.state === GestureState.ACTIVE) {
        const delta = evt.deltaX  ;

        this.lrhandleDragUpdate(delta);
    } else if (evt.state === GestureState.END) {
        const velocity = evt.velocityX / this.widthActual.value;
        this.lrhandleDragEnd(velocity);
    } else if (evt.state === GestureState.CANCELLED) {
        this.pageNavFun(true, 250);
    }
  },

  lrhandleDragUpdate(delta) {
      'worklet';
      const newVal = wx.pageTrans.value + delta
      wx.pageTrans.value = clamp(newVal, 0.0, this.widthActual.value);
      wx.leftTrans.value = wx.pageTrans.value / this.widthActual.value * this.leftActual.value
      wx.leftOp.value = wx.leftTrans.value / this.leftActual.value
  },

  lrhandleDragEnd(velocity) {
      'worklet';
      const durationTime = 250 * (1 - wx.pageTrans.value / this.widthActual.value)
      let animateForward = false;
      if (Math.abs(velocity) >= 1.0) {
          animateForward = velocity >= 0;
      } else {
          animateForward = wx.pageTrans.value > (this.widthActual.value / 2);
      }

      if(animateForward){
        this.pageNavFun(true,durationTime)
      }else{
        runOnJS(this.closePage.bind(this))()
      }
  },

  closePage(){
    if(this._closing) return
    this._closing = true
    wx.navigateBack({ fail: () => {
      this._closing = false
      this.takeOverDrawer()
    } })
  },
  selectConversation(e){
    const conversationId = e.detail && e.detail.conversationId
    if(!conversationId) return
    if(this.eventChannel && this.eventChannel.emit){
      this.eventChannel.emit('selectConversation', { conversationId })
    }
    this.closePage()
  },
  openStorageCategory(e) {
    const category = e?.detail?.category
    if (!['image', 'document'].includes(category)) return
    this.eventChannel?.emit('openStorageCategory', { category })
  },
  selectFeature(e){
    const feature = normalizeHomeFeature(e?.detail?.feature)
    this.setData({ currentFeature: feature })
    if(this.eventChannel && this.eventChannel.emit){
      this.eventChannel.emit('selectFeature', { feature, ...(e?.detail?.modeId ? { modeId: e.detail.modeId } : {}) })
    }
  },
  refreshConversations(){
    if(this.eventChannel?.emit) this.eventChannel.emit('refreshConversations')
  },
  loadMoreConversations(){
    if(this.eventChannel?.emit) this.eventChannel.emit('loadMoreConversations')
  },
  loadMorePinnedConversations(){
    if(this.eventChannel?.emit) this.eventChannel.emit('loadMorePinnedConversations')
  },
  openConversationActions(e){
    const { conversationId, options, rect } = e.detail || {}
    if(!conversationId || !rect || this._closing || this._unloaded) return
    const conversationActions = (options || []).map(item => ({ ...item }))
    const cached = store.getChatMessageCacheEntry(conversationId)
    this._activeConversationId = conversationId
    this._activeConversationRect = rect
    this._pendingConversationAction = ''
    triggerHaptic(this.data.applicationSettings?.hapticFeedback, 'heavy')
    const version = (this._conversationPreviewVersion || 0) + 1
    this._conversationPreviewVersion = version
    const accountVersion = chatRuntime.epoch
    this.setData({
      conversationActions,
      conversationPreview: cached ? cached.chats.filter(message => message?.role === 'user' || message?.role === 'assistant').slice(0, 5).reverse().map(message =>
        normalizeHistoryMessage(message, this.data.applicationSettings?.language)).filter(Boolean) : [],
      conversationPreviewLoading: !cached,
      conversationPreviewFailed: false
    }, () => {
      if(this._unloaded || this._closing || version !== this._conversationPreviewVersion || accountVersion !== chatRuntime.epoch) return
      this.selectComponent('#conversationActions').open(rect)
    })
    if(!cached) this.loadConversationPreview(conversationId)
  },
  async loadConversationPreview(conversationId){
    const version = this._conversationPreviewVersion
    const accountVersion = chatRuntime.epoch
    const valid = () => !this._unloaded && !this._closing
      && version === this._conversationPreviewVersion && accountVersion === chatRuntime.epoch
      && conversationId === this._activeConversationId
    try {
      const res = await getConversationMessages({ conversationId, limit: 5 })
      if(!valid()) return
      chatRuntime.acceptOwner(res?.data?.ownerKey)
      const conversationPreview = (res?.data?.messages || []).slice(-5).map(message =>
        normalizeHistoryMessage(message, this.data.applicationSettings?.language)).filter(Boolean)
      this.setData({ conversationPreview, conversationPreviewLoading: false })
    } catch(error) {
      if(valid()) this.setData({ conversationPreviewLoading: false, conversationPreviewFailed: true })
    }
  },
  openConversationPreview(){
    const conversationId = this._activeConversationId
    if(!conversationId) return
    this.selectComponent('#conversationActions').close('api', true)
    this.selectConversation({ detail: { conversationId } })
  },
  preventPreviewScroll(){
  },
  closeConversationActions(){
    this._conversationPreviewVersion = (this._conversationPreviewVersion || 0) + 1
    const leftCenter = this.selectComponent('#leftCenter')
    if(leftCenter) leftCenter.closeConversationActions()
  },
  changeConversationAction(e){
    const action = e?.currentTarget?.dataset?.value
    if(!action || !this._activeConversationId) return
    const leftCenter = this.selectComponent('#leftCenter')
    if(!leftCenter) return
    if(action === 'pin') {
      leftCenter.pinConversation(this._activeConversationId)
      this.selectComponent('#conversationActions').close()
      return
    }

    const dialogConfig = conversationDialog(this.data.applicationSettings?.language, action)
    if(!dialogConfig) return
    const conversation = leftCenter.getConversation(this._activeConversationId)
    if(!conversation) return
    this._pendingConversationAction = action
    this.setData({
      conversationDialog: action === 'rename'
        ? { ...dialogConfig, inputValue: conversation.title || '' }
        : dialogConfig
    })
    this.selectComponent('#conversationActions').close()
  },
  confirmConversationAction(e){
    const leftCenter = this.selectComponent('#leftCenter')
    const action = this._pendingConversationAction
    const method = CONVERSATION_ACTION_METHODS[action]
    if(!leftCenter || !this._activeConversationId || typeof leftCenter[method] !== 'function') return
    const args = action === 'rename'
      ? [this._activeConversationId, e?.detail?.value]
      : [this._activeConversationId]
    leftCenter[method](...args)
    this.clearConversationActionContext()
  },
  conversationActionsHidden(){
    const action = this._pendingConversationAction
    if(!CONVERSATION_ACTION_METHODS[action]) {
      this.clearConversationActionContext()
      return
    }
    const dialog = this.selectComponent('#conversationDialog')
    if(!dialog) {
      this.clearConversationActionContext()
      return
    }
    dialog.show(ANCHORED_CONVERSATION_DIALOGS.has(action) ? this._activeConversationRect : undefined)
  },
  conversationDialogClosed(){
    this.clearConversationActionContext()
  },
  clearConversationActionContext(){
    this._conversationPreviewVersion = (this._conversationPreviewVersion || 0) + 1
    this._pendingConversationAction = ''
    this._activeConversationId = ''
    this._activeConversationRect = null
    this.setData({ conversationPreview: [], conversationPreviewLoading: false, conversationPreviewFailed: false })
  },
  conversationRenamed(e){
    if(this.eventChannel?.emit) this.eventChannel.emit('conversationRenamed', e.detail)
  },
  conversationDeleted(e){
    if(this.eventChannel?.emit) this.eventChannel.emit('conversationDeleted', e.detail)
  },
  conversationArchived(e){
    if(this.eventChannel?.emit) this.eventChannel.emit('conversationArchived', e.detail)
  },
  pageNavFun(animateForward,durationTime){
    'worklet'
    wx.pageTrans.value = timing(animateForward ? this.widthActual.value : 0 ,{duration:durationTime})

   
    wx.leftOp.value = timing(animateForward ? 1 : 0,{duration:durationTime})
    wx.leftTrans.value = timing(animateForward ? this.leftActual.value : 0 ,{duration:durationTime})
  },
  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {
    const screenWidth = app.globalData.su_system.screenWidth
    this.applyAnimatedStyle('.drawer-page-background', () => {
      'worklet'
      const card = drawerCardStyle(wx.pageTrans.value, screenWidth)
      return {
        transform: card.transform,
        borderRadius: card.borderRadius,
        borderWidth: card.borderWidth,
        opacity: wx.drawerRouteVisible.value ? 1 : 0
      }
    }, { flush: 'sync' })
    this.applyAnimatedStyle('.drawer-viewport', () => {
      'worklet'
      return { width: `${wx.pageTrans.value}px` }
    }, { flush: 'sync' })
    this.applyAnimatedStyle('.drawer-close-area', () => {
      'worklet'
      const card = drawerCardStyle(wx.pageTrans.value, screenWidth)
      // 显式列出字段，避免跨 Worklet 的对象展开停留在首帧。
      return {
        transform: card.transform,
        borderRadius: card.borderRadius,
        borderWidth: card.borderWidth,
        opacity: wx.drawerRouteVisible.value ? 1 : 0
      }
    }, { flush: 'sync' })
    this.applyAnimatedStyle('.drawer-close-hitbox', () => {
      'worklet'
      return { width: `${Math.max(0, screenWidth - wx.pageTrans.value)}px` }
    }, { flush: 'sync' })
    this.applyAnimatedStyle('.leftview', () => {
      'worklet'
      return {
        transform: `translateX(${wx.leftTrans.value}px)`,
        opacity: wx.drawerRouteVisible.value ? wx.leftOp.value : 0
      }
    }, { flush: 'sync' }, () => {
      this._drawerStyleReady = true
      this.takeOverDrawer()
    })
  },

  drawerContentReady() {
    this._drawerContentReady = true
    this.takeOverDrawer()
  },

  takeOverDrawer() {
    if(this._unloaded || this._closing || !this._drawerContentReady || !this._drawerStyleReady) return
    if(this.customRouteContext.primaryAnimationStatus.value === 2) return
    // Both pages consume this flag synchronously; only one list paints at a time.
    wx.drawerRouteVisible.value = true
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    syncThemeNavigation(this)

  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    this._unloaded = true
    eventBus.off(CHAT_SESSION_RESET, this._resetConversationPreviewHandler)
    unbindPageTheme(this)

    triggerHaptic(this.data.applicationSettings?.hapticFeedback, 'light')
    
    wx.pageTrans.value = 0
    wx.leftTrans.value = 0
    wx.leftOp.value = 0
    wx.drawerRouteVisible.value = false

    this.storeBindings.destroyStoreBindings()

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {

  }
})
