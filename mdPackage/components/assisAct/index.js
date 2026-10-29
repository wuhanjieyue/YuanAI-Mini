const { showErrorNotice } = require('../../../static_utils/errorNotice')
import { triggerHaptic } from '../../../static_utils/haptic'

const { sourceIcons } = require('../../../static_utils/sourceIcons')
const { normalizeCitations } = require('../../../static_utils/chatSources')
const { messageCopyText } = require('../../../static_utils/chatArtifacts')
const i18nBehavior = require('../../../static_utils/i18n/behavior')
const { t } = require('../../../static_utils/i18n/index')
const { getThemeStyle } = require('../../../static_utils/theme')

function padTimePart(value) {
  return String(value).padStart(2, '0')
}

function formatActionTime(value, language) {
  const date = new Date(value || Date.now())
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const sameDay = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()
  const time = `${padTimePart(date.getHours())}:${padTimePart(date.getMinutes())}`
  if (language === 'English') return `${sameDay ? 'Today' : `${date.getMonth() + 1}/${date.getDate()}`} ${time}`
  return `${sameDay ? '今天' : `${date.getMonth() + 1}月${date.getDate()}日`} ${time}`
}
// mdPackage/components/assisAct/index.js
Component({
  behaviors: [i18nBehavior],

  /**
   * 组件的属性列表
   */
  properties: {
    theme: { type: String, value: 'light' },
    compact: { type: Boolean, value: false },
    hapticFeedback: { type: Boolean, value: false },
    animateEntrance: { type: Boolean, value: false },
    modelName: { type: String, value: '' },
    shareEnabled: { type: Boolean, value: true },
    branchLoadingTurnId: { type: String, value: '' },
    shareLoading: { type: Boolean, value: false },
    item:{
      type:Object,
      value:null
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    themeStyle: getThemeStyle('light'),
    citations:[],
    icons:[],
    feedbackValue:null,
    timeText:'',
    usedModelText:'',
    sharePending:false
  },
  lifetimes: {
    attached() {
      this._attached = true
      this.animateEntrance()
    },
    detached() {
      this._attached = false
      clearTimeout(this._sharePendingTimer)
    }
  },
  observers:{
    shareLoading(loading) {
      if (!loading && this.data.sharePending) {
        clearTimeout(this._sharePendingTimer)
        this.setData({ sharePending:false })
      }
    },
    theme(theme) { this.setData({ themeStyle: getThemeStyle(theme) }) },
    item(item){
      this.setData({ feedbackValue:item?.feedback?.value || null, citations:normalizeCitations(item?.citations), icons:sourceIcons(item?.citations) })
      this.syncActionMeta(item)
    },
    'language,modelName': function() {
      this.syncActionMeta(this.properties.item)
    },
    'language,citations': function(language, citations) {
      this.setData({ sourcesLabel:t(language, 'sources.viewCount', { count:(citations || []).length }) })
    }
  },

  /**
   * 组件的方法列表
   */
  methods: {
    syncActionMeta(item = this.properties.item) {
      const language = this.properties.language || '中文'
      const model = String(this.properties.modelName || item?.modelName || item?.modelId || t(language, 'chat.defaultModel')).trim()
      this.setData({
        timeText: formatActionTime(item?.createdAt, language),
        usedModelText: t(language, 'chat.usedModel', { model })
      })
    },
    animateEntrance() {
      if (!this._attached || !this.data.animateEntrance || this._entranceBound) return
      this._entranceScale = this._entranceScale || wx.worklet.shared(0)
      wx.nextTick(() => {
        if (!this._attached || this._entranceBound) return
        this.applyAnimatedStyle('.message-actions', () => {
          'worklet'
          return { transform: `scale(${this._entranceScale.value})` }
        })
        this._entranceBound = true
        this._entranceScale.value = wx.worklet.spring(1, { mass: 0.8 })
      })
    },
    feedbackFlyoutOpened() {
      triggerHaptic(this.data.hapticFeedback, 'light')
    },
    moreFlyoutOpened() {
      triggerHaptic(this.data.hapticFeedback, 'light')
    },
    copy() {
      triggerHaptic(this.data.hapticFeedback, 'light')
      this.triggerEvent('copy', { content: messageCopyText(this.data.item?.content) })
    },
    retryLocal() {
      triggerHaptic(this.data.hapticFeedback, 'light')
      this.triggerEvent('retryLocal')
    },
    share() {
      triggerHaptic(this.data.hapticFeedback, 'light')
      this.triggerEvent('share', { item: this.data.item }, { bubbles:true, composed:true })
    },
    shareHaptic() {
      triggerHaptic(this.data.hapticFeedback, 'light')
      this.setData({ sharePending:true })
      clearTimeout(this._sharePendingTimer)
      this._sharePendingTimer = setTimeout(() => this.setData({ sharePending:false }), 3000)
    },
    regenerate(){
      if(this.data.item?.turnId) this.triggerEvent('regenerate', this.data.item, { bubbles:true, composed:true })
    },
    iconError(e){
      const domain = e.currentTarget.dataset.domain
      this.setData({ icons:this.data.icons.filter(item => item.domain !== domain) })
    },
    openSources(){
      triggerHaptic(this.data.hapticFeedback, 'light')
      this.triggerEvent('openSources', { citations:this.data.citations }, {})
    },
    selectMoreAction(e) {
      const action = e.currentTarget.dataset.action
      if (!action) return
      if (action === 'branch' && this.data.branchLoadingTurnId) return
      triggerHaptic(this.data.hapticFeedback, 'light')
      this.selectComponent('#moreFlyout')?.close()
      if (action === 'retry') {
        this.regenerate()
        return
      }
      this.triggerEvent('moreAction', { action, item:this.data.item }, { bubbles:true, composed:true })
    },
    async setFeedback(e){
      if(this._feedbackPending) return
      const value = e.currentTarget.dataset.value
      if(value !== 'like' && value !== 'dislike') return
      triggerHaptic(this.data.hapticFeedback, 'light')
      this.selectComponent('#feedbackFlyout')?.close()
      const item = this.data.item || {}
      if(!item.messageId){
        showErrorNotice({ title:t(this.properties.language, 'chat.feedbackLocalUnsupported') })
        return
      }
      const nextValue = this.data.feedbackValue === value ? null : value
      const request = wx.yuanAI && wx.yuanAI.updateChatFeedback
      if(!request){
        showErrorNotice({ title:t(this.properties.language, 'chat.feedbackUnavailable') })
        return
      }
      this._feedbackPending = true
      try{
        await request({ messageId:item.messageId, value:nextValue })
        if(this.data.item?.messageId === item.messageId) this.setData({ feedbackValue:nextValue })
      }catch(error){
        showErrorNotice({ title:t(this.properties.language, 'chat.feedbackFailed') })
      }finally{
        this._feedbackPending = false
      }
    }
  }
})
