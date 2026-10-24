const {
  calculatePosition,
  normalizeRect,
  normalizeWindowMetrics
} = require('./position')

const { shared, timing, spring, sequence, runOnJS } = wx.worklet

const POPUP_SHOW_DURATION = 220
const POPUP_HIDE_DURATION = 180
const TRIGGER_DURATION = 220
let activeFlyout = null
Component({
  options: {
    multipleSlots: true
  },

  externalClasses: ['trigger-class', 'anchor-class', 'popup-class', 'mask-class'],

  properties: {
    themeStyle: { type: String, value: '' },
    previewEnabled: { type: Boolean, value: false },
    previewWidthRpx: { type: Number, value: 0 },
    previewHeightRatio: { type: Number, value: 0 },
    anchorCentered: {
      type: Boolean,
      value: false
    },
    separateAnchor: {
      type: Boolean,
      value: false
    },
    popupWidthRpx: {
      type: Number,
      value: 450
    },
    popupTransformOrigin: {
      type: String,
      value: '50% 0'
    },
    maxHeightRatio: {
      type: Number,
      value: 0.6
    },
    safeGapRpx: {
      type: Number,
      value: 36
    },
    edgeGapRpx: {
      type: Number,
      value: 24
    },
    closeOnPopupTap: {
      type: Boolean,
      value: false
    },
    closeOnMaskTap: {
      type: Boolean,
      value: true
    },
    animateTrigger: {
      type: Boolean,
      value: true
    },
    scrollable: {
      type: Boolean,
      value: false
    },
    disabled: {
      type: Boolean,
      value: false
    },
    openOnTriggerTap: {
      type: Boolean,
      value: true
    }
  },

  data: {
    maskMounted: false,
    portalActive: false,
    scrollReady: false,
    maskStyle: '',
    positionerStyle: '',
    panelStyle: '',
    measuredTransformOrigin: '',
    previewStyle: '',
    scrollStyle: ''
  },

  lifetimes: {
    attached() {
      this._phase = 'closed'
      this._token = 0
      this._maskTapReadyAt = 0
      this.anchorScale = shared(1)
      this.anchorOpacity = shared(1)
      this.anchorTranslate = shared(0)
      this.panelScale = shared(1)
      this.panelOpacity = shared(0)
      this.previewProgress = shared(0)
      this.previewX = shared(0)
      this.previewY = shared(0)
      this.previewScale = shared(1)

      wx.nextTick(() => {
        const sizedPreview = this.properties.previewHeightRatio > 0
        this.applyAnimatedStyle('.yb-flyout-animated-anchor', () => {
          'worklet'
          return {
            transform: `scale(${this.anchorScale.value},${this.anchorScale.value}) translateY(${this.anchorTranslate.value}px)`,
            opacity: `${this.anchorOpacity.value}`
          }
        })

        this.applyAnimatedStyle('.yb-flyout-panel', () => {
          'worklet'
          return {
            transform: `scale(${this.panelScale.value})`,
            opacity: `${this.panelOpacity.value}`
          }
        }, { flush: 'sync' })
        this.applyAnimatedStyle('.yb-flyout-preview', () => {
          'worklet'
          if (sizedPreview) return {
            transform: `scale(${this.panelScale.value})`,
            opacity: `${this.panelOpacity.value}`
          }
          const progress = this.previewProgress.value
          return {
            transform: `translate(${this.previewX.value * progress}px, ${this.previewY.value * progress}px) scale(${1 + (this.previewScale.value - 1) * progress})`
          }
        }, { flush: 'sync' })
      })
    },

    detached() {
      if (activeFlyout === this) activeFlyout = null
      clearTimeout(this._closeTimer)
      this._token += 1
      this._phase = 'closed'
      if (this._cancelOpen) this._cancelOpen()
    }
  },

  methods: {
    getWindowMetrics() {
      const info = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : {}
      return normalizeWindowMetrics(info)
    },

    normalizeRect(rect = {}) {
      return normalizeRect(rect)
    },

    getLayoutMetrics(anchorRect = {}, measuredHeight = 0, portalRect = {}, boundaryRect) {
      return calculatePosition({
        anchorRect,
        measuredHeight,
        portalRect,
        boundaryRect,
        anchorCentered: this.properties.anchorCentered,
        previewEnabled: this.properties.previewEnabled,
        previewWidthRpx: this.properties.previewWidthRpx,
        previewHeightRatio: this.properties.previewHeightRatio,
        windowMetrics: this.getWindowMetrics(),
        popupWidthRpx: this.properties.popupWidthRpx,
        maxHeightRatio: this.properties.maxHeightRatio,
        safeGapRpx: this.properties.safeGapRpx,
        edgeGapRpx: this.properties.edgeGapRpx
      })
    },

    measureAnchor() {
      return new Promise((resolve) => {
        this.createSelectorQuery()
          .select('.yb-flyout-anchor')
          .boundingClientRect(resolve)
          .exec()
      })
    },

    measurePopup() {
      return new Promise((resolve) => {
        const scrollHeight = this._scrollHeight
        const query = this.createSelectorQuery()
        query.select('.yb-flyout-origin').boundingClientRect()
        query.select('.yb-flyout-panel-metrics').boundingClientRect()
        query.select('.yb-flyout-popup-content').boundingClientRect()
        query.exec((results) => {
          resolve({
            portalRect: results && results[0],
            panelRect: results && results[1],
            scrollHeight,
            contentRect: results && results[2]
          })
        })
      })
    },

    setDataAndWait(data) {
      return new Promise((resolve) => {
        this.setData(data, () => wx.nextTick(resolve))
      })
    },

    waitForOpenLayout(operation) {
      return new Promise((resolve) => {
        const finish = (value) => {
          if (this._cancelOpen === cancel) this._cancelOpen = null
          resolve(value)
        }
        const cancel = () => finish(null)
        this._cancelOpen = cancel
        Promise.resolve(operation).then(finish, () => {
          if (this._cancelOpen === cancel) this.close()
          finish(null)
        })
      })
    },

    animateAnchor(opening) {
      if (!this.properties.animateTrigger || this.properties.previewEnabled) return
      this.anchorScale.value = timing(opening ? 0.8 : 1, { duration: TRIGGER_DURATION })
      this.anchorOpacity.value = timing(opening ? 0 : 1, { duration: TRIGGER_DURATION })
      this.anchorTranslate.value = opening
        ? sequence(
          timing(-10, { duration: 90 }),
          timing(0, { duration: 130 })
        )
        : timing(0, { duration: TRIGGER_DURATION })
    },

    getPopupLayout(anchor, measuredPopup, boundaryRect) {
      const { portalRect, panelRect, scrollHeight, contentRect } = measuredPopup || {}
      if (!portalRect || !panelRect || !Number.isFinite(scrollHeight) || !contentRect || contentRect.height <= 0) return null

      const chromeHeight = Math.max(0, panelRect.height - scrollHeight)
      const layout = this.getLayoutMetrics(anchor, contentRect.height + chromeHeight, portalRect, boundaryRect)
      return {
        layout,
        scrollHeight: Math.max(0, layout.panelHeightPx - chromeHeight)
      }
    },

    getPopupStyles(anchor, layout, scrollHeight) {
      const sizedPreview = this.properties.previewHeightRatio > 0
      const preview = sizedPreview ? layout.preview : anchor
      let previewStyle = ''
      if (this.properties.previewEnabled && preview) {
        previewStyle = `left:${preview.left}px;top:${preview.top}px;width:${preview.width}px;height:${preview.height}px;`
        if (sizedPreview) {
          const originX = Math.max(0, Math.min(preview.width, anchor.left + anchor.width / 2 - preview.left))
          previewStyle += `transform-origin:${originX}px 100%;`
        }
      }
      return {
        measuredTransformOrigin: this.properties.anchorCentered || this.properties.previewEnabled ? layout.transformOrigin : '',
        previewStyle,
        maskStyle: `top:${layout.maskTopPx}px;left:${layout.maskLeftPx}px;`,
        positionerStyle: `width:${layout.popupWidthPx}px;height:${layout.panelHeightPx}px;top:${layout.panelTopPx}px;left:${layout.panelLeftPx}px;`,
        panelStyle: `height:${layout.panelHeightPx}px;max-height:${layout.maxPopupHeightPx}px;`,
        scrollStyle: `height:${scrollHeight}px;`
      }
    },

    async open(anchorRect, boundaryRect) {
      if (this.properties.disabled) return false
      if (this._phase === 'closing') this.finishClose(this._token)
      if (this._phase !== 'closed') return false

      if (activeFlyout && activeFlyout !== this) activeFlyout.close('api', true)
      activeFlyout = this
      const token = ++this._token
      this._maskTapReadyAt = 0
      this._phase = 'locating'
      const measuredAnchor = anchorRect || await this.waitForOpenLayout(this.measureAnchor())
      if (token !== this._token || this._phase !== 'locating') return false
      if (!measuredAnchor || !Number.isFinite(Number(measuredAnchor.top)) || !Number.isFinite(Number(measuredAnchor.left))) {
        this.close()
        return false
      }

      const anchor = this.normalizeRect(measuredAnchor)
      const boundary = boundaryRect ? this.normalizeRect(boundaryRect) : null
      this._anchorRect = anchor
      this._boundaryRect = boundary
      this._externalAnchor = !!anchorRect
      const initialLayout = this.getLayoutMetrics(anchor, 0, {}, boundary)
      this.animateAnchor(true)
      this.panelScale.value = 1
      this.panelOpacity.value = 0
      this._phase = 'measuring'
      this._scrollHeight = this.getWindowMetrics().windowHeight

      await this.waitForOpenLayout(this.setDataAndWait({
        maskMounted: true,
        portalActive: false,
        scrollReady: false,
        positionerStyle: `width:${initialLayout.popupWidthPx}px;top:0;left:0;`,
        panelStyle: 'height:auto;max-height:none;',
        scrollStyle: `height:${this._scrollHeight}px;`
      }))

      if (token !== this._token || this._phase !== 'measuring') return false
      const measuredPopup = await this.waitForOpenLayout(this.measurePopup())
      if (token !== this._token || this._phase !== 'measuring') return false

      const popupLayout = this.getPopupLayout(anchor, measuredPopup, boundary)
      if (!popupLayout) {
        this.close()
        return false
      }

      const { layout, scrollHeight } = popupLayout
      if (this.properties.previewEnabled) this.setPreviewLayout(anchor, layout)
      this.panelScale.value = 0
      await this.waitForOpenLayout(this.setDataAndWait({
        ...this.getPopupStyles(anchor, layout, scrollHeight),
        portalActive: true,
        scrollReady: !!this.properties.scrollable
      }))

      if (token !== this._token || this._phase !== 'measuring') return false
      this._scrollHeight = scrollHeight
      this._phase = 'open'
      this.panelOpacity.value = timing(1, { duration: POPUP_SHOW_DURATION })
      this.panelScale.value = spring(1, { velocity: 16, mass: 0.6 })
      if (this.properties.previewEnabled && !this.properties.previewHeightRatio) this.previewProgress.value = spring(1, { mass: 0.8, damping: 24, stiffness: 260 })
      this._maskTapReadyAt = Date.now() + POPUP_SHOW_DURATION
      this.triggerEvent('open', {
        anchorRect: anchor,
        placement: layout.alignRight ? 'right' : 'left'
      })
      return true
    },

    setPreviewLayout(anchor, layout) {
      if (!layout.preview || this.properties.previewHeightRatio > 0) return
      this.previewX.value = layout.preview.left - anchor.left
      this.previewY.value = layout.preview.top - anchor.top
      this.previewScale.value = layout.preview.scale
    },

    async reposition(anchorRect, boundaryRect) {
      if (this.properties.disabled || this._phase !== 'open') return false

      const token = this._token
      const measuredAnchor = anchorRect || (this._externalAnchor ? this._anchorRect : await this.measureAnchor())
      if (token !== this._token || this._phase !== 'open' || !measuredAnchor) return false
      const anchor = this.normalizeRect(measuredAnchor)
      const boundary = boundaryRect ? this.normalizeRect(boundaryRect) : this._boundaryRect
      const popupLayout = this.getPopupLayout(anchor, await this.measurePopup(), boundary)
      if (token !== this._token || this._phase !== 'open' || !popupLayout) return false

      const { layout, scrollHeight } = popupLayout
      if (this.properties.previewEnabled) this.setPreviewLayout(anchor, layout)
      await this.setDataAndWait(this.getPopupStyles(anchor, layout, scrollHeight))
      if (token !== this._token || this._phase !== 'open') return false
      this._scrollHeight = scrollHeight
      this._anchorRect = anchor
      this._boundaryRect = boundary
      this._externalAnchor = !!anchorRect || this._externalAnchor
      return true
    },

    close(reason = 'api', immediate = false) {
      if (this._phase === 'closed') return false
      if (this._phase === 'closing') {
        if (immediate) this.finishClose(this._token)
        return false
      }

      const closeReason = ['mask', 'popup', 'api'].includes(reason) ? reason : 'api'
      const wasMeasuring = this._phase === 'locating' || this._phase === 'measuring'
      const token = ++this._token
      this._maskTapReadyAt = 0
      this._phase = 'closing'
      if (this._cancelOpen) this._cancelOpen()
      this.animateAnchor(false)
      if (this.previewProgress) this.previewProgress.value = timing(0, { duration: POPUP_HIDE_DURATION })
      this.triggerEvent('close', { reason: closeReason })

      if (wasMeasuring || immediate) {
        this.panelScale.value = 0
        this.panelOpacity.value = 0
        this.finishClose(token)
        return true
      }

      const finishClose = this.finishClose.bind(this)
      // Finish the lifecycle even if native animation completion never arrives.
      this._closeTimer = setTimeout(() => this.finishClose(token), POPUP_HIDE_DURATION * 2)
      this.panelOpacity.value = timing(0, { duration: POPUP_HIDE_DURATION })
      this.panelScale.value = timing(0, { duration: POPUP_HIDE_DURATION }, (finished) => {
        'worklet'
        if (finished) runOnJS(finishClose)(token)
      })
      return true
    },

    finishClose(token) {
      if (token !== this._token || this._phase !== 'closing') return
      if (activeFlyout === this) activeFlyout = null
      clearTimeout(this._closeTimer)
      this._closeTimer = null
      this._phase = 'closed'
      this._maskTapReadyAt = 0
      this.setData({
        maskMounted: false,
        portalActive: false,
        scrollReady: false,
        maskStyle: '',
        positionerStyle: '',
        panelStyle: '',
        previewStyle: '',
        scrollStyle: ''
      }, () => {
        if (token === this._token && this._phase === 'closed') this.triggerEvent('afterclose')
      })
    },

    handleTriggerTap() {
      if (this.properties.disabled || !this.properties.openOnTriggerTap) return
      this.open()
    },

    handleMaskTap() {
      this.triggerEvent('masktap')
      if (this._phase !== 'open' || Date.now() < this._maskTapReadyAt) return
      if (this.properties.closeOnMaskTap) this.close('mask')
    },

    handlePopupTap() {
      if (this.properties.closeOnPopupTap) this.close('popup')
    },

    handlePreviewTap(e) {
      if (this._phase !== 'open') return
      if (this.properties.previewHeightRatio > 0) this.triggerEvent('previewtap', {})
      else this.handleMaskTap(e)
    }
  }
})
