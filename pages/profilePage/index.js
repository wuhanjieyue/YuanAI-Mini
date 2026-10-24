const { bindPageTheme, unbindPageTheme, syncThemeNavigation } = require('../../static_utils/themeBinding')
import { createStoreBindings } from 'mobx-miniprogram-bindings'
import { store } from '../../store/index'
import { buildUserFromAccountSummary } from '../../static_utils/appDataInit'
import { updateProfile, uploadUserAvatar } from '../../request/request'
const { messages } = require('../../static_utils/i18n/index')

const { shared, runOnJS } = wx.worklet
const app = getApp()

function unwrapCloudResult(requestPromise, fallbackMessage) {
  return requestPromise.then((res) => {
    const body = res && res.result ? res.result : {}
    if (body.code === 200) return body.data
    throw new Error(body.msg || fallbackMessage)
  })
}

function buildForm(user = {}) {
  return {
    avatarUrl: user.avatarUrl || '',
    avatarFileID: user.avatarFileID || '',
    userName: user.userName || '',
    nickName: user.nickName || ''
  }
}

Page({
  onShow() { syncThemeNavigation(this) },
  data: {
    form: buildForm(),
    i18n: messages('中文')
  },

  onLoad() {
    bindPageTheme(this)
    this.eventChannel = this.getOpenerEventChannel()
    this.storeBindings = createStoreBindings(this, {
      store,
      fields: {
        user: 'user',
        i18n: (state) => messages(state.applicationSettings?.language)
      },
      actions: ['setUser']
    })

    this.setData({ form: buildForm(store.user || {}) })

    this.sheetHeight = shared(app.globalData.su_system.screenHeight - app.globalData.su_menu.bottom - 20)
    this.applyAnimatedStyle('.sheet', () => {
      'worklet'
      return { height: `${this.sheetHeight.value}px` }
    })

    this.scrollSca = shared(0.95)
    this.applyAnimatedStyle('.scrollable', () => {
      'worklet'
      return { width: `${this.scrollSca.value * 100}%` }
    })

  },

  onUnload() {
    unbindPageTheme(this)
    if (this.storeBindings) this.storeBindings.destroyStoreBindings()
  },

  onSizeUpdate(e) {
    'worklet'
    this.scrollSca.value = e.size <= 0.6 ? 0.95 : (0.9 + 0.1 * e.size)
    if (e.size <= 0.01) {
      runOnJS(this.closePage.bind(this))()
    }
  },

  closePage() {
    wx.navigateBack()
  },

  handleInput(e) {
    const field = e.currentTarget.dataset.field
    if (!field) return
    this.setData({
      form: Object.assign({}, this.data.form, { [field]: e.detail.value })
    })
  },

  chooseAvatar() {
    wx.showActionSheet({
      itemList: [this.data.i18n.profile.takePhoto, this.data.i18n.profile.choosePhoto],
      success: ({ tapIndex }) => {
        wx.chooseMedia({
          count: 1,
          mediaType: ['image'],
          sourceType: [tapIndex === 0 ? 'camera' : 'album'],
          camera: 'front',
          success: (res) => {
            const file = res.tempFiles && res.tempFiles[0]
            if (!file || !file.tempFilePath) return
            this.setData({
              form: Object.assign({}, this.data.form, {
                avatarUrl: file.tempFilePath,
                avatarFileID: ''
              })
            })
          }
        })
      }
    })
  },

  async saveProfile() {
    const form = this.data.form || {}
    const userName = (form.userName || '').trim()
    const nickName = (form.nickName || '').trim()
    if (!userName || !nickName) {
      wx.showToast({ title: this.data.i18n.profile.required, icon: 'none' })
      return
    }

    wx.showLoading({ title: this.data.i18n.profile.saving, mask: true })
    try {
      let avatarUrl = form.avatarUrl
      let avatarFileID = form.avatarFileID
      if (avatarUrl && !avatarFileID && !avatarUrl.startsWith('http')) {
        const uploadRes = await uploadUserAvatar(avatarUrl, this.data.user && this.data.user.userId)
        avatarFileID = uploadRes.fileID
        avatarUrl = ""
      }

      const data = await unwrapCloudResult(updateProfile({
        avatarUrl,
        avatarFileID,
        userName,
        nickName
      }), this.data.i18n.common.requestFailed)
      const nextUser = buildUserFromAccountSummary(data.user)
      this.setUser(nextUser)
      if (this.eventChannel && this.eventChannel.emit) {
        this.eventChannel.emit('profileUpdated', { user: nextUser })
      }
      wx.hideLoading()
      wx.showToast({ title: this.data.i18n.common.saved, icon: 'success' })
      wx.navigateBack()
    } catch (error) {
      wx.hideLoading()
      wx.showToast({ title: error.message || this.data.i18n.profile.saveFailed, icon: 'none' })
    }
  }
})
