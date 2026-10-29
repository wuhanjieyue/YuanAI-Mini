const { showErrorNotice } = require('../../../static_utils/errorNotice')
const {shared} = wx.worklet
const i18nBehavior = require('../../../static_utils/i18n/behavior')
const { artifactAttachmentDetail } = require('../../../static_utils/chatArtifacts')
const { t } = require('../../../static_utils/i18n/index')

Component({
  behaviors: [i18nBehavior],

  /**
   * 组件的属性列表
   */
  properties: {
    theme: { type: String, value: 'light' },
    hapticFeedback: { type: Boolean, value: false },
    modelName: { type: String, value: '' },
    shareEnabled: { type: Boolean, value: true },
    showActions: { type: Boolean, value: true },
    branchLoadingTurnId: { type: String, value: '' },
    shareLoading: { type: Boolean, value: false },
    item:{
      type:Object,
      value:null
    },
    index:{
      type:Number,
      value:0
    },
    renderToken:{
      type:Number,
      value:0
    }

  },
  observers:{
    item: function (item) {
      if(item?.content){
        this.parseContent(item.content, item.citations, item.contentParts)
      }
      if(item?.role === 'user' || (item?.role === 'assistant' && !item.content?.trim())){
        wx.nextTick(() => this.notifyRenderReady())
      }
    }
  },
  /**
   * 组件的初始数据
   */
  data: {
    article:{}
  },
  lifetimes:{
    attached(){

      wx.nextTick(()=>{
        this._that = this.selectOwnerComponent()
        this.opacity = shared(1)
        if(this.data.item.role == 'user'){
          this.applyAnimatedStyle(`#user_${this.data.index}`,()=>{
            'worklet'
            return { opacity:`${this.opacity.value}`}
          })
          this.notifyRenderReady()
        }
   
      })

    }
  },
  /**
   * 组件的方法列表
   */
  methods: {
    copy(e){
      this.triggerEvent('copy', e.detail || {}, {})
    },
    share(e){
      this.triggerEvent('share', e.detail || {}, {})
    },
    moreAction(e){
      this.triggerEvent('moreAction', e.detail || {}, {})
    },
    parseContent(content, citations, images){
      const result = wx.towxml(content,'markdown',{
        citations,
        images,
        theme: this.data.theme,					// 主题，默认`light`
        events:{					// 为元素绑定的事件方法
          tap:()=>{
            this.triggerEvent('contenttap', {})
          }
        }
      });
      // 更新解析数据
      this.setData({
        article:result
      });
    },

    handleTowxmlReady(){
      this.notifyRenderReady()
    },

    notifyRenderReady(){
      if(this._renderReadyToken === this.data.renderToken) return
      this._renderReadyToken = this.data.renderToken
      this.triggerEvent('renderready', {
        renderToken: this.data.renderToken,
        index: this.data.index,
        role: this.data.item?.role || ''
      })
    },

    showContent(){
      this.opacity.value = 1
    },
    openSources(e){
      this.triggerEvent('openSources', e.detail || {}, {})
    },
    openReasoning(e){
      this.triggerEvent('openReasoning', e.detail || {}, {})
    },
    previewFile(e){
      this.triggerEvent('previewFile', e.detail || {}, {})
    },
    previewArtifact(e){
      const detail = artifactAttachmentDetail(this.data.item?.contentParts, e.detail?.link)
      if(detail) this.triggerEvent('previewFile', detail, {})
      else showErrorNotice({ title:t(this.properties.language, 'assets.previewFailed') })
    },
    unavailableImage(){
      this.triggerEvent('unavailableImage', {}, {})
    },
    // 长按文本
    pressContent(e){

      this.createSelectorQuery().select(`#user_${this.data.index} .user-content`).fields({ rect:true, size:true, computedStyle:['font-size', 'font-family', 'font-weight', 'line-height', 'letter-spacing', 'text-align', 'white-space', 'word-break'] }, content =>{
         
        if (!content || !this._that) return
          this.opacity.value = 0
          this._that.contentShow.value = 0

          this.triggerEvent("showUserContent",{content:this.data.item.content,index:this.data.index,rect:content,featureLabel:this.data.item.featureLabel || ''},{})
      }).exec()

    }
  }
})
