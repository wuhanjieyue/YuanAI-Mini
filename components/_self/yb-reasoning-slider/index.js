import { rpx2px } from '../../../static_utils/otherUtils'
const { getReasoningIndex:effortIndex } = require('../../../static_utils/modelCatalog')
const { shared, timing, spring, runOnJS } = wx.worklet
const GestureState = {
  BEGIN:1,
  ACTIVE:2,
  END:3,
  CANCELLED:4
}

function boundedIndex(value, maxIndex) {
  const index = Number(value)
  if (!Number.isFinite(index)) return 0
  return Math.max(0, Math.min(maxIndex, Math.round(index)))
}

function clamp(value, lower, upper) {
  'worklet'
  return Math.max(lower, Math.min(upper, value))
}

Component({
  properties: {
    currentModelId: { type:String, value:'' },
    efforts: { type:Array, value:[] },
    currentEffortId: { type:String, value:'' },
    currentEffortLabel: { type:String, value:'' }
  },

  data: {
    markers:[],
    draftIndex:0,
    draftLabel:'',
    draftModelName:'',
    originX:0,
    fillBodyWidth:1
  },

  observers: {
    'efforts,currentModelId,currentEffortId,currentEffortLabel': function () {
      this.syncCatalogData()
    }
  },

  lifetimes: {
    attached() {
      this._phase = 'closed'
      this._token = 0
      const initialIndex = effortIndex(this.data.efforts, this.data.currentModelId, this.data.currentEffortId)
      this._levelMax = Math.max(0, this.data.efforts.length - 1)
      this._allowedMax = this.getAllowedMaxIndex()
      this.viewOpen = shared(0)
      this.islandScale = shared(0.18)
      this.islandOpacity = shared(0)
      this.backdropOpacity = shared(0)
      this.sliderProgress = shared(this._levelMax ? initialIndex / this._levelMax : 0)
      this.draftIndexShared = shared(initialIndex)
      this.levelMaxShared = shared(Math.max(1, this._levelMax))
      this.allowedMaxShared = shared(this._allowedMax)
      this.trackLeftShared = shared(0)
      this.thumbCenterOffsetShared = shared(0)
      this.thumbStartShared = shared(0)
      this.thumbTravelShared = shared(1)
      this.thumbPressed = shared(1)
      this._trackLeft = 0
      this._thumbCenterOffset = 0
      this._thumbTravel = 1
      this.syncCatalogData()
      wx.nextTick(() => {
        this._that = this.selectOwnerComponent()
        const { screenWidth, screenHeight } = wx.getWindowInfo()
        const islandWidth = screenWidth * 0.94
        const islandLeft = screenWidth * 0.03
        const gaugeCenterX = screenWidth - rpx2px(144, screenWidth)
        const rpxScale = screenWidth / 750
        const horizontalPadding = 20 * rpxScale
        const trackWidth = islandWidth - horizontalPadding * 2
        const thumbSize = 84 * rpxScale
        const fillInset = 8 * rpxScale
        this._trackLeft = (screenWidth - trackWidth) / 2
        this._thumbCenterOffset = fillInset + thumbSize / 2
        this._thumbTravel = trackWidth - this._thumbCenterOffset * 2
        const fillBodyMaxWidth = this._thumbTravel
        this.trackLeftShared.value = this._trackLeft
        this.thumbCenterOffsetShared.value = this._thumbCenterOffset
        this.thumbStartShared.value = fillInset
        this.thumbTravelShared.value = this._thumbTravel
        this.setData({
          originX:gaugeCenterX - islandLeft,
          fillBodyWidth:fillBodyMaxWidth,
          markers:this.buildMarkers()
        })

        this.applyAnimatedStyle('.reasoning-slider-view', () => {
          'worklet'
          return {
            width:`${this.viewOpen.value}vw`,
            height:`${this.viewOpen.value === 0 ? 0 : screenHeight - this._that.keyHeight.value}px`
          }
        })

        const minimumHeight = rpx2px(340, screenWidth)
        const backdropExtraHeight = rpx2px(96, screenWidth)
        const compactInputHeight = rpx2px(52, screenWidth)
        this.applyAnimatedStyle('.reasoning-island', () => {
          'worklet'
          return {
            height:`${minimumHeight + Math.max(0, this._that.inputHeight.value - compactInputHeight)}px`,
            transform:`scale(${this.islandScale.value})`
          }
        })

        this.applyAnimatedStyle('.reasoning-backdrop', () => {
          'worklet'
          return {
            height:`${minimumHeight + backdropExtraHeight + Math.max(0, this._that.inputHeight.value - compactInputHeight)}px`,
            opacity:`${this.backdropOpacity.value}`
          }
        })

        this.applyAnimatedStyle('.reasoning-content', () => {
          'worklet'
          return { opacity:`${this.islandOpacity.value}` }
        })

        this.applyAnimatedStyle('.reasoning-fill-body', () => {
          'worklet'
          const currentWidth = this.thumbTravelShared.value * this.sliderProgress.value
          return { transform:`scaleX(${currentWidth / fillBodyMaxWidth})` }
        })

        this.applyAnimatedStyle('.reasoning-thumb', () => {
          'worklet'
          return {
            transform:`translateX(${this.thumbStartShared.value + this.thumbTravelShared.value * this.sliderProgress.value}px) scale(${this.thumbPressed.value})`
          }
        })
      })
    },
    detached() {
      this._token++
      this._phase = 'closed'
    }
  },

  methods: {
    getAllowedMaxIndex() {
      let allowedMax = -1
      ;(this.data.efforts || []).forEach((effort, index) => {
        if (!effort.locked) allowedMax = index
      })
      return Math.max(0, allowedMax)
    },

    buildMarkers() {
      const efforts = this.data.efforts || []
      const maxIndex = Math.max(1, efforts.length - 1)
      return efforts.map((effort, index) => ({
        id:effort.id,
        locked:effort.locked === true,
        left:(this._thumbCenterOffset || 0) + (this._thumbTravel || 0) * index / maxIndex
      }))
    },

    syncCatalogData() {
      const efforts = this.data.efforts || []
      const maxIndex = Math.max(0, efforts.length - 1)
      const index = boundedIndex(effortIndex(efforts, this.data.currentModelId, this.data.currentEffortId), maxIndex)
      this._levelMax = maxIndex
      this._allowedMax = this.getAllowedMaxIndex()
      if (this.levelMaxShared) this.levelMaxShared.value = Math.max(1, maxIndex)
      if (this.allowedMaxShared) this.allowedMaxShared.value = this._allowedMax
      if (this._phase !== 'open') {
        this._draftChanged = false
        this._draftIndex = index
        if (this.draftIndexShared) this.draftIndexShared.value = index
        if (this.sliderProgress) this.sliderProgress.value = maxIndex ? index / maxIndex : 0
      }
      this.setData({
        markers:this.buildMarkers(),
        draftIndex:this._draftIndex ?? index,
        draftLabel:this._draftChanged ? efforts[this._draftIndex]?.label || '' : this.data.currentEffortLabel || efforts[index]?.label || '',
        draftModelName:efforts[this._draftIndex ?? index]?.modelName || ''
      })
    },

    show() {
      if(!this.viewOpen || this._phase !== 'closed') return false
      this._token++
      this._commitOnClose = true
      this.syncCatalogData()
      this._phase = 'open'
      this.islandScale.value = 0.18
      this.islandOpacity.value = 0
      this.backdropOpacity.value = 0
      this.viewOpen.value = 100
      this.backdropOpacity.value = timing(1, { duration:260 })
      this.islandOpacity.value = timing(1, { duration:180 })
      this.islandScale.value = spring(1, { velocity:10, mass:0.78 })
      return true
    },

    close() {
      if(this._phase !== 'open') return
      this._phase = 'closing'
      this.triggerEvent('closing', { handoff:this._commitOnClose === false })
      const finishClose = this.finishClose.bind(this, this._token)
      this.thumbPressed.value = 1
      this.backdropOpacity.value = timing(0, { duration:260 })
      this.islandOpacity.value = timing(0, { duration:130 })
      this.islandScale.value = timing(0.18, { duration:220 }, () => {
        'worklet'
        runOnJS(finishClose)()
      })
    },

    openModels() {
      if(this._phase !== 'open') return
      const token = this._token
      this.createSelectorQuery().select('.reasoning-model-summary').boundingClientRect((anchorRect) => {
        if(!anchorRect || token !== this._token || this._phase !== 'open') return
        const effort = this.data.efforts[this._draftIndex]
        this._commitOnClose = false
        this.close()
        this.triggerEvent('openModels', {
          anchorRect,
          modelId:this._draftChanged ? effort?.modelId || '' : this.data.currentModelId,
          effortId:this._draftChanged ? effort?.effortId || '' : this.data.currentEffortId
        })
      }).exec()
    },

    finishClose(token) {
      if(token !== this._token || this._phase !== 'closing') return
      const index = boundedIndex(this._draftIndex, this._levelMax)
      const effort = this.data.efforts[index]
      const changed = this._commitOnClose !== false && this._draftChanged &&
        (effort?.modelId !== this.data.currentModelId || effort?.effortId !== this.data.currentEffortId)
      this.viewOpen.value = 0
      this._phase = 'closed'
      if(changed){
        this.triggerEvent('commit', {
          index,
          modelId:effort?.modelId || '',
          effortId:effort?.effortId || '',
          label:effort?.label || ''
        }, {})
      }
      this.triggerEvent('close', { changed }, {})
    },

    dismiss() {
      if(this._phase === 'closed') return
      this._token++
      this._phase = 'closed'
      this.viewOpen.value = 0
      this.islandScale.value = 0.18
      this.islandOpacity.value = 0
      this.backdropOpacity.value = 0
      this.thumbPressed.value = 1
    },

    setDraftIndex(value) {
      const index = boundedIndex(value, this._allowedMax)
      if(this._draftChanged && this._draftIndex === index && this.data.draftIndex === index) return
      this._draftChanged = true
      this._draftIndex = index
      if(this.draftIndexShared) this.draftIndexShared.value = index
      this.setData({
        draftIndex:index,
        draftLabel:this.data.efforts[index]?.label || '',
        draftModelName:this.data.efforts[index]?.modelName || ''
      })
    },

    updateDraftFromProgress(progress) {
      this.setDraftIndex(Math.round(clamp(progress, 0, 1) * this._levelMax))
    },

    shouldAcceptGesture() {
      'worklet'
      return true
    },

    shouldResponseOnMove() {
      'worklet'
      return true
    },

    handlePan(evt) {
      'worklet'
      if(evt.state === GestureState.BEGIN){
        this.thumbPressed.value = spring(1.08, { velocity:5, mass:0.7 })
      }
      if(evt.state === GestureState.BEGIN || evt.state === GestureState.ACTIVE){
        const maxProgress = this.allowedMaxShared.value / this.levelMaxShared.value
        const progress = clamp(
          (evt.absoluteX - this.trackLeftShared.value - this.thumbCenterOffsetShared.value) / this.thumbTravelShared.value,
          0,
          maxProgress
        )
        this.sliderProgress.value = progress
        const index = Math.round(progress * this.levelMaxShared.value)
        if(index !== this.draftIndexShared.value){
          this.draftIndexShared.value = index
          runOnJS(this.updateDraftFromProgress.bind(this))(progress)
        }
        return
      }
      if(evt.state === GestureState.END || evt.state === GestureState.CANCELLED){
        this.thumbPressed.value = spring(1, { velocity:5, mass:0.7 })
        this.sliderProgress.value = timing(this.draftIndexShared.value / this.levelMaxShared.value, { duration:140 })
      }
    },

    tapTrack(e) {
      const x = Number(e.detail && e.detail.x)
      if(!Number.isFinite(x)) return
      const progress = clamp(
        (x - this._trackLeft - this._thumbCenterOffset) / this._thumbTravel,
        0,
        1
      )
      const requestedIndex = Math.round(progress * this._levelMax)
      if(requestedIndex > this._allowedMax) this.triggerEvent('locked', {
        minPlan:this.data.efforts[requestedIndex]?.minPlan || 'user'
      })
      const index = Math.min(requestedIndex, this._allowedMax)
      this.setDraftIndex(index)
      this.sliderProgress.value = timing(this._levelMax ? index / this._levelMax : 0, { duration:140 })
    }
  }
})
