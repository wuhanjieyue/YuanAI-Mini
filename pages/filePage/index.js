const { bindPageTheme, unbindPageTheme, syncThemeNavigation } = require('../../static_utils/themeBinding')
// pages/filePage/index.js
const { shared, runOnJS } = wx.worklet
const { PICKER_FILE_EXTENSIONS } = require('../../static_utils/chatAttachment')
const { store } = require('../../store/index')
const { messages, t } = require('../../static_utils/i18n/index')
const { getSkillTitle } = require('../../static_utils/chatFeature')
const { listInstalledSkills } = require('../../request/skills')
const { reaction } = require('mobx-miniprogram')
const app = getApp()

const FEATURE_SKILLS = {
  image_generation: { feature:'imging', tip:'tools.imageDesc' },
  deep_research: { feature:'thinking', tip:'tools.researchDesc' },
  web_search: { feature:'searching', tip:'tools.webSearchDesc' },
  study: { feature:'studying', tip:'tools.studyDesc' }
}

function accountKey() {
  return `${!!store.user?.login}:${store.user?.userId || ''}:${store.assetCacheEpoch}`
}

Page({

  /**
   * 页面的初始数据
   */
  data: {
    // 模式
    model:'',
    i18n:messages('中文'),
    utils:[],
    utilsLoading:true,
    utilsFailed:false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options = {}) {
    bindPageTheme(this)
    this._skills = []
    this._disposeLanguage = reaction(() => store.applicationSettings.language, () => this.syncUtils())
    this._disposeAccount = reaction(accountKey, () => {
      if (this._closing || this._unloaded) return
      this._skills = []
      this.setData({ utils:[] })
      this.closePage()
    })
    this.syncUtils()
    this.eventChannel = this.getOpenerEventChannel()

    var model = ''
    if (options.feature) {
      model = options.feature
    } else if (options.imging === 'true') {
      model = 'imging'
    } else if (options.thinking === 'true') {
      model = 'thinking'
    } else if (options.searching === 'true') {
      model = 'searching'
    } else if (options.studying === 'true') {
      model = 'studying'
    }
    this.setData({model:options.skillId || Object.keys(FEATURE_SKILLS).find(id => FEATURE_SKILLS[id].feature === model) || ''})
    this.loadEnabledSkills()
    if (options.action) {
      wx.nextTick(() => {
        if (options.action === 'camera') this.openCamera()
        if (options.action === 'photo') this.openImages()
        if (options.action === 'file') this.openFiles()
      })
    }
    this.sheetHeight = shared(app.globalData.su_system.screenHeight - app.globalData.su_menu.bottom - 20)
        this.applyAnimatedStyle('.sheet', () => {
          'worklet'
          return {height:  `${this.sheetHeight.value}px` }
        })

        this.scrollSca = shared(0.95 )
        this.applyAnimatedStyle('.scrollable', () => {
          'worklet'
          return {width:  `${this.scrollSca.value * 100}%` }
        })

        this.applyAnimatedStyle('.move-bg', () => {
          'worklet'
          return {width:  `${this.scrollSca.value * 100}%` }
        })
  },
  syncUtils() {
    if (this._closing || this._unloaded) return
    const language = store.applicationSettings.language
    this.setData({ i18n:messages(language), utils:(this._skills || []).map(item => ({
      ...item, name:getSkillTitle(item, language),
      tip:FEATURE_SKILLS[item.id] ? t(language, FEATURE_SKILLS[item.id].tip) : item.description
    })) })
  },
  async loadEnabledSkills() {
    if (this._closing || this._unloaded) return
    const version = this._requestVersion = (this._requestVersion || 0) + 1
    const account = accountKey()
    this.setData({ utilsLoading:true, utilsFailed:false })
    try {
      const page = await listInstalledSkills()
      if (this._closing || this._unloaded || version !== this._requestVersion || account !== accountKey()) return
      this._skills = page.items.filter(item => item.enabled)
      this._loadedAccount = account
      this.syncUtils()
      this.setData({ utilsLoading:false })
    } catch (error) {
      if (!this._closing && !this._unloaded && version === this._requestVersion && account === accountKey()) {
        this.setData({ utilsLoading:false, utilsFailed:true })
      }
    }
  },
  onSizeUpdate(e){
    'worklet'
    this.scrollSca.value = e.size <= 0.6 ? (0.95) : (0.9 + 0.1*e.size)
    if(e.size <= 0.01) {
      runOnJS(this.closePage.bind(this))()
    }
  },
  closePage(){
    if (this._closing || this._unloaded) return
    this._closing = true
    wx.navigateBack({ fail:() => { this._closing = false } });
  },
  emitAddFile(files){
    if (this.eventChannel && this.eventChannel.emit) {
      this.eventChannel.emit('addFile', {files:files})
    }
  },
  emitSelectFeature(feature, tip, skill){
    if (this.eventChannel && this.eventChannel.emit) {
      this.eventChannel.emit('selectFeature', {feature:feature, tip:tip, ...(skill ? {skill} : {})})
    }
  },
  selectUtil(e){
    if (this._closing || this._unloaded || this.data.utilsLoading || this.data.utilsFailed || this._loadedAccount !== accountKey()) return
    const skill = this.data.utils.find(item => item.id === e.currentTarget.dataset.id)
    if (!skill) return
    const feature = FEATURE_SKILLS[skill.id]?.feature || ''
    this.setData({model:skill.id})
    this.emitSelectFeature(feature, skill.tip, feature ? null : skill)
    this.closePage()
  },

  openCamera(){
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera','album'],
      camera: 'back',
      success:(res)=> {
        this.emitAddFile(res.tempFiles);
        wx.navigateBack();
      }
    })
  },
  openImages(){
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sourceType: ['album'],
      maxDuration: 30,
      camera: 'back',
      success:(res)=> {
        this.emitAddFile(res.tempFiles);
        wx.editImage({
          src: res.tempFiles[0].tempFilePath
        })
        wx.navigateBack();

      }
    })
  },
  openFiles(){
    wx.chooseMessageFile({
      count: 9,
      type: 'file',
      extension: PICKER_FILE_EXTENSIONS,
      success :(res)=> {
        this.emitAddFile(res.tempFiles);
        wx.navigateBack();
      }
    })
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {
    
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
    this._requestVersion++
    this._disposeLanguage?.()
    this._disposeAccount?.()
    unbindPageTheme(this)

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
