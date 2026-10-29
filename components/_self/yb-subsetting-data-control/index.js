const { showNotice } = require('../../../static_utils/errorNotice')
import { clearLocation } from '../../../request/location'
const i18nBehavior = require('../../../static_utils/i18n/behavior')
const { t } = require('../../../static_utils/i18n/index')

const CHAT_ACTION_ITEMS = [
  { key: 'archived_chats', labelKey: 'archive.title', rowType: 'value', arrow: true, navigable: true },
  { key: 'archive_all', labelKey: 'archive.archiveAll', rowType: 'action', actionTone: 'primary' },
  { key: 'delete_all', labelKey: 'archive.deleteAll', rowType: 'action', actionTone: 'danger' }
]

const ACCOUNT_ACTION_ITEMS = [
  { key: 'export_data', labelKey: 'dataControls.export', rowType: 'value', navigable: true },
  { key: 'delete_account', labelKey: 'dataControls.deleteAccount', rowType: 'value', labelTone: 'danger', navigable: true }
]

const CONFIRM_MESSAGES = {
  archive_all: 'dataControls.archiveAllPrompt',
  delete_all: 'dataControls.deleteAllPrompt',
  export_data: 'dataControls.exportPrompt',
  delete_account: 'dataControls.deleteAccountPrompt'
}

const DANGER_KEYS = ['delete_all', 'delete_account']

function localizeItems(language, items) {
  return items.map((item) => ({ ...item, label:t(language, item.labelKey) }))
}

function buildSwitchItems(language, dataControl) {
  return {
    modelImproveItems: [
      { key: 'improve_model', label: t(language, 'dataControls.improveModel'), rowType: 'switch', checked: !!dataControl.improve_model }
    ],
    voiceItems: [
      { key: 'voice_record', label: t(language, 'dataControls.includeAudio'), rowType: 'switch', checked: !!dataControl.voice_record },
      { key: 'voice_camera', label: t(language, 'dataControls.includeVideo'), rowType: 'switch', checked: !!dataControl.voice_camera }
    ],
    chatActionItems: localizeItems(language, CHAT_ACTION_ITEMS),
    accountActionItems: localizeItems(language, ACCOUNT_ACTION_ITEMS)
  }
}

function buildLocationItems(language, authorized) {
  return [
    { key:'location_service', label:t(language, 'dataControls.locationServices'), rowType:'value', value:t(language, authorized ? 'common.on' : 'common.off'), valueTone:'primary' },
    authorized
      ? { key:'location_service_on', label:t(language, 'dataControls.locationEnabled'), rowType:'value', value:'', valueTone:'primary' }
      : { key:'allow_location', label:t(language, 'dataControls.allowLocation'), rowType:'action', actionTone:'primary' }
  ]
}

