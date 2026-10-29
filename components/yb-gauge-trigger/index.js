const { shared, timing, sequence } = wx.worklet
const START_ANGLE = Math.PI * 145 / 180
const SWEEP_ANGLE = Math.PI * 250 / 180
const NEEDLE_MIN_ANGLE = -125
const NEEDLE_SWEEP_ANGLE = 250

function clampProgress(value) {
  const progress = Number(value)
  return Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0
}

Component({
  properties: {
    pageHidden: {
      type:Boolean,
      value:false,
      observer(hidden) {
        if(!this._ready) return
        if(hidden) this.releaseCanvas()
        else wx.nextTick(() => this.initCanvas())
      }
    },
    popupOpen: { type:Boolean, value:false, observer(value) { this.animateVisibility(value) } },
    theme: { type: String, value: 'light', observer() { this.drawRing(this._displayProgress) } },
    progress: {
      type: Number,
      value: 0,
      observer(value) {
        this.animateToProgress(value)
      }
    },
    accentColor: {
      type: String,
      value: 'rgba(0, 0, 0, 0.9)',
      observer() {
        this.drawRing(this._displayProgress)
      }
    }
  },

  lifetimes: {
    attached() {
      this._canvasVersion = 0
      this.triggerScale = shared(this.data.popupOpen ? 0.8 : 1)
      this.triggerOpacity = shared(this.data.popupOpen ? 0 : 1)
      this.triggerTranslate = shared(0)
      this._displayProgress = clampProgress(this.data.progress)
      this.needleProgress = shared(this._displayProgress)
    },
    ready() {
      this._ready = true
      this.applyAnimatedStyle('.gauge-trigger', () => {
        'worklet'
        return {
          transform:`scale(${this.triggerScale.value}) translateY(${this.triggerTranslate.value}px)`,
          opacity:`${this.triggerOpacity.value}`
        }
      })
      this.applyAnimatedStyle('.gauge-needle', () => {
        'worklet'
        const angle = NEEDLE_MIN_ANGLE + NEEDLE_SWEEP_ANGLE * this.needleProgress.value
        return { transform:`rotate(${angle}deg)` }
      })
      wx.nextTick(() => this.initCanvas())
    },
    detached() {
      this._ready = false
      this.releaseCanvas()
    }
  },

  methods: {
    open() {
      if(this.data.popupOpen || this.data.pageHidden) return
      this.triggerEvent('open', {}, {})
    },

    animateVisibility(hidden) {
      if(!this.triggerScale) return
      this.triggerScale.value = timing(hidden ? 0.8 : 1, { duration:160 })
      this.triggerOpacity.value = timing(hidden ? 0 : 1, { duration:160 })
      this.triggerTranslate.value = sequence(timing(-10, { duration:80 }), timing(0, { duration:80 }))
    },

    releaseCanvas() {
      this._canvasVersion++
      clearTimeout(this._canvasRetry)
      if(this._canvas && this._animationFrame) this._canvas.cancelAnimationFrame(this._animationFrame)
      this._animationFrame = 0
      this._canvas = null
      this._context = null
    },

    initCanvas() {
      if(!this._ready || this.data.pageHidden) return
      this.releaseCanvas()
      const version = this._canvasVersion
      this.createSelectorQuery()
        .select('#gaugeCanvas')
        .fields({ node:true, size:true })
        .exec((res) => {
          if(!this._ready || this.data.pageHidden || version !== this._canvasVersion) return
          const result = res && res[0]
          if(!result?.node || !(result.width > 0 && result.height > 0)) {
            this._canvasRetry = setTimeout(() => this.initCanvas(), 50)
            return
          }
          const canvas = result.node
          const context = canvas.getContext('2d')
          const dpr = wx.getWindowInfo().pixelRatio || 1
          canvas.width = Math.round(result.width * dpr)
          canvas.height = Math.round(result.height * dpr)
          context.scale(dpr, dpr)
          this._canvas = canvas
          this._context = context
          this._canvasWidth = result.width
          this._canvasHeight = result.height
          this._displayProgress = clampProgress(this.data.progress)
          this.needleProgress.value = this._displayProgress
          // Paint now even if RAF is suspended, then repaint when the native surface resumes.
          this.drawRing(this._displayProgress)
          this._animationFrame = canvas.requestAnimationFrame(() => {
            if(version !== this._canvasVersion) return
            this._animationFrame = 0
            this.drawRing(this._displayProgress)
          })
        })
    },

    drawRing(progress) {
      if(!this._context) return
      const context = this._context
      const width = this._canvasWidth
      const height = this._canvasHeight
      const centerX = width / 2
      const centerY = height / 2
      const radius = Math.min(width, height) / 2 - 2
      context.clearRect(0, 0, width, height)
      context.lineWidth = 3
      context.lineCap = 'round'
      context.strokeStyle = this.data.theme === 'dark' ? 'rgba(230, 230, 230, 0.24)' : 'rgba(51, 51, 51, 0.18)'
      context.beginPath()
      context.arc(centerX, centerY, radius, START_ANGLE, START_ANGLE + SWEEP_ANGLE)
      context.stroke()
      if(progress <= 0) return
      context.strokeStyle = this.data.accentColor
      context.beginPath()
      context.arc(centerX, centerY, radius, START_ANGLE, START_ANGLE + SWEEP_ANGLE * progress)
      context.stroke()
    },

    animateToProgress(value) {
      const target = clampProgress(value)
      if(!this.needleProgress) {
        this._displayProgress = target
        return
      }
      this.needleProgress.value = timing(target, { duration:280 })
      if(!this._canvas || !this._context) {
        this._displayProgress = target
        return
      }
      if(this._animationFrame) this._canvas.cancelAnimationFrame(this._animationFrame)
      const from = this._displayProgress
      const startedAt = Date.now()
      const version = this._canvasVersion
      const animate = () => {
        if(version !== this._canvasVersion) return
        const elapsed = Math.min(1, (Date.now() - startedAt) / 280)
        const eased = 1 - Math.pow(1 - elapsed, 3)
        this._displayProgress = from + (target - from) * eased
        this.drawRing(this._displayProgress)
        if(elapsed < 1) this._animationFrame = this._canvas.requestAnimationFrame(animate)
        else this._animationFrame = 0
      }
      this._animationFrame = this._canvas.requestAnimationFrame(animate)
    }
  }
})
