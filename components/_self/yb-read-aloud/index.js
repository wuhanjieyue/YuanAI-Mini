import { synthesizeSpeech } from '../../../request/speech'
const i18nBehavior = require('../../../static_utils/i18n/behavior')
const { t } = require('../../../static_utils/i18n/index')

function clock(seconds) {
  const value = Math.max(0, Math.floor(seconds || 0))
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}

Component({
  behaviors:[i18nBehavior],
  properties:{ themeStyle:{ type:String, value:'' } },
  data:{ loading:false, paused:true, elapsed:'00:00', rate:1 },
  lifetimes:{
    attached() { this._version = 0 },
    detached() { this._detached = true; this.release() }
  },
  pageLifetimes:{ hide() { this.stop() } },
  methods:{
    release() {
      this._version += 1
      this._request?.abort()
      this._request = null
      this._resumeAfterRateChange = false
      const audio = this._audio
      this._audio = null
      if (audio) { audio.stop(); audio.destroy() }
      if (this._path) wx.getFileSystemManager().unlink({ filePath:this._path, fail() {} })
      this._path = ''
      this._ended = false
    },
    stop() {
      this.release()
      this.selectComponent('#playbackNotice')?.hide()
    },
    async play(item) {
      if (this._detached) return
      this.release()
      const version = this._version
      const current = () => !this._detached && version === this._version
      this.setData({ loading:true, paused:true, elapsed:'00:00', rate:1 })
      this.selectComponent('#playbackNotice')?.show(t(this.properties.language, 'chat.readAloud'))
      let path
      try {
        if (!item?.conversationId || !item?.messageId) throw new Error('missing_message')
        this._request = synthesizeSpeech(item)
        const bytes = await this._request.promise
        if (!current()) return
        this._request = null
        path = `${wx.env.USER_DATA_PATH}/yuanai-read-aloud-${Date.now()}-${version}.mp3`
        const files = wx.getFileSystemManager()
        await new Promise((resolve, reject) => files.writeFile({ filePath:path, data:bytes, success:resolve, fail:reject }))
        if (!current()) { files.unlink({ filePath:path, fail() {} }); return }
        this._path = path
        const audio = this._audio = wx.createInnerAudioContext({ useWebAudioImplement:false })
        const active = () => current() && this._audio === audio
        audio.onPlay(() => { if (active()) this.setData({ paused:false, loading:false }) })
        audio.onPause(() => {
          if (!active()) return
          audio.playbackRate = this.data.rate
          if (this._resumeAfterRateChange) {
            this._resumeAfterRateChange = false
            audio.play()
          } else this.setData({ paused:true })
        })
        audio.onTimeUpdate(() => {
          if (!active()) return
          const elapsed = clock(audio.currentTime)
          if (elapsed !== this.data.elapsed) this.setData({ elapsed })
        })
        audio.onEnded(() => {
          if (!active()) return
          this.setData({ paused:true, elapsed:clock(audio.duration) })
          this.stop()
        })
        audio.onError(() => { if (active()) this.fail() })
        this.setData({ loading:false })
        audio.src = path
        audio.play()
      } catch (error) {
        if (path) wx.getFileSystemManager().unlink({ filePath:path, fail() {} })
        if (current()) this.fail(error.statusCode)
      }
    },
    fail(status) {
      this.stop()
      this.triggerEvent('error', { message:t(this.properties.language,
        status === 413 ? 'speech.tooLong' : status === 429 ? 'speech.busy' : 'speech.failed') })
    },
    togglePlayback() {
      if (!this._audio || this.data.loading) return
      if (this._resumeAfterRateChange) {
        this._resumeAfterRateChange = false
        this.setData({ paused:true })
        return
      }
      if (this.data.paused) {
        if (this._ended) { this._audio.seek(0); this._ended = false }
        this._audio.play()
      } else this._audio.pause()
    },
    cycleRate() {
      if (!this._audio || this.data.loading) return
      const rates = [1, 1.25, 1.5, 1.75, 2, 0.75]
      const rate = rates[(rates.indexOf(this.data.rate) + 1) % rates.length]
      this.setData({ rate })
      if (this.data.paused) this._audio.playbackRate = rate
      else if (!this._resumeAfterRateChange) {
        // Apply the rate after native pause completes; some devices latch it only on play.
        this._resumeAfterRateChange = true
        this._audio.pause()
      }
    },
    seek(e) {
      const audio = this._audio
      if (!audio || this.data.loading || !(audio.duration > 0)) return
      const offset = Number(e.currentTarget.dataset.offset)
      if (offset !== -15 && offset !== 15) return
      const target = Math.max(0, Math.min(audio.duration, audio.currentTime + offset))
      this._ended = target >= audio.duration
      audio.seek(target)
      this.setData({ elapsed:clock(target) })
    }
  }
})
