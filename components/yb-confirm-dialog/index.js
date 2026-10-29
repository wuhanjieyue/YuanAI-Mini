const { shared, timing, spring, runOnJS } = wx.worklet

const SHOW_DURATION = 220
const HIDE_DURATION = 180
const CENTER_DIALOG_ORIGIN = '50% 50%'

function calculateDialogTransformOrigin(anchorRect, panelRect) {
  if (!anchorRect || !panelRect) return CENTER_DIALOG_ORIGIN

  const anchorLeft = Number(anchorRect.left)
  const anchorTop = Number(anchorRect.top)
  const anchorWidth = Number(anchorRect.width) || 0
  const anchorHeight = Number(anchorRect.height) || 0
  const panelLeft = Number(panelRect.left)
  const panelTop = Number(panelRect.top)
  const panelWidth = Number(panelRect.width)
  const panelHeight = Number(panelRect.height)
  if (![anchorLeft, anchorTop, panelLeft, panelTop, panelWidth, panelHeight].every(Number.isFinite) || panelWidth <= 0 || panelHeight <= 0) {
    return CENTER_DIALOG_ORIGIN
  }

  const anchorX = anchorLeft + anchorWidth / 2
  const anchorY = anchorTop + anchorHeight / 2
  const originX = Math.min(Math.max(anchorX - panelLeft, 0), panelWidth)
  const originY = Math.min(Math.max(anchorY - panelTop, 0), panelHeight)
  return originX + 'px ' + originY + 'px'
}

