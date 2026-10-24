const { bindPageTheme, unbindPageTheme, syncThemeNavigation } = require('../../static_utils/themeBinding')
const { shared, timing, cancelAnimation, runOnJS } = wx.worklet
const { normalizeProcessTrace, localizeProcessNode, isVisibleProcessNode, formatProcessDuration, formatStoppedDuration, publicProcessText, assistantProcessTimeline, processPresentation } = require('../../static_utils/processTrace')
const { rpx2px } = require('../../static_utils/otherUtils')
const { store } = require('../../store/index')
const { messages } = require('../../static_utils/i18n/index')
const app = getApp()

Page({
  onShow() {
    syncThemeNavigation(this)
    if(this._toolDetails){
      this.setData({i18n:messages(store.applicationSettings.language)})
      this.setData({processTrace:this.projectProcessTrace(this._rawProcessTrace || this.data.processTrace)}, () => this.scheduleDetailMeasurement())
    }
  },
  onUnload() {
    this._destroyed = true
    this._detailVersion++
    clearTimeout(this._detailTimer)
    for(const motion of this._toolDetails.values()) cancelAnimation(motion.height)
    this._toolDetails.clear()
    this._unsubscribe?.()
    unbindPageTheme(this)
  },
  data: {
    durationText:'',
    stopped:false,
    active:false,
    stopping:false,
    failed:false,
    processTrace:[],
    i18n:messages('中文')
  },

  onLoad() {
    this._destroyed = false
    this._toolDetails = new Map()
    this._detailKey = 0
    this._detailVersion = 0
    this._detailQuery = 0
    this._appliedDetailQuery = 0
    bindPageTheme(this)
    const i18n = messages(store.applicationSettings.language)
    this.setData({ i18n })
    const eventChannel = this.getOpenerEventChannel()
    if(eventChannel && eventChannel.on){
      eventChannel.on('showReasoning', (data = {}) => {
        if(this._destroyed) return
        const stopped = data.stopped === true
        const processTrace = this.projectProcessTrace(data.processTrace)
        this.setData({
          durationText:typeof data.durationText === 'string' ? data.durationText : '',
          stopped,
          stopping:!stopped && data.status === 'cancelling',
          failed:!stopped && data.status === 'failed',
          active:!stopped && (['running','queued','cancelling'].includes(data.status) || processTrace.some(node => ['proposed','ready','running'].includes(node.status))),
          processTrace
        }, () => this.scheduleDetailMeasurement())
        this._unsubscribe?.()
        if(data.turnKey){
          wx.yuanAI.chatRuntime.setVisibleTurn(data.turnKey)
          this._unsubscribe = wx.yuanAI.chatRuntime.observe(data.turnKey, record => {
            if(this._destroyed) return
            const assistant = record.assistant || {}
            this.setData({
              processTrace:this.projectProcessTrace(assistantProcessTimeline(assistant, store.applicationSettings.language)?.processTrace || assistant.processTrace),
              active:!stopped && ['submitting','queued','running','cancelling'].includes(record.status),
              stopping:!stopped && record.status === 'cancelling', stopped:stopped || record.status === 'cancelled',
              failed:!stopped && record.status === 'failed',
              durationText:stopped ? this.data.durationText :
                (record.status === 'cancelled' ? formatStoppedDuration : formatProcessDuration)(assistant.processDurationMs, store.applicationSettings.language)
            }, () => this.scheduleDetailMeasurement())
          })
        }
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

  projectProcessTrace(trace){
    this._rawProcessTrace = trace
    const previous = new Map(this.data.processTrace.map(node => [node.id, node]))
    const maxHeight = rpx2px(360, wx.getWindowInfo().windowWidth)
    const normalized = normalizeProcessTrace(trace)
    const nodes = normalized.filter(node => isVisibleProcessNode(node, normalized))
      .map(node => localizeProcessNode(node, store.applicationSettings.language))
      .map(node => {
        const commentary = node.stage === 'public_commentary'
        const publicData = node.public || {}
        const presentation = processPresentation(node, store.applicationSettings.language)
        const detailText = commentary ? '' : presentation.content
        const summary = presentation.summary
        const hasDetails = node.presentation.hasDetails
        let motion = this._toolDetails.get(node.id)
        if(hasDetails && !motion){
          this._detailVersion++
          motion = {key:++this._detailKey,height:shared(0),target:0,bound:false}
          this._toolDetails.set(node.id, motion)
        }
        const old = previous.get(node.id)
        return {...node,title:presentation.detailTitle,
          ...(commentary ? {activityIcon:'icon-app-control-created'} : {}),
          public:{...publicData,summary},details:presentation.details,
          statusLabel:presentation.statusLabel,hasDetails,detailText,
          expanded:hasDetails && Boolean(old?.expanded),detailKey:motion?.key,
          detailHeight:old?.detailHeight ?? maxHeight}
      }).filter(node => node.stage !== 'public_commentary' || node.title.trim() || node.hasDetails)
    const retained = new Set(nodes.filter(node => node.hasDetails).map(node => node.id))
    for(const [id, motion] of this._toolDetails) if(!retained.has(id)){
      this._detailVersion++
      cancelAnimation(motion.height)
      this._toolDetails.delete(id)
    }
    return nodes
  },

  toggleTool(e){
    const id = e.currentTarget.dataset.id
    const node = this.data.processTrace.find(node => node.id === id)
    if(!node?.hasDetails || this._destroyed) return
    this._detailVersion++
    if(node.expanded){
      const motion = this._toolDetails.get(id)
      cancelAnimation(motion.height)
      motion.target = 0
      motion.height.value = timing(0, {duration:250})
    }
    this.setData({processTrace:this.data.processTrace.map(item => item.id === id ? {...item,expanded:!item.expanded} : item)},
      () => this.measureToolDetails())
  },

  scheduleDetailMeasurement(){
    if(this._destroyed || this._detailTimer) return
    // Coalesce live text/layout changes; animation frames stay on the UI thread.
    this._detailTimer = setTimeout(() => {
      this._detailTimer = null
      this.measureToolDetails()
    }, 80)
  },

  measureToolDetails(){
    if(this._destroyed) return
    clearTimeout(this._detailTimer)
    this._detailTimer = null
    const version = this._detailVersion
    wx.nextTick(() => {
      if(this._destroyed || version !== this._detailVersion) return
      for(const node of this.data.processTrace) if(node.hasDetails){
        const motion = this._toolDetails.get(node.id)
        if(!motion.bound){
          const height = motion.height
          this.applyAnimatedStyle(`.reasoning-details-${motion.key}`, () => {
            'worklet'
            return {height:`${height.value}px`}
          })
          motion.bound = true
        }
      }
      if(!this.data.processTrace.some(node => node.expanded)) return
      const query = ++this._detailQuery
      this.createSelectorQuery().selectAll('.reasoning-details-content').boundingClientRect(rects => {
        if(this._destroyed || version !== this._detailVersion || query < this._appliedDetailQuery) return
        this._appliedDetailQuery = query
        const maxHeight = rpx2px(360, wx.getWindowInfo().windowWidth)
        const heights = new Map((rects || []).filter(rect => Number.isFinite(rect.height) && rect.height > 0)
          .map(rect => [rect.dataset.id, Math.min(rect.height, maxHeight)]))
        this.setData({processTrace:this.data.processTrace.map(node => node.expanded && heights.has(node.id)
          ? {...node,detailHeight:heights.get(node.id)} : node)}, () => {
          if(this._destroyed || version !== this._detailVersion) return
          for(const node of this.data.processTrace) if(node.expanded && heights.has(node.id)){
            const motion = this._toolDetails.get(node.id)
            const target = heights.get(node.id)
            if(motion.target !== target){
              cancelAnimation(motion.height)
              motion.target = target
              motion.height.value = timing(target, {duration:250})
            }
          }
        })
      }).exec()
    })
  },

  onSizeUpdate(e) {
    'worklet'
    const width = e.size <= 0.6 ? 0.95 : 0.9 + 0.1 * e.size
    const changed = this.sheetWidth.value !== width
    this.sheetWidth.value = width
    if(changed && (width === 0.95 || e.size === 1)) runOnJS(this.scheduleDetailMeasurement.bind(this))()
    if(e.size <= 0.01) runOnJS(this.closePage.bind(this))()
  },

  closePage() {
    wx.navigateBack()
  }
})
