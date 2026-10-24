// components/_self/yb-title-nav/index.js
import { rpx2px } from '../../../static_utils/otherUtils'
import { createStoreBindings } from 'mobx-miniprogram-bindings'
import { store } from '../../../store/index'
import { getAccentStyle } from '../../../static_utils/accentColor'
const {timing,shared,sequence}  = wx.worklet
const durationTime = 160
Component({

  /**
   * 组件的属性列表
   */
  properties: {
    model:{
        type:Object,
        value:{}
    },
    featureName:{
        type:String,
        value:'聊天'
    },
    featureMenuEnabled:{
        type:Boolean,
        value:true
    },
    tabs: { type:Array, value:[] },
    activeTab: { type:String, value:'' },
    tabsDisabled: { type:Boolean, value:false }
  },

  /**
   * 组件的初始数据
   */
  data: {
    titleHeight: 100,
    navHeight: 100
  },
  observers: {
    tabs() {
      if (this._attached) this.updateHeight()
    }
  },
  lifetimes: {
      attached(){
        this._attached = true
        this.storeBindings = createStoreBindings(this, { store, fields: {
          hasUnreadConversations: 'hasUnreadConversations',
          accentStyle: state => getAccentStyle(state.applicationSettings?.pointColor, state.effectiveTheme)
        } })
        this.storeBindings.updateStoreBindings()
        this.updateHeight()
        const { height: menuHeight } = wx.getMenuButtonBoundingClientRect()
        wx.nextTick(()=>{
          // 头部功能名称
          this.modelNameSca = shared(1)
          this.modelNameOpa = shared(1)
          this.modelNameTra = shared(0)


          this.applyAnimatedStyle('.model-name', () => {
              'worklet'
              return { height: `${menuHeight}px`,transform:`scale(${this.modelNameSca.value},${this.modelNameSca.value}) translateY(${this.modelNameTra.value}px)`,opacity:`${this.modelNameOpa.value}` }
          })

          this.applyAnimatedStyle('.more-icon',()=>{
              'worklet'
              return {height:`${menuHeight}px`}
          })

        })
      },
      detached(){ this._attached = false; this.storeBindings.destroyStoreBindings() }
    },

  /**
   * 组件的方法列表
   */
  methods: {
      updateHeight(){
          const titleHeight = wx.getMenuButtonBoundingClientRect().bottom + 8
          // 120rpx = 22 top + 36 tab padding + 42 line height + 20 bottom.
          const tabsHeight = this.data.tabs.length ? rpx2px(120, wx.getWindowInfo().windowWidth) : 0
          const height = titleHeight + tabsHeight
          this.setData({ titleHeight: titleHeight - 1, navHeight: height }, () => {
              this.triggerEvent('heightchange', { height })
          })
      },
      selectTab(e){
          const id = e.currentTarget.dataset.id
          if(this.data.tabsDisabled || id === this.data.activeTab || !this.data.tabs.some(tab => tab.id === id)) return
          this.triggerEvent('tabchange', { id })
      },
      openLeft(){
          this.triggerEvent('openLeft', null, {})
      },
      showFeatures(){
          if(!this.data.featureMenuEnabled) return
          if(this._featureMenuOpen || !this.modelNameSca) return
          this._featureMenuOpen = true
          const request = this._featureRequest = (this._featureRequest || 0) + 1
          this.createSelectorQuery()
            .select('.model-name-anchor')
            .boundingClientRect((rect) => {
              if(request !== this._featureRequest || !this._attached) return
              if(!rect){ this.closeFeatures(); return }
              this.hideFeatures()
              this.triggerEvent('showFeatures',{rect}, {})
            })
            .exec()
      },

      hideFeatures(){
          this.modelNameSca.value = timing(.8,{duration:durationTime})
          this.modelNameOpa.value = timing(0,{duration:durationTime})
          this.modelNameTra.value = sequence(timing(-10,{duration:durationTime/2}), timing(0,{duration:durationTime/2}))
      },

      closeFeatures(){
          this._featureMenuOpen = false
          this._featureRequest = (this._featureRequest || 0) + 1
          this.modelNameSca.value = timing(1,{duration:durationTime})
          this.modelNameOpa.value = timing(1,{duration:durationTime})
          this.modelNameTra.value = sequence(timing(-10,{duration:durationTime/2}), timing(0,{duration:durationTime/2}))
      },
  }
})
