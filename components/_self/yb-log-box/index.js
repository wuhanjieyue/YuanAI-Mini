const i18nBehavior = require('../../../static_utils/i18n/behavior')

Component({
  behaviors: [i18nBehavior],
  properties: {
    temporaryMode: {
      type: Boolean,
      value: false
    },
    workMode: {
      type: Boolean,
      value: false
    }
  },
  lifetimes: {
    attached() {
      wx.nextTick(() => {
        this._that = this.selectOwnerComponent()
        const screenHeight = wx.getWindowInfo().screenHeight
        this.applyAnimatedStyle('.log-empty-state', () => {
          'worklet'
          return { height: `${screenHeight - this._that.keyHeight.value}px` }
        })
      })
    }
  },

  methods: {
    showTemporaryInfo() {
      this.triggerEvent('showTemporaryInfo')
    }
  }
})
