const { showErrorNotice } = require('../../../static_utils/errorNotice')
const { bindPageTheme, unbindPageTheme, syncThemeNavigation } = require('../../../static_utils/themeBinding')
const { messages } = require('../../../static_utils/i18n/index')
const { store } = require('../../../store/index')
const { reaction } = require('mobx-miniprogram')
const { getSkillDetail, removeSkill, trySkill: enableSkillTrial } = require('../../../request/skills')
const { getMcpDetail, removeMcp, tryMcp } = require('../../../request/mcps')
const { formatDateTime } = require('../../../static_utils/assetPresentation')
const { getSkillTitle } = require('../../../static_utils/chatFeature')
const { static: parseMarkdown } = require('../../components/towxmlstream/index')
const { runOnJS } = wx.worklet

Page({
  data: { kind: 'skill', item: null, skillTitle: '', description: '', article: null, updatedAtLabel: '', loading: true, failed: false, trying: false, removing: false, i18n: messages('中文'), screenHeight: 0, maxSheetSize: 1 },

  onLoad(options = {}) {
    bindPageTheme(this)
    this._skillId = options.id || ''
    this.setData({ kind:options.kind === 'mcp' ? 'mcp' : 'skill' })
    this.eventChannel = this.getOpenerEventChannel()
    this._assetEpoch = store.assetCacheEpoch
    this._disposeAccount = reaction(() => `${!!store.user?.login}:${store.user?.userId || ''}:${store.assetCacheEpoch}`, () => this.closePage())
    this._disposeLanguage = reaction(() => store.applicationSettings.language, language => {
      if (!this._closing && !this._unloaded) {
        this.setData({ i18n:messages(language), skillTitle:getSkillTitle(this.data.item, language) })
        if (this.data.item) this.presentItem(this.data.item, language)
      }
    })
    const { su_system, su_menu } = getApp().globalData
    this.setData({
      i18n: messages(store.applicationSettings.language),
      screenHeight: su_system.screenHeight,
      maxSheetSize: (su_system.screenHeight - su_menu.bottom - 20) / su_system.screenHeight
    })
    this.loadSkill()
  },

  onShow() { syncThemeNavigation(this) },

  onUnload() { this._unloaded = true; this._disposeAccount?.(); this._disposeLanguage?.(); unbindPageTheme(this) },

  async loadSkill() {
    if (this._closing || this._unloaded) return
    this.setData({ loading: true, failed: false })
    try {
      const item = await (this.data.kind === 'mcp' ? getMcpDetail : getSkillDetail)({ id: this._skillId })
      if (this._closing || this._unloaded || this._assetEpoch !== store.assetCacheEpoch) return
      this.presentItem(item, store.applicationSettings.language)
      this.setData({ updatedAtLabel: formatDateTime(item.updatedAt), loading: false })
    } catch (error) {
      if (!this._closing && !this._unloaded && this._assetEpoch === store.assetCacheEpoch) this.setData({ loading: false, failed: true })
    }
  },

  presentItem(item, language) {
    const english = ['English', 'en-US'].includes(language)
    const description = this.data.kind === 'mcp' && english ? item.descriptionEn || item.description : item.description
    const markdown = this.data.kind === 'mcp' ? description : item.markdown
    const patch = { item, skillTitle:getSkillTitle(item, language), description }
    if (!this.data.article || this.data.kind === 'mcp') patch.article = parseMarkdown(markdown, 'markdown', { theme:this.data.effectiveTheme })
    this.setData(patch)
  },

  onSizeUpdate(e) {
    'worklet'
    if (e.size <= 0.01) runOnJS(this.closePage.bind(this))()
  },

  closePage() {
    if (this._closing || this._unloaded) return
    this._closing = true
    wx.navigateBack({ fail: () => {
      this._closing = false
      this.setData({ trying: false })
      this.eventChannel?.emit('cancelSkillTrial')
    } })
  },

  async removeSkill() {
    if (!this.data.item?.installed || this.data.item.globalDefault || this.data.loading || this.data.failed || this.data.trying || this.data.removing || this._closing || this._unloaded) return
    this.setData({ removing: true })
    try {
      const item = await (this.data.kind === 'mcp' ? removeMcp : removeSkill)({ id: this._skillId })
      if (this._closing || this._unloaded || this._assetEpoch !== store.assetCacheEpoch) return
      this.setData({ item: { ...this.data.item, ...item }, removing: false })
      this.eventChannel.emit('skillRemoved', item)
      this.closePage()
    } catch (error) {
      if (!this._closing && !this._unloaded && this._assetEpoch === store.assetCacheEpoch) {
        this.setData({ removing: false })
        showErrorNotice({ title: error.message || this.data.i18n.common.operationFailed })
      }
    }
  },

  async trySkill() {
    if (!this.data.item?.canTry || this.data.loading || this.data.failed || this.data.trying || this.data.removing || this._closing || this._unloaded) return
    this.setData({ trying: true })
    try {
      const item = await (this.data.kind === 'mcp' ? tryMcp : enableSkillTrial)({ id: this._skillId })
      if (this._closing || this._unloaded || this._assetEpoch !== store.assetCacheEpoch) return
      this.eventChannel.emit('trySkill', item)
      this.closePage()
    } catch (error) {
      if (!this._closing && !this._unloaded && this._assetEpoch === store.assetCacheEpoch) {
        this.setData({ trying: false })
        showErrorNotice({ title: error.message || this.data.i18n.common.loadFailed })
      }
    }
  }
})
