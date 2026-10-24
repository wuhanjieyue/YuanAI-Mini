const i18nBehavior = require('../../../static_utils/i18n/behavior')

Component({
  behaviors: [i18nBehavior],
  properties: {
    delivery: { type: Boolean, value: false },
    attachments: {
      type: Array,
      value: []
    }
  },
  data: {
    images: [],
    files: []
  },
  methods: {
    previewFile(e) {
      const kind = e.currentTarget.dataset.kind
      const index = Number(e.currentTarget.dataset.index)
      const list = kind === 'image' ? this.data.images : this.data.files
      const attachment = list[index]
      if (!attachment || kind === 'image' && attachment.unavailableReason) return
      this.triggerEvent('previewFile', {
        attachment,
        attachments: this.properties.attachments
      }, {})
    }
  },
  observers: {
    attachments(attachments) {
      const items = Array.isArray(attachments) ? attachments : []
      this.setData({
        images: items.filter((item) => item.attachmentType === 'image'),
        files: items.filter((item) => item.attachmentType !== 'image')
      })
    }
  }
})
