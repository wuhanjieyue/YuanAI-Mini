import {
  CurveAnimation,
  Curves
} from '../static_utils/routerUtil.js'

export const TRY_IT_ROUTE_TYPE = 'tryItRouterBuilder'
export const TRY_IT_ROUTE_DURATION = 250
export const TRY_IT_SHEET_HEIGHT_RATIO = 0.45
const SHEET_RADIUS = 32

export function getTryItSheetMetrics() {
  const screenHeight = getApp().globalData?.su_system?.screenHeight || wx.getWindowInfo().screenHeight
  const sheetHeight = screenHeight * TRY_IT_SHEET_HEIGHT_RATIO
  return {
    topInset: screenHeight - sheetHeight,
    sheetHeight
  }
}

const TryItRouterBuilder = (customRouteContext) => {
  const { topInset, sheetHeight } = getTryItSheetMetrics()
  const {
    primaryAnimation,
    primaryAnimationStatus,
    userGestureInProgress
  } = customRouteContext

  const curvePrimaryAnimation = CurveAnimation({
    animation: primaryAnimation,
    animationStatus: primaryAnimationStatus,
    curve: Curves.linearToEaseOut,
    reverseCurve: Curves.easeInToLinear
  })

  const handlePrimaryAnimation = () => {
    'worklet'
    const t = userGestureInProgress.value ? primaryAnimation.value : curvePrimaryAnimation.value
    return {
      overflow: 'hidden',
      marginTop: `${topInset}px`,
      height: `${sheetHeight}px`,
      borderTopLeftRadius: `${SHEET_RADIUS}px`,
      borderTopRightRadius: `${SHEET_RADIUS}px`,
      transform: `translateY(${sheetHeight * (1 - t)}px)`
    }
  }

  return {
    opaque: false,
    handlePrimaryAnimation,
    transitionDuration: TRY_IT_ROUTE_DURATION,
    reverseTransitionDuration: TRY_IT_ROUTE_DURATION,
    barrierColor: '#00000059',
    barrierDismissible: true,
    canTransitionTo: true,
    canTransitionFrom: false,
    allowEnterRouteSnapshotting: false,
    allowExitRouteSnapshotting: true
  }
}

export default function tryItRouterBuilder() {
  try {
    wx.router.removeRouteBuilder(TRY_IT_ROUTE_TYPE)
  } catch (error) {}
  wx.router.addRouteBuilder(TRY_IT_ROUTE_TYPE, TryItRouterBuilder)
}
