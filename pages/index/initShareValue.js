const { shared } = wx.worklet

export default function initShareValue(page) {
  page.drawerGestureActive = shared(false)

  wx.homePressFlag = wx.homePressFlag || shared(false)
  wx.homeContentShow = wx.homeContentShow || shared(0)
  wx.homePressFlag.value = false
  wx.homeContentShow.value = 0
}
