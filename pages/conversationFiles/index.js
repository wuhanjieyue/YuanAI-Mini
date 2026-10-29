const { showErrorNotice } = require('../../static_utils/errorNotice')
const { bindPageTheme, unbindPageTheme, syncThemeNavigation } = require('../../static_utils/themeBinding')
const { getConversationMessages } = require('../../request/chatStream')
const { collectConversationFiles } = require('../../static_utils/conversationFiles')
const { refreshAssetMetadata } = require('../../request/assetCache')
const { presentAsset } = require('../../static_utils/assetPresentation')
const { messages } = require('../../static_utils/i18n/index')
const { t } = require('../../static_utils/i18n/index')
const { store } = require('../../store/index')
const { getSettingSheetMetrics } = require('../../static_router/settingRouter')

Page({
  data: { files:[], loading:false, title:'', language:'中文', sheetHeight:0 },

  onLoad() {
    bindPageTheme(this)
    this.setData({ sheetHeight:getSettingSheetMetrics().sheetHeight })
    this.getOpenerEventChannel().on('showConversationFiles', context => {
      this._context = context
      const language = store.applicationSettings?.language || '中文'
      const modeKey = context.modeId === 'work' ? 'chat.work' : context.modeId === 'temporary' ? 'chat.temporaryShort' : 'home.chat'
      this.setData({ language, title:`${t(language, modeKey)}${language === 'English' ? ' ' : ''}${t(language, 'library.title')}` })
      this.loadFiles()
    })
  },

  async loadFiles() {
    const context = this._context
    if (!context) return
    const version = this._loadVersion = (this._loadVersion || 0) + 1
    const epoch = store.assetCacheEpoch
    const current = () => version === this._loadVersion && epoch === store.assetCacheEpoch
    const language = this.data.language
    const local = Array.isArray(context.messages) ? context.messages : []
    this.setData({ files:collectConversationFiles(local, language), loading:true })
    try {
      const pages = context.conversationId ? [] : local
      let beforeSeq = null
      while (context.conversationId) {
        const result = await getConversationMessages({ conversationId:context.conversationId, beforeSeq })
        if (!current()) return
        const data = result?.data || {}
        pages.push(...(data.messages || []))
        this.setData({ files:collectConversationFiles(pages, language) })
        if (!data.hasMore || !data.nextCursor || data.nextCursor === beforeSeq) break
        beforeSeq = data.nextCursor
      }
      if (context.modeId !== 'temporary') {
        const files = await refreshAssetMetadata(collectConversationFiles(pages, language))
        if (!current()) return
        this.setData({ files:files.map(item => presentAsset(item, messages(language), language)) })
      }
    } catch (error) {
      if (current()) showErrorNotice({ title:error?.message || t(language, 'common.loadFailed') })
    } finally {
      if (version === this._loadVersion) this.setData({ loading:false, ...(epoch !== store.assetCacheEpoch ? { files:[] } : {}) })
    }
  },

  chatAsset(e) {
    if (e.detail.epoch !== store.assetCacheEpoch) return
    this.getOpenerEventChannel().emit('chatAsset', e.detail)
    this.closePage()
  },
  closePage() { wx.navigateBack() },
  onShow() { syncThemeNavigation(this) },
  onUnload() { this._loadVersion = (this._loadVersion || 0) + 1; unbindPageTheme(this) }
})
