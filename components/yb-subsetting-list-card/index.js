Component({
  properties: {
    items: {
      type: Array,
      value: []
    }
  },

  methods: {
    handleItemTap(e) {
      const { index } = e.currentTarget.dataset
      const item = this.properties.items[index]
      if (!item || (!item.navigable && item.rowType !== 'action')) return

      this.createSelectorQuery()
        .selectAll('.card-row')
        .boundingClientRect(rects => {
          const rect = (rects && rects[index]) || null
          this.triggerEvent('itemtap', { item, rect })
        })
        .exec()
    },

    handleSwitchChange(e) {
      const { index } = e.currentTarget.dataset
      const item = this.properties.items[index]
      if (!item) return
      this.triggerEvent('switchchange', { item, checked: e.detail.value })
    }
  }
})
