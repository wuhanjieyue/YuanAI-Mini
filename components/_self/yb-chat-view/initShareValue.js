const { shared} = wx.worklet
export default function initShareValue(_that){
  /**
   * index 聊天框高度 页面平移 页面缩放 页面滤镜 左侧视图平移 左侧视图透明度
   */
  _that.chatHeight = shared(300)
  _that.topIconSca = shared(0)

  /**
   * 底部
   */
  _that.btSca = shared(1)
  _that.btTrax = shared(0)
  _that.btTray = shared(0)

  _that.leftIconWitdh = shared(0)
  _that.ficonScale = shared(1)
  _that.ficonOpa = shared(1)
  /**
   * filePage 高度 透明度 缩放
   */
  _that.fHeight = shared(180)
  _that.fOpa = shared(0.2)
  _that.fScale = shared(0.8)

  /**
   * chatInput 高度
   */
  _that.keyHeight = shared(36)
  _that.inputHeight = shared(0)
  wx.homePressFlag = wx.homePressFlag || shared(false)
  wx.homeContentShow = wx.homeContentShow || shared(0)
  _that.pressFlag = wx.homePressFlag


  /**
   * funList 高度在聊天容器中的布局镜像
   */
  _that.funHeight = shared(0)

  /**
   * 文件列表高度在聊天容器中的布局镜像
   */
  _that.fileHeight = shared(0)
 
  _that.contentShow = wx.homeContentShow
  _that.contentSca = shared(1)
  _that.contentTop = shared(0)
  _that.contentRight = shared(0)
  _that.contentHeight = shared(0)

  _that.moveSca = shared(1)
  _that.moveTop = shared(0)
  _that.oldTop = shared(0)

}

// index.json
// "assis-done":"/mdPackage/components/assisDone/index",
// "assis-stream":"/mdPackage/components/assisStream/index",
