const { shared, timing, spring, runOnJS } = wx.worklet

Component({
  properties: {
    themeStyle: { type: String, value: '' },
    modeOptions: {
      type: Array,
      value: []
    },
    modePopupWidthRpx: {
      type: Number,
      value: 416
    },
    moreOptions: {
      type: Array,
      value: []
    },
    modeId: {
      type: String,
      value: 'chat'
    },
    smartMode: {
      type: Boolean,
      value: false
    },
    conversationTitle: {
      type: String,
      value: '新对话'
    },
    conversationId: { type: String, value: '' },
    conversationPinned: { type: Boolean, value: false },
    unpinLabel: { type: String, value: '取消置顶' },
    shareLoading: { type: Boolean, value: false },
    archiveLoading: { type: Boolean, value: false },
    conversationActions: {
      type: Array,
      value: []
    }
  },

  data: {
    popupType: ''
  },

  lifetimes: {
    attached() {
      wx.nextTick(() => {
        const owner = this.selectOwnerComponent()
        const screenHeight = wx.getWindowInfo().screenHeight

        this.popupView = shared(0)
        this.popupScale = shared(0)
        this.popupOpacity = shared(0.5)
        this.popupKeyHeight = owner && owner.keyHeight ? owner.keyHeight : shared(36)

        this.applyAnimatedStyle('.feature-popup-view', () => {
          'worklet'
          return {
            width: `${this.popupView.value}vw`,
            height: `${this.popupView.value === 0 ? 0 : screenHeight - this.popupKeyHeight.value}px`
          }
        })

        this.applyAnimatedStyle('.feature-popup', () => {
          'worklet'
          return {
            transform: `scale(${this.popupScale.value})`,
            opacity: `${this.popupOpacity.value}`
          }
        })
      })
    }
  },

  methods: {
    show(type, anchorRect) {
      this.close(true)
      const request = this._showRequest = (this._showRequest || 0) + 1
      if (type === 'mode' || type === 'conversation') {
        if (!anchorRect) return Promise.resolve(false)
        this._activeType = type
        return new Promise((resolve) => {
          this.setData({ popupType: type }, () => {
            if (request !== this._showRequest) return resolve(false)
            resolve(this.selectComponent('#anchoredFeaturePopup').open(anchorRect))
          })
        })
      }
      if (!this.popupView) return

      this._activeType = type
      this.setData({ popupType: type }, () => {
        if (request !== this._showRequest) return
        this.popupView.value = 100
        this.popupOpacity.value = timing(1, { duration: 250 })
        this.popupScale.value = spring(1, { velocity: 10, mass: 0.8 })
      })
    },

    close(immediate = false) {
      // A tap passes an event object; only explicit true skips the animation.
      immediate = immediate === true
      const type = this._activeType || this.data.popupType
      const wasVisible = !!this._activeType
      if (type === 'mode' || type === 'conversation') {
        this._showRequest = (this._showRequest || 0) + 1
        const closed = this.selectComponent('#anchoredFeaturePopup').close('api', immediate)
        if (!closed && wasVisible) {
          this.handleAnchoredClose()
          this.handleAnchoredAfterClose()
        }
        return
      }
      if (!this.popupView || (!wasVisible && !immediate)) return

      this._showRequest = (this._showRequest || 0) + 1
      this._activeType = ''
      const request = this._showRequest
      if (immediate || this.popupView.value === 0) {
        this.popupView.value = 0
        this.popupOpacity.value = 0
        this.popupScale.value = 0
        if (wasVisible) this.triggerEvent('close', { type }, {})
        return
      }
      this.popupOpacity.value = timing(0, { duration: 150 })
      const finishMoreClose = this.finishMoreClose.bind(this)
      this.popupScale.value = timing(0, { duration: 250 }, (finished) => {
        'worklet'
        if (finished) runOnJS(finishMoreClose)(request)
      })
      this.triggerEvent('close', { type }, {})
    },

    finishMoreClose(request) {
      if (request === this._showRequest && !this._activeType) this.popupView.value = 0
    },

    handleAnchoredClose() {
      this._closingType = this._activeType || this.data.popupType
      this._activeType = ''
      this.triggerEvent('close', { type: this._closingType }, {})
    },

    handleAnchoredAfterClose() {
      this.triggerEvent('afterclose', { type: this._closingType }, {})
    },

    catchPopup() {},

    selectMode(e) {
      const id = e.currentTarget.dataset.id
      if (!id) return
      this.triggerEvent('selectMode', { id }, {})
    },

    selectMoreFeature(e) {
      const id = e.currentTarget.dataset.id
      if (!id) return
      this.triggerEvent('selectMoreFeature', { id }, {})
    },

    selectConversationAction(e) {
      const id = e.currentTarget.dataset.id
      if (id && !(id === 'archive' && this.properties.archiveLoading)) {
        this.triggerEvent('selectConversationAction', { id }, {})
      }
    }
  }
})
