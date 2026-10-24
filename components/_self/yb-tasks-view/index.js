const i18nBehavior = require('../../../static_utils/i18n/behavior')
import { listTasks, taskStatus, taskAction, taskView } from '../../../request/tasks'
import eventBus, { CHAT_SESSION_RESET } from '../../../static_utils/eventBus'

Component({
  behaviors:[i18nBehavior],
  properties:{ themeStyle:String },
  data:{ tabs:[{ id:'active', name:'已开启' }, { id:'paused', name:'已暂停' }, { id:'completed', name:'已完成' }],
    activeTab:'active', navHeight:100, menuOpen:false, tasks:[], loading:false, error:'', nextCursor:'', hasMore:false },
  methods:{
    openLeft() { this.triggerEvent('openLeft') },
    handleNavHeightChange(e) { this.setData({ navHeight:e.detail.height }) },
    selectTab(e) {
      if (this.data.activeTab === e.detail.id) return
      this._version++
      this._pollOffset = 0
      this.setData({ activeTab:e.detail.id, tasks:[], nextCursor:'', hasMore:false, error:'' })
      this.reload()
    },
    openTask(e) {
      if (this.data.menuOpen || this._busy) return
      const task = this.data.tasks.find(item => item.id === e.currentTarget.dataset.id)
      if (task && this.data.activeTab === 'completed') return this.triggerEvent('openTaskChat', { conversationId:task.conversationId })
      this.triggerEvent('editTask', { task:task || null })
    },
    ignoreTap() {},
    menuChanged(e) {
      this.setData({ menuOpen:e.detail.open })
      this.triggerEvent('actionschange', { open:e.detail.open })
    },
    updateTask({ task, deleted }) {
      if (this._destroyed) return
      if (this.data.activeTab === 'completed') return
      this._version++
      const exists = this.data.tasks.some(item => item.id === task.id)
      const removed = deleted || task.paused !== (this.data.activeTab === 'paused')
      const tasks = removed ? this.data.tasks.filter(item => item.id !== task.id)
        : this.data.tasks.map(item => item.id === task.id ? taskView(task) : item)
      if (!removed && !exists) tasks.unshift(taskView(task))
      this.setData({ tasks })
    },
    async loadTasks(more = false) {
      if (this._loading || this._destroyed || (more && !this.data.hasMore)) return
      this._loading = true
      const version = this._version
      this.setData({ loading:true, error:'' })
      try {
        const result = await listTasks(more ? this.data.nextCursor : '', this.data.activeTab)
        if (this._destroyed || version !== this._version) return
        const rows = more ? [...this.data.tasks, ...result.items] : result.items
        const tasks = [...new Map(rows.map(task => [task.id, taskView(task)])).values()]
        this.setData({ tasks, nextCursor:result.nextCursor, hasMore:result.hasMore })
      } catch (error) {
        if (!this._destroyed && version === this._version) { this._failedMore = more; this.setData({ error:error.message }) }
      } finally {
        this._loading = false
        if (!this._destroyed) {
          this.setData({ loading:false })
          if (this._visible && version !== this._version && !this.data.tasks.length) this.reload()
        }
      }
    },
    reload() { return this.loadTasks() },
    loadMore() { return this.loadTasks(true) },
    retry() { return this.loadTasks(this._failedMore) },
    async poll() {
      if (!this._visible || this._destroyed) return
      try {
        if (this.data.activeTab !== 'completed' && !this._busy && !this._loading && !this.data.menuOpen && this.data.tasks.length) {
          const version = this._version
          const offset = this._pollOffset || 0
          const ids = this.data.tasks.slice(offset, offset + 50).map(task => task.id)
          this._pollOffset = offset + 50 >= this.data.tasks.length ? 0 : offset + 50
          const result = await taskStatus(ids)
          if (this._destroyed || version !== this._version) return
          const returned = new Map(result.items.map(task => [task.id, task]))
          const tasks = this.data.tasks.filter(task => !ids.includes(task.id) || returned.has(task.id))
            .map(task => returned.has(task.id) ? taskView(returned.get(task.id)) : task)
            .filter(task => task.paused === (this.data.activeTab === 'paused'))
          this.setData({ tasks })
        }
      } catch (error) { /* Keep the last confirmed list and retry on the next foreground tick. */ }
      finally { this.schedulePoll() }
    },
    schedulePoll() {
      clearTimeout(this._pollTimer)
      if (this._visible && !this._destroyed) this._pollTimer = setTimeout(() => this.poll(), 5000)
    },
    async handleAction(e) {
      if (this._busy) return
      const { action, task } = e.detail
      const kind = action === 'toggle' ? (task.paused ? 'resume' : 'pause') : action
      if (!['run', 'chat', 'pause', 'resume', 'delete'].includes(kind)) return
      this._busy = true
      this._version++
      try {
        const result = await taskAction(task.id, kind)
        if (this._destroyed) return
        if (kind === 'chat') this.triggerEvent('openTaskChat', result)
        else this.updateTask(result)
        if (kind === 'run') wx.showToast({ title:'任务已加入执行队列', icon:'none' })
      } catch (error) {
        if (!this._destroyed) wx.showToast({ title:error.message, icon:'none' })
      } finally { this._busy = false }
    }
  },
  lifetimes:{
    attached() {
      this._version = 0
      this._visible = true
      this._accountReset = ({ reason } = {}) => {
        if (!['login', 'logout', 'account-refresh'].includes(reason)) return
        this._version++
        this.setData({ tasks:[], nextCursor:'', hasMore:false })
        this.reload()
      }
      eventBus.on(CHAT_SESSION_RESET, this._accountReset)
      this.reload()
      this.schedulePoll()
    },
    detached() {
      this._destroyed = true
      clearTimeout(this._pollTimer)
      eventBus.off(CHAT_SESSION_RESET, this._accountReset)
      this.triggerEvent('actionschange', { open:false })
    }
  },
  pageLifetimes:{
    show() { this._visible = true; this.reload(); this.schedulePoll() },
    hide() { this._visible = false; this._version++; clearTimeout(this._pollTimer) }
  }
})
