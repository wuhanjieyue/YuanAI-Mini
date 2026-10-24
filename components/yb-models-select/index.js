// components/yb-models-select/index.js
const { rpx2px } = require('../_shared/utils')
const {shared,timing,spring,runOnJS} = wx.worklet
const DURATION_TIME = 160
const THINKING_ITEM_HEIGHT_RPX = 72
const MODELS_BASE_CHROME_HEIGHT_RPX = 113

Component({

  /**
   * 组件的属性列表
   */
  properties: {
    themeStyle: { type: String, value: '' },
    models:{ type:Array, value:[] },
    modelId:{ type:String, value:'' },
    effortId:{ type:String, value:'' }
  },
   /**
   * 组件的初始数据
   */
   data: {
    effortOptions:[],
    modelsBaseHeightRpx:MODELS_BASE_CHROME_HEIGHT_RPX,
    modelsFlyoutHeightRpx:MODELS_BASE_CHROME_HEIGHT_RPX + 160,
    selectedModelName:'',
    otherOpen:false,
    alignRight:true,
    modelOptions:[]
  },
  observers:{
    'models,modelId,effortId':function(){
      this.syncCatalogData()
    }
  },
  lifetimes:{
    attached(e){
      this.syncCatalogData()
      wx.nextTick(()=>{
        const screenWidth = wx.getWindowInfo().screenWidth
        this.otherHeightCollapsed = rpx2px(100,screenWidth)
        this.updateMetrics()
        this.modelsStackHeight = shared(this.modelsBaseHeight)
        this.otherPanelScale = shared(0)
        this.otherModelHeight = shared(0)
        this.otherModelOpacity = shared(0)
        this.modelsBaseInset = shared(0)

        this.applyAnimatedStyle('.models-stack',()=>{
            'worklet'
            return {
              height:`${this.modelsStackHeight.value}px`
            }
        })

        this.applyAnimatedStyle('.models-base',()=>{
            'worklet'
            return {transform:`scale(${1 - this.modelsBaseInset.value})`}
        })

        this.otherHeight = shared(this.otherHeightCollapsed)
        this.applyAnimatedStyle('.other-model-panel',()=>{
            'worklet'
            return {
              height:`${this.otherHeight.value}px`,
              transform:`scale(${1 + this.otherPanelScale.value})`
            }
        })

        this.applyAnimatedStyle('.model-options',()=>{
            'worklet'
            return {
              height:`${this.otherModelHeight.value}px`,
              opacity:`${this.otherModelOpacity.value}`
            }
        })
      })
    }
  },

  /**
   * 组件的方法列表
   */
  methods: {
    syncCatalogData(){
      const models = (this.data.models || []).map((model) => Object.assign({}, model, {
        locked:model.locked === true
      }))
      const selectedModel = models.find((model) => model.id === this.data.modelId) || models[0]
      const effortOptions = (selectedModel?.efforts || []).map((effort) => Object.assign({}, effort, {
        locked:effort.locked === true
      }))
      const modelsBaseHeightRpx = MODELS_BASE_CHROME_HEIGHT_RPX + effortOptions.length * THINKING_ITEM_HEIGHT_RPX
      const modelsExpandedHeightRpx = 100 + Math.min(models.length, 3) * 110
      this.setData({
        modelOptions:models,
        effortOptions,
        selectedModelName:selectedModel?.name || '',
        modelsBaseHeightRpx,
        modelsFlyoutHeightRpx:Math.max(modelsBaseHeightRpx, modelsExpandedHeightRpx) + 160
      }, () => {
        if(this.modelsStackHeight) this.updateMetrics(true)
      })
    },

    updateMetrics(reset = false){
      const screenWidth = wx.getWindowInfo().screenWidth
      this.modelsBaseHeight = rpx2px(this.data.modelsBaseHeightRpx,screenWidth)
      const visibleModelCount = Math.min(this.data.modelOptions.length, 3)
      this.otherModelsExpandedHeight = rpx2px(visibleModelCount * 110,screenWidth)
      this.otherHeightExpanded = this.otherHeightCollapsed + this.otherModelsExpandedHeight
      this.modelsStackExpandedHeight = Math.max(this.modelsBaseHeight, this.otherHeightExpanded)
      if(reset && !this.data.otherOpen) this.resetOtherState()
    },

    openOther(){
      if(this.data.otherOpen) return
      this.setData({otherOpen:true})
      this.modelsStackHeight.value = timing(this.modelsStackExpandedHeight,{duration:DURATION_TIME})
      this.otherHeight.value = timing(this.otherHeightExpanded,{duration:DURATION_TIME})
      this.otherModelHeight.value = timing(this.otherModelsExpandedHeight,{duration:DURATION_TIME})
      this.otherPanelScale.value = spring(0.05,{velocity:5,mass:0.8})
      this.otherModelOpacity.value = timing(1,{duration:DURATION_TIME})
      this.modelsBaseInset.value = spring(0.05,{velocity:5,mass:0.8})
    },

    closeOther(){
      if(!this.data.otherOpen) return
      const finishOtherClose = this.finishOtherClose.bind(this)
      this.modelsStackHeight.value = timing(this.modelsBaseHeight,{duration:DURATION_TIME})
      this.otherHeight.value = timing(this.otherHeightCollapsed,{duration:DURATION_TIME},()=>{
        'worklet'
        runOnJS(finishOtherClose)()
      })
      this.otherModelHeight.value = timing(0,{duration:DURATION_TIME})
      this.otherPanelScale.value = timing(0,{duration:DURATION_TIME})
      this.otherModelOpacity.value = timing(0,{duration:DURATION_TIME})
      this.modelsBaseInset.value = timing(0,{duration:DURATION_TIME})
    },

    finishOtherClose(){
      this.setData({otherOpen:false})
    },

    toggleOther(){
      if(this.data.otherOpen){
        this.closeOther()
        return
      }
      this.openOther()
    },
    resetOtherState(){
      this.modelsStackHeight.value = this.modelsBaseHeight
      this.otherHeight.value = this.otherHeightCollapsed
      this.otherModelHeight.value = 0
      this.otherPanelScale.value = 0
      this.otherModelOpacity.value = 0
      this.modelsBaseInset.value = 0
      if(this.data.otherOpen) this.setData({otherOpen:false})
    },
    show(anchorRect,boundaryRect){
      if(!anchorRect) return Promise.resolve(false)
      const windowWidth = wx.getWindowInfo().windowWidth
      const width = Number(anchorRect.width) || 0
      const alignRight = Number(anchorRect.left) + width / 2 >= windowWidth / 2
      const viewportAnchor = Object.assign({}, anchorRect, {
        left:alignRight ? windowWidth - width : 0
      })
      this.resetOtherState()
      this._emitClose = true
      return new Promise((resolve) => {
        this.setData({alignRight}, () => resolve(this.selectComponent('#modelFlyout').open(viewportAnchor,boundaryRect)))
      })
    },
    close(){
      if(this.data.otherOpen){
        this.closeOther()
        return
      }
      this.selectComponent('#modelFlyout').close()
    },
    handleMaskTap(){
      this.close()
    },
    handleCardTap(){},
    handleFlyoutClose(){
      if(this._emitClose !== false) this.triggerEvent('close', {}, {})
      this._emitClose = true
    },
    hidePicker(emitClose){
      this._emitClose = emitClose
      this.selectComponent('#modelFlyout').close()
    },
    dismiss(){
      this.resetOtherState()
      this.hidePicker(false)
    },
    changeModel(e){
      const kind = e.currentTarget.dataset.kind
      const id = e.currentTarget.dataset.id
      if(!id || (kind !== 'model' && kind !== 'effort')) return
      const item = kind === 'model'
        ? this.data.modelOptions.find((model) => model.id === id)
        : this.data.effortOptions.find((effort) => effort.id === id)
      if(!item) return
      if(item.locked){
        this.triggerEvent('locked', { minPlan:item.minPlan || 'user' })
        return
      }
      this.triggerEvent('changeModel', {
        modelId:kind === 'model' ? id : this.data.modelId,
        effortId:kind === 'effort' ? id : this.data.effortId
      }, {})
      if(kind === 'model') this.closeOther()
      else this.choose()
    },
    choose(){
      this.resetOtherState()
      this.hidePicker(true)
    }
  }
})
