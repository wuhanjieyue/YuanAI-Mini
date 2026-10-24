const { layoutContent } = require('../../../static_utils/userContentLayout')
const { getThemeStyle } = require('../../../static_utils/theme')
const { normalizeHistoryMessage } = require('../../../static_utils/chatHistoryMessages')
// components/_self/yb-chat-view/index.js
import { createStoreBindings } from 'mobx-miniprogram-bindings'
import { store } from '../../../store/index'
import eventBus, { CHAT_SESSION_RESET, ASSET_LIST_INVALIDATED } from '../../../static_utils/eventBus'
import { formatFileSize, rpx2px } from '../../../static_utils/otherUtils'
import { triggerHaptic } from '../../../static_utils/haptic'
import { getConversationMessages, getConversationMessagesStatus, createConversationBranch } from '../../../request/chatStream'
import { chatRuntime } from '../../../request/chatRuntime'
import { dailyRecommendations } from '../../../request/dailyRecommendations'
import { deleteCloudFile, uploadCloudFiles } from '../../../request/request'
import { loadModelCatalog } from '../../../static_utils/appDataInit'
import initShareValue from './initShareValue'
const {
  DEFAULT_POINT_COLOR,
  getAccentTheme,
  getAccentStyle
} = require('../../../static_utils/accentColor')
const {
  canAccessPlan,
  normalizeModelCatalog,
  normalizeModeSelection,
  getSelectionView,
  getReasoningChoices,
  getReasoningIndex
} = require('../../../static_utils/modelCatalog')
const {
  CHAT_MODE_IDS,
  CHAT_MODE_OPTIONS,
  createSmartModePreferences,
  resolveSmartMode,
  rememberSmartMode
} = require('../../../static_utils/chatModes')
const { getChatFeatureMeta, getChatFeatureFromContentParts, getChatMessageLabel } = require('../../../static_utils/chatFeature')
const { formatProcessDuration, formatStoppedDuration, normalizeProcessTrace } = require('../../../static_utils/processTrace')
const { buildEphemeralMessages } = require('../../../static_utils/ephemeralMessages')
const { previewStorageFile, openStorageUpgrade } = require('../../../static_utils/filePreview')
const i18nBehavior = require('../../../static_utils/i18n/behavior')
const { t } = require('../../../static_utils/i18n/index')
const {
  PICKER_FILE_EXTENSIONS,
  buildMessageContentParts,
  createAttachmentPart,
  getAttachmentPresentation,
  getMessageAttachments,
  getFileExtension,
  normalizeSelectedFile,
  isSupportedChatAttachment
} = require('../../../static_utils/chatAttachment')

const { shared ,timing,sequence} = wx.worklet
const GUEST_UPLOAD_LIMIT_BYTES = 5 * 1024 * 1024

function withLockedEfforts(efforts = [], accessPlan, language = '中文') {
  return efforts.map((effort) => {
    const key = `reasoning.efforts.${effort.id}`
    const label = t(language, key)
    return Object.assign({}, effort, {
      label:label === key ? effort.label : label,
      locked:!canAccessPlan(accessPlan, effort.minPlan)
    })
  })
}

function withLockedModels(models = [], accessPlan, language = '中文') {
  return models.map((model) => Object.assign({}, model, {
    locked:!canAccessPlan(accessPlan, model.minPlan),
    efforts:withLockedEfforts(model.efforts, accessPlan, language)
  }))
}

function fillResponseFeatures(chats) {
  const userFeatures = new Map(chats.filter(item => item.role === 'user').map(item => [item.turnId, item.feature]))
  return chats.map(item => item.role === 'assistant' && !item.feature
    ? { ...item, feature:userFeatures.get(item.turnId) || '' }
    : item)
}

function withBranchPoint(chats, origin) {
  if (!origin?.conversationId || !origin?.turnId) return chats
  const index = chats.findIndex(item => item.role === 'assistant' && item.seq === origin.cutoffSeq)
  if (index < 0) return chats
  const result = chats.slice()
  result.splice(index, 0, { role:'branchPoint', origin })
  return result
}

const durationTime = 160
const initialCatalog = normalizeModelCatalog(store.modelCatalog)
const initialChatSelection = normalizeModeSelection(initialCatalog, CHAT_MODE_IDS.CHAT)
const initialWorkSelection = normalizeModeSelection(initialCatalog, CHAT_MODE_IDS.WORK, store.workModelSelection)
const initialChatView = getSelectionView(initialCatalog, initialChatSelection)
const initialWorkView = getSelectionView(initialCatalog, initialWorkSelection)
const initialReasoningChoices = getReasoningChoices(withLockedModels(
  initialCatalog.models.filter((model) => model.modes.includes(CHAT_MODE_IDS.CHAT)),
  initialCatalog.accessPlan
), initialChatSelection.modelId)

let userBigContentIndex = 0;
const THINK = "thinking"
const SEARCH = "searching"
const IMG = "imging"
const STUDY = "studying"
const DEFAULT_ACCENT_STYLE = getAccentStyle(DEFAULT_POINT_COLOR)
const DEFAULT_ACCENT_ACTION_COLOR = getAccentTheme(DEFAULT_POINT_COLOR).actionColor

function shouldShowTrendingSearch(data) {
  return data.modeId !== CHAT_MODE_IDS.WORK && data.recommendationItems?.length === 3 && data.suggest?.trendingSearch &&
    !data.chats.length && !data.sessionTurns.length && !data.streamStatus &&
    !data.historyInitialLoading && !data.validatingConversation &&
    !data.inputFocused && !data.hasInputValue
}

