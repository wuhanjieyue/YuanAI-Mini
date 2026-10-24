const { shared, timing, Easing, runOnJS } = wx.worklet
const ANIMATION_DURATION = 100
let activeCapsule = null
let resumableCapsule = null
let latestShow = 0

Component({
  options: { multipleSlots: true },
  properties: {
    text: { type: String, value: '' },
    duration: { type: Number, value: 2000 },
    resumeOnReplace: { type: Boolean, value: false },
    heightRpx: { type: Number, value: 120, observer(height) {
      if (this._heightRpx) this._heightRpx.value = height
    } },
    customContent: { type: Boolean, value: false },
    alert: { type: Boolean, value: false },
    themeStyle: { type: String, value: '' }
  },
  data: { visible: false, closing: false, message: '', noticeTop: 0, noticeLeft: 0 },
  lifetimes: {
    attached() {
      this._progress = shared(0)
      this._opacity = shared(1)
      this._heightRpx = shared(this.properties.heightRpx)
      this._version = 0
    },
    ready() {
      const menu = wx.getMenuButtonBoundingClientRect()
      const unit = wx.getWindowInfo().windowWidth / 750
      const topDelta = menu.top + menu.height / 2 - menu.bottom - 36 * unit
      this.applyAnimatedStyle('.notice-capsule', () => {
        'worklet'
        const progress = this._progress.value
        const startY = topDelta - this._heightRpx.value / 2 * unit
        return { transform: `translateY(${startY * (1 - progress)}px) scale(${0.6 + 0.4 * progress})`, opacity: (0.3 + 0.7 * progress) * this._opacity.value }
      })
    },
    detached() {
      this._detached = true
      this._version += 1
      clearTimeout(this._timer)
      if (activeCapsule === this) activeCapsule = null
      if (resumableCapsule === this) resumableCapsule = null
    }
  },
  pageLifetimes: { hide() { this.hide() } },
  methods: {
    show(message = this.properties.text) {
      if (this._detached) return
      if (this.properties.resumeOnReplace) resumableCapsule = this
      const version = ++this._version
      const request = ++latestShow
      clearTimeout(this._timer)
      this._closing = false
      this.createSelectorQuery().select('.notice-origin').boundingClientRect(origin => {
        if (this._detached || version !== this._version || request !== latestShow) return
        const replacing = activeCapsule && activeCapsule !== this && activeCapsule.data.visible
        if (!this.data.visible) {
          this._progress.value = replacing ? 1 : 0
          this._opacity.value = replacing ? 0 : 1
        } else if (replacing) {
          this._progress.value = this._progress.value
        }
        const width = wx.getWindowInfo().windowWidth
        const menu = wx.getMenuButtonBoundingClientRect()
        this.setData({ message, visible: true, closing: false,
          noticeTop: menu.bottom + 36 * width / 750 - (origin?.top || 0),
          noticeLeft: width * 0.07 - (origin?.left || 0) }, () => {
          if (this._detached || version !== this._version) return
          if (request !== latestShow) {
            if (activeCapsule !== this) this.hide(true)
            return
          }
          const previous = activeCapsule
          activeCapsule = this
          if (previous && previous !== this) {
            previous.hide(true)
            previous.triggerEvent('replaced')
          }
          const finishShow = this.finishShow.bind(this)
          if (!replacing && this._opacity.value !== 1) {
            this._opacity.value = timing(1, { duration: ANIMATION_DURATION, easing: Easing.ease })
          }
          const animation = timing(1, { duration: ANIMATION_DURATION, easing: Easing.ease }, (finished) => {
            'worklet'
            if (finished) runOnJS(finishShow)(version)
          })
          if (replacing) this._opacity.value = animation
          else this._progress.value = animation
        })
      }).exec()
    },
    finishShow(version) {
      if (this._detached || version !== this._version || this._closing) return
      if (this.properties.duration > 0) this._timer = setTimeout(() => {
        if (version === this._version) this.hide()
      }, this.properties.duration)
    },
    hide(fade = false) {
      if (!fade && resumableCapsule === this) resumableCapsule = null
      if (this._detached || this._closing && !fade) return
      if (!fade && activeCapsule === this && resumableCapsule) {
        resumableCapsule.show(resumableCapsule.data.message)
        fade = true
      }
      const version = ++this._version
      clearTimeout(this._timer)
      if (!this.data.visible) return
      this._closing = true
      this.setData({ closing: true })
      if (fade) this._progress.value = this._progress.value
      const finishHide = this.finishHide.bind(this)
      const animation = timing(0, { duration: ANIMATION_DURATION, easing: Easing.ease }, (finished) => {
        'worklet'
        if (finished) runOnJS(finishHide)(version)
      })
      if (fade) this._opacity.value = animation
      else this._progress.value = animation
    },
    finishHide(version) {
      if (this._detached || version !== this._version || !this._closing) return
      this._closing = false
      if (activeCapsule === this) activeCapsule = null
      this.setData({ visible: false, closing: false })
    }
  }
})
