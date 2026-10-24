const { bindPageTheme, unbindPageTheme, syncThemeNavigation } = require('../../static_utils/themeBinding')
import { createStoreBindings } from 'mobx-miniprogram-bindings'
import { store } from '../../store/index'
import { loginWithPhoneCode } from '../../static_utils/settingApi'
import { buildUserFromAccountSummary, initAppData } from '../../static_utils/appDataInit'
import eventBus, { CHAT_SESSION_RESET } from '../../static_utils/eventBus'
import {
  GestureState,
  clamp,
  Curves,
  bottomSheetSuspendedCurve
} from '../../static_utils/routerUtil.js'
import {
  getTryItSheetMetrics,
  TRY_IT_ROUTE_DURATION
} from '../../static_router/tryItRouter'
import { appStaticRoot } from '../../app_config'

const { shared, timing } = wx.worklet
const CLOSE_PROGRESS_THRESHOLD = 0.5

Page({
  data: {
    appStaticRoot,
    appName: store.appInfo?.appName || 'YuanAI',
    loginPending: false
  },

  onLoad() {
    bindPageTheme(this)
    this.storeBindings = createStoreBindings(this, {
      store,
      fields: {
        appName: (state) => state.appInfo?.appName || 'YuanAI'
      }
    })
    this.routeContext = wx.router.getRouteContext(this)
    this.dragExtent = shared(getTryItSheetMetrics().sheetHeight)
  },

  onShow() {
    syncThemeNavigation(this)
  },

  onUnload() {
    unbindPageTheme(this)
    if (this.storeBindings) this.storeBindings.destroyStoreBindings()
  },

  shouldPanResponse(pointerEvent) {
    'worklet'
    if (this.routeContext && this.routeContext.userGestureInProgress.value) return true
    return pointerEvent.deltaY > 0 && pointerEvent.deltaY >= Math.abs(pointerEvent.deltaX)
  },

  shouldPanAccept() {
    'worklet'
    return true
  },

  handleDragStart() {
    'worklet'
    const { startUserGesture } = this.routeContext || {}
    if (startUserGesture) startUserGesture()
  },

  handleDragUpdate(delta) {
    'worklet'
    const { primaryAnimation } = this.routeContext || {}
    if (!primaryAnimation) return
    primaryAnimation.value = clamp(primaryAnimation.value - delta, 0, 1)
  },

  handleDragEnd(cancelled = false) {
    'worklet'
    const {
      primaryAnimation,
      stopUserGesture,
      userGestureInProgress,
      didPop
    } = this.routeContext || {}
    if (!primaryAnimation || !stopUserGesture || !didPop || !userGestureInProgress || !userGestureInProgress.value) return

    const t = primaryAnimation.value
    if (cancelled || t > CLOSE_PROGRESS_THRESHOLD) {
      const duration = Math.max(1, Math.floor(TRY_IT_ROUTE_DURATION * (1 - t)))
      primaryAnimation.value = timing(1, {
        duration,
        easing: bottomSheetSuspendedCurve(t, Curves.decelerateEasing)
      }, () => {
        'worklet'
        stopUserGesture()
      })
      return
    }

    const duration = Math.max(1, Math.floor(TRY_IT_ROUTE_DURATION * t))
    primaryAnimation.value = timing(0, { duration, easing: Curves.easeOutCubic }, () => {
      'worklet'
      stopUserGesture()
      didPop()
    })
  },

  handleVerticalDrag(evt) {
    'worklet'
    if (evt.state === GestureState.BEGIN) {
      this.handleDragStart()
    } else if (evt.state === GestureState.ACTIVE) {
      this.handleDragUpdate(evt.deltaY / (this.dragExtent.value || 1))
    } else if (evt.state === GestureState.END) {
      this.handleDragEnd(false)
    } else if (evt.state === GestureState.CANCELLED) {
      this.handleDragEnd(true)
    }
  },

  closePage() {
    wx.navigateBack()
  },

  async handleGetPhoneNumber(e) {
    if (this.data.loginPending) return
    const { errMsg, code } = e.detail || {}
    if (errMsg !== 'getPhoneNumber:ok' || !code) return

    this.setData({ loginPending: true })
    wx.showLoading({ title: '正在登录', mask: true })
    try {
      const result = await loginWithPhoneCode(code)
      if (!result?.user) throw new Error('登录失败，请重试')
      store.resetAssetListCache()
      store.resetChatHistory()
      store.resetChatMessageCache()
      store.resetChatRuns()
      eventBus.emit(CHAT_SESSION_RESET, { reason: 'login', reloadHistory: true })
      store.setUser(buildUserFromAccountSummary(result.user))
      await initAppData({ force: true, silent: true })
      this.getOpenerEventChannel()?.emit('loginSuccess')
      wx.navigateBack()
    } catch (error) {
      wx.showToast({ title: error.message || '登录失败，请重试', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ loginPending: false })
    }
  }
})
