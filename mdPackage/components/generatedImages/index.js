const { mergeGeneratedImages, visibleGeneratedImages } = require('../../../static_utils/generatedImages')
const towxml = require('../towxmlstream/index')
const i18nBehavior = require('../../../static_utils/i18n/behavior')
const { reaction } = require('mobx-miniprogram')
const { store } = require('../../../store/index')
const { getAccentTheme } = require('../../../static_utils/accentColor')
const { shared, spring } = wx.worklet

Component({
  behaviors: [i18nBehavior],
  properties: {
    theme: { type: String, value: 'light' },
    images: { type: Array, value: [] },
    referencedIds: { type: Array, value: [] },
    content: { type: String, value: '' },
    settled: { type: Boolean, value: false },
    turnStatus: { type: String, value: '' },
    animateEntrance: { type: Boolean, value: false }
  },
  data: { cards: [], listHeight: 75, pageHidden: false },
  observers: {
    'images, content, settled, referencedIds, turnStatus'(images, content, settled, references, turnStatus) {
      const previous = this.data.cards
      const sources = []
      const referencedIds = [...(references || [])]
      if (settled && content && images?.length) {
        const collect = node => {
          if (node.tag === 'img' && node.attrs?.src) sources.push(node.attrs.src)
          if (node.generatedImage) referencedIds.push(node.generatedImage.artifactId)
          for (const child of node.children || []) collect(child)
        }
        collect(towxml.static(content, 'markdown', { images }))
      }
      const cards = settled && turnStatus === 'completed' && referencedIds.length ? [] :
        visibleGeneratedImages(mergeGeneratedImages([], (images || []).filter(item =>
        item?.displayMode !== 'markdown' || item.status === 'completed' || item.unavailableReason)), settled, sources, referencedIds).map((item) => {
        const old = previous.find((card) => card.artifactId === item.artifactId && card.url === item.url)
        return { ...item, loaded: !!old?.loaded, loadFailed: !!old?.loadFailed }
      })
      this.setData({ cards, listHeight: Math.max(0, ...cards.map((item) => item.heightVw)) }, () => this.animateEntrance())
    }
  },
  lifetimes: {
    attached() {
      this._disposeLoadingColor = reaction(
        () => [store.applicationSettings.pointColor, store.effectiveTheme],
        ([pointColor, theme]) => this.setData({ loadingColor: getAccentTheme(pointColor, theme).loadingColor }),
        { fireImmediately: true }
      )
      this._attached = true
      this._entranceScale = shared(0)
      this.animateEntrance()
    },
    detached() {
      this._attached = false
      this._disposeLoadingColor?.()
    }
  },
  pageLifetimes: {
    show() { this.setData({ pageHidden: false }) },
    hide() { this.setData({ pageHidden: true }) }
  },
  methods: {
    animateEntrance() {
      if (!this._attached || !this.data.animateEntrance || !this.data.cards.length || this._entranceBound) return
      wx.nextTick(() => {
        if (!this._attached || this._entranceBound) return
        this.applyAnimatedStyle('.generated-images', () => {
          'worklet'
          return { transform: `scale(${this._entranceScale.value})` }
        })
        this._entranceBound = true
        this._entranceScale.value = spring(1, { mass: 0.8 })
      })
    },
    imageLoaded(e) { this.updateImage(e, { loaded: true, loadFailed: false }) },
    imageFailed(e) { this.updateImage(e, { loaded: false, loadFailed: true }) },
    updateImage(e, patch) {
      const index = this.data.cards.findIndex((item) => item.artifactId === e.currentTarget.dataset.id && item.url === e.currentTarget.dataset.url)
      if (index < 0) return
      this.setData({ [`cards[${index}]`]: { ...this.data.cards[index], ...patch } })
    },
    preview(e) {
      const current = e.currentTarget.dataset.url
      const card = this.data.cards.find((item) => item.artifactId === e.currentTarget.dataset.id)
      if (card?.unavailableReason) {
        this.triggerEvent('unavailable', {}, {})
        return
      }
      const urls = this.data.cards.filter((item) => item.url && !item.loadFailed).map((item) => item.url)
      if (urls.includes(current)) wx.previewImage({ current, urls })
    }
  }
})
