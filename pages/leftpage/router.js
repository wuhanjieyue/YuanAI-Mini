import {
	CurveAnimation,
	Curves,
  AnimationStatus
} from '../../static_utils/routerUtil.js'
const { shared } = wx.worklet
let app = getApp()

function clamp(v, lower, upper) {
  'worklet'
  if (v < lower) return lower
  if (v > upper) return upper
  return v
}
const screenWidth = app?.globalData?.su_system?.screenWidth || wx.getWindowInfo().screenWidth;

const RouteBuilder = (customRouteContext) => {
	const {
		primaryAnimation,
		primaryAnimationStatus,
		userGestureInProgress,
	} = customRouteContext

	const _curvePrimaryAnimation = CurveAnimation({
		animation: primaryAnimation,
		animationStatus: primaryAnimationStatus,
		curve: Curves.linearToEaseOut,
		reverseCurve: Curves.easeInToLinear,
	})
  const exitProgress = shared(-1)

	const handlePrimaryAnimation = () => {
    'worklet'
    const status = primaryAnimationStatus.value
    if (userGestureInProgress.value || status === AnimationStatus.reverse || exitProgress.value >= 0) {
      if (exitProgress.value < 0) {
        exitProgress.value = clamp(wx.pageTrans.value / (screenWidth * 0.7), 0, 1)
      }
      const t = userGestureInProgress.value ? primaryAnimation.value : _curvePrimaryAnimation.value
      const progress = exitProgress.value * t
      wx.pageTrans.value = screenWidth * 0.7 * progress
      wx.pageScale.value = 1 - progress / 10
      wx.pageFilter.value = clamp(5 * progress, 0, 3)
      wx.leftTrans.value = screenWidth * 0.5 * progress
      wx.leftOp.value = progress
      if (status === AnimationStatus.completed && !userGestureInProgress.value) exitProgress.value = -1
    }
    // Entry and exit use the same shared translation as the home preview.
    return { width: `${screenWidth}px` }
  }

	return {
		opaque: false,
    handlePrimaryAnimation,
		transitionDuration: 10,
		reverseTransitionDuration: 250,
		barrierColor: `rgba(0,0,0,0%)`,
		barrierDismissible:true,
		canTransitionTo: true,
    canTransitionFrom:  false,
	    allowEnterRouteSnapshotting: false,
	    allowExitRouteSnapshotting: false,
	}
}


export default function routeBuilder() { 
  wx.router.addRouteBuilder('leftRoute',RouteBuilder)
}
