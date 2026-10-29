const { showNotice } = require('../../../static_utils/errorNotice')
// components/_self/yb-user-content/index.js
import { triggerHaptic } from '../../../static_utils/haptic'

const durationTime = 160
const {shared,timing,sequence,delay,spring} = wx.worklet
const i18nBehavior = require('../../../static_utils/i18n/behavior')

Component({
  behaviors: [i18nBehavior],

  /**
   * 组件的属性列表
   */
  properties: {

    content:{
        type:String,
        value:''
    },
    
    hapticFeedback:{
      type:Boolean,
      value:false
    }
      
  },

  lifetimes:{
    detached(){ this._showVersion = (this._showVersion || 0) + 1 },
    attached(){
      wx.nextTick(()=>{
        this._that = this.selectOwnerComponent()

        this.applyAnimatedStyle('.box',()=>{
            'worklet'
            return {transform: `scale(${this._that.contentShow.value})`}
        })

        this.applyAnimatedStyle('.user-content-panel',()=>{
          'worklet'
          return {top:`${this._that.contentTop.value}px`,right:`${this._that.contentRight.value}px`,transform: `scale(${this._that.contentSca.value})`}
        })

        
        this.handleSca = shared(0)
        this.handleTop = shared(0)

        this.applyAnimatedStyle('.handle-view',()=>{
          'worklet'
          return {top:`${this.handleTop.value}px`,transform: `scale(${this.handleSca.value})`}
        })

      })
    }
  },
  
  /**
   * 组件的初始数据
   */
  data: {

  },

  /**
   * 组件的方法列表
   */
  methods: {
    show(rect, featureLabel = ''){
      if (!rect || rect.width <= 0 || !this._that) return
      const version = this._showVersion = (this._showVersion || 0) + 1
      this._that.contentShow.value = 0
      this._that.contentSca.value = 1
      this.handleSca.value = 0
      // Preserve the source's text width; the overlay adds a 2px border on each side.
      const textStyle = ['font-size', 'font-family', 'font-weight', 'line-height', 'letter-spacing',
        'text-align', 'white-space', 'word-break']
        .filter(key => typeof rect[key] === 'string' && rect[key])
        .map(key => `${key}:${rect[key]}`).join(';')
      this.setData({ bubbleWidth:rect.width + 4, featureLabel, textStyle }, () => wx.nextTick(() => {
        this.createSelectorQuery().select('.measure').boundingClientRect(measured => {
          if (version !== this._showVersion) return
          if (!measured || measured.height <= 0) { this.triggerEvent('showOldContent'); return }
          const layout = this._that.prepareUserContent(rect, measured.height)
          this.handleTop.value = layout.menuTop
          this._that.contentShow.value = 1
          triggerHaptic(this.data.hapticFeedback, 'heavy')
          this._that.contentSca.value = sequence(timing(1.06,{duration:durationTime/2}),timing(layout.scale,{duration:durationTime}))
          this._that.contentTop.value = delay(durationTime/2,timing(layout.top,{duration:durationTime}))
          this.handleSca.value = delay(durationTime*1.5,spring(1,{velocity:10,mass:0.8}))
        }).exec()
      }))
    },

    close(){
      this._showVersion = (this._showVersion || 0) + 1
      
      this.handleSca.value = timing(0,{duration:durationTime})

      this._that.contentSca.value = timing(1,{duration:durationTime})
      this._that.contentTop.value = timing(this._that.oldTop.value ,{duration:durationTime},()=>{
        'worklet'
        this._that.contentShow.value = 0
      })
      setTimeout(()=>{
        this.triggerEvent("showOldContent",{},{})
      },durationTime)
    },

    copy(){
      wx.setClipboardData({
        data:this.data.content,
        success:() => {
          wx.hideToast()
          showNotice({ title:this.data.i18n.common.copied })
          this.close()
        }
      })
    },
    edit(){
      this.triggerEvent("editContent",{askText:this.data.content},{})
      this.close()
    }
  },
})
