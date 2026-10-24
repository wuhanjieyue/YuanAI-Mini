const { t } = require('../../../static_utils/i18n/index')

const NOTIFICATION_SUMMARY_ITEMS = [
  {
    key: 'reply',
    rowType: 'link',
    arrow: true,
    navigable: true,
    pageKey: 'notification_reply'
  },
  {
    key: 'group',
    rowType: 'link',
    arrow: true,
    navigable: true,
    pageKey: 'notification_group'
  },
  {
    key: 'task',
    rowType: 'link',
    arrow: true,
    navigable: true,
    pageKey: 'notification_task'
  },
  {
    key: 'recommend',
    rowType: 'link',
    arrow: true,
    navigable: true,
    pageKey: 'notification_recommend'
  },
  {
    key: 'usage',
    rowType: 'link',
    arrow: true,
    navigable: true,
    pageKey: 'notification_usage'
  }
]

const DETAIL_MAP = {
  notification_reply: {
    key: 'reply',
    items: [
      { key: 'wechat', rowType: 'switch', checked: true }
    ]
  },
  notification_group: {
    key: 'group',
    items: [
      { key: 'wechat', rowType: 'switch', checked: true }
    ]
  },
  notification_task: {
    key: 'task',
    items: [
      { key: 'wechat', rowType: 'switch', checked: true },
      { key: 'sms', rowType: 'switch', checked: true }
    ]
  },
  notification_recommend: {
    key: 'recommend',
    items: [
      { key: 'wechat', rowType: 'switch', checked: true },
      { key: 'sms', rowType: 'switch', checked: true }
    ]
  },
  notification_usage: {
    key: 'usage',
    items: [
      { key: 'wechat', rowType: 'switch', checked: true },
      { key: 'sms', rowType: 'switch', checked: true }
    ]
  }
}

function buildSummaryItems(language, notification = {}) {
  return NOTIFICATION_SUMMARY_ITEMS.map((item) => {
    const prefs = notification[item.key] || {}
    const channels = []
    if (prefs.wechat) channels.push(t(language, 'notification.channels.wechat'))
    if (prefs.sms) channels.push(t(language, 'notification.channels.sms'))
    const value = channels.length
      ? t(language, 'notification.channels.combined', {
        channels: channels.join(t(language, 'notification.channels.separator'))
      })
      : t(language, 'notification.channels.off')
    const title = t(language, `notification.categories.${item.key}`)
    return { ...item, label: title, title, value }
  })
}

Component({
  properties: {
    pageKey: {
      type: String,
      value: 'notification'
    },
    notification: {
      type: Object,
      value: {}
    },
    language: {
      type: String,
      value: '中文'
    }
  },

  observers: {
    'pageKey,notification,language': function (pageKey, notification, language) {
      this.syncPage(pageKey, notification, language)
    }
  },

  data: {
    isOverview: true,
    summaryItems: buildSummaryItems('中文'),
    detailItems: [],
    detailHint: '',
    locationsTitle: t('中文', 'notification.locations')
  },

  lifetimes: {
    attached() {
      this.syncPage(this.properties.pageKey, this.properties.notification, this.properties.language)
    }
  },

  methods: {
    syncPage(
      pageKey = 'notification',
      notification = this._notification || this.data.notification || {},
      language = this.data.language
    ) {
      const isOverview = pageKey === 'notification'
      const notif = notification || {}
      this._notification = notif
      const summaryItems = buildSummaryItems(language, notif)
      const locationsTitle = t(language, 'notification.locations')
      if (isOverview) {
        this.setData({ isOverview: true, summaryItems, detailItems: [], detailHint: '', locationsTitle })
      } else {
        const detailConfig = DETAIL_MAP[pageKey]
        if (!detailConfig) return
        const category = pageKey.replace('notification_', '')
        const prefs = notif[category] || {}
        const detailItems = detailConfig.items.map(item => ({
          ...item,
          label: t(language, `notification.channels.${item.key}`),
          checked: prefs[item.key] !== undefined ? !!prefs[item.key] : item.checked
        }))
        this.setData({
          isOverview: false,
          summaryItems,
          detailItems,
          detailHint: t(language, `notification.hints.${detailConfig.key}`),
          locationsTitle
        })
      }
    },

    handleNavigate(e) {
      const { item } = e.detail || {}
      if (!item || !item.pageKey || !item.title) return

      this.triggerEvent('navigate', {
        key: item.pageKey,
        title: item.title
      })
    },

    handleSwitchChange(e) {
      const { item, checked } = e.detail || {}
      if (!item || !item.key) return
      const pageKey = this.properties.pageKey
      if (pageKey === 'notification') return
      const category = pageKey.replace('notification_', '')
      const notif = { ...(this._notification || this.data.notification || {}) }
      notif[category] = { ...(notif[category] || {}), [item.key]: checked }
      this.syncPage(pageKey, notif, this.data.language)
      this.triggerEvent('change', {
        category,
        channel:item.key,
        enabled:checked,
        notification:notif
      })
    }
  }
})