Component({
  behaviors: [i18nBehavior],
  properties: {
    shareLoading: { type: Boolean, value: false },
    archiveLoading: { type: Boolean, value: false }
  },

  /**
   * 页面的初始数据
   */
  data: {
    // 用户输入
    askText:'',
    inputFocused:false,
    hasInputValue:false,
    trendingSearchVisible:false,
    trendingSearchMounted:false,
    recommendationsRefreshing:false,
    leftIcon:'moreFun',

    //   流式组件ID
    sivId:"",
    restoreScrollTop:0,
    // 输入框是否获取焦点
    inputFocus:false,
    // ai模型标题
    modelCatalog:initialCatalog,
    accessPlan:initialCatalog.accessPlan,
    modelCatalogReady:!!initialChatSelection.effortId,
    workModelSelection:initialWorkSelection,
    workModels:withLockedModels(
      initialCatalog.models.filter((model) => model.modes.includes(CHAT_MODE_IDS.WORK)),
      initialCatalog.accessPlan
    ),
    workModelName:initialWorkView.modelName,
    workEffortLabel:initialWorkView.effortLabel,
    modeId:CHAT_MODE_IDS.CHAT,
    modeName:'聊天',
    modePopupWidthRpx:416,
    temporaryAccentStyle:DEFAULT_ACCENT_STYLE,
    temporaryAccentActionColor:DEFAULT_ACCENT_ACTION_COLOR,
    temporaryInfoMessage:t('中文', 'chat.temporaryPrivacy'),
    modeOptions:CHAT_MODE_OPTIONS,
    conversationActions:[
      { id:'share', name:'分享', icon:'icon-share' },
      { id:'pin', name:'置顶', icon:'icon-pin' },
      { id:'file', name:'文件', icon:'icon-file' },
      { id:'archive', name:'归档', icon:'icon-archive' },
      { id:'delete', name:'删除', icon:'icon-delete', tone:'danger' }
    ],
    moreOptions:[
      { id:'camera', name:'相机', icon:'icon-camera' },
      { id:'photo', name:'照片', icon:'icon-image' },
      { id:'file', name:'文件', icon:'icon-file' },
      { id:'plugin', name:'插件', icon:'icon-plugin' },
      { id:'smart', name:'深入思考', icon:'icon-gauge' }
    ],
    smartMode:!!initialChatSelection.effortId,
    reasoningModelId:initialChatSelection.modelId,
    reasoningEffortId:initialChatSelection.effortId,
    reasoningModelName:initialChatView.modelName,
    reasoningEffortLabel:initialChatView.effortLabel,
    reasoningEfforts:initialReasoningChoices.options,
    reasoningProgress:getReasoningIndex(initialReasoningChoices.options, initialChatSelection.modelId,
      initialChatSelection.effortId) / Math.max(1, initialReasoningChoices.options.length - 1),
    reasoningSliderOpen:false,
    reasoningSliderClosing:false,
    modelPickerOpen:false,
    pageHidden:false,
    currentConversationId:'',
    isScheduledTask:false,
    currentConversationTitle:'新对话',
    currentConversationPinned:false,
    branchOrigin:null,
    branchLoadingTurnId:'',
    messageHistoryCursor:null,
    messageHistoryHasMore:false,
    loadingOlderMessages:false,
    historyInitialLoading:false,
    validatingConversation:false,
    historyRenderToken:0,
    // 高级模式
    feature:'',
    selectedSkill:null,
    // 思考模式
    thinking:false,
    // 搜索模式
    searching:false,
    // 绘画模式
    imging:false,
    // 研究与学习模式
    studying:false,
    files:[],
    uploadNoticeText:'文件上传失败',
    deletedAssetNotice:false,
    chats:[],
    sessionTurns:[],

    streamStatus:false,
    // 长按用户对话
    contentBig:'',

  },

  observers: {
    'modeId, recommendationItems, suggest, chats, sessionTurns, streamStatus, historyInitialLoading, validatingConversation, inputFocused, hasInputValue'() {
      const visible = shouldShowTrendingSearch(this.data)
      if (visible) {
        if (!this.data.trendingSearchVisible || !this.data.trendingSearchMounted) {
          this.setData({ trendingSearchVisible:true, trendingSearchMounted:true })
        }
      } else if (this.data.trendingSearchVisible) {
        this.setData({ trendingSearchVisible:false })
      }
    },
    'chatHistory, pinnedChatHistory'() {
      const conversation = [...(this.data.chatHistory?.conversations || []),
        ...(this.data.pinnedChatHistory?.conversations || [])]
        .find(item => item.conversationId === this.data.currentConversationId)
      const pinned = !!conversation?.pinnedAt
      if(pinned !== this.data.currentConversationPinned) this.setData({ currentConversationPinned:pinned })
      if (conversation?.title && conversation.title !== this.data.currentConversationTitle) {
        this.setData({ currentConversationTitle: conversation.title })
      }
    },
    language(language) {
      const modeNames = { chat:t(language, 'home.chat'), work:t(language, 'chat.work'), temporary:t(language, 'chat.temporaryShort') }
      const withLabel = message => message.role === 'user'
        ? { ...message, featureLabel:getChatMessageLabel(message.contentParts, language) } : message
      this._sessionCompletedChats = (this._sessionCompletedChats || []).map(withLabel)
      this.setData({
        chats:this.data.chats.map(withLabel).map(message => message.processDurationMs > 0
          ? { ...message, thinkDurationText:(message.status === 'cancelled' ? formatStoppedDuration : formatProcessDuration)(message.processDurationMs, language) }
          : message),
        sessionTurns:this.data.sessionTurns.map(turn => ({ ...turn,
          featureLabel:getChatMessageLabel(turn.contentParts, language) })),
        modeName:modeNames[this.data.modeId],
        modePopupWidthRpx:language === 'English' ? 480 : 416,
        modeOptions:CHAT_MODE_OPTIONS.map((item) => ({ ...item, name:modeNames[item.id] })),
        temporaryInfoMessage:t(language, 'chat.temporaryPrivacy'),
        conversationActions:[
          { id:'share', name:t(language, 'chat.share'), icon:'icon-share' },
          { id:'pin', name:t(language, 'chat.pin'), icon:'icon-pin' },
          { id:'file', name:t(language, 'common.file'), icon:'icon-file' },
          { id:'archive', name:t(language, 'chat.archive'), icon:'icon-archive' },
          { id:'delete', name:t(language, 'common.delete'), icon:'icon-delete', tone:'danger' }
        ],
        moreOptions:[
          { id:'camera', name:t(language, 'common.camera'), icon:'icon-camera' },
          { id:'photo', name:t(language, 'common.photo'), icon:'icon-image' },
          { id:'file', name:t(language, 'common.file'), icon:'icon-file' },
          { id:'plugin', name:t(language, 'common.plugin'), icon:'icon-plugin' },
          { id:'smart', name:t(language, 'chat.smart'), icon:'icon-gauge' }
        ]
      }, () => this.syncModelCatalogState())
      this.selectComponent('#chatInput')?.setPlaceHolder(this.data.modeId === CHAT_MODE_IDS.TEMPORARY
        ? t(language, 'chat.temporary') : t(language, 'chat.askAnything'))
    },
    'modelCatalog,workModelSelection': function () {
      this.syncModelCatalogState()
    }
  },

  lifetimes: {
    attached() {
      this.systemInfo = wx.getWindowInfo()
      this.menuRect = wx.getMenuButtonBoundingClientRect()
      initShareValue(this)
      this._destroyed = false
      this._conversationLoadVersion = 0
      this._sessionTurnSeq = 0
      this._queueGroup = `new-${Date.now()}-${Math.random().toString(36).slice(2)}`
      this._activeTurnKey = ''
      this._activeRuntimeTurnKey = ''
      this._sessionCompletedChats = []
      this._smartModePreferences = createSmartModePreferences()
      this._historyRenderWaiting = false
      this._historyRenderTimer = null
      this._userContentSource = null
      this._resetChatSessionHandler = ({ reason } = {}) => this.resetChatSession({ account:reason !== 'new-chat' })
      eventBus.on(CHAT_SESSION_RESET, this._resetChatSessionHandler)
      this._assetInvalidatedHandler = ({ source, evictedFileIDs } = {}) => {
        if (source !== 'library') return
        if (Array.isArray(evictedFileIDs) && evictedFileIDs.length) this.markDeletedMessageAssets(new Set(evictedFileIDs))
        if (!this.data.currentConversationId) return
        clearTimeout(this._assetRefreshTimer)
        this._assetRefreshTimer = setTimeout(() => this.refreshDeletedMessageAssets(), 250)
      }
      eventBus.on(ASSET_LIST_INVALIDATED, this._assetInvalidatedHandler)

      this.storeBindings = createStoreBindings(this, {
        store,
        fields: {
          user: 'user',
          settings: 'settings',
          suggest: 'suggest',
          recommendationItems: 'recommendationItems',
          applicationSettings: 'applicationSettings',
          modelCatalog: 'modelCatalog',
          workModelSelection: 'workModelSelection',
          chatHistory: 'chatHistory',
          pinnedChatHistory: 'pinnedChatHistory',
          effectiveTheme: (state) => state.effectiveTheme,
          themeStyle: (state) => getThemeStyle(state.effectiveTheme),
          temporaryAccentStyle: (state) => getAccentStyle(DEFAULT_POINT_COLOR, state.effectiveTheme),
          temporaryAccentActionColor: (state) => getAccentTheme(DEFAULT_POINT_COLOR, state.effectiveTheme).actionColor,
          accentStyle: (state) => getAccentStyle(state.applicationSettings?.pointColor, state.effectiveTheme),
          accentActionColor: (state) => getAccentTheme(state.applicationSettings?.pointColor, state.effectiveTheme).actionColor
        },
        actions: ['getChatMessageCacheEntry', 'setChatMessageCacheEntry', 'resetChatMessageCache', 'setWorkModelSelection', 'setChatHistory', 'removeChatRun'],
      })
      wx.nextTick(()=>{
        this.syncModelCatalogState()
        this.setData({inputFocus:this.data.settings?.autoKey ? true : false})
      })

    },
    ready() {
      this.initView()
    },
    detached() {
      this.leaveConversation()
      this._destroyed = true
      this._conversationLoadVersion += 1
      this.clearHistoryInitialLoading(false)
      clearTimeout(this._assetRefreshTimer)
      eventBus.off(CHAT_SESSION_RESET, this._resetChatSessionHandler)
      eventBus.off(ASSET_LIST_INVALIDATED, this._assetInvalidatedHandler)
      if(this.storeBindings) this.storeBindings.destroyStoreBindings()
      if(this.pressFlag) this.pressFlag.value = false
      if(this.contentShow) this.contentShow.value = 0
    }
  },

  pageLifetimes: {
    show() {
      this._processDetailNavigation = false
      this.setData({ pageHidden:false })
      const runningKey = chatRuntime.getRunningKey(this.data.currentConversationId || this._queueGroup)
      if(store.unreadConversations[this.data.currentConversationId]) this.loadConversation(this.data.currentConversationId)
      else if(runningKey) chatRuntime.setVisibleTurn(runningKey)
      if(this.ficonOpa && this.ficonOpa.value === 0){
        this.fIconAn(false,durationTime)
      }
    },
    hide() {
      this.setData({ pageHidden:true })
      if(!this._processDetailNavigation) chatRuntime.setVisibleTurn()
    }
  },

  methods: {
    setProcessDetailVisible(value){ this._processDetailNavigation = value === true },
    handleTrendingSearchExitComplete(){
      if (!this.data.trendingSearchVisible) this.setData({ trendingSearchMounted:false })
    },
    handleAssetsChanged(e) { eventBus.emit(ASSET_LIST_INVALIDATED, e.detail) },
  saveConversationView(){
    if(this.data.modeId === CHAT_MODE_IDS.TEMPORARY) return
    const input = this.selectComponent('#chatInput')
    const stream = this.getActiveStreamComponent()
    chatRuntime.saveView(this.data.currentConversationId || this._activeTurnKey || 'new', {
      draft:input?.data?.askText || '', files:this.data.files.slice(),
      feature:this.data.feature, thinking:this.data.thinking, imging:this.data.imging,
      searching:this.data.searching, studying:this.data.studying,
      scrollTop:this._scrollTop || 0, thinkOpen:stream?.data?.thinkOpen === true
    })
  },
  leaveConversation(save = true){
    this.selectComponent('#readAloud')?.stop()
    this.selectComponent('#chatInput')?.cancelVoice?.()
    if(save) this.saveConversationView()
    chatRuntime.setVisibleTurn()
    if(this._regenerateObserver) this._regenerateObserver()
    this._regenerateObserver = null
    const stream = this.getActiveStreamComponent()
    if(stream) stream.resetStream()
    this._activeRuntimeTurnKey = ''
    this._startingChat = false
    this._attachmentSending = false
  },
  rememberScroll(e){ this._scrollTop = e.detail.scrollTop },
  restoreConversationView(conversationId){
    const state = chatRuntime.getView(conversationId)
    const input = this.selectComponent('#chatInput')
    if(state){
      const { draft, scrollTop, thinkOpen, ...composer } = state
      this.setData({ ...composer, sivId:'', restoreScrollTop:scrollTop })
      if(input) input.setAskText(draft)
      if(composer.files?.length) this.selectComponent('#fileList')?.showFun()
      if(composer.feature) this.selectComponent('#funList')?.showFun()
      const stream = this.getActiveStreamComponent()
      if(stream) stream.setData({ thinkOpen })
    }
    if(input) input.syncAskStatus(input.data.askText, this.data.streamStatus)
  },
  syncModelCatalogState(){
    const catalog = normalizeModelCatalog(this.data.modelCatalog)
    const reasoningMode = this.data.modeId === CHAT_MODE_IDS.TEMPORARY ? CHAT_MODE_IDS.TEMPORARY : CHAT_MODE_IDS.CHAT
    const chatSelection = normalizeModeSelection(catalog, reasoningMode, {
      modelId:this.data.reasoningModelId,
      effortId:this.data.reasoningEffortId
    })
    const modelCatalogReady = !!chatSelection.modelId && !!chatSelection.effortId
    const smartMode = modelCatalogReady && resolveSmartMode(this.data.modeId,
      this._smartModePreferences || createSmartModePreferences())
    const reasoningChoices = getReasoningChoices(withLockedModels(
      catalog.models.filter((model) => model.modes.includes(reasoningMode)),
      catalog.accessPlan,
      this.properties.language
    ), chatSelection.modelId)
    const workSelection = normalizeModeSelection(catalog, CHAT_MODE_IDS.WORK, this.data.workModelSelection)
    const chatView = getSelectionView(catalog, chatSelection)
    const workView = getSelectionView(catalog, workSelection)
    const smartModeChanged = this.data.smartMode !== smartMode
    this.setData({
      accessPlan:catalog.accessPlan,
      modelCatalogReady,
      smartMode,
      reasoningModelId:chatSelection.modelId,
      reasoningEffortId:chatSelection.effortId,
      reasoningModelName:chatView.modelName,
      reasoningEffortLabel:withLockedEfforts(chatView.efforts, catalog.accessPlan, this.properties.language)
        .find((effort) => effort.id === chatSelection.effortId)?.label || '',
      reasoningEfforts:reasoningChoices.options,
      reasoningProgress:getReasoningIndex(reasoningChoices.options, chatSelection.modelId,
        chatSelection.effortId) / Math.max(1, reasoningChoices.options.length - 1),
      workModels:withLockedModels(
        catalog.models.filter((model) => model.modes.includes(CHAT_MODE_IDS.WORK)),
        catalog.accessPlan,
        this.properties.language
      ),
      workModelName:workView.modelName,
      workEffortLabel:withLockedEfforts(workView.efforts, catalog.accessPlan, this.properties.language)
        .find((effort) => effort.id === workSelection.effortId)?.label || ''
    })
    if(smartModeChanged) this.syncSmartMode(smartMode)
    if((workSelection.modelId !== this.data.workModelSelection?.modelId
      || workSelection.effortId !== this.data.workModelSelection?.effortId)
      && this.setWorkModelSelection){
      this.setWorkModelSelection(workSelection)
    }
  },

  async ensureModelCatalogReady(){
    if(this.data.modelCatalogReady) return true
    const viewVersion = this._conversationLoadVersion
    const accountVersion = chatRuntime.epoch
    await loadModelCatalog({ silent:false }).catch(() => null)
    if(this._destroyed || viewVersion !== this._conversationLoadVersion || accountVersion !== chatRuntime.epoch) return false
    const catalog = normalizeModelCatalog(store.modelCatalog)
    if(catalog.models.length){
      this.setData({ modelCatalog:catalog })
      this.syncModelCatalogState()
      return true
    }
    wx.showToast({ title:t(this.properties.language, 'chat.modelLoadFailed'), icon:'none' })
    return false
  },

  showLockedPlan(e){
    const minPlan = e?.detail?.minPlan || 'user'
    wx.showToast({
      title:this.data.accessPlan === 'guest' ? t(this.properties.language, 'auth.loginRequired') : t(this.properties.language, 'auth.upgradeRequired', { plan: minPlan }),
      icon:'none'
    })
  },

  selectRecommendation(e){
    const item = this.data.recommendationItems?.find(item => item.id === e.detail.id)
    if (!item || !this.data.suggest?.trendingSearch || this.data.inputFocused || this.data.hasInputValue ||
        this.data.chats.length || this.data.sessionTurns.length || this.data.streamStatus || this.data.historyInitialLoading || this.data.validatingConversation) return
    this.selectFeature(SEARCH, t(this.properties.language, 'tools.webSearchDesc'))
    this.selectComponent('#chatInput')?.setCopytext(item.text)
  },

  refreshRecommendations(){
    dailyRecommendations.shuffle()
  },

  updateInputValue(e){
    this.setData({ hasInputValue: e.detail.hasValue })
  },

  updateInputFocus(e){
    this.setData({ inputFocused: e.detail.focused })
  },

  initView(){
    this.pdheight = shared(rpx2px(52,this.systemInfo.screenWidth))

    const screenHeight = this.systemInfo.screenHeight

    // 聊天视图随键盘高度变化，首页容器本身保持全屏。
    this.applyAnimatedStyle('.chat-page', () => {
      'worklet'
      return { height: `${screenHeight - this.keyHeight.value}px` }
    })

    // 回到锚点icon
    this.applyAnimatedStyle('.top-icon', () => {
      'worklet'
      return {transform:  `scale(${this.topIconSca.value},${this.topIconSca.value})`,opacity:`${this.topIconSca.value}`}
    })

    // 底部
    this.applyAnimatedStyle('.bottom-box', () => {
      'worklet'
      return {transform:  `scale(${this.btSca.value},${this.btSca.value}) translateX(${this.btTrax.value}px) translateY(${this.btTray.value}px)`}
    })

    this.moreIconSca = shared(1)
    this.moreIconOpa = shared(1)
    this.moreIconTra = shared(0)
    this.applyAnimatedStyle('.input-more-icon', () => {
      'worklet'
      return {
        transform: `scale(${this.moreIconSca.value},${this.moreIconSca.value}) translateY(${this.moreIconTra.value}px)`,
        opacity: `${this.moreIconOpa.value}`
      }
    })

    this.modelSummaryWidth = shared(0)
    this.modelSummarySca = shared(0.8)
    this.modelSummaryOpa = shared(0)
    this.modelSummaryTra = shared(0)
    this.applyAnimatedStyle('.model-summary', () => {
      'worklet'
      return {
        width: `${this.modelSummaryWidth.value}px`,
        transform: `scale(${this.modelSummarySca.value}) translateY(${this.modelSummaryTra.value}px)`,
        opacity: `${this.modelSummaryOpa.value}`
      }
    })
    const compactInputHeight = rpx2px(52, this.systemInfo.screenWidth)
    const expandedInputHeight = rpx2px(94, this.systemInfo.screenWidth) + rpx2px(64, this.systemInfo.screenWidth)
    this.inputHeight.value = this.data.smartMode ? expandedInputHeight : compactInputHeight
    const compactInputRadius = rpx2px(36, this.systemInfo.screenWidth)
    const expandedInputRadius = rpx2px(28, this.systemInfo.screenWidth)
    this.applyAnimatedStyle('.input-box', () => {
      'worklet'
      const progress = Math.max(0, Math.min(1, (this.inputHeight.value - compactInputHeight) / (expandedInputHeight - compactInputHeight)))
      const radius = compactInputRadius + (expandedInputRadius - compactInputRadius) * progress
      return {borderRadius: `${radius}px`}
    })

    // 底部左操作按钮
    const leftIconWitdh = rpx2px(204,this.systemInfo.screenWidth)
    this.leftIconWitdh.value = leftIconWitdh

    this.applyAnimatedStyle('.file-icon', () => {
      'worklet'
      return {transform:  `scale(${this.ficonScale.value},${this.ficonScale.value}) translateX(${this.leftIconWitdh.value - leftIconWitdh}px)`,opacity:`${this.ficonOpa.value}`}
    })

    
    this.applyAnimatedStyle('.chat-view', () => {
      'worklet'
      return {paddingBottom: `${this.pdheight.value + this.inputHeight.value + this.fileHeight.value + this.funHeight.value}px`  }
    })

    this.applyAnimatedStyle('.history-layout-holder', () => {
      'worklet'
      return {minHeight: `${this.chatHeight.value}px`}
    })

    this.applyAnimatedStyle('.history-initial-loading', () => {
      'worklet'
      return {paddingBottom: `${this.pdheight.value + this.inputHeight.value + this.fileHeight.value + this.funHeight.value + this.chatHeight.value}px`}
    })

  },

  getActiveStreamComponent(){
    if(!this._activeTurnKey) return null
    return this.selectComponent(`#assis-stream-${this._activeTurnKey}`)
  },

  tryStartSessionTurn(turnKey){
    const turn = this.data.sessionTurns.find((item) => item.turnKey === turnKey)
    if(!turn) return
    const stream = this.selectComponent(`#assis-stream-${turnKey}`)
    if(turn.stopped) stream?.stopDisplay?.()
    if(!turn.requestReady) return
    if(stream && stream.startTurn) stream.startTurn(turn)
  },

  clearHistoryInitialLoading(updateData = true){
    if(this._historyRenderTimer){
      clearTimeout(this._historyRenderTimer)
      this._historyRenderTimer = null
    }
    this._historyRenderWaiting = false
    if(updateData && this.data.historyInitialLoading) this.setData({ historyInitialLoading:false })
  },

  historyRenderReady(e){
    if(!this.data.historyInitialLoading || !this._historyRenderWaiting) return
    if(e?.detail?.renderToken !== this.data.historyRenderToken) return
    this.clearHistoryInitialLoading()
  },

  startHistoryRenderFallback(loadVersion){
    if(this._historyRenderTimer) clearTimeout(this._historyRenderTimer)
    this._historyRenderTimer = setTimeout(() => {
      if(this._destroyed || loadVersion !== this._conversationLoadVersion) return
      this.clearHistoryInitialLoading()
    }, 3000)
  },

  syncSessionCache(conversationId){
    if(this.data.modeId === CHAT_MODE_IDS.TEMPORARY || !conversationId || !this.setChatMessageCacheEntry) return
    this.setChatMessageCacheEntry({
      conversationId,
      conversation:{
        conversationId,
        title:this.data.currentConversationTitle,
        modeId:this.data.modeId,
        branchOrigin:this.data.branchOrigin
      },
      // 当前会话内的新消息已写入缓存，但版本号要交给服务端重新校验。
      messageVersion:'',
      chats:[...this._sessionCompletedChats, ...this.data.chats.map(({regenerateTurn, preservedHeight, ...message}) => message)],
      nextCursor:this.data.messageHistoryCursor ?? null,
      hasMore:this.data.messageHistoryHasMore === true
    })
  },

  resetChatSession({ account = false } = {}){
    this.leaveConversation(!account)
    this._conversationLoadVersion += 1
    this.clearHistoryInitialLoading()
    this._historyRenderWaiting = false
    this._ignoreStreamFinish = true
    const stream = this.getActiveStreamComponent()
    if(stream && stream.resetStream) stream.resetStream()
    this._activeTurnKey = ''
    this._activeRuntimeTurnKey = ''
    this._sessionCompletedChats = []
    this._queueGroup = `new-${Date.now()}-${Math.random().toString(36).slice(2)}`

    this.resetChatComposer()
    this.setData({
      sivId: '',
      currentConversationId: '',
      isScheduledTask:false,
      currentConversationTitle: t(this.properties.language, 'chat.newChat'),
      currentConversationPinned:false,
      branchOrigin:null,
      messageHistoryCursor: null,
      messageHistoryHasMore: false,
      loadingOlderMessages: false,
      historyInitialLoading: false,
      validatingConversation:false,
      chats: [],
      sessionTurns:[],
      streamStatus: false
    })
  },

  resetChatComposer(){
    this._smartModePreferences = createSmartModePreferences()
    this.dismissReasoningSlider()
    const input = this.selectComponent('#chatInput')
    if(input){
      if(input.finish) input.finish()
      if(input.setAskText) input.setAskText('')
      if(input.setPlaceHolder) input.setPlaceHolder(t(this.properties.language, 'chat.askAnything'))
      if(input.setSmartMode) input.setSmartMode(this.data.modelCatalogReady)
    }

    const funList = this.selectComponent('#funList')
    if(funList && funList.hideFun) funList.hideFun()
    const fileList = this.selectComponent('#fileList')
    if(fileList && fileList.hideFun) fileList.hideFun()
    if(this.topIconSca) this.topIconSca.value = 0
    if(this.modelSummaryWidth){
      this.modelSummaryWidth.value = 0
      this.modelSummarySca.value = 0.8
      this.modelSummaryOpa.value = 0
    }

    this.setData({
      askText: '',
      leftIcon: 'moreFun',
      modeId: CHAT_MODE_IDS.CHAT,
      modeName: t(this.properties.language, 'home.chat'),
      feature: '',
      selectedSkill: null,
      smartMode: this.data.modelCatalogReady,
      modelPickerOpen:false,
      placeHolder: t(this.properties.language, 'chat.askAnything'),
      thinking: false,
      searching: false,
      imging: false,
      studying: false,
      files: [],
      contentBig: ''
    }, () => this.triggerEvent('modeChange', { modeId: this.data.modeId }))
  },

  closeModels(){
    this.setData({ modelPickerOpen:false })
    this.showModelSummary()
  },

  changeModel(e){
    if(this.data.modeId !== CHAT_MODE_IDS.WORK) return this.commitReasoning(e)
    const selection = normalizeModeSelection(this.data.modelCatalog, CHAT_MODE_IDS.WORK, e.detail || {})
    if(!selection.modelId || !selection.effortId) return
    this.setWorkModelSelection(selection)
  },

  changeLeftIcon(e){
    this.setData({leftIcon:e.detail.leftIcon})
    if(e.detail.leftIcon == "stop"){
      // 此时开始录音了，需要closeFun
      this.selectComponent("#funList").hideFun()
      this.selectComponent("#fileList").hideFun()

    }else{
      this.selectComponent("#funList").reshowFun()
      this.selectComponent("#fileList").reshowFun()

    }
  },
  changeFunHeight(e){
    this.funHeight.value = timing(e.detail.height,{duration:e.detail.duration})
  },
  changeFileHeight(e){
    this.fileHeight.value = timing(e.detail.height,{duration:e.detail.duration})
  },
    /**
     * 输入框组件开始聊天回调
     * @param {*} detail
     * keyHeight
     * askTextTmp
     */
    async startChat(e){
        if(this.data.modeId === CHAT_MODE_IDS.WORK || this.data.historyInitialLoading || this.data.validatingConversation || this._attachmentSending || this._startingChat) return
        const askText = e.detail.askText.trim()
        if(!askText) return
        this._startingChat = true
        const viewVersion = this._conversationLoadVersion
        const accountVersion = chatRuntime.epoch
        const valid = () => !this._destroyed && viewVersion === this._conversationLoadVersion && accountVersion === chatRuntime.epoch
        const featureMeta = getChatFeatureMeta(this.data.feature)
        const selectedSkill = this.data.selectedSkill
        const skillParts = selectedSkill ? [{ type:'skill', id:selectedSkill.id,
          title:selectedSkill.title, titleEn:selectedSkill.titleEn }] : []
        const turnKey = `live-${Date.now()}-${++this._sessionTurnSeq}`
        const directFiles = e.detail.files
        const selectedFiles = Array.isArray(directFiles)
          ? directFiles.map((file, index) => ({ ...normalizeSelectedFile(file),
            draftId:`${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
            uploadStatus:'uploading' }))
          : this.data.files.slice()
        const attachmentError = this.attachmentSelectionError(selectedFiles)
        if(attachmentError){
          this.showUploadFailure(attachmentError)
          this._startingChat = false
          return
        }
        const modeId = this.data.modeId
        const reasoningModelId = this.data.reasoningModelId
        const reasoningEffortId = this.data.reasoningEffortId
        const workModelSelection = this.data.workModelSelection
        const reasoningEnabled = this.data.modeId === CHAT_MODE_IDS.WORK || this.data.smartMode
        const attachmentParts = selectedFiles.filter(file => file.fileID).map((file) => createAttachmentPart(file, file.fileID))
        const contentParts = buildMessageContentParts(featureMeta.value, attachmentParts, skillParts)
        const attachments = selectedFiles.map(file => ({ ...getAttachmentPresentation(file),
          ...file, attachmentType:file.fileType, src:file.previewPath || file.url || '' }))
        this._ignoreStreamFinish = false
        this._activeTurnKey = turnKey
        this._activeRuntimeTurnKey = turnKey
        this._attachmentSending = true
        this.chatHeight.value = this.systemInfo.screenHeight - e.detail.keyHeight - this.menuRect.bottom - 18 - (this.pdheight.value + this.inputHeight.value)
        this.setData({
          // 刷新占位只覆盖刷新期间；开始新轮次后释放，避免历史行把间距带到新消息。
          chats:this.data.chats.map(({ preservedHeight, regenerateTurn, ...message }) => message),
          sessionTurns:[{
            turnKey,
            streamContent:askText,
            contentParts,
            attachments,
            thinking:featureMeta.value === THINK,
            imging:featureMeta.value === IMG,
            searching:featureMeta.value === SEARCH,
            studying:featureMeta.value === STUDY,
            modeId,
            modelId:modeId === CHAT_MODE_IDS.WORK ? workModelSelection.modelId : reasoningModelId,
            effortId:modeId === CHAT_MODE_IDS.WORK ? workModelSelection.effortId : reasoningEffortId,
            modelName:'',
            reasoningEnabled,
            requestReady:false,
            feature:featureMeta.value,
            ...(selectedSkill ? { skillIds: [selectedSkill.id] } : {}),
            featureLabel:getChatMessageLabel(contentParts, this.properties.language),
            layoutOwner:true,
            conversationId:modeId === CHAT_MODE_IDS.TEMPORARY ? '' : this.data.currentConversationId,
            ephemeralMessages:modeId === CHAT_MODE_IDS.TEMPORARY
              ? buildEphemeralMessages(this._sessionCompletedChats)
              : []
          }, ...this.data.sessionTurns.map(item => item.layoutOwner
            ? {...item, layoutOwner:false}
            : item)],
          streamStatus:true,
          sivId:'',
          currentConversationTitle:this.data.currentConversationId
            ? this.data.currentConversationTitle
            : (askText.slice(0, 24) || t(this.properties.language, 'chat.newChat')),
        }, () => this.setData({ sivId:'assis-up' }))
        this.selectComponent('#chatInput')?.acceptSend(e.detail.askText)
        try {
          if(selectedFiles.some(file => !file.fileID)){
            const turn = this.data.sessionTurns.find(item => item.turnKey === turnKey)
            const queueGroup = this.data.currentConversationId || this._queueGroup
            const prepared = Promise.all([this.ensureModelCatalogReady(), this.resolveTurnFiles(selectedFiles)])
              .then(([ready, files]) => {
                if(!ready) throw new Error(t(this.properties.language, 'chat.modelLoadFailed'))
                const selection = modeId === CHAT_MODE_IDS.WORK
                  ? normalizeModeSelection(this.data.modelCatalog, CHAT_MODE_IDS.WORK, workModelSelection)
                  : normalizeModeSelection(this.data.modelCatalog, modeId, { modelId:reasoningModelId, effortId:reasoningEffortId })
                const parts = buildMessageContentParts(featureMeta.value, files.map(file => createAttachmentPart(file, file.fileID)), skillParts)
                return { ...turn, ...selection, modelName:getSelectionView(this.data.modelCatalog, selection).modelName,
                  reasoningEnabled, askText, contentParts:parts, attachments:getMessageAttachments(parts), queueGroup }
              })
            chatRuntime.submitTurnWhenReady(turnKey, { ...turn, localFiles:selectedFiles, queueGroup }, prepared)
            this.sendAllFile()
            this.setData({ sessionTurns:this.data.sessionTurns.map(item => item.turnKey === turnKey
              ? {...item, localFiles:selectedFiles, requestReady:true} : item) }, () => this.tryStartSessionTurn(turnKey))
            this.clearSelectedFeature()
            return
          }
          const ready = await this.ensureModelCatalogReady()
          if(!valid() || this.data.sessionTurns.find(item => item.turnKey === turnKey)?.stopped) return
          if(!ready){
            const turn = this.data.sessionTurns.find(item => item.turnKey === turnKey)
            chatRuntime.failLocalTurn(turnKey, { ...turn, queueGroup:this.data.currentConversationId || this._queueGroup },
              new Error(t(this.properties.language, 'chat.modelLoadFailed')))
            this.setData({ sessionTurns:this.data.sessionTurns.map(item => item.turnKey === turnKey
              ? {...item, requestReady:true} : item) }, () => this.tryStartSessionTurn(turnKey))
            return
          }
          const selection = modeId === CHAT_MODE_IDS.WORK
            ? normalizeModeSelection(this.data.modelCatalog, CHAT_MODE_IDS.WORK, workModelSelection)
            : normalizeModeSelection(this.data.modelCatalog, modeId, { modelId:reasoningModelId, effortId:reasoningEffortId })
          const modelView = getSelectionView(this.data.modelCatalog, selection)
          this.sendAllFile()
          const turn = this.data.sessionTurns.find(item => item.turnKey === turnKey)
          chatRuntime.submitTurn(turnKey, { ...turn, ...selection, modelName:modelView.modelName, reasoningEnabled, askText:turn.streamContent,
            queueGroup:this.data.currentConversationId || this._queueGroup })
          this.setData({
            sessionTurns:this.data.sessionTurns.map((item) => item.turnKey === turnKey
              ? {...item, modelId:selection.modelId, effortId:selection.effortId, modelName:modelView.modelName, requestReady:true}
              : item)
          }, () => {
            if(valid()) this.tryStartSessionTurn(turnKey)
          })
          this.clearSelectedFeature()
        } finally {
          if(valid()){ this._attachmentSending = false; this._startingChat = false }
        }
    },

    resolveTurnFiles(files){
      const pending = files.filter(file => !file.fileID)
      return (pending.length ? this.uploadSelectedFiles(pending) : Promise.resolve([])).then(uploaded => {
        let index = 0
        const resolved = files.map(file => file.fileID ? file : uploaded[index++])
        if(resolved.some(file => !file?.fileID)) throw new Error(t(this.properties.language, 'attachments.attachmentUploadFailed'))
        return resolved
      }).catch(() => {
        throw Object.assign(new Error(t(this.properties.language, 'attachments.attachmentUploadFailed')), { code:'ATTACHMENT_UPLOAD_FAILED' })
      })
    },

    selectSkill(item){
      if (!item?.id) return
      this.clearSelectedFeature()
      this.setData({ selectedSkill: { id: item.id, title: item.title, titleEn:item.titleEn || '', logoUrl: item.logoUrl } }, () => {
        this.selectComponent('#funList')?.showFun()
      })
    },

    prefillMcp(item){
      const english = ['English', 'en-US'].includes(this.properties.language)
      const text = english ? item.exampleMessageEn || item.exampleMessage : item.exampleMessage
      if (typeof text !== 'string' || !text.trim()) return
      this.clearSelectedFeature()
      this.selectComponent('#chatInput')?.setCopytext(text)
    },

    prefillSkill(item){
      if (!item?.id || typeof item.exampleMessage !== 'string' || !item.exampleMessage.trim()) return
      this.selectSkill(item)
      this.selectComponent('#chatInput')?.setCopytext(item.exampleMessage)
    },

    sendCreationPrompt(prompt, files = []){
      const text = String(prompt || '').trim()
      if(!text) return
      this.selectFeature(IMG, t(this.properties.language, 'tools.imageDesc'))
      return this.startChat({ detail:{ askText:text, keyHeight:0, files } })
    },

    async retryLocalTurn(e){
      const turnKey = e?.detail?.turnKey
      const turn = this.data.sessionTurns.find(item => item.turnKey === turnKey)
      if(!turn || this._retryingLocalTurnKey === turnKey) return
      if(turn.turnId) return this.regenerate({ detail:{ turnId:turn.turnId, conversationId:turn.conversationId || this.data.currentConversationId } })
      this._retryingLocalTurnKey = turnKey
      const viewVersion = this._conversationLoadVersion
      const accountVersion = chatRuntime.epoch
      const valid = () => !this._destroyed && viewVersion === this._conversationLoadVersion && accountVersion === chatRuntime.epoch
      try {
        if(!await this.ensureModelCatalogReady() || !valid()) return
        const selection = turn.modeId === CHAT_MODE_IDS.WORK
          ? normalizeModeSelection(this.data.modelCatalog, CHAT_MODE_IDS.WORK,
            turn.modelId ? { modelId:turn.modelId, effortId:turn.effortId } : this.data.workModelSelection)
          : normalizeModeSelection(this.data.modelCatalog, turn.modeId,
            { modelId:turn.modelId || this.data.reasoningModelId, effortId:turn.effortId || this.data.reasoningEffortId })
        const modelName = getSelectionView(this.data.modelCatalog, selection).modelName
        const queueGroup = this.data.currentConversationId || this._queueGroup
        const next = { ...turn, ...selection,
          conversationId:turn.modeId === CHAT_MODE_IDS.TEMPORARY ? '' : this.data.currentConversationId || turn.conversationId,
          ...(turn.modeId === CHAT_MODE_IDS.TEMPORARY ? { ephemeralMessages:buildEphemeralMessages(this._sessionCompletedChats) } : {}),
          modelName, requestReady:true, stopped:false }
        const retryParams = { ...next, askText:turn.streamContent, queueGroup }
        if(turn.localFiles?.length){
          const ready = this.resolveTurnFiles(turn.localFiles).then(files => {
            const parts = buildMessageContentParts(turn.feature, files.map(file => createAttachmentPart(file, file.fileID)),
              (turn.contentParts || []).filter(part => part?.type === 'skill'))
            return { ...retryParams, localFiles:undefined, contentParts:parts, attachments:getMessageAttachments(parts) }
          })
          if(!chatRuntime.retryTurnWhenReady(turnKey, retryParams, ready)) return
        } else if(!chatRuntime.retryLocalTurn(turnKey, retryParams)) return
        this._ignoreStreamFinish = false
        this._activeTurnKey = turnKey
        this._activeRuntimeTurnKey = chatRuntime.getRunningKey(queueGroup) || turnKey
        this.selectComponent('#chatInput')?.syncAskStatus?.(undefined, true)
        this.setData({
          sessionTurns:this.data.sessionTurns.map(item => item.turnKey === turnKey ? next : item),
          streamStatus:true
        }, () => {
          if(valid()) this.selectComponent(`#assis-stream-${turnKey}`)?.restartLocalTurn(next)
        })
      } catch(error) {
        if(valid()) wx.showToast({ title:error.message || t(this.properties.language, 'common.operationFailed'), icon:'none' })
      } finally {
        if(this._retryingLocalTurnKey === turnKey) this._retryingLocalTurnKey = ''
      }
    },

    async regenerate(e){
      const item = e.detail || {}
      const selectedFeature = e.detail?.selectedFeature
      if(this.data.streamStatus || this.data.historyInitialLoading || this.data.validatingConversation || this._measuringRegenerate || !item.turnId || item.conversationId !== this.data.currentConversationId) return
      const key = `live-${Date.now()}-${++this._sessionTurnSeq}`
      const viewVersion = this._conversationLoadVersion
      const accountVersion = chatRuntime.epoch
      const sourceSessionTurn = this.data.sessionTurns.find(turn => turn.turnId === item.turnId)
      const sourceUser = message => message.role === 'user' && (message.turnId === item.turnId ||
        message.messageId && message.messageId === sourceSessionTurn?.userMessageId)
      const sourceMessage = this.data.chats.find(sourceUser)
        || this._sessionCompletedChats.find(sourceUser)
        || this.data.chats.find(message => message.turnId === item.turnId)
        || this._sessionCompletedChats.find(message => message.turnId === item.turnId)
      const historyIndex = this.data.chats.findIndex(message => message.turnId === item.turnId && message.role === 'assistant')
      if(!sourceSessionTurn && historyIndex < 0) return
      const selector = sourceSessionTurn && !sourceSessionTurn.historyInline
        ? `#turn-row-${sourceSessionTurn.turnKey}`
        : `#history-row-${historyIndex}`
      this._measuringRegenerate = true
      let rect
      try {
        rect = await new Promise(resolve => this.createSelectorQuery().select(selector).boundingClientRect(resolve).exec())
      } finally {
        this._measuringRegenerate = false
      }
      if(this._destroyed || viewVersion !== this._conversationLoadVersion || accountVersion !== chatRuntime.epoch || this.data.streamStatus) return
      if(!rect || !Number.isFinite(rect.height) || rect.height <= 0) return
      const source = sourceSessionTurn || sourceMessage || {}
      const featureMeta = getChatFeatureMeta(selectedFeature ?? item.feature ?? source.feature ?? getChatFeatureFromContentParts(source.contentParts))
      const contentParts = buildMessageContentParts(featureMeta.value,
        (source.contentParts || []).filter(part => part?.type !== 'feature'))
      const responseOnly = sourceSessionTurn?.responseOnly === true || !sourceSessionTurn
      const renderKey = sourceSessionTurn?.turnKey || key
      const previous = {
        activeTurnKey:this._activeTurnKey,
        activeRuntimeTurnKey:this._activeRuntimeTurnKey,
        sessionTurns:this.data.sessionTurns,
        chats:this.data.chats,
        completedChats:this._sessionCompletedChats,
        branchOrigin:this.data.branchOrigin,
        sivId:this.data.sivId
      }
      const regenerateTurn = {
        ...sourceSessionTurn,
        stopped:false,
        turnKey:renderKey,
        runtimeKey:key,
        turnId:'',
        runId:'',
        requestReady:true,
        layoutOwner:true,
        historyInline:sourceSessionTurn?.historyInline === true || !sourceSessionTurn,
        preservedHeight:0,
        regenerating:true,
        responseOnly,
        skipUserEntrance:true,
        userMessageId:sourceSessionTurn?.userMessageId || (sourceMessage?.role === 'user' ? sourceMessage.messageId : '') || '',
        streamContent:source.streamContent ?? source.content ?? '',
        contentParts,
        attachments:source.attachments || [],
        feature:featureMeta.value,
        featureLabel:getChatMessageLabel(contentParts, this.properties.language),
        thinking:featureMeta.value === THINK,
        imging:featureMeta.value === IMG,
        searching:featureMeta.value === SEARCH,
        studying:featureMeta.value === STUDY,
        modeId:source.modeId || this.data.modeId,
        conversationId:item.conversationId,
        ephemeralMessages:source.ephemeralMessages || []
      }
      const sameTurn = message => message.turnId === item.turnId
      const updateUserFeature = message => message.role === 'user' && (message === sourceMessage ||
        message.messageId && message.messageId === regenerateTurn.userMessageId)
        ? {...message, feature:featureMeta.value, featureLabel:regenerateTurn.featureLabel, contentParts:regenerateTurn.contentParts}
        : message
      const retainedTurns = sourceSessionTurn && !regenerateTurn.historyInline
        ? this.data.sessionTurns.slice(this.data.sessionTurns.indexOf(sourceSessionTurn))
        : []
      const retainedTurnIds = new Set(retainedTurns.map(turn => turn.turnId))
      const completedChats = this._sessionCompletedChats.filter(message =>
        retainedTurnIds.has(message.turnId) && (!sameTurn(message) || (responseOnly && message.role === 'user'))
      ).map(updateUserFeature)
      // Keep the history row in place; only replace its renderer, never its list position.
      const chats = regenerateTurn.historyInline
        ? this.data.chats.slice(historyIndex).map(updateUserFeature).map((message, index) => index === 0
          ? {...message, regenerateTurn, preservedHeight:0}
          : message)
        : this.data.chats
      const sessionTurns = sourceSessionTurn
        ? [regenerateTurn, ...retainedTurns.filter(turn => turn.turnKey !== sourceSessionTurn.turnKey).map(turn => ({...turn, layoutOwner:false}))]
        : [regenerateTurn]
      const restore = () => {
        if(this._regenerateObserver) this._regenerateObserver()
        this._regenerateObserver = null
        this._activeTurnKey = previous.activeTurnKey
        this._activeRuntimeTurnKey = previous.activeRuntimeTurnKey
        this._sessionCompletedChats = previous.completedChats
        chatRuntime.setVisibleTurn(previous.activeRuntimeTurnKey || previous.activeTurnKey)
        if(sourceSessionTurn){
          this.selectComponent(`#assis-stream-${renderKey}`)?.restoreResponse?.()
        }
        this.setData({
          sessionTurns:previous.sessionTurns,
          chats:previous.chats,
          branchOrigin:previous.branchOrigin,
          sivId:previous.sivId,
          streamStatus:false
        })
        this.selectComponent('#chatInput')?.syncAskStatus(undefined, false)
      }
      this._activeTurnKey = renderKey
      this._activeRuntimeTurnKey = key
      this._sessionCompletedChats = completedChats
      chatRuntime.setVisibleTurn(key)
      this.selectComponent('#chatInput')?.syncAskStatus(undefined, true)
      const handleRegenerateRecord = record => {
        if(this._destroyed || viewVersion !== this._conversationLoadVersion || accountVersion !== chatRuntime.epoch) return
        if(record.error?.data?.activeTurn){
          this.loadConversation(item.conversationId)
        } else if(record.status === 'failed' && record.meta?.turnId) {
          this.loadConversation(item.conversationId)
        } else if(record.status === 'failed') {
          restore()
          wx.showToast({ title:record.error?.message || t(this.properties.language, 'common.operationFailed'), icon:'none' })
        }
      }
      this.setData({
        sessionTurns,
        chats,
        streamStatus:true,
        branchOrigin:regenerateTurn.historyInline && this.data.branchOrigin?.cutoffSeq >= item.seq ? null : this.data.branchOrigin,
        sivId:'assis-up'
      }, () => {
        if(this._destroyed || viewVersion !== this._conversationLoadVersion || accountVersion !== chatRuntime.epoch) return
        chatRuntime.submitTurn(key, { conversationId:item.conversationId, regenerateFromTurnId:item.turnId, modeId:this.data.modeId, ...(selectedFeature !== undefined ? { feature:selectedFeature, searching:selectedFeature === SEARCH, studying:selectedFeature === STUDY, thinking:selectedFeature === THINK, imging:selectedFeature === IMG } : {}) })
        const stream = this.selectComponent(`#assis-stream-${renderKey}`)
        if(sourceSessionTurn) stream?.reloadResponse?.(regenerateTurn)
        else this.tryStartSessionTurn(renderKey)
        this._regenerateObserver = chatRuntime.observe(key, handleRegenerateRecord)
      })
    },

    /**
     * 输入框组件手动结束对话回调
     */
    async endStream(){
        const runtimeKey = chatRuntime.getRunningKey(this.data.currentConversationId || this._queueGroup)
          || this._activeRuntimeTurnKey
        const turn = this.data.sessionTurns.find(item => (item.runtimeKey || item.turnKey) === runtimeKey)
        let displayStop
        if(turn){
          this.setData({sessionTurns:this.data.sessionTurns.map(item => item.turnKey === turn.turnKey ? {...item, stopped:true} : item)})
          displayStop = this.selectComponent(`#assis-stream-${turn.turnKey}`)?.stopDisplay?.() || {contentLength:0}
        }
        this.selectComponent('#chatInput')?.finish()
        this.setData({ streamStatus:false })
        try { await chatRuntime.cancelTurn(runtimeKey, displayStop) }
        catch(error) { wx.showToast({ title:t(this.properties.language, 'common.operationFailed'), icon:'none' }) }
    },

    /**
     * 长按输入框后，开始语音输入
     * @param {*} e 
     */
    voiceError(e){
      this.showUploadFailure(e.detail.message)
    },
    async sendTranscription(e){
      const input = this.selectComponent('#chatInput')
      try { await this.startChat(e) }
      finally { input?.finishVoiceSend?.(e.detail.voiceVersion, true) }
    },

  /**
   * 流式组件创建完成
   * @param {} e 
   */
  stramready(e){
    const turn = this.data.sessionTurns.find(item => item.turnKey === e?.detail?.turnKey)
    if(turn?.regenerating) return
    this.setData({sivId:'assis-up'})
  },

  streamMounted(e){
    this.tryStartSessionTurn(e?.detail?.turnKey)
  },

  conversationReady(e){
    const detail = e?.detail || {}
    const turnKey = detail.turnKey || this._activeTurnKey
    if(turnKey && !this.data.sessionTurns.some(item => item.turnKey === turnKey)) return
    const conversationId = detail.conversationId || ''
    if(!conversationId) return

    const turn = this.data.sessionTurns.find((item) => item.turnKey === turnKey)
    if(this.data.modeId !== CHAT_MODE_IDS.TEMPORARY && !this.data.currentConversationId) {
      this.setData({ currentConversationId:conversationId,
        currentConversationTitle:detail.conversation?.title || turn?.streamContent?.slice(0, 24) || t(this.properties.language, 'chat.newChat') })
    }
    if(detail.turnId && this._sessionCompletedChats.some(message => message.localTurnKey === turnKey)){
      this._sessionCompletedChats = this._sessionCompletedChats.map(message => {
        if(message.localTurnKey !== turnKey) return message
        const {localTurnKey, ...stopped} = message
        return {...stopped, conversationId, turnId:detail.turnId, runId:detail.runId || '',
          messageId:(message.role === 'assistant' ? detail.assistantMessageId : detail.userMessageId) || ''}
      })
      this.setData({sessionTurns:this.data.sessionTurns.map(item => item.turnKey === turnKey
        ? {...item, turnId:detail.turnId, assistantMessageId:detail.assistantMessageId || '', userMessageId:detail.userMessageId || ''}
        : item)})
      this.syncSessionCache(conversationId)
    }
  },

  /**
   * 对话结束
   * @param {*} e 
   */
  finish(e){
    const detail = e.detail || {}
    const turnKey = detail.turnKey || this._activeTurnKey
    if(turnKey && !this.data.sessionTurns.some(item => item.turnKey === turnKey)) return
    const latest = turnKey === this._activeTurnKey
    const input = this.selectComponent("#chatInput")
    if(latest && input && input.finish) input.finish()
    if(this._ignoreStreamFinish) return

    const conversationId = this.data.modeId === CHAT_MODE_IDS.TEMPORARY ? '' : detail.conversationId || this.data.currentConversationId
    if(this._regenerateObserver) this._regenerateObserver()
    this._regenerateObserver = null
    const assistant = (detail.chats || []).find(message => message.role === 'assistant')
    const user = (detail.chats || []).find(message => message.role === 'user')
    const sessionTurns = assistant?.turnId && turnKey
      ? this.data.sessionTurns.map(item => item.turnKey === turnKey
        ? {...item,
          turnId:assistant.turnId,
          assistantMessageId:assistant.messageId || item.assistantMessageId || '',
          userMessageId:user?.messageId || item.userMessageId || ''
        }
        : item)
      : this.data.sessionTurns
    if(latest){
      this._activeTurnKey = ''
      this._activeRuntimeTurnKey = ''
    }
    const historyInline = sessionTurns.find(item => item.turnKey === turnKey)?.historyInline
    this._sessionCompletedChats = [
      ...(historyInline || !assistant?.turnId && assistant?.status !== 'cancelled' ? [] : detail.chats || []),
      ...this._sessionCompletedChats
    ]
    const chats = this.data.chats.map(item => item.regenerateTurn?.turnKey === turnKey && assistant
      ? {...assistant, regenerateTurn:sessionTurns.find(turn => turn.turnKey === turnKey), preservedHeight:item.preservedHeight}
      : item)
    if(latest) chatRuntime.setVisibleTurn()
    this.setData({
      currentConversationId:conversationId,
      sessionTurns,
      chats,
      streamStatus:latest ? false : this.data.streamStatus,
    })
    this.syncSessionCache(conversationId)
    // 触觉反馈
    triggerHaptic(this.data.applicationSettings?.hapticFeedback, 'medium')

  },

  selectFeature(feature, tip){
    this.selectComponent("#funList").showFun()
    this.selectComponent("#chatInput").setPlaceHolder(tip)
    this.setData({
      feature:feature,
      selectedSkill:null,
      placeHolder: tip,
      thinking: feature == THINK,
      searching: feature == SEARCH,
      imging: feature == IMG,
      studying: feature == STUDY
    })
  },
  clearSelectedFeature(){
    const funList = this.selectComponent('#funList')
    if(funList && funList.hideFun) funList.hideFun()
    this.selectComponent("#chatInput").setPlaceHolder(t(this.properties.language, 'chat.askAnything'))
    this.setData({
      feature:'',
      selectedSkill:null,
      placeHolder: t(this.properties.language, 'chat.askAnything'),
      thinking:false,
      searching:false,
      imging:false,
      studying:false
    })
  },
  closeFun(){
    this.clearSelectedFeature()
  },

  showFeatures(e){
    this._conversationAnchorRect = e.detail?.rect || null
    this.showFeaturePopup(this.hasStartedConversation() ? 'conversation' : 'mode', e.detail?.rect)
  },

  hasStartedConversation(){
    return !!(this.data.currentConversationId || this.data.sessionTurns.length || this.data.chats.length)
  },

  async showFeaturePopup(type, anchorRect){
    const popup = this.selectComponent('#featurePopup')
    if(!popup) return
    const request = this._featurePopupRequest = (this._featurePopupRequest || 0) + 1
    if(type === 'more' || type === 'mode' || type === 'conversation') this.blurChatInput()

    if(type === 'more'){
      this.moreIconAn(true)
      popup.show(type)
      return
    }

    const opened = await popup.show(type, anchorRect)
    if(!opened && request === this._featurePopupRequest) this.selectComponent('#titleNav')?.closeFeatures()
  },

  closeFeaturePopup(){
    const popup = this.selectComponent('#featurePopup')
    if(popup) popup.close()
  },

  closeConversationSharePopup(conversationId){
    const popup = this.selectComponent('#featurePopup')
    if(popup?.data.popupType === 'conversation' && this.data.currentConversationId === conversationId){
      popup.close()
    }
  },

  showTemporaryInfo(){
    wx.nextTick(() => {
      const dialog = this.selectComponent('#temporaryInfoDialog')
      if(dialog && dialog.show) dialog.show()
    })
  },

  handleFeaturePopupClose(e){
    this._featurePopupRequest = (this._featurePopupRequest || 0) + 1
    const type = e.detail?.type
    if(type === 'more') this.moreIconAn(false)
    if(type === 'mode' || type === 'conversation') this.selectComponent('#titleNav').closeFeatures()
  },

  handleFeaturePopupAfterClose(e){
    if(e.detail?.type !== 'conversation') return
    if(this._pendingConversationFiles){
      const context = this._pendingConversationFiles
      this._pendingConversationFiles = null
      this.triggerEvent('openConversationFiles', context)
      return
    }
    if(!this._pendingConversationDelete) return
    this.selectComponent('#titleNav')?.hideFeatures()
    this.selectComponent('#conversationDeleteDialog')?.show(this._conversationAnchorRect)
  },

  selectConversationAction(e){
    const id = e.detail?.id
    const conversationId = this.data.currentConversationId
    if(id === 'share') return
    if(id === 'delete'){
      this._pendingConversationDelete = conversationId || 'temporary'
      this.closeFeaturePopup()
      return
    }
    if(id === 'file'){
      this._pendingConversationFiles = this.getConversationFileContext()
      this.closeFeaturePopup()
      return
    }
    if(!conversationId){
      this.closeFeaturePopup()
      wx.showToast({ title:t(this.properties.language, 'chat.temporaryActionUnavailable'), icon:'none' })
      return
    }
    if(id === 'pin') this.closeFeaturePopup()
    if(id === 'pin' || id === 'archive') this.triggerEvent('conversationAction', { id, conversationId })
  },

  getConversationFileContext(){
    const fileMessages = [...this.data.chats, ...(this._sessionCompletedChats || []), ...this.data.sessionTurns]
    return {
      conversationId:this.data.modeId === CHAT_MODE_IDS.TEMPORARY ? '' : this.data.currentConversationId,
      modeId:this.data.modeId,
      messages:[...fileMessages.map(message => ({ attachments:message.attachments, contentParts:message.contentParts, createdAt:message.createdAt })),
        ...this.data.files.filter(file => file.fileID).map(file => ({ attachments:[{ ...file, type:'attachment', attachmentType:file.fileType, assetId:file.assetId }] }))]
    }
  },

  confirmConversationDelete(){
    const conversationId = this._pendingConversationDelete === 'temporary' ? '' : this._pendingConversationDelete
    if(!this._pendingConversationDelete) return
    this._pendingConversationDelete = ''
    this.selectComponent('#conversationDeleteDialog')?.hide(false)
    this.selectComponent('#titleNav')?.closeFeatures()
    this.resetChatSession()
    if(conversationId) this.triggerEvent('deleteConversation', { conversationId })
  },

  conversationDeleteDialogClosed(){
    this._pendingConversationDelete = ''
    this.selectComponent('#titleNav')?.closeFeatures()
  },

  selectMode(e){
    if(this.hasStartedConversation()) return
    const id = e.detail?.id ?? e.currentTarget?.dataset?.id
    const item = this.data.modeOptions.find(option => option.id === id)
    if(!item) return

    const previousModeId = this.data.modeId
    if(this.data.modelCatalogReady) this._smartModePreferences = rememberSmartMode(
      this._smartModePreferences,
      previousModeId,
      this.data.smartMode
    )
    const smartMode = this.data.modelCatalogReady && resolveSmartMode(item.id, this._smartModePreferences)
    this.dismissReasoningSlider()
    this.setData({ modeId:item.id, modeName:item.name, smartMode }, () => {
      const input = this.selectComponent('#chatInput')
      if(input && input.setPlaceHolder) {
        input.setPlaceHolder(item.id === CHAT_MODE_IDS.TEMPORARY
          ? t(this.properties.language, 'chat.temporary') : t(this.properties.language, 'chat.askAnything'))
      }
      this.triggerEvent('modeChange', { modeId: this.data.modeId })
      this.syncSmartMode(this.data.smartMode)
      if(this.data.modeId === CHAT_MODE_IDS.WORK) this.showModelSummary()
      else this.hideModelSummary()
    })
    this.closeFeaturePopup()
  },

  selectMoreFeature(e){
    const id = e.detail?.id ?? e.currentTarget?.dataset?.id
    this.closeFeaturePopup()
    if(id === 'smart'){
      this.setSmartMode(!this.data.smartMode)
      return
    }
    if(id === 'camera' || id === 'photo' || id === 'file'){
      this.chooseAttachment(id)
      return
    }
    if(id === 'plugin') this.openFilePage()
  },

  chooseAttachment(action){
    const context = this.draftContext()
    const success = (res) => {
      if(!this._destroyed && context.epoch === chatRuntime.epoch && context.version === this._conversationLoadVersion){
        this.addSelectedFiles(res.tempFiles)
      }
    }
    if(action === 'file'){
      wx.chooseMessageFile({
        count:9,
        type:'file',
        extension:PICKER_FILE_EXTENSIONS,
        success
      })
      return
    }

    wx.chooseMedia({
      count:action === 'camera' ? 1 : 9,
      mediaType:['image'],
      sourceType:action === 'camera' ? ['camera', 'album'] : ['album'],
      maxDuration:30,
      camera:'back',
      success
    })
  },

  async setSmartMode(enabled){
    const modeId = this.data.modeId
    if(enabled && (!await this.ensureModelCatalogReady() || this.data.modeId !== modeId)) return
    const smartMode = this.data.modelCatalogReady && (this.data.modeId === CHAT_MODE_IDS.WORK || enabled === true)
    this._smartModePreferences = rememberSmartMode(
      this._smartModePreferences,
      this.data.modeId,
      smartMode
    )
    if(this.data.smartMode === smartMode) return
    if(!smartMode) this.dismissReasoningSlider()
    this.setData({ smartMode }, () => this.syncSmartMode(this.data.smartMode))
  },

  syncSmartMode(smartMode){
    const input = this.selectComponent('#chatInput')
    if(input && input.setSmartMode) input.setSmartMode(smartMode)
    if(!smartMode){
      this.hideModelSummary()
      const models = this.selectComponent('#modelsSelect')
      if(models && models.dismiss) models.dismiss()
      this.setData({ modelPickerOpen:false })
    }
  },

  moreIconAn(hide){
    this.moreIconSca.value = timing(hide ? .8 : 1,{duration:durationTime})
    this.moreIconOpa.value = timing(hide ? 0 : 1,{duration:durationTime})
    this.moreIconTra.value = sequence(timing(-10,{duration:durationTime/2}), timing(0,{duration:durationTime/2}))
  },

  hideModelSummary(){
    if(!this.modelSummaryWidth) return
    this.modelSummaryWidth.value = timing(0,{duration:durationTime})
    this.modelSummarySca.value = timing(.8,{duration:durationTime})
    this.modelSummaryOpa.value = timing(0,{duration:durationTime})
    this.modelSummaryTra.value = sequence(timing(-10,{duration:durationTime/2}), timing(0,{duration:durationTime/2}))
  },

  showModelSummary(){
    if(this.data.modeId !== CHAT_MODE_IDS.WORK || this.data.modelPickerOpen || !this.modelSummaryWidth) return
    this.modelSummaryWidth.value = timing(rpx2px(220,this.systemInfo.screenWidth),{duration:durationTime})
    this.modelSummarySca.value = timing(1,{duration:durationTime})
    this.modelSummaryOpa.value = timing(1,{duration:durationTime})
    this.modelSummaryTra.value = sequence(timing(-10,{duration:durationTime/2}), timing(0,{duration:durationTime/2}))
  },

  openSet(){
    triggerHaptic(this.data.applicationSettings?.hapticFeedback, 'light')
    this.triggerEvent('openSettings')
  },
  createConversationSnapshot(data = {}){
    chatRuntime.acceptOwner(data.ownerKey)
    let chats = fillResponseFeatures((data.messages || [])
      .map(message => normalizeHistoryMessage(message, this.properties.language))
      .filter(Boolean)
      .reverse())
    chats = withBranchPoint(chats, data.conversation?.branchOrigin)
    const record = data.activeTurn ? chatRuntime.restoreConversation(data) : null
    const stopped = Boolean(record?.cancelRequested || record?.assistant?.displayStop)
    if(stopped){
      const stoppedMessages = [record.user, {...record.assistant, status:'cancelled',
        messageId:record.meta.assistantMessageId, turnId:record.meta.turnId, conversationId:record.meta.conversationId}]
        .map(message => normalizeHistoryMessage(message, this.properties.language)).filter(Boolean).reverse()
      const ids = new Set(stoppedMessages.map(message => message.messageId))
      chats = [...stoppedMessages, ...chats.filter(message => !ids.has(message.messageId))]
    }
    const activeTurn = stopped ? null : record?.meta || null
    let activeSessionTurn = null
    if(activeTurn){
      const assistant = record.assistant
      const user = record.user
      const featureMeta = getChatFeatureMeta(activeTurn.feature || getChatFeatureFromContentParts(user?.contentParts))
      chats = chats.filter(item => item.messageId !== activeTurn.assistantMessageId && item.messageId !== activeTurn.userMessageId)
      activeSessionTurn = {
        turnKey:record.key,
        conversationId:activeTurn.conversationId,
        turnId:activeTurn.turnId,
        runId:activeTurn.runId,
        assistantMessageId:activeTurn.assistantMessageId,
        userMessageId:activeTurn.userMessageId,
        lastEventSeq:Number.isInteger(assistant?.snapshotSeq) ? assistant.snapshotSeq : -1,
        streamContent:user?.content || '',
        contentParts:user?.contentParts || [],
        attachments:getMessageAttachments(
          Array.isArray(user?.attachments) && user.attachments.length ? user.attachments : user?.contentParts || []
        ),
        thinking:featureMeta.value === THINK,
        imging:featureMeta.value === IMG, searching:featureMeta.value === SEARCH, studying:featureMeta.value === STUDY,
        modeId:data.conversation?.modeId || CHAT_MODE_IDS.CHAT,
        modelId:activeTurn.modelId || '', effortId:activeTurn.effortId || '', reasoningEnabled:activeTurn.reasoningEnabled === true,
        modelName:getSelectionView(this.data.modelCatalog, { modelId:activeTurn.modelId || '', effortId:activeTurn.effortId || '' }).modelName,
        requestReady:true,
        feature:featureMeta.value, featureLabel:getChatMessageLabel(user?.contentParts, this.properties.language), layoutOwner:true,
        thinkOpen:chatRuntime.getView(activeTurn.conversationId)?.thinkOpen === true
      }
    }
    return {
      chats,
      activeTurn,
      activeSessionTurn,
      conversation:data.conversation || null,
      messageVersion: data.messageVersion || '',
      nextCursor: data.nextCursor ?? null,
      hasMore: data.hasMore === true
    }
  },
  applyConversationSnapshot(conversationId, snapshot, options = {}){
    const chats = (Array.isArray(snapshot.chats) ? snapshot.chats : []).map(chat =>
      chat.role === 'user' ? {...chat, featureLabel:getChatMessageLabel(chat.contentParts, this.properties.language)}
      : chat.role === 'assistant' && ['cancelling', 'cancelled'].includes(chat.status)
        ? {...chat, ...normalizeHistoryMessage(chat, this.properties.language)} : chat)
    const historyInitialLoading = options.historyInitialLoading === true
    const historyRenderToken = options.historyRenderToken ?? this.data.historyRenderToken
    const conversation = snapshot.conversation || {}
    if(conversation.titleGenerationStatus === 'pending') chatRuntime.refreshConversationTitle(conversationId)
    const mode = this.data.modeOptions.find((item) => item.id === conversation.modeId)
    const pending = chatRuntime.getPendingTurns(conversationId).map(turn => ({ ...turn,
      featureLabel:getChatMessageLabel(turn.contentParts, this.properties.language) }))
    const activePending = pending.find(item => item.localStatus !== 'failed')
    this._activeTurnKey = activePending?.turnKey || snapshot.activeSessionTurn?.turnKey || ''
    this._activeRuntimeTurnKey = chatRuntime.getRunningKey(conversationId) || snapshot.activeSessionTurn?.runtimeKey || this._activeTurnKey
    if(!this.data.pageHidden) chatRuntime.setVisibleTurn(this._activeRuntimeTurnKey)
    this._sessionCompletedChats = []
    this._historyRenderWaiting = historyInitialLoading && chats.length > 0
    this.resetChatComposer()
    this.setData({
      chats,
      sessionTurns:[...pending.map((item) => ({...item, layoutOwner:item.turnKey === activePending?.turnKey})),
        ...(snapshot.activeSessionTurn ? [{...snapshot.activeSessionTurn, layoutOwner:!activePending}] : [])],
      currentConversationId: conversationId,
      isScheduledTask:conversation.isScheduledTask === true,
      currentConversationTitle: conversation.title || t(this.properties.language, 'chat.newChat'),
      currentConversationPinned:!!conversation.pinnedAt,
      branchOrigin: conversation.branchOrigin || null,
      ...(mode ? { modeId:mode.id, modeName:mode.name, smartMode:this.data.modelCatalogReady && resolveSmartMode(mode.id, this._smartModePreferences) } : {}),
      messageHistoryCursor: snapshot.nextCursor ?? null,
      messageHistoryHasMore: snapshot.hasMore === true,
      loadingOlderMessages: false,
      historyInitialLoading,
      historyRenderToken,
      sivId: 'assis-up',
      streamStatus: Boolean(snapshot.activeSessionTurn || activePending)
    }, () => {
      if(!options.fromCache && !this.data.pageHidden && !this._destroyed && this.data.currentConversationId === conversationId) {
        if(chats.some(chat => chat.role === 'assistant' && chat.status === 'completed' && chat.runId === conversation.completedRunId)) {
          chatRuntime.markConversationRead(conversationId, conversation.completedRunId)
        }
        if(!snapshot.activeTurn) this.removeChatRun(conversationId)
      }
      this.triggerEvent('modeChange', { modeId: this.data.modeId })
      this.syncSmartMode(this.data.smartMode)
      if(this.data.modeId === CHAT_MODE_IDS.WORK) this.showModelSummary()
      this.restoreConversationView(conversationId)
      if(snapshot.activeSessionTurn) this.tryStartSessionTurn(snapshot.activeSessionTurn.turnKey)
    })
  },
  saveConversationSnapshot(conversationId, snapshot){
    this.setChatMessageCacheEntry({
      conversationId,
      conversation:snapshot.conversation || null,
      messageVersion: snapshot.messageVersion || '',
      chats: snapshot.chats || [],
      nextCursor: snapshot.nextCursor ?? null,
      hasMore: snapshot.hasMore === true

    })
  },
  async loadConversation(conversation){
    const conversationId = typeof conversation === 'string'
      ? conversation
      : (conversation?.detail?.conversationId || conversation?.conversationId || '')
    if(!conversationId) return
    if(this.data.currentConversationId) this.syncSessionCache(this.data.currentConversationId)
    this.leaveConversation()
    this._activeTurnKey = ''
    this._activeRuntimeTurnKey = ''
    this._ignoreStreamFinish = false
    const accountVersion = chatRuntime.epoch

    const loadVersion = this._conversationLoadVersion + 1
    this._conversationLoadVersion = loadVersion
    const valid = () => !this._destroyed && loadVersion === this._conversationLoadVersion && accountVersion === chatRuntime.epoch
    const cached = this.getChatMessageCacheEntry(conversationId)
    if(cached){
      this.clearHistoryInitialLoading()
      this.applyConversationSnapshot(conversationId, cached, {
        fromCache:true,
        historyInitialLoading:false,
        historyRenderToken:loadVersion
      })
      this.setData({ validatingConversation:true })
      try {
        const statusRes = await getConversationMessagesStatus({ conversationId })
        if(!valid()) return
        const status = statusRes?.data || {}
        chatRuntime.acceptOwner(status.ownerKey)
        if(status.conversation){
          if(status.conversation.titleGenerationStatus === 'pending') chatRuntime.refreshConversationTitle(conversationId)
          const mode = this.data.modeOptions.find((item) => item.id === status.conversation.modeId)
          this.setData({
            currentConversationTitle:status.conversation.title || this.data.currentConversationTitle,
            currentConversationPinned:!!status.conversation.pinnedAt,
            isScheduledTask:status.conversation.isScheduledTask === true,
            ...(mode ? { modeId:mode.id, modeName:mode.name, smartMode:this.data.modelCatalogReady && resolveSmartMode(mode.id, this._smartModePreferences) } : {})
          }, () => {
            this.triggerEvent('modeChange', { modeId: this.data.modeId })
            this.syncSmartMode(this.data.smartMode)
          })
        }
        const completedRunId = status.conversation?.completedRunId
        const cachedReplyVisible = cached.chats.some(chat => chat.role === 'assistant' && chat.status === 'completed' && chat.runId === completedRunId)
        if(!status.activeTurn && status.messageVersion && status.messageVersion === cached.messageVersion && (!completedRunId || cachedReplyVisible)){
          if(!this.data.pageHidden) {
            if(cachedReplyVisible) chatRuntime.markConversationRead(conversationId, completedRunId)
            this.removeChatRun(conversationId)
          }
          this.saveConversationView()
          this.setData({ streamStatus:false })
          this.restoreConversationView(conversationId)
          return
        }
        const res = await getConversationMessages({ conversationId })
        if(!valid()) return
        this.saveConversationView()
      const snapshot = this.createConversationSnapshot(res?.data || {})
        this.applyConversationSnapshot(conversationId, snapshot, {
          historyInitialLoading:false,
          historyRenderToken:loadVersion
        })
        this.saveConversationSnapshot(conversationId, snapshot)
      } catch (error) {
        if(valid()){ this.saveConversationView(); this.setData({ streamStatus:false }); this.restoreConversationView(conversationId) }
      } finally {
        if(valid()) this.setData({ validatingConversation:false })
      }
      return
    }

    this.clearHistoryInitialLoading(false)
    this.resetChatComposer()
    this.setData({
      chats:[], sessionTurns:[], currentConversationId:conversationId, isScheduledTask:false, branchOrigin:null,
      currentConversationTitle:t(this.properties.language, 'chat.newChat'),
      currentConversationPinned:false,
      streamStatus:false, validatingConversation:false, historyInitialLoading:true
    }, () => this.restoreConversationView(conversationId))
    try {
      const res = await getConversationMessages({ conversationId })
      if(!valid()) return
      this.saveConversationView()
      const snapshot = this.createConversationSnapshot(res?.data || {})
      this.applyConversationSnapshot(conversationId, snapshot, {
        historyInitialLoading:snapshot.chats.length > 0,
        historyRenderToken:loadVersion
      })
      this.saveConversationSnapshot(conversationId, snapshot)
      if(snapshot.chats.length > 0) this.startHistoryRenderFallback(loadVersion)
      else this.clearHistoryInitialLoading()
    } catch (error) {
      if(valid()) {
        this.clearHistoryInitialLoading()
        wx.showToast({ title:t(this.properties.language, 'chat.sessionLoadFailed'), icon:'none' })
      }
    }
  },
  blurChatInput(){
    this.setData({ inputFocus: false })
    const input = this.selectComponent('#chatInput')
    if(input) input.setInputFocus(false)
    wx.hideKeyboard()
  },
  moreFun(){
    triggerHaptic(this.data.applicationSettings?.hapticFeedback, 'light')
    this.showFeaturePopup('more')
  },

  openFilePage(action = '', fromMention = false){
    this.triggerEvent('openFile', {
      action,
      fromMention,
      feature:this.data.feature,
      skillId:this.data.selectedSkill?.id || '',
      thinking:this.data.thinking,
      imging:this.data.imging,
      searching:this.data.searching,
      studying:this.data.studying
    })
  },

  cancelVoice(){
    this.selectComponent("#chatInput")?.cancelVoice()
  },
  draftContext(){
    return { epoch:chatRuntime.epoch, version:this._conversationLoadVersion,
      key:this.data.currentConversationId || this._activeTurnKey || 'new' }
  },
  updateDraftFiles(context, update){
    if(context.epoch !== chatRuntime.epoch) return
    if(!this._destroyed && context.version === this._conversationLoadVersion){
      const files = update(this.data.files)
      this.setData({ files })
      if(!files.length) this.selectComponent('#fileList')?.hideFun()
    } else {
      const state = chatRuntime.getView(context.key)
      const files = update(state?.files || [])
      if(state) chatRuntime.saveView(context.key, { ...state, files })
    }
  },
  attachmentSelectionError(files = []){
    const language = this.properties.language
    if(files.length > 9) return t(language, 'attachments.limit')
    if(files.some(file => !isSupportedChatAttachment(file))) return t(language, 'attachments.unsupportedFormat')
    for(const file of files){
      const limit = getFileExtension(file) === 'pdf' ? 50 : 20
      if(Number(file.size) > limit * 1024 * 1024) return t(language, 'attachments.tooLarge', { limit })
    }
    if(this.data.user?.login !== true && files.reduce((size, file) => size + (Number(file.size) || 0), 0) > GUEST_UPLOAD_LIMIT_BYTES){
      return t(language, 'attachments.guestTooLarge')
    }
    return ''
  },
  addSelectedFiles(selectedFiles = []){
    if(!selectedFiles.length) return
    if(selectedFiles.some(file => !isSupportedChatAttachment(file))){
      this.showUploadFailure(t(this.properties.language, 'attachments.unsupportedFormat'))
      return
    }
    const available = Math.max(0, 9 - this.data.files.length)
    if(selectedFiles.length > available){
      wx.showToast({ title:t(this.properties.language, 'attachments.limit'), icon:'none' })
    }
    const incomingFiles = selectedFiles.slice(0, available).map((file, index) => {
      const normalized = normalizeSelectedFile(file)
      return Object.assign({}, normalized, {
        draftId:`${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
        sizeText:formatFileSize(normalized.size),
        uploadStatus:'selected'
      })
    })
    if(!incomingFiles.length) return
    const files = [...incomingFiles, ...this.data.files]
    const attachmentError = this.attachmentSelectionError(files)
    if(attachmentError){
      this.showUploadFailure(attachmentError)
      return
    }

    this.setData({
      files
    })
    this.selectComponent("#fileList").showFun()
  },
  async deleteFile(e){
    const index = Number(e?.detail?.index)
    const file = this.data.files[index]
    if(!file) return
    if(!file.fileID){
      const files = this.data.files.filter((_, position) => position !== index)
      this.setData({ files })
      if(!files.length) this.selectComponent('#fileList')?.hideFun()
      return
    }
    if(file.uploadStatus !== 'uploaded') return
    const context = this.draftContext()
    const fileID = file.fileID
    this.setData({[`files[${index}].uploadStatus`]:'deleting'})
    try {
      await deleteCloudFile(fileID)
      this.updateDraftFiles(context, files => files.filter(item => item.fileID !== fileID))
    } catch (error) {
      this.updateDraftFiles(context, files => files.map(item => item.fileID === fileID ? {...item, uploadStatus:'uploaded'} : item))
      if(!this._destroyed && context.epoch === chatRuntime.epoch && context.version === this._conversationLoadVersion){
        this.showUploadFailure(error.message || t(this.properties.language, 'attachments.deleteFailed'))
      }
    }
  },
  showUploadFailure(message = t(this.properties.language, 'attachments.uploadFailed'), deletedAssetNotice = false){
    if(this._destroyed) return
    this.setData({ uploadNoticeText:message, deletedAssetNotice }, () => {
      if(!this._destroyed) this.selectComponent('#uploadNotice')?.show(message)
    })
  },
  hideUploadFailure(){ this.selectComponent('#uploadNotice')?.hide() },
  /**
   * 聊天发送所有文件
   */
  async uploadSelectedFiles(files){
    const uploaded = await uploadCloudFiles(files.map((file) => ({
      filePath:file.previewPath,
      fileName:file.name,
      dir:file.fileType === 'image' ? 'uploads/image' : 'uploads/file',
      ext:file.extension,
      fallbackExt:file.fileType === 'image' ? 'jpg' : 'dat',
      size:file.size,
      mimeType:file.mimeType
    })))
    return files.map((file, index) => {
      const result = uploaded[index]
      if(!result || !result.fileID) throw new Error(t(this.properties.language, 'attachments.attachmentUploadFailed'))
      const size = result.size || file.size
      return Object.assign({}, file, {
        fileID:result.fileID,
        assetId:result.assetId || file.assetId || '',
        size,
        sizeText:formatFileSize(size),
        uploadStatus:'uploaded'
      })
    })
  },

  sendAllFile(){
    this.setData({files:[]})
    const fileList = this.selectComponent('#fileList')
    if(fileList && fileList.hideFun) fileList.hideFun()
  },
  fIconAn(hide,duration=250){
    this.ficonScale.value = timing(hide ? 1.8 : 1 ,{duration:duration})
    this.ficonOpa.value = timing(hide ? 0 : 1 ,{duration:duration})
  },
  upScroll(e){
    'worklet'
    const st = e.detail.scrollTop 
    if(-50 <= st && st <= 300){
      this.topIconSca.value = Math.max(Math.min(st/250,1),0)
    }
    

  },
  endScroll(e){
    'worklet'
    const st = e.detail.scrollTop 
    if(st >= 300){
      this.topIconSca.value = 1
    }else if(st <= 0){
      this.topIconSca.value = 0
    }else{
      this.topIconSca.value = timing(this.topIconSca.value >= 0.75 ? 1 : 0,{duration:durationTime})
    }
  },

  /**
   * 滚动到顶部 加载
   * @param {Object} e - 事件对象
   */
  toTop(e){
    this.loadOlderMessages()
  },
  async loadOlderMessages(){
    const conversationId = this.data.currentConversationId
    const beforeSeq = this.data.messageHistoryCursor
    if(this.data.historyInitialLoading || !conversationId || !beforeSeq || !this.data.messageHistoryHasMore || this.data.loadingOlderMessages) return

    const loadVersion = this._conversationLoadVersion
    const accountVersion = chatRuntime.epoch
    this.setData({ loadingOlderMessages: true })
    try {
      const res = await getConversationMessages({ conversationId, beforeSeq })
      if(this._destroyed || accountVersion !== chatRuntime.epoch || loadVersion !== this._conversationLoadVersion || conversationId !== this.data.currentConversationId) return
      const data = res?.data || {}
      chatRuntime.acceptOwner(data.ownerKey)
      const olderChats = withBranchPoint(fillResponseFeatures((data.messages || [])
        .map(message => normalizeHistoryMessage(message, this.properties.language))
        .filter(Boolean)
        .reverse()), this.data.branchOrigin)
      this.setData({
        chats: [...this.data.chats, ...olderChats],
        messageHistoryCursor: data.nextCursor ?? null,
        messageHistoryHasMore: data.hasMore === true
      })
    } catch (error) {
      if(this._destroyed || accountVersion !== chatRuntime.epoch || loadVersion !== this._conversationLoadVersion) return
      wx.showToast({ title:t(this.properties.language, 'chat.historyLoadFailed'), icon:'none' })
    } finally {
      if(loadVersion === this._conversationLoadVersion && conversationId === this.data.currentConversationId) {
        this.setData({ loadingOlderMessages: false })
      }
    }
  },
  back2Top(){
    this.setData({sivId:'assis-up'})
  },


  setFoucs(focus){
    this.setData({inputFocus:focus})
  },
  goVoice(){
    triggerHaptic(this.data.applicationSettings?.hapticFeedback, 'medium')
    this.setFoucs(false)
    this.triggerEvent('openVoice')
  },
  openLeft(){
    this.setFoucs(false)
    this.triggerEvent('openLeft')
  },
  openPlugins(){
    this.setFoucs(false)
    this.openFilePage('', true)
  },
  async showModels(e){
      if(this._openingModels || this.data.modelPickerOpen) return
      const modeId = this.data.modeId
      const anchorRect = e?.detail?.anchorRect
      if(modeId !== CHAT_MODE_IDS.WORK && !anchorRect) return
      this._openingModels = true
      try {
          if(!await this.ensureModelCatalogReady() || this.data.modeId !== modeId) return
          if(modeId !== CHAT_MODE_IDS.WORK) this.commitReasoning(e)
          const query = this.createSelectorQuery()
          query.select('.model-summary').boundingClientRect()
          query.select('.chat-page').boundingClientRect()
          let [rect,boundaryRect] = await new Promise(resolve => query.exec(resolve))
          if(this._destroyed || this.data.modeId !== modeId) return
          rect = anchorRect || rect
          if(!rect || !boundaryRect) return
          this.closeFeaturePopup()
          this.setData({ modelPickerOpen:true })
          if(modeId === CHAT_MODE_IDS.WORK) this.hideModelSummary()
          if(!await this.selectComponent("#modelsSelect").show(rect,boundaryRect)) this.closeModels()
      } catch(error) {
          this.closeModels()
          throw error
      } finally {
          this._openingModels = false
      }
  },
  async showReasoningSlider(){
    if(this.data.modeId === CHAT_MODE_IDS.WORK || !this.data.smartMode) return
    if(!await this.ensureModelCatalogReady()) return
    this.closeFeaturePopup()
    const slider = this.selectComponent('#reasoningSlider')
    if(slider && slider.show && slider.show()) this.setReasoningSliderOpen(true)
  },
  commitReasoning(e){
    const modelId = e.detail?.modelId
    const effortId = e.detail?.effortId
    if(!modelId || !effortId || (modelId === this.data.reasoningModelId && effortId === this.data.reasoningEffortId)) return
    const selection = normalizeModeSelection(this.data.modelCatalog, this.data.modeId, { modelId, effortId })
    const view = getSelectionView(this.data.modelCatalog, selection)
    const reasoningEfforts = getReasoningChoices(withLockedModels(
      this.data.modelCatalog.models, this.data.accessPlan, this.properties.language
    ), selection.modelId).options
    const index = getReasoningIndex(reasoningEfforts, selection.modelId, selection.effortId)
    this.setData({
      reasoningModelId:selection.modelId,
      reasoningModelName:view.modelName,
      reasoningEffortId:selection.effortId,
      reasoningEffortLabel:withLockedEfforts(view.efforts, this.data.accessPlan, this.properties.language)
        .find((effort) => effort.id === selection.effortId)?.label || '',
      reasoningEfforts,
      reasoningProgress:index / Math.max(1, reasoningEfforts.length - 1)
    })
  },
  startCloseReasoningSlider(e){
    if(!e.detail?.handoff) this.setData({ reasoningSliderClosing:true })
  },
  closeReasoningSlider(e){
    if(e.detail?.changed) triggerHaptic(this.data.applicationSettings?.hapticFeedback, 'light')
    this.setReasoningSliderOpen(false)
  },
  dismissReasoningSlider(){
    const slider = this.selectComponent('#reasoningSlider')
    if(slider && slider.dismiss) slider.dismiss()
    this.setReasoningSliderOpen(false)
  },
  setReasoningSliderOpen(open){
    const reasoningSliderOpen = open === true
    const changed = this.data.reasoningSliderOpen !== reasoningSliderOpen
    if(!changed && !this.data.reasoningSliderClosing) return
    this.setData({ reasoningSliderOpen, reasoningSliderClosing:false })
    if(changed) this.triggerEvent('reasoningSliderChange', { open:reasoningSliderOpen })
  },
  openSources(e){
    this.triggerEvent('openSources', e.detail || {}, {})
  },
  shareMessage(e){
    this.triggerEvent('share', e.detail || {}, {})
  },
  async moreAction(e){
    const detail = e.detail || {}
    if(detail.action === 'readAloud') {
      this.selectComponent('#readAloud')?.play(detail.item)
      return
    }
    if(detail.action === 'webSearch' || detail.action === 'deepResearch') {
      this.regenerate({ detail:{ ...detail.item, selectedFeature:detail.action === 'webSearch' ? SEARCH : THINK } })
      return
    }
    if(detail.action !== 'branch') {
      this.triggerEvent('moreAction', detail, {})
      return
    }
    const conversationId = detail.item?.conversationId
    const turnId = detail.item?.turnId
    if(this.data.branchLoadingTurnId || !conversationId || !turnId) return
    this.setData({ branchLoadingTurnId:turnId })
    try {
      const result = await createConversationBranch({ conversationId, turnId })
      const newId = result?.data?.conversationId
      if(!newId) throw new Error('分支响应不完整')
      this.triggerEvent('conversationCreated')
      this.loadConversation(newId)
    } catch(error) {
      wx.showToast({ title:'创建失败', icon:'none' })
    } finally {
      this.setData({ branchLoadingTurnId:'' })
    }
  },
  openBranchSource(e){
    const sourceId = e.currentTarget.dataset.conversationId
    if(sourceId) this.loadConversation(sourceId)
  },
  showSpeechError(e){
    wx.showToast({ title:e.detail.message, icon:'none' })
  },
  copyMessage(e){
    wx.setClipboardData({ data:e.detail?.content || '' })
  },
  async previewMessageAttachment(e){
    if(this._previewingMessageAttachment) return
    const detail = e?.detail || {}
    if(!detail.attachment) return
    if(detail.attachment.unavailableReason){
      this.openDeletedMessageAsset()
      return
    }
    this._previewingMessageAttachment = true
    try {
      await previewStorageFile(detail.attachment, {
        relatedItems: detail.attachments,
        language: this.properties.language
      })
    } finally {
      this._previewingMessageAttachment = false
    }
  },
  openDeletedMessageAsset(){
    this.showUploadFailure(t(this.properties.language, 'assets.fileDeleted'), true)
  },
  openStorageUpgrade(){
    this.hideUploadFailure()
    openStorageUpgrade()
  },
  markDeletedMessageAssets(unavailable){
    if (!unavailable.size) return
    const mark = parts => (parts || []).map(part => unavailable.has(part.fileID)
      ? { ...part, unavailableReason:'storage_deleted' } : part)
    this.setData({
      chats:this.data.chats.map(message => ({ ...message, contentParts:mark(message.contentParts), attachments:mark(message.attachments) })),
      sessionTurns:this.data.sessionTurns.map(turn => ({ ...turn, contentParts:mark(turn.contentParts), attachments:mark(turn.attachments) }))
    })
    this.data.sessionTurns.forEach(turn => this.selectComponent(`#assis-stream-${turn.turnKey}`)?.markUnavailableFileIds(unavailable))
  },
  async refreshDeletedMessageAssets(){
    const conversationId = this.data.currentConversationId
    const version = this._conversationLoadVersion
    if (!conversationId || this._destroyed) return
    try {
      const result = await getConversationMessages({ conversationId })
      if (this._destroyed || version !== this._conversationLoadVersion || conversationId !== this.data.currentConversationId) return
      const unavailable = new Set((result?.data?.messages || [])
        .flatMap(message => message.contentParts || [])
        .filter(part => part?.unavailableReason && part.fileID)
        .map(part => part.fileID))
      this.markDeletedMessageAssets(unavailable)
    } catch (_) { /* Keep the current messages on a transient refresh failure. */ }
  },
  openReasoning(e){
    const detail = e?.detail || {}
    const processTrace = normalizeProcessTrace(detail.processTrace)
    if(!processTrace.length && !String(detail.content || '').trim()) return
    this.triggerEvent('openReasoning', {
      content:detail.content,
      durationText:detail.durationText || '',
      processTrace,
      processDurationMs:Number(detail.processDurationMs) || 0,
      status:detail.status || '',
      turnKey:detail.turnKey || '',
      stopped:detail.stopped === true
    })
  },
  prepareUserContent(rect, height){
    const window = wx.getWindowInfo()
    const menu = wx.getMenuButtonBoundingClientRect()
    // Two action rows: 48rpx line height + 64rpx vertical padding; 2px menu border.
    const layout = layoutContent(rect, height, window.windowHeight, menu.bottom + 12,
      224 * window.windowWidth / 750 + 2, window.safeArea?.bottom || window.windowHeight)
    this.contentTop.value = rect.top - 2
    this.contentRight.value = window.windowWidth - rect.right - 2
    this.oldTop.value = rect.top - 2
    this.contentHeight.value = height
    this.moveSca.value = layout.scale
    this.moveTop.value = layout.top
    return layout
  },
  showUserContent(e){
    const detail = e.detail || {}
    userBigContentIndex = detail.index
    this._userContentSource = detail.turnKey
      ? { type:'stream', turnKey:detail.turnKey }
      : { type:'done', index:detail.index }
    this.setData({contentBig:detail.content}, () => {
      this.selectComponent("#userContent").show(detail.rect, detail.featureLabel)
    })
    this.selectComponent(`#chatInput`).setInputFocus(false)
  },

  showOldContent(){
    const source = this._userContentSource
    const selector = source?.type === 'stream'
      ? `#assis-stream-${source.turnKey}`
      : `#assisdone_${userBigContentIndex}`
    const component = this.selectComponent(selector)
    if(component && component.showContent) component.showContent()
  },

  editContent(e){
    this.selectComponent(`#chatInput`).setCopytext(e.detail.askText)

  }
  }
})
