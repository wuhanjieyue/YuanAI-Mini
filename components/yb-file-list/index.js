// components/yb-file-list/index.js

const {shared, timing} = wx.worklet
const durationTime = 160
const expandedHeight = 96
Component({

  /**
   * 组件的属性列表
   */
  properties: {
    files:{
      type:Array,
      value:[]
    },
  },
  lifetimes:{
    attached(){
      this.fileHeight = shared(0)
      wx.nextTick(()=>{
        this.applyAnimatedStyle('.file-scroll',()=>{
          'worklet'
          return {height:`${this.fileHeight.value}px`}
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
      setHeight(height){
        this.fileHeight.value = timing(height,{duration:durationTime})
        this.triggerEvent('heightchange',{height,duration:durationTime},{})
      },
      showFun(){
        this.setHeight(expandedHeight)
      },
      deleteFile(e){
          this.triggerEvent("deleteFile",{index:e.currentTarget.dataset.index},{});
      },
      hideFun(){
        this.setHeight(0)
      },
      reshowFun(){
        if(this.data.files.length > 0){
          this.setHeight(expandedHeight)
        }
      }
  }
})
