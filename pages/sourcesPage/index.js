const { showErrorNotice, showNotice } = require('../../static_utils/errorNotice')
const { bindPageTheme, unbindPageTheme, syncThemeNavigation } = require('../../static_utils/themeBinding')
const { sourceIconUrl } = require('../../static_utils/sourceIcons')
const { shared, runOnJS } = wx.worklet
const { normalizeCitations } = require('../../static_utils/chatSources')
const { store } = require('../../store/index')
const { messages, t } = require('../../static_utils/i18n/index')
const app = getApp()
const { knowledgeCitationId, resolveKnowledgeCitation } = require('../../request/knowledge')
const { previewStorageFile } = require('../../static_utils/filePreview')

Page({
  onShow() { syncThemeNavigation(this) },
  onUnload() { this._unloaded = true; unbindPageTheme(this) },
  data: { citations:[], i18n:messages('中文') },

  onLoad() {
    bindPageTheme(this)
    const language = store.applicationSettings.language
    const i18n = messages(language)
    this.setData({ i18n })
    const eventChannel = this.getOpenerEventChannel()
    if(eventChannel && eventChannel.on){
      eventChannel.on('showSources', (data = {}) => {
        this.setData({ citations:normalizeCitations(data.citations).map(item => ({
          ...item,
          showSite:!knowledgeCitationId(item.url),
          showTitle:item.title !== '来源' && item.title !== i18n.sources.title && item.title.toLowerCase().replace(/^www\./, '') !== item.domain && item.title !== item.siteName,
          iconUrl:sourceIconUrl(item),
          description:(item.description || '').replace(/\s+/g, ' '),
          ariaLabel:t(language, knowledgeCitationId(item.url) ? 'sources.openOriginal' : 'sources.copyLink', { title:item.title })
        })) })
        this.data.citations.forEach((item, index) => {
          if (knowledgeCitationId(item.url) && !item.showTitle) {
            this.setData({ [`citations[${index}].title`]:i18n.sources.openOriginal, [`citations[${index}].showTitle`]:true })
            this.loadKnowledgeTitle(index, item.url)
          }
        })
      })
    }

    const screenHeight = app.globalData.su_system.screenHeight || wx.getWindowInfo().screenHeight
    const menuBottom = app.globalData.su_menu.bottom || 0
    this.sheetHeight = shared(Math.max(screenHeight - menuBottom - 20, 0))
    this.sheetWidth = shared(0.95)

    this.applyAnimatedStyle('.sheet', () => {
      'worklet'
      return { height:`${this.sheetHeight.value}px` }
    })
    this.applyAnimatedStyle('.scrollable', () => {
      'worklet'
      return { width:`${this.sheetWidth.value * 100}%` }
    })
    this.applyAnimatedStyle('.move-bg', () => {
      'worklet'
      return { width:`${this.sheetWidth.value * 100}%` }
    })
  },

  onSizeUpdate(e) {
    'worklet'
    this.sheetWidth.value = e.size <= 0.6 ? 0.95 : 0.9 + 0.1 * e.size
    if(e.size <= 0.01) runOnJS(this.closePage.bind(this))()
  },

  iconError(e) {
    const index = e.currentTarget.dataset.index
    if(this.data.citations[index]) this.setData({ [`citations[${index}].iconUrl`]:'' })
  },

  copySource(e) {
    const item = this.data.citations[e.currentTarget.dataset.index]
    if(!item) return
    const knowledgeId = knowledgeCitationId(item.url)
    if (knowledgeId) { this.openKnowledgeEvidence(knowledgeId); return }
    wx.setClipboardData({
      data:item.url,
      success:() => { wx.hideToast(); showNotice({ title:this.data.i18n.sources.copied }) }
    })
  },

  async loadKnowledgeTitle(index, url) {
    const epoch = store.assetCacheEpoch
    const current = () => !this._unloaded && epoch === store.assetCacheEpoch && this.data.citations[index]?.url === url
    try {
      const evidence = await resolveKnowledgeCitation(knowledgeCitationId(url))
      if (!current()) return
      this.setData({
        [`citations[${index}].title`]:evidence.title,
        [`citations[${index}].description`]:(evidence.text || '').replace(/\s+/g, ' ').trim().slice(0, 500),
        [`citations[${index}].ariaLabel`]:this.data.i18n.sources.openOriginal
      })
    } catch (error) {
      if (current()) showErrorNotice({ title:error.message || '资料暂不可访问' })
    }
  },

  async openKnowledgeEvidence(id) {
    if (this._openingKnowledge) return
    this._openingKnowledge = true
    const epoch = store.assetCacheEpoch
    const current = () => !this._unloaded && epoch === store.assetCacheEpoch
    try {
      const evidence = await resolveKnowledgeCitation(id)
      if (!current()) return
      if (!evidence.file) throw new Error('原文件已不可访问')
      await previewStorageFile(evidence.file, { language:store.applicationSettings.language })
    } catch (error) {
      if (current()) showErrorNotice({ title:error.message || '资料暂不可访问' })
    } finally { this._openingKnowledge = false }
  },

  closePage() {
    wx.navigateBack()
  }
})
