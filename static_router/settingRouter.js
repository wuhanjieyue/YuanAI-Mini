import {
  CurveAnimation,
  Curves
} from '../static_utils/routerUtil.js'

export const SETTING_ROUTE_TYPE = 'settingRouterBuilder'
export const SETTING_ROUTE_DURATION = 250
const DEFAULT_TOP_INSET_RATIO = 0.12
const SHEET_EDGE_GAP = 20
const SHEET_RADIUS = 25

export function getSettingSheetMetrics() {
  const screenHeight = getApp().globalData?.su_system?.screenHeight || wx.getWindowInfo().screenHeight
  const menuBottom = getApp().globalData?.su_menu?.bottom || 0
  const fallbackTopInset = Math.round(screenHeight * DEFAULT_TOP_INSET_RATIO)
  const topInset = Math.max(menuBottom + SHEET_EDGE_GAP, fallbackTopInset)
  const sheetHeight = Math.max(screenHeight - topInset, 0)
  return {
    topInset,
    sheetHeight
  }
}

const SettingRouterBuilder = (customRouteContext, routeOptions = {}) => {
  const { topInset, sheetHeight } = getSettingSheetMetrics()
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
    let t = primaryAnimation.value
    if (!userGestureInProgress.value) {
      t = curvePrimaryAnimation.value
    }
    const transY = sheetHeight * (1 - t)
    return {
      overflow: 'hidden',
      marginTop: `${topInset}px`,
      height: `${sheetHeight}px`,
      borderTopLeftRadius: `${SHEET_RADIUS}px`,
      borderTopRightRadius: `${SHEET_RADIUS}px`,
      transform: `translateY(${transY}px)`
    }
  }

  const handlePreviousPageAnimation = () => {
    'worklet'
    const t = userGestureInProgress.value ? primaryAnimation.value : curvePrimaryAnimation.value
    return {
      transformOrigin: '50% 0',
      transform: `translateY(${-12 * t}px) scale(${1 - 0.04 * t})`
    }
  }

  return {
    opaque: false,
    handlePrimaryAnimation,
    transitionDuration: SETTING_ROUTE_DURATION,
    reverseTransitionDuration: SETTING_ROUTE_DURATION,
    barrierColor: '#00000059',
    barrierDismissible: true,
    canTransitionTo: true,
    canTransitionFrom: routeOptions.stacked === true,
    ...(routeOptions.stacked === true ? {
      handlePreviousPageAnimation,
      fullscreenDrag: true,
      popGestureDirection: 'multi'
    } : {}),
    // Theme variables arrive with the first setData; do not freeze the unthemed frame.
    allowEnterRouteSnapshotting: false,
    allowExitRouteSnapshotting: true
  }
}

export default function settingRouterBuilder() {
  try {
    wx.router.removeRouteBuilder(SETTING_ROUTE_TYPE)
  } catch (error) {}
  wx.router.addRouteBuilder(SETTING_ROUTE_TYPE, SettingRouterBuilder)
}
