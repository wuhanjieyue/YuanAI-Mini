const { showErrorNotice } = require('../../../static_utils/errorNotice')
const { bindPageTheme, unbindPageTheme, syncThemeNavigation } = require('../../../static_utils/themeBinding')
const { messages } = require('../../../static_utils/i18n/index')
const { store } = require('../../../store/index')
const {
  GestureState,
  clamp,
  Curves,
  bottomSheetSuspendedCurve
} = require('../../../static_utils/routerUtil')
const settingRouterBuilder = require('../../../static_router/settingRouter').default
const { getSettingSheetMetrics, SETTING_ROUTE_DURATION } = require('../../../static_router/settingRouter')
const { static: parseMarkdown } = require('../../components/towxmlstream/index')
const { resolvePreviewFile } = require('../../../static_utils/filePreview')
const { TEXT_EXTENSIONS } = require('../../../static_utils/chatAttachment')

const MIN_FLING_VELOCITY = 500
const CLOSE_PROGRESS_THRESHOLD = 0.6

function shouldRestoreRoute(primaryAnimationValue, velocity) {
  'worklet'
  if (Math.abs(velocity) >= MIN_FLING_VELOCITY) return velocity <= 0
  return primaryAnimationValue > CLOSE_PROGRESS_THRESHOLD
}

Page({
  data: {
    title: '', content: '', article: null, kind: '', loading: true, failed: false, downloading: false,
    pageVisible: true, loadingCanvasWidthRpx: 678, loadingCanvasHeightRpx: 0,
    i18n: messages('中文'), sheetScrollHandlers: ['scroll']
  },

  onLoad() {
    bindPageTheme(this)
    settingRouterBuilder()
    this._alive = true
    this.routeContext = wx.router.getRouteContext(this)
    const { sheetHeight } = getSettingSheetMetrics()
    this.dragExtent = wx.worklet.shared(Math.max(sheetHeight, 1))
    this.scrollTop = wx.worklet.shared(0)
    this.startPan = wx.worklet.shared(false)
    this.setData({
      i18n: messages(store.applicationSettings.language),
      loadingCanvasHeightRpx: Math.max(1, sheetHeight * 750 / wx.getWindowInfo().windowWidth - 220)
    })
    this.getOpenerEventChannel().on('previewFile', data => {
      this._previewInput = data
      this.setData({ title: data.name || this.data.i18n.common.document })
      if (this._ready) this.loadFile(data)
    })
  },

  onReady() {
    this._ready = true
    if (this._previewInput) this.loadFile(this._previewInput)
  },

  onShow() {
    this.setData({ pageVisible: true })
    syncThemeNavigation(this)
  },

  onHide() { this.setData({ pageVisible: false }) },

  onUnload() {
    this._alive = false
    unbindPageTheme(this)
  },

  async loadFile({ filePath, attachment, name, extension } = {}) {
    const kind = extension === 'md' || extension === 'markdown' ? 'markdown'
      : TEXT_EXTENSIONS.has(extension) || String(attachment?.mimeType || '').startsWith('text/') ? 'text' : ''
    this._filePath = ''
    this.setData({ title: name || this.data.i18n.common.document, kind, loading: true, failed: false })
    if ((!filePath && !attachment) || !kind) {
      this.setData({ loading: false, failed: true })
      return
    }
    try {
      const resolvedPath = filePath || await resolvePreviewFile(attachment)
      if (!this._alive) return
      const data = await new Promise((resolve, reject) => wx.getFileSystemManager().readFile({
        filePath: resolvedPath, encoding: 'utf8', success: result => resolve(result.data), fail: reject
      }))
      if (!this._alive) return
      const content = String(data || '').replace(/^\uFEFF/, '')
      const article = kind === 'markdown' ? parseMarkdown(content, 'markdown', { theme: this.data.effectiveTheme }) : null
      this._filePath = resolvedPath
      this.setData({ content, article, loading: false, failed: false })
    } catch (error) {
      if (this._alive) this.setData({ loading: false, failed: true })
    }
  },

  async downloadFile() {
    if (this.data.loading || this.data.failed || this.data.downloading || !this._filePath) return
    this.setData({ downloading: true })
    try {
      const platform = wx.getDeviceInfo().platform
      await new Promise((resolve, reject) => {
        const options = { filePath: this._filePath, success: resolve, fail: reject }
        if (platform === 'windows' || platform === 'mac') wx.saveFileToDisk(options)
        else wx.shareFileMessage({ ...options, fileName: this.data.title })
      })
    } catch (error) {
      if (this._alive && !/cancel/i.test(error?.errMsg || '')) {
        showErrorNotice({ title: this.data.i18n.assets.downloadFailed })
      }
    } finally {
      if (this._alive) this.setData({ downloading: false })
    }
  },

  handleScrollUpdate(evt) {
    'worklet'
    this.scrollTop.value = evt.detail?.scrollTop || 0
  },

  shouldPanResponse() {
    'worklet'
    return this.startPan.value
  },

  shouldPanAccept() {
    'worklet'
    return true
  },

  shouldScrollViewResponse(pointerEvent) {
    'worklet'
    const { primaryAnimation } = this.routeContext || {}
    if (!primaryAnimation) return true
    if (primaryAnimation.value < 1) return false
    const shouldScroll = !(this.scrollTop.value <= 0 && pointerEvent.deltaY > 0)
    this.startPan.value = !shouldScroll
    return shouldScroll
  },

  handleVerticalDrag(evt) {
    'worklet'
    if (evt.state === GestureState.BEGIN) {
      this.startPan.value = true
      const { startUserGesture } = this.routeContext || {}
      if (startUserGesture) startUserGesture()
      return
    }
    if (evt.state === GestureState.ACTIVE) {
      const { primaryAnimation } = this.routeContext || {}
      if (primaryAnimation) primaryAnimation.value = clamp(primaryAnimation.value - evt.deltaY / (this.dragExtent.value || 1), 0, 1)
      return
    }
    if (evt.state !== GestureState.END && evt.state !== GestureState.CANCELLED) return
    this.startPan.value = false
    const { primaryAnimation, stopUserGesture, userGestureInProgress, didPop } = this.routeContext || {}
    if (!primaryAnimation || !stopUserGesture || !didPop || !userGestureInProgress || !userGestureInProgress.value) return
    const velocity = evt.state === GestureState.END ? evt.velocityY : 0
    const t = primaryAnimation.value
    if (shouldRestoreRoute(t, velocity)) {
      const duration = Math.max(1, Math.floor(SETTING_ROUTE_DURATION * (1 - t)))
      primaryAnimation.value = wx.worklet.timing(1, { duration, easing: bottomSheetSuspendedCurve(t, Curves.decelerateEasing) }, () => {
        'worklet'
        stopUserGesture()
      })
      return
    }
    primaryAnimation.value = wx.worklet.timing(0, { duration: Math.max(1, Math.floor(SETTING_ROUTE_DURATION * t)), easing: Curves.easeOutCubic }, () => {
      'worklet'
      stopUserGesture()
      didPop()
    })
  },

  closePage() { wx.navigateBack() }
})
