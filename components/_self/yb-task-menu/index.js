Component({
  properties: {
    task: Object,
    editor: Boolean,
    themeStyle: String
  },
  methods: {
    opened() { this.triggerEvent('menuchange', { open:true }) },
    choose(e) {
      this._action = e.currentTarget.dataset.action
      this.selectComponent('#menu').close()
    },
    closed() {
      this.triggerEvent('menuchange', { open:false })
      const action = this._action
      this._action = null
      if (action) this.triggerEvent('action', { action, task:this.data.task })
    }
  },
  lifetimes: { detached() { this.triggerEvent('menuchange', { open:false }) } }
})
