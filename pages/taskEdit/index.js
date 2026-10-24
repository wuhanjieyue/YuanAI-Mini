import { saveTask as persistTask, taskAction } from '../../request/tasks'
import { store } from '../../store/index'
import { loadModelCatalog } from '../../static_utils/appDataInit'
const { normalizeModelCatalog, normalizeModeSelection, getSelectionView, canAccessPlan } = require('../../static_utils/modelCatalog')
const { bindPageTheme, unbindPageTheme, syncThemeNavigation } = require('../../static_utils/themeBinding')
const { getSettingSheetMetrics, SETTING_ROUTE_DURATION } = require('../../static_router/settingRouter')
import { GestureState, clamp, Curves, bottomSheetSuspendedCurve } from '../../static_utils/routerUtil'
const { shared, timing, runOnJS } = wx.worklet

function formSnapshot(task) {
  // A wheel returning to its default interval must compare equal to an untouched form.
  const intervals = Object.entries(task.intervals).filter(([, value]) => value !== 1).sort(([a], [b]) => a.localeCompare(b))
  return JSON.stringify({ ...task, intervals })
}

function dateColumns(date) {
  const [year, month, day] = date.split('-').map(Number)
  const firstYear = Math.min(new Date().getFullYear(), year)
  const years = Array.from({ length:Math.max(11, year - firstYear + 1) }, (_, i) => firstYear + i)
  const days = Array.from({ length:new Date(year, month, 0).getDate() }, (_, i) => i + 1)
  return { years, months:Array.from({ length:12 }, (_, i) => i + 1), days, dateValue:[year - firstYear, month - 1, Math.min(day, days.length) - 1] }
}