Component({
  properties: {
    horizontalActions: { type: Boolean, value: false },
    themeStyle: { type: String, value: '' },
    title: {
      type: String,
      value: ''
    },
    message: {
      type: String,
      value: ''
    },
    danger: {
      type: Boolean,
      value: false
    },
    confirmTone: {
      type: String,
      value: ''
    },
    messageAlign: {
      type: String,
      value: 'center'
    },
    mutedText: {
      type: Boolean,
      value: false
    },
    anchorPlacement: { type: String, value: '' },
    centered: {
      type: Boolean,
      value: false
    },
    singleAction: {
      type: Boolean,
      value: false
    },
    inputMode: {
      type: Boolean,
      value: false
    },
    inputValue: {
      type: String,
      value: ''
    },
    confirmText: {
      type: String,
      value: '确认'
    },
    cancelText: {
      type: String,
      value: '取消'
    },
    validationText: {
      type: String,
      value: '名称不能为空'
    }
  },

  data: {
    dialogVisible: false,
    dialogBottom: 0,
    dialogTop: 0,
    dialogLeft: 0,
    dialogTransformOrigin: CENTER_DIALOG_ORIGIN,
    inputText: '',
    inputFocused: false
  },

  observers: {
    inputValue(value) {
      this.setData({ inputText: value || '' })
    }
  },

  lifetimes: {
    attached() {
      wx.nextTick(() => {
        this.dialogOpacity = shared(0)
        this.dialogScale = shared(1)
        this.overlaySize = shared(0)

        this.applyAnimatedStyle('.dialog-overlay', () => {
          'worklet'
          return {
            width: `${this.overlaySize.value}vw`,
            height: `${this.overlaySize.value}vh`
          }
        })

        this.applyAnimatedStyle('.dialog-panel', () => {
          'worklet'
          return {
            transform: `scale(${this.dialogScale.value})`,
            opacity: `${this.dialogOpacity.value}`
          }
        }, { flush: 'sync' })
      })
    }
  },

  methods: {
    show(anchorRect) {
      const metrics = typeof wx.getWindowInfo === 'function'
        ? wx.getWindowInfo()
        : getApp().globalData.su_system
      const { screenWidth, screenHeight, windowHeight } = metrics
      const viewportHeight = windowHeight || screenHeight
      const dialogWidthPx = screenWidth * 0.76
      const safeGap = 16
      const anchorGap = 8
      let dialogBottom = 0
      let dialogTop = 0
      let dialogLeft = 0

      if (this.data.centered) {
        this._keyboardHeight = 0
      } else if (anchorRect && this.properties?.anchorPlacement === 'below-start') {
        const anchorX = Number(anchorRect.left) + (Number(anchorRect.width) || 0) / 2
        dialogTop = Math.max(safeGap, Math.min(Number(anchorRect.bottom || anchorRect.top) + anchorGap, viewportHeight * 0.55))
        dialogLeft = Math.max(safeGap, Math.min(anchorX - dialogWidthPx * 0.3, screenWidth - dialogWidthPx - safeGap))
      } else if (anchorRect) {
        const anchorCenter = Number(anchorRect.top) + (Number(anchorRect.height) || 0) / 2
        const bottom = viewportHeight - anchorCenter + anchorGap
        const left = anchorRect.left + anchorRect.width - dialogWidthPx - 18
        dialogBottom = Math.max(safeGap, Math.min(bottom, viewportHeight * 0.72))
        dialogLeft = Math.max(safeGap, Math.min(left, screenWidth - dialogWidthPx - safeGap))
      } else {
        dialogBottom = viewportHeight * 0.4
        dialogLeft = screenWidth * 0.12
      }

      this._closing = false
      this.dialogOpacity.value = 0
      this.dialogScale.value = 1
      this.setData({
        dialogVisible: true,
        dialogBottom,
        dialogTop,
        dialogLeft,
        inputText: this.data.inputMode ? (this.data.inputValue || '') : this.data.inputText,
        inputFocused: false
      }, () => {
        this.overlaySize.value = 100
        const startAnimation = (transformOrigin) => {
          if (this._closing || !this.data.dialogVisible) return
          this.setData({ dialogTransformOrigin: transformOrigin }, () => {
            if (this._closing || !this.data.dialogVisible) return
            this.dialogScale.value = 0
            this.dialogScale.value = spring(1, { velocity: 16, mass: 0.6 })
            if (this.data.inputMode) {
              const focusInput = this.focusInput.bind(this)
              this.dialogOpacity.value = timing(1, { duration: SHOW_DURATION }, () => {
                'worklet'
                runOnJS(focusInput)()
              })
              return
            }
            this.dialogOpacity.value = timing(1, { duration: SHOW_DURATION })
          })
        }

        if (this.properties?.anchorPlacement === 'below-start') {
          startAnimation('30% 0%')
          return
        }
        if (!anchorRect || this.data.centered || typeof this.createSelectorQuery !== 'function') {
          startAnimation(CENTER_DIALOG_ORIGIN)
          return
        }

        const measurePanel = () => {
          const query = this.createSelectorQuery()
          if (!query || typeof query.select !== 'function') {
            startAnimation(CENTER_DIALOG_ORIGIN)
            return
          }
          query.select('.dialog-panel').boundingClientRect((panelRect) => {
            startAnimation(calculateDialogTransformOrigin(anchorRect, panelRect))
          }).exec()
        }
        if (typeof wx.nextTick === 'function') wx.nextTick(measurePanel)
        else measurePanel()
      })
    },

    hide(notifyClose) {
      if (!this.data.dialogVisible || this._closing) return
      this._closing = true
      const finishClose = this.finishClose.bind(this)
      const animateClose = () => {
        this.dialogOpacity.value = timing(0, { duration: HIDE_DURATION })
        this.dialogScale.value = timing(0, { duration: HIDE_DURATION }, () => {
          'worklet'
          this.overlaySize.value = 0
          runOnJS(finishClose)()
        })
      }
      if (this.data.inputFocused) this.setData({ inputFocused: false }, animateClose)
      else animateClose()
      if (notifyClose) this.triggerEvent('close')
    },

    close() {
      this.hide(true)
    },

    finishClose() {
      this._closing = false
      this.setData({ dialogVisible: false })
    },

    ignoreTap() {},

    focusInput() {
      if (!this.data.dialogVisible || this._closing || !this.data.inputMode) return
      this.setData({ inputFocused: true })
    },

    handleInput(e) {
      this.setData({ inputText: e.detail.value })
    },

    handleKeyboardHeightChange(e) {
      if (!this.data.centered || !this.data.inputMode || this._closing) return
      const height = Math.max(0, Number(e.detail.height) || 0)
      if (height === this._keyboardHeight) return
      this._keyboardHeight = height
      this.setData({ dialogBottom: height / 2 })
    },

    handleConfirm() {
      if (this._closing) return
      const value = this.data.inputText.trim()
      if (this.data.inputMode && !value) {
        this.selectComponent('#validationNotice').show(this.data.validationText)
        return
      }
      this.triggerEvent('confirm', this.data.inputMode ? { value } : {})
      this.hide(false)
    }
  }
})
