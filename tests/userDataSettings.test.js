const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

const source = file => fs.readFileSync(file, 'utf8')

async function checkLocation() {
  const code = source('request/location.js').replace(/^import .*\n/gm, '').replace(/export function /g, 'function ')
  for (const denied of [false, true]) {
    let lookups = 0, calls = 0
    const context = {
      wx: { getFuzzyLocation(options) {
        lookups++
        assert.equal(options.type, 'gcj02')
        queueMicrotask(() => denied ? options.fail({}) : options.success({ longitude: 120, latitude: 30 }))
      } },
      callHttp: async (path, data) => {
        calls++
        assert.equal(path, '/user')
        assert.equal(data.funName, 'resolveLocation')
        return { statusCode: 200, result: { code: 200, data: { location: { country: '中国', township: '盈丰街道' } } } }
      }
    }
    const api = vm.runInNewContext(code + '\n({initLocation,currentLocation,syncLocationPermission})', context)
    await Promise.all([api.initLocation(), api.initLocation()])
    await api.initLocation()
    assert.equal(lookups, 1, 'onShow and repeated callers never request another device location')
    assert.equal(calls, denied ? 0 : 1)
    assert.equal(api.currentLocation().country, '中国')
    assert.equal(api.currentLocation().township, denied ? undefined : '盈丰街道')
    api.currentLocation().country = 'bad'
    assert.equal(api.currentLocation().country, '中国')
    context.wx.getSetting = options => options.success({ authSetting: { 'scope.userFuzzyLocation': false } })
    api.syncLocationPermission()
    assert.equal(api.currentLocation().township, undefined, 'revocation clears cached address')
    await api.initLocation()
    assert.equal(lookups, 1, 'revocation does not trigger a second device lookup')
  }
  const config = JSON.parse(source('app.json'))
  assert(config.requiredPrivateInfos.includes('getFuzzyLocation'))
  assert(config.permission['scope.userFuzzyLocation'])
}

async function checkRowsAndDialog() {
  let definition
  vm.runInNewContext(source('components/_self/yb-subsetting-data-control/index.js').replace(/^import .*\n/gm, ''), {
    require: path => path.endsWith('/behavior') ? {} : require('../static_utils/i18n'),
    Component: value => { definition = value }
  })
  const events = []
  const component = {
    data: { language: '中文', dataControl: {}, i18n: require('../static_utils/i18n').messages('中文') },
    setData(values, callback) { Object.assign(this.data, values); callback?.() },
    triggerEvent(name, detail) { events.push({ name, detail }) }
  }
  Object.assign(component, definition.methods)
  for (const status of ['idle', 'queued', 'running', 'completed']) {
    component.data.exportStatus = status
    component.syncSwitchItems()
    const item = component.data.accountActionItems[0]
    assert.equal(item.rowType, 'value')
    assert.equal(item.actionTone, undefined, 'export label is neutral, not blue')
    assert.equal(item.trailingIcon, ['queued', 'running'].includes(status) ? 'icon-loading_flow_iconfont' : status === 'completed' ? 'icon-download' : '')
    component.handleActionTap({ detail: { item, rect: { left: 0, top: 10, width: 100, height: 40 } } })
    const event = events.pop()
    assert.equal(event.name, status === 'idle' ? 'confirmrequest' : 'exporttap')
    if (status === 'idle') {
      assert.equal(event.detail.title, '导出数据')
      assert.equal(event.detail.confirmText, '开始导出')
      assert.equal(event.detail.message, '即将要导出你的数据，可能需要一点时间，请耐心等待')
      assert.equal(event.detail.centered, true)
      assert.equal(event.detail.danger, false)
    }
  }
}

async function checkPollingAndShare() {
  const code = source('pages/setting/index.js')
  const start = code.indexOf('  async refreshDataActions()')
  const end = code.indexOf('  handleDataControlConfirmRequest(', start)
  let status = { status: 'queued', jobId: 'a'.repeat(32) }, shares = 0, notice = '', poll
  let fetchExport = () => Promise.resolve(status)
  const store = { user: { login: true, userId: 'alice' } }
  const page = vm.runInNewContext('({' + code.slice(start, end) + '})', {
    store, getDataExport: () => fetchExport(), getAccountDeletion: async () => ({ status: 'idle' }),
    shareDataExport: async job => { assert.equal(job.status, 'completed'); shares++ },
    setTimeout: fn => { poll = fn; return 1 }, clearTimeout: () => { poll = null },
    DEFAULT_USER: { login: false }, Promise
  })
  page.data = { exportState: { status: 'idle' }, i18n: { dataControls: { exporting: '正在导出' } } }
  page.setData = values => Object.assign(page.data, values)
  page.selectComponent = () => ({ show: text => { notice = text } })
  await page.refreshDataActions()
  assert.equal(page.data.exportState.status, 'queued')
  assert.equal(typeof poll, 'function')
  await page.handleExportTap()
  assert.equal(notice, '正在导出')
  assert.equal(shares, 0)
  status = { ...status, status: 'completed' }
  await poll()
  await page.handleExportTap()
  assert.equal(shares, 1)
  assert.equal(poll, null)
  let resolve
  fetchExport = () => new Promise(done => { resolve = done })
  const pending = page.refreshDataActions()
  store.user.userId = 'bob'
  resolve({ status: 'completed', jobId: 'foreign' })
  await pending
  assert.equal(page.data.exportState.jobId, 'a'.repeat(32), 'late state cannot cross accounts')
}

async function checkFileSharing() {
  const code = source('request/userData.js').replace(/^import .*\n/gm, '')
    .replace(/export (async )?function /g, '$1function ').replace(/export const /g, 'const ')
  let shared, saved
  const api = vm.runInNewContext(code + '\n({shareDataExport})', {
    downloadHttpFile: async path => { assert.equal(path, '/user-data/export/' + 'a'.repeat(32)); return '/tmp/chat.zip' },
    wx: { getDeviceInfo: () => ({ platform: 'ios' }), shareFileMessage: options => { shared = options; options.success() },
      saveFileToDisk: options => { saved = options; options.success() } }
  })
  await api.shareDataExport({ jobId: 'a'.repeat(32), fileName: '聊天数据.zip' })
  assert.equal(shared.filePath, '/tmp/chat.zip')
  assert.equal(shared.fileName, '聊天数据.zip')
  assert.equal(saved, undefined)
}

Promise.resolve().then(checkLocation).then(checkRowsAndDialog).then(checkPollingAndShare).then(checkFileSharing)
  .then(() => console.log('userDataSettings: location once, neutral export, dialog, polling, owner fence and native sharing passed'))
