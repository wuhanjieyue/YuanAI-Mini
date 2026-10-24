const { shared, timing, Easing, runOnJS } = wx.worklet

Component({
  properties: {
    items: { type: Array, value: [] },
    loading: { type: Boolean, value: false },
    visible: {
      type: Boolean,
      value: false,
      observer() {
        this.animateVisibility()
      }
    }
  },
  lifetimes: {
    ready() {
      this.progress = shared(0)
      this.applyAnimatedStyle('.recommendations', () => {
        'worklet'
        const progress = this.progress.value
        return {
          opacity: progress,
          transform: `scaleY(${0.8 + 0.2 * progress})`
        }
      })
      if (this.data.visible) this.animateVisibility()
      else this.finishHide(this._animationToken)
    }
  },
  methods: {
    refresh() {
      if (this.data.visible && !this.data.loading) this.triggerEvent('refresh')
    },
    selectItem(e) {
      if (!this.data.visible || this.data.loading) return
      const item = this.data.items.find(item => item.id === e.currentTarget.dataset.id)
      if (item) this.triggerEvent('select', { id: item.id })
    },
    animateVisibility() {
      if (!this.progress) return
      const visible = this.data.visible
      const token = (this._animationToken || 0) + 1
      this._animationToken = token
      const finishHide = this.finishHide.bind(this, token)
      this.progress.value = timing(visible ? 1 : 0, {
        duration: visible ? 220 : 160,
        easing: Easing.ease
      }, visible ? undefined : () => {
        'worklet'
        runOnJS(finishHide)()
      })
    },
    finishHide(token) {
      if (token !== this._animationToken || this.data.visible) return
      this.triggerEvent('exitcomplete')
    }
  }
})
