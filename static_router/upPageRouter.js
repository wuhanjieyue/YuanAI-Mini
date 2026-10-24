import {
  CurveAnimation,
  Curves
} from '../static_utils/routerUtil.js'

const UP_ROUTE_TYPE = 'upRouterBuilder'

const UpRouterBuilder = (customRouteContext) => {
  const screenHeight = getApp().globalData?.su_system?.screenHeight || wx.getWindowInfo().screenHeight
  const {
    primaryAnimation,
    primaryAnimationStatus,
    userGestureInProgress,
  } = customRouteContext

  const curvePrimaryAnimation = CurveAnimation({
    animation: primaryAnimation,
    animationStatus: primaryAnimationStatus,
    curve: Curves.linearToEaseOut,
    reverseCurve: Curves.easeInToLinear,
  })

  const handlePrimaryAnimation = () => {
    'worklet'
    let t = primaryAnimation.value
    if (!userGestureInProgress.value) {
      t = curvePrimaryAnimation.value
    }

    const transY = screenHeight * (1 - t)
    return {
      transform: `translateY(${transY}px)`
    }
  }

  return {
    opaque: false,
    handlePrimaryAnimation,
    transitionDuration: 250,
    reverseTransitionDuration: 250,
    barrierColor: '#00000059',
    barrierDismissible: true,
    canTransitionTo: true,
    canTransitionFrom: false,
    allowEnterRouteSnapshotting: false,
    allowExitRouteSnapshotting: true,
  }
}

export default function upRouterBuilder() {
  try {
    wx.router.removeRouteBuilder(UP_ROUTE_TYPE)
  } catch (error) {}
  wx.router.addRouteBuilder(UP_ROUTE_TYPE, UpRouterBuilder)
}
