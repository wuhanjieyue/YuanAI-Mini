// components/_self/yb-fun-list/index.js
import { rpx2px } from '../../../static_utils/otherUtils'
import { appStaticRoot } from '../../../app_config'
const i18nBehavior = require('../../../static_utils/i18n/behavior')
const { t } = require('../../../static_utils/i18n/index')
const { getSkillTitle } = require('../../../static_utils/chatFeature')
const {timing,shared}  = wx.worklet
const durationTime = 160
Component({
  behaviors: [i18nBehavior],
  observers: {
    'skill, language'(skill, language) {
      this.setData({ skillTitle:getSkillTitle(skill, language) })
    },
    language(language) {
      this.setData({
        thinkingName:t(language, 'tools.research'),
        imgingName:t(language, 'tools.image'),
        searchingName:t(language, 'tools.webSearch'),
        studyingName:t(language, 'tools.study')
      })
    }
  },

  /**
   * 组件的属性列表
   */
  properties: {
    skill: { type: Object, value: null },
    feature:{
      type:String,
      value:'',
      observer:function(newVal){
        this.setData({
          thinking: newVal === 'thinking',
          searching: newVal === 'searching',
          imging: newVal === 'imging',
          studying: newVal === 'studying'
        })
      }
    },
    
  },
  lifetimes:{
    attached(){
      this.funHeight = shared(0)
      this.expandedHeight = rpx2px(92,wx.getWindowInfo().screenWidth)
      wx.nextTick(()=>{
        this.applyAnimatedStyle('.fun-box',()=>{
          'worklet'
          return {height:`${this.funHeight.value}px`}
        })
      })
    }
  },


  /**
   * 组件的初始数据
   */
  data: {
    featureLogos: {
      thinking: `${appStaticRoot}/skills/deep-research-4f77b5c062f6.png`,
      searching: `${appStaticRoot}/skills/web-search-0cc5aa36974e.png`,
      imging: `${appStaticRoot}/skills/image-generation-a3fd29d79e02.png`,
      studying: `${appStaticRoot}/skills/study-7282bdfd11f2.png`
    },
    skillTitle:'',
    thinking:false,
    searching:false,
    imging:false,
    studying:false,
    thinkingName:'深度研究',
    imgingName:'创建图片',
    searchingName:'网页搜索',
    studyingName:'研究与学习'
  },

  /**
   * 组件的方法列表
   */
  methods: {
    setHeight(height){
      this.funHeight.value = timing(height,{duration:durationTime})
      this.triggerEvent('heightchange',{height,duration:durationTime},{})
    },
    // 对外
    showFun(){
      this.setHeight(this.expandedHeight)
    },

    closeFun(){
      this.setHeight(0)
      this.triggerEvent('closeFun', {}, {})
    },

    hideFun(){
      this.setHeight(0)
    },
    reshowFun(){
      if(this.data.skill || this.data.thinking || this.data.searching || this.data.imging || this.data.studying){
        this.setHeight(this.expandedHeight)
      }
    }
  }
})
