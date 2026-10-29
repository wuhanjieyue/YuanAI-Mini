const i18nBehavior = require('../../../static_utils/i18n/behavior')
const { getAccentTheme } = require('../../../static_utils/accentColor')
import { appStaticRoot } from '../../../app_config'

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
    },
    pointColor: {
      type: String,
      value: '默认'
    }
  },
  data: {
    botLogos: [],
    botLogoLoaded: false
  },
  observers: {
    'workMode, temporaryMode, pointColor': function (workMode, temporaryMode, pointColor) {
      const color = workMode && !temporaryMode ? getAccentTheme(pointColor).color.slice(1) : ''
      if (this._botLogoColor === color) return
      this._botLogoColor = color
      this._botLogoToken = (this._botLogoToken || 0) + 1
      this.setData({
        botLogoLoaded: false,
        botLogos: color ? [{
          token: this._botLogoToken,
          poster: `/static/logs/yuan-bot/cloud-first-frame-${color}.svg`,
          src: `${appStaticRoot}/yuan-bot/cloud-${color}.gif`
        }] : []
      })
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
    handleBotLogoLoad(e) {
      if (Number(e.currentTarget.dataset.token) !== this._botLogoToken) return
      this.setData({ botLogoLoaded: true })
    },
    handleBotLogoError(e) {
      if (Number(e.currentTarget.dataset.token) !== this._botLogoToken) return
      this.setData({ botLogoLoaded: false })
    },
    showTemporaryInfo() {
      this.triggerEvent('showTemporaryInfo')
    }
  }
})
