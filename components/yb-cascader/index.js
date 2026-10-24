const { shared, timing, spring, runOnJS } = wx.worklet
const { calculatePosition, rpxToPx } = require('../yb-flyout/position')
const MAX_DEPTH = 10
const DURATION = 160

Component({
  properties: {
    options: { type: Array, value: [] },
    themeStyle: { type: String, value: '' }
  },
  data: { layers: [], depth: 0, stageHeight: 0, cardWidth: 0, busy: false, alignRight: false, popupOrigin: '0% 0%' },
  lifetimes: {
    detached() { this._generation = (this._generation || 0) + 1 }
  },
  methods: {
    handleCardTap() {},
    makeLayer(options, depth, trigger = null) {
      const items = (Array.isArray(options) ? options : []).filter(item => item && typeof item.label === 'string')
      const headerHeight = this._px(trigger ? 100 : 0)
      const chromeHeight = this._px(trigger ? 2 : 14)
      const listHeight = Math.max(0, Math.min(this._cardMaxHeight - headerHeight - chromeHeight,
        this._px(Math.min(items.length, trigger ? 4 : 5) * 110)))
      const height = headerHeight + listHeight + chromeHeight
      return {
        depth, height, trigger, bottom: this._px(36),
        listHeight,
        items: items.map(item => ({ ...item,
          hasChildren: depth < MAX_DEPTH - 1 && Array.isArray(item.children) && item.children.length > 0
        }))
      }
    },
    open(anchorRect, boundaryRect) {
      if (this._opened || !anchorRect) return
      const info = wx.getWindowInfo()
      this._px = value => rpxToPx(value, info.windowWidth)
      const layout = calculatePosition({ windowInfo: info, anchorRect, boundaryRect,
        popupWidthRpx: 640, edgeGapRpx: 0, maxHeightRatio: 1, measuredHeight: this._px(824) })
      this._cardMaxHeight = layout.panelHeightPx - this._px(260)
      if (this._cardMaxHeight < this._px(210)) return
      this._opened = true
      this._generation = (this._generation || 0) + 1
      this._path = []
      this._motion = []
      this._scrollTops = []
      const generation = this._generation
      const root = this.makeLayer(this.data.options, 0)
      const alignRight = anchorRect.left >= info.windowWidth / 2
      const topInset = layout.panelHeightPx - root.height - root.bottom
      // Position the visible card at the trigger, not the transparent safety container.
      const popupAnchor = { ...anchorRect,
        left: anchorRect.left + this._px(36) * (alignRight ? 1 : -1),
        top: anchorRect.top - topInset + 12 }
      this.setData({ layers: [root], depth: 0, alignRight,
        popupOrigin: `${alignRight ? layout.popupWidthPx - this._px(36) : this._px(36)}px ${topInset}px`,
        stageHeight: layout.panelHeightPx, cardWidth: Math.max(0, layout.popupWidthPx - this._px(240)), busy: true }, () => {
        wx.nextTick(() => {
          if (generation !== this._generation) return
          this.bindLayer(0, false)
          this.selectComponent('#flyout').open(popupAnchor, boundaryRect)
          this.setData({ busy: false })
        })
      })
    },
    bindLayer(depth, entering) {
      const layer = this.data.layers[depth]
      const scale = shared(1)
      const inset = shared(0)
      const height = shared(entering ? this._px(100) : layer.height)
      const bottom = shared(entering ? layer.triggerBottom : layer.bottom)
      const listHeight = shared(entering ? 0 : layer.listHeight)
      const opacity = shared(entering ? 0 : 1)
      this._motion[depth] = { scale, inset, height, bottom, listHeight, opacity }
      this.applyAnimatedStyle(`.cascade-card-${depth}`, () => {
        'worklet'
        return { height: `${height.value}px`, bottom: `${bottom.value}px`,
          transform: `scale(${scale.value - inset.value})` }
      })
      this.applyAnimatedStyle(`.cascade-options-${depth}`, () => {
        'worklet'
        return { height: `${listHeight.value}px`, opacity: opacity.value }
      })
    },
    rememberScroll(e) {
      this._scrollTops[Number(e.currentTarget.dataset.depth)] = e.detail.scrollTop
    },
    choose(e) {
      const depth = Number(e.currentTarget.dataset.depth)
      const index = Number(e.currentTarget.dataset.index)
      if (!this._opened || this.data.busy || depth !== this.data.depth) return
      const item = this.data.layers[depth]?.items[index]
      if (!item || item.disabled) return
      const path = this._path.slice(0, depth).concat({ id: item.id, label: item.label })
      if (!item.hasChildren) {
        this.triggerEvent('select', { value: item.id, item, path })
        this.close()
        return
      }
      this._path = path
      const next = depth + 1
      const generation = this._generation
      this._scrollTops[next] = 0
      const parent = this.data.layers[depth]
      const child = this.makeLayer(item.children, next, { id: item.id, label: item.label })
      child.bottom = Math.max(this._px(36), parent.bottom + parent.height - child.height)
      child.triggerBottom = parent.bottom + parent.height - this._px((parent.trigger ? 100 : 0) + index * 110 + 100) + (this._scrollTops[depth] || 0)
      this.setData({ layers: this.data.layers.concat(child), depth: next, busy: true }, () => {
        wx.nextTick(() => {
          if (generation !== this._generation) return
          this.bindLayer(next, true)
          // Sibling cards: only the immediate parent changes; ancestors keep their transforms.
          this._motion[depth].inset.value = spring(0.05, { velocity: 5, mass: 0.8 })
          this._motion[next].height.value = timing(child.height, { duration: DURATION })
          this._motion[next].bottom.value = timing(child.bottom, { duration: DURATION })
          this._motion[next].listHeight.value = timing(child.listHeight, { duration: DURATION })
          this._motion[next].opacity.value = timing(1, { duration: DURATION })
          const finish = this.finishTransition.bind(this, generation)
          this._motion[next].scale.value = spring(1.05, { velocity: 5, mass: 0.8 }, () => {
            'worklet'
            runOnJS(finish)()
          })
        })
      })
    },
    finishTransition(generation) {
      if (generation === this._generation) this.setData({ busy: false })
    },
    back() {
      if (!this._opened || this.data.busy) return
      const depth = this.data.depth
      if (!depth) { this.close(); return }
      this.setData({ busy: true })
      this._motion[depth - 1].inset.value = timing(0, { duration: DURATION })
      this._motion[depth].scale.value = timing(1, { duration: DURATION })
      this._motion[depth].height.value = timing(this._px(100), { duration: DURATION })
      this._motion[depth].bottom.value = timing(this.data.layers[depth].triggerBottom, { duration: DURATION })
      this._motion[depth].listHeight.value = timing(0, { duration: DURATION })
      const finish = this.finishBack.bind(this, this._generation, depth)
      this._motion[depth].opacity.value = timing(0, { duration: DURATION }, () => {
        'worklet'
        runOnJS(finish)()
      })
    },
    finishBack(generation, depth) {
      if (generation !== this._generation) return
      this._path = this._path.slice(0, depth - 1)
      this._motion.length = depth
      this.setData({ layers: this.data.layers.slice(0, depth), depth: depth - 1, busy: false })
    },
    close() {
      if (!this._opened) return
      this._generation = (this._generation || 0) + 1
      this.setData({ busy: true })
      this.selectComponent('#flyout').close()
    },
    handleAfterClose() {
      this._opened = false
      this._motion = []
      this.setData({ layers: [], depth: 0, busy: false })
      this.triggerEvent('close')
    }
  }
})