Page({
  data: {
    task:{}, models:[], pickerSelection:{}, modelLabel:'', editing:false, menuOpen:false, sheetHeight:0, saveButtonState:'idle',
    repeatOptions:['从不', '按小时', '按天', '工作日', '按周', '按月', '自定义'],
    timeOptions:['上午', '下午', '夜间', '自定义'], endOptions:['永不', '在选定日期结束'],
    unitOptions:['小时', '天', '周', '月'],
    intervals:Array.from({ length:99 }, (_, i) => i + 1),
    weekdays:['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    monthDays:[...Array.from({ length:31 }, (_, i) => `${i + 1}日`), '最后一天'],
    hours:Array.from({ length:24 }, (_, i) => String(i).padStart(2, '0')),
    minutes:Array.from({ length:60 }, (_, i) => String(i).padStart(2, '0'))
  },
  onLoad() {
    this._newTaskId = `task_${Date.now()}_${Math.random().toString(36).slice(2)}`
    this._requestClose = this.closePage.bind(this)
    this.routeContext = wx.router.getRouteContext(this)
    this._saveMorph = shared(0)
    this.scrollTop = shared(0)
    this.startPan = shared(true)
    this.menuShown = shared(false)
    this.dragExtent = shared(Math.max(getSettingSheetMetrics().sheetHeight, 1))
    bindPageTheme(this)
    const now = new Date()
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    this.setData({ sheetHeight:getSettingSheetMetrics().sheetHeight, task:{ ...normalizeModeSelection(store.modelCatalog, 'chat'), name:'', description:'', timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai', repeat:'按天', frequency:'每天', time:'上午', end:'永不', endDate:date, paused:false, runDate:date, customUnit:'天', intervals:{}, weekday:now.getDay() || 7, monthDay:now.getDate(), hour:9, minute:0, hourlyMinute:0 }, ...dateColumns(date), runDatePicker:dateColumns(date) })
    this.syncSchedule()
    this.syncTaskModels()
    this._initialForm = formSnapshot(this.data.task)
    this.getOpenerEventChannel().on('editTask', ({ task }) => {
      if (!task) return
      const draft = { ...this.data.task, ...task, intervals:{ ...task.intervals } }
      this.setData({ task:draft, editing:true, ...dateColumns(draft.endDate), runDatePicker:dateColumns(draft.runDate) })
      this.syncSchedule()
      this.syncTaskModels()
      this._initialForm = formSnapshot(this.data.task)
    })
  },
  onReady() {
    const rpx = wx.getWindowInfo().windowWidth / 750
    this._saveLabelWidth = shared(56 * rpx)
    this.createSelectorQuery().select('.task-save-label').boundingClientRect((rect) => {
      if (rect?.width > 0) this._saveLabelWidth.value = rect.width
    }).exec()
    this.applyAnimatedStyle('.task-save-button', () => {
      'worklet'
      const padding = (22 + 30 * (1 - this._saveMorph.value)) * rpx
      return { paddingLeft:`${padding}px`, paddingRight:`${padding}px` }
    })
    this.applyAnimatedStyle('.task-save-label-wrap', () => {
      'worklet'
      const visible = 1 - this._saveMorph.value
      return { width:`${this._saveLabelWidth.value * visible}px`, opacity:`${visible}` }
    })
    this.applyAnimatedStyle('.task-save-icon-wrap', () => {
      'worklet'
      return { width:`${48 * rpx * this._saveMorph.value}px`, opacity:`${this._saveMorph.value}` }
    })
  },
  onShow() { syncThemeNavigation(this) },
  onUnload() { this._destroyed = true; clearTimeout(this._saveTimer); unbindPageTheme(this) },
  syncTaskModels() {
    const catalog = normalizeModelCatalog(store.modelCatalog)
    const view = getSelectionView(catalog, this.data.task)
    const models = catalog.models.filter(model => model.modes.includes('chat')).map(model => ({
      ...model, locked:!canAccessPlan(catalog.accessPlan, model.minPlan),
      efforts:model.efforts.map(effort => ({ ...effort, locked:!canAccessPlan(catalog.accessPlan, effort.minPlan) }))
    }))
    this.setData({ models, pickerSelection:normalizeModeSelection(catalog, 'chat', this.data.task),
      modelLabel:[view.modelName || this.data.task.modelId, view.effortLabel].filter(Boolean).join(' · ') })
  },
  async showModels() {
    if (this._openingModels || this.data.menuOpen || this.data.saveButtonState !== 'idle') return
    this._openingModels = true
    this.menuOpened()
    wx.hideKeyboard()
    try {
      await loadModelCatalog({ silent:false })
      if (this._destroyed) return
      this.syncTaskModels()
      if (!this.data.pickerSelection.modelId) {
        this.menuClosed()
        wx.showToast({ title:'暂无可用模型', icon:'none' })
        return
      }
      const query = this.createSelectorQuery()
      query.select('.task-model-anchor').boundingClientRect()
      query.select('.task-edit').boundingClientRect()
      const [anchor, boundary] = await new Promise(resolve => query.exec(resolve))
      if (this._destroyed) return
      if (!anchor || !boundary || !await this.selectComponent('#modelsSelect').show(anchor, boundary)) this.menuClosed()
    } catch (error) {
      if (!this._destroyed) {
        this.menuClosed()
        wx.showToast({ title:'模型加载失败，请重试', icon:'none' })
      }
    } finally { this._openingModels = false }
  },
  modelChanged(e) {
    if (this.data.saveButtonState !== 'idle') return
    const selection = normalizeModeSelection(store.modelCatalog, 'chat', e.detail || {})
    if (!selection.modelId || !selection.effortId) return
    this.setData({ 'task.modelId':selection.modelId, 'task.effortId':selection.effortId })
    this.syncTaskModels()
  },
  modelLocked() { wx.showToast({ title:'当前套餐暂不支持此选项', icon:'none' }) },
  closePage() {
    if (this.data.saveButtonState !== 'idle') return
    if (formSnapshot(this.data.task) === this._initialForm) return this.leavePage()
    wx.hideKeyboard()
    this.selectComponent('#discardMenu').open()
  },
  keepEditing() { this._pendingChat = null; this.selectComponent('#discardMenu').close() },
  discardChanges() { this._discardAfterClose = true; this.selectComponent('#discardMenu').close() },
  discardClosed() {
    this.menuClosed()
    if (this._discardAfterClose) this.leavePage()
    else this._pendingChat = null
  },
  inputChanged(e) { this.setData({ [`task.${e.currentTarget.dataset.field}`]:e.detail.value }) },
  menuOpened() { this.menuChanged({ detail:{ open:true } }) },
  menuClosed() { this.menuChanged({ detail:{ open:false } }) },
  menuChanged(e) { this.menuShown.value = e.detail.open; this.setData({ menuOpen:e.detail.open }) },
  shouldPanResponse() {
    'worklet'
    return !this.menuShown.value && this.startPan.value
  },
  shouldPanAccept() {
    'worklet'
    return !this.menuShown.value
  },
  shouldScrollResponse(event) {
    'worklet'
    if (this.menuShown.value) return false
    if (!this.routeContext) return true
    if (this.routeContext.primaryAnimation.value < 1) return false
    const shouldScroll = !(this.scrollTop.value <= 0 && event.deltaY > 0)
    this.startPan.value = !shouldScroll
    return shouldScroll
  },
  scrollUpdated(event) {
    'worklet'
    this.scrollTop.value = event.detail.scrollTop
    this.startPan.value = event.detail.scrollTop <= 0
  },
  handleVerticalDrag(event) {
    'worklet'
    if (!this.routeContext) return
    const { primaryAnimation, startUserGesture, stopUserGesture, userGestureInProgress } = this.routeContext
    if (event.state === GestureState.BEGIN) {
      startUserGesture()
    } else if (event.state === GestureState.ACTIVE) {
      primaryAnimation.value = clamp(primaryAnimation.value - event.deltaY / this.dragExtent.value, 0, 1)
    } else if (event.state === GestureState.END || event.state === GestureState.CANCELLED) {
      if (!userGestureInProgress.value) return
      const velocity = event.state === GestureState.END ? event.velocityY : 0
      const progress = primaryAnimation.value
      const dismiss = Math.abs(velocity) >= 500 ? velocity > 0 : progress <= 0.6
      const requestClose = this._requestClose
      const duration = Math.max(1, Math.floor(SETTING_ROUTE_DURATION * (1 - progress)))
      const easing = bottomSheetSuspendedCurve(progress, Curves.decelerateEasing)
      primaryAnimation.value = timing(1, { duration, easing }, () => {
        'worklet'
        stopUserGesture()
        if (dismiss) runOnJS(requestClose)()
      })
    }
  },
  selectOption(e) {
    const { field, value } = e.currentTarget.dataset
    this.setData({ [`task.${field}`]:value })
    this.syncSchedule()
    this.selectComponent(`#${field}Menu`).close()
  },
  dateChanged(e) {
    const [y, m, d] = e.detail.value
    const field = e.currentTarget?.dataset.field || 'endDate'
    const columns = field === 'runDate' ? this.data.runDatePicker : this.data
    const year = columns.years[y]
    const month = m + 1
    const day = Math.min(d + 1, new Date(year, month, 0).getDate())
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    this.setData({ [`task.${field}`]:date, ...(field === 'runDate' ? { runDatePicker:dateColumns(date) } : dateColumns(date)) })
  },
  closeDate(e) { this.selectComponent(e?.currentTarget?.dataset.menu || '#dateMenu').close() },
  syncSchedule() {
    const task = this.data.task
    const unit = task.repeat === '自定义' ? task.customUnit : { '按小时':'小时', '按天':'天', '按周':'周', '按月':'月' }[task.repeat] || '天'
    const intervalKey = task.repeat === '自定义' ? `自定义${unit}` : task.repeat
    const interval = task.intervals[intervalKey] || 1
    const suffix = unit === '周' ? this.data.weekdays[task.weekday - 1] : unit === '月' ? this.data.monthDays[task.monthDay - 1] : ''
    let frequency = `每${interval === 1 ? '' : interval}${unit}${suffix ? ` · ${suffix}` : ''}`
    if (interval === 1 && unit === '周') frequency = `每${suffix}`
    if (interval === 1 && unit === '月') frequency = `每月${suffix}`
    if (task.repeat === '从不') frequency = '仅一次'
    if (task.repeat === '工作日') frequency = '周一至周五'
    this.setData({ unit, intervalKey, interval, 'task.frequency':frequency,
      frequencyValue:[interval - 1, unit === '周' ? task.weekday - 1 : unit === '月' ? task.monthDay - 1 : 0],
      timeValue:[task.hour, task.minute], minuteValue:[task.hourlyMinute],
      exactTime:`${this.data.hours[task.hour]}:${this.data.minutes[task.minute]}` })
  },
  frequencyChanged(e) {
    const [index, day = 0] = e.detail.value
    const intervals = { ...this.data.task.intervals, [this.data.intervalKey]:index + 1 }
    const patch = { 'task.intervals':intervals }
    if (this.data.unit === '周') patch['task.weekday'] = day + 1
    if (this.data.unit === '月') patch['task.monthDay'] = day + 1
    this.setData(patch)
    this.syncSchedule()
  },
  timeChanged(e) {
    const [hour, minute] = e.detail.value
    this.setData({ 'task.hour':hour, 'task.minute':minute })
    this.syncSchedule()
  },
  minuteChanged(e) {
    this.setData({ 'task.hourlyMinute':e.detail.value[0] })
    this.syncSchedule()
  },
  async openTaskChat() {
    if (this._openingChat || this.data.saveButtonState !== 'idle') return
    this._openingChat = true
    try {
      const result = await taskAction(this.data.task.id, 'chat')
      if (this._destroyed) return
      this._pendingChat = result
      this.closePage()
    } catch (error) { wx.showToast({ title:error.message, icon:'none' }) }
    finally { this._openingChat = false }
  },
  leavePage() {
    const chat = this._pendingChat
    const channel = this.getOpenerEventChannel()
    wx.navigateBack({ success:() => { if (chat) channel.emit('openTaskChat', chat) } })
  },
  async saveTask() {
    if (this.data.saveButtonState !== 'idle') return
    const task = this.data.task
    if (!task.name.trim() || !task.description.trim()) {
      wx.showToast({ title:'请填写任务名称和任务说明', icon:'none' })
      return
    }
    if ((task.repeat === '按小时' || task.repeat === '自定义') && task.end === '在选定日期结束' && task.endDate < task.runDate) {
      wx.showToast({ title:'结束日期不能早于开始日期', icon:'none' })
      return
    }
    this.setData({ saveButtonState:'saving' })
    this._saveMorph.value = timing(1, { duration:220, easing:Curves.easeOutCubic })
    this.menuShown.value = true
    wx.hideKeyboard()
    try {
      const result = await persistTask({ ...task, id:task.id || this._newTaskId })
      if (this._destroyed) return
      this.getOpenerEventChannel().emit('taskUpdated', result)
      this.setData({ task:result.task, saveButtonState:'done' })
      this.syncSchedule()
      this._initialForm = formSnapshot(this.data.task)
      this._saveTimer = setTimeout(() => this.leavePage(), 600)
    } catch (error) {
      if (this._destroyed) return
      this.menuShown.value = false
      this.setData({ saveButtonState:'idle' })
      this._saveMorph.value = timing(0, { duration:220, easing:Curves.easeOutCubic })
      wx.showToast({ title:error.message || '保存失败，请重试', icon:'none' })
    }
  }
})
