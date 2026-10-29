const { showErrorNotice } = require('../../static_utils/errorNotice')
const { bindPageTheme, unbindPageTheme, syncThemeNavigation } = require('../../static_utils/themeBinding')
const { messages, toLocale } = require('../../static_utils/i18n/index')
const { store } = require('../../store/index')
import { renewAssetUrls } from '../../request/assetCache'
import { downloadCreationImage } from '../../request/request'
const { runOnJS } = wx.worklet

Page({
  data: { item: null, i18n: messages('中文'), sharing: false, imageFailed: false, screenHeight: 0, sheetSize: 0.6 },
  onLoad() {
    bindPageTheme(this)
    this._assetEpoch = store.assetCacheEpoch
    const language = store.applicationSettings.language
    const screenHeight = getApp().globalData.su_system.screenHeight
    this._rpxSize = wx.getWindowInfo().windowWidth / 750 / screenHeight
    this.setData({ i18n: messages(language), screenHeight, sheetSize: 0.6 + 36 * this._rpxSize })
    this.eventChannel = this.getOpenerEventChannel()
    this.eventChannel.on('showCreation', item => {
      if (this._unloaded) return
      const english = toLocale(language) === 'en-US'
      this.setData({ sheetSize:Math.min(0.9, 0.6 + (36 + (item.supportsImageInput === true ? 116 : 0)) * this._rpxSize), item: {
        ...item,
        supportsImageInput:item.supportsImageInput === true,
        title: (english && item.titleEn) || item.title || item.displayName || item.name,
        prompt: (english && item.promptEn) || item.prompt || ''
      } })
    })
  },
  onShow() {
    if (this._assetEpoch !== store.assetCacheEpoch) { this.closePage(); return }
    syncThemeNavigation(this)
  },
  onUnload() { this._unloaded = true; unbindPageTheme(this) },
  onSizeUpdate(e) {
    'worklet'
    if (e.size <= 0.01) runOnJS(this.closePage.bind(this))()
  },
  closePage() {
    if (this._closing || this._unloaded) return
    this._closing = true
    wx.navigateBack({ fail: () => { this._closing = false } })
  },
  imageFailed() { this.setData({ imageFailed: true }) },
  tryPrompt() {
    const prompt = String(this.data.item?.prompt || '').trim()
    if (!prompt || this._closing || this._unloaded || this._actionPending) return
    this._actionPending = true
    this.eventChannel.emit('tryCreationPrompt', { prompt })
    this.closePage()
  },
  choosePhoto(e) {
    const prompt = String(this.data.item?.prompt || '').trim()
    if (!prompt || this._closing || this._unloaded || this._actionPending) return
    this._actionPending = true
    wx.chooseMedia({
      count:1,
      mediaType:['image'],
      sourceType:[e.currentTarget.dataset.source === 'camera' ? 'camera' : 'album'],
      success:({ tempFiles }) => {
        if (this._unloaded || !tempFiles?.[0]) { this._actionPending = false; return }
        this.eventChannel.emit('tryCreationPrompt', { prompt, files:[{ ...tempFiles[0], fileType:'image' }] })
        this.closePage()
      },
      fail:() => { this._actionPending = false }
    })
  },
  async shareImage() {
    const item = this.data.item
    if (this.data.sharing || !item?.url || this._assetEpoch !== store.assetCacheEpoch) return
    this.setData({ sharing: true })
    try {
      const [renewed] = await renewAssetUrls([item], this.data.imageFailed)
      if (this._unloaded || this._closing || this._assetEpoch !== store.assetCacheEpoch) return
      this.setData({ item: { ...item, ...renewed }, imageFailed: !renewed.url })
      const path = await downloadCreationImage(renewed.url)
      if (this._unloaded || this._closing || this._assetEpoch !== store.assetCacheEpoch) return
      await wx.showShareImageMenu({ path, needShowEntrance: false })
    } catch (error) {
      if (!this._unloaded && !/cancel/i.test(error.errMsg || error.message || '')) {
        showErrorNotice({ title: this.data.i18n.create.shareFailed })
      }
    } finally {
      if (!this._unloaded) this.setData({ sharing: false })
    }
  }
})
