const TWO_PI = Math.PI * 2
const MAX_CANVAS_SIZE = 1365

Component({
  properties: {
    theme: { type: String, value: 'light' },
    color: { type: String, value: '' },
    contained: { type: Boolean, value: false },
    fitCanvas: { type: Boolean, value: false },
    canvasWidthRpx: { type: Number, value: 0 },
    canvasHeightRpx: { type: Number, value: 0 },
    active: {
      type: Boolean,
      value: true,
      observer(active) {
        if (active) this.start()
        else this.stop()
      }
    }
  },

  lifetimes: {
    ready() {
      this._ready = true
      if (this.properties.active) this.start()
    },
    detached() {
      this._ready = false
      this.stop()
    }
  },

  methods: {
    start() {
      if (!this._ready || this._running) return
      this._running = true
      wx.nextTick(() => this.initCanvas())
    },

    stop() {
      this._running = false
      if (this._raf && this._canvas?.cancelAnimationFrame) {
        this._canvas.cancelAnimationFrame(this._raf)
      }
      if (this._timer) clearTimeout(this._timer)
      this._raf = null
      this._timer = null
    },

    initCanvas() {
      if (!this._running) return

      this.createSelectorQuery()
        .select('#dotMatrixCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          const info = res && res[0]
          if (!this._running) return
          const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
          // Use final layout dimensions when an ancestor is animating its scale.
          const width = this.properties.canvasWidthRpx > 0
            ? this.properties.canvasWidthRpx * windowInfo.windowWidth / 750 : info?.width
          const height = this.properties.canvasHeightRpx > 0
            ? this.properties.canvasHeightRpx * windowInfo.windowWidth / 750 : info?.height
          if (!info?.node || !width || !height) {
            this._timer = setTimeout(() => this.initCanvas(), 50)
            return
          }

          const canvas = info.node
          const ctx = canvas.getContext('2d')
          const ratio = Math.min(windowInfo.pixelRatio || 1, MAX_CANVAS_SIZE / width, MAX_CANVAS_SIZE / height)

          canvas.width = Math.floor(width * ratio)
          canvas.height = Math.floor(height * ratio)
          ctx.scale(ratio, ratio)

          this._canvas = canvas
          this._ctx = ctx
          this._width = width
          this._height = height
          this._phase = Math.random() * 10
          this.drawFrame(Date.now())
        })
    },

    schedule() {
      if (!this._running) return
      if (this._canvas?.requestAnimationFrame) {
        this._raf = this._canvas.requestAnimationFrame((time) => this.drawFrame(time || Date.now()))
        return
      }
      this._timer = setTimeout(() => this.drawFrame(Date.now()), 33)
    },

    drawFrame(time) {
      if (!this._running || !this._ctx) return

      const ctx = this._ctx
      const width = this._width
      const height = this._height
      const t = time * 0.00195 + this._phase
      const cx = width * (0.5 + 0.22 * Math.sin(t * 0.42) + 0.1 * Math.sin(t * 0.93))
      const cy = height * (0.52 + 0.26 * Math.cos(t * 0.31) + 0.12 * Math.sin(t * 0.71))
      const spacing = 14
      const focusRadius = Math.max(width, height) * 0.38

      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = this.data.color || (this.data.theme === 'dark' ? '#D2D2D2' : '#484848')

      for (let y = 4; y < height; y += spacing) {
        for (let x = 4; x < width; x += spacing) {
          const dx = x - cx
          const dy = y - cy
          const focus = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / focusRadius)
          const soft = focus * focus * (3 - 2 * focus)
          const radius = 0.55 + soft * 2.15
          const alpha = 0.08 + soft * 0.46

          ctx.beginPath()
          ctx.arc(x, y, radius, 0, TWO_PI)
          ctx.globalAlpha = alpha
          ctx.fill()
        }
      }

      ctx.globalAlpha = 1
      this.schedule()
    }
  }
})