Component({
  behaviors: [i18nBehavior],

  properties: {
    exportStatus: { type: String, value: 'idle' },
    deletionStatus: { type: String, value: 'idle' },
    aiName: {
      type: String,
      value: 'ChatGPT'
    },
    dataControl: {
      type: Object,
      value: {}
    }
  },

  observers: {
    'exportStatus,deletionStatus': function () { this.syncSwitchItems() },
    'dataControl,language': function (dataControl, language) {
      this.syncSwitchItems(dataControl, language)
    }
  },

  data: {
    modelImproveItems: [],
    voiceItems: [],
    locationItems: [],
    chatActionItems: [],
    accountActionItems: [],
    confirmMessage: '',
    confirmDanger: false,
    confirmTone: '',
    confirmMessageAlign: 'center',
    pendingAction: ''
  },

  lifetimes: {
    attached() {
      this.syncSwitchItems(this.properties.dataControl, this.properties.language)
      this.checkLocationPermission()
    }
  },

  methods: {
    syncSwitchItems(dataControl = this._dataControl || this.data.dataControl || {}, language = this.data.language) {
      this._dataControl = dataControl || {}
      const items = buildSwitchItems(language, this._dataControl)
      items.accountActionItems = items.accountActionItems.map(item => {
        const loading = item.key === 'export_data'
          ? ['queued', 'running', 'starting'].includes(this.data.exportStatus)
          : this.data.deletionStatus === 'deleting'
        return { ...item, loading, trailingIcon: loading ? 'icon-loading_flow_iconfont'
          : item.key === 'export_data' && this.data.exportStatus === 'completed' ? 'icon-download' : '' }
      })
      this.setData({
        ...items,
        modelImproveDesc:t(language, 'dataControls.improveModelDesc', { app:this.data.aiName }),
        voiceDesc:t(language, 'dataControls.voiceDesc'),
        locationDesc:t(language, 'dataControls.locationDesc', { app:this.data.aiName })
      })
    },

    handleSwitchChange(e) {
      const { item, checked } = e.detail || {}
      if (!item || !item.key) return
      const dc = { ...(this._dataControl || this.data.dataControl || {}), [item.key]: checked }
      this._dataControl = dc
      this.setData(buildSwitchItems(this.data.language, dc))
      this.triggerEvent('change', {
        key:item.key,
        checked,
        dataControl:dc
      })
    },

    handleActionTap(e) {
      const { item, rect } = e.detail || {}
      if (!item || !item.key) return

      if (item.key === 'export_data' && ['starting', 'queued', 'running', 'completed'].includes(this.data.exportStatus)) {
        this.triggerEvent('exporttap')
        return
      }
      if (item.key === 'delete_account' && this.data.deletionStatus === 'deleting') {
        this.triggerEvent('deletiontap')
        return
      }
      if (item.key === 'allow_location') {
        this.requestLocation()
        return
      }

      if (item.key === 'archived_chats') {
        this.triggerEvent('navigatearchive')
        return
      }

      const messageKey = CONFIRM_MESSAGES[item.key]
      if (!messageKey) return
      const message = t(this.data.language, messageKey)

      this.setData({
        confirmMessage: message,
        confirmDanger: DANGER_KEYS.includes(item.key),
        confirmTone: ['archive_all', 'delete_all'].includes(item.key) ? 'danger' : '',
        confirmMessageAlign: ['archive_all', 'delete_all'].includes(item.key) ? 'left' : 'center',
        pendingAction: item.key
      }, () => {
        this.triggerEvent('confirmrequest', {
          rect,
          title: ['export_data', 'delete_account'].includes(item.key) ? item.label : '',
          centered: ['export_data', 'delete_account'].includes(item.key),
          confirmText: item.key === 'export_data' ? this.data.i18n.dataControls.startExport : this.data.i18n.common.confirm,
          message: this.data.confirmMessage,
          danger: this.data.confirmDanger,
          confirmTone: this.data.confirmTone,
          messageAlign: this.data.confirmMessageAlign
        })
      })
    },

    handleConfirmAction() {
      const action = this.data.pendingAction
      this.setData({ pendingAction: '' })
      if (action) this.triggerEvent('action', { action })
    },

    checkLocationPermission() {
      wx.getSetting({
        success: (res) => {
          const authorized = res.authSetting['scope.userFuzzyLocation']
          if (authorized === false) clearLocation()
          this.setData({
            locationItems: buildLocationItems(this.data.language, authorized)
          })
        }
      })
    },

    requestLocation() {
      wx.authorize({
        scope: 'scope.userFuzzyLocation',
        success: () => {
          this.checkLocationPermission()
          showNotice({ title: this.data.i18n.common.enabled })
        },
        fail: () => {
          wx.showModal({
            title: this.data.i18n.dataControls.locationPermission,
            content: this.data.i18n.dataControls.locationPrompt,
            confirmText: this.data.i18n.dataControls.openSettings,
            success: (res) => {
              if (res.confirm) {
                wx.openSetting({
                  success: () => this.checkLocationPermission()
                })
              }
            }
          })
        }
      })
    }
  }
})
