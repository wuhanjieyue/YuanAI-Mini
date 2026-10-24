const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const billingModule = { exports: {} }
vm.runInNewContext(fs.readFileSync('static_utils/billingView.js', 'utf8'), {
  module: billingModule,
  require(specifier) {
    const file = path.resolve('static_utils', specifier + '.js')
    assert.ok(fs.existsSync(file), `Mini Program module must resolve to a file: ${specifier}`)
    return require(file)
  }
})
const { billingView } = billingModule.exports
const { messages } = require('../static_utils/i18n')

const view = billingView({ enabled: true, cycleEndAt: Date.now(), pendingCount: 2, totalReservedCny: '1.05',
  package: { budgetCny: '2.5', spentCny: '.2', reservedCny: '1', points: 138 },
  purchased: { points: 60, reservedCny: '.05' } }, '中文')
assert.equal(view.usageLimitsPercent, '8.0')
assert.equal(view.usageLimitsPackagePoints, 138)
assert.equal(view.usageLimitsPurchasedPoints, 60)
assert.equal(view.usageLimitsReserved, '1.0500')
assert.equal(billingView({ enabled: false }, '中文').usageLimitsPercent, '0.0')
assert.equal(billingView(null, 'English').usageLimitsEnabled, false)
for (const language of ['中文', 'English']) {
  const free = billingView({ enabled: true, allowancePeriod: 'lifetime', cycleEndAt: null,
    package: { budgetCny: '2.5', spentCny: '2.5', points: 0 }, purchased: { points: 0 } }, language)
  assert.equal(free.usageLimitsLifetime, true)
  assert.equal(free.usageLimitsPercent, '100.0')
  assert.equal(free.usageLimitsReset, messages(language).usageLimits.freeLifetime)
  assert.equal(view.usageLimitsLifetime, false, 'PRO and older monthly responses keep their cycle display')
}
assert.equal(billingView({ package: {}, purchased: {}, cycleEndAt: null }, '中文').usageLimitsReset,
  messages('中文').usageLimits.notEnabled, 'a missing date must not display 1970')

for (const [spentCny, expected] of [['0', '0.0'], ['0.14436', '0.4'], ['0.2', '0.6'], ['40', '100.0']]) {
  assert.equal(billingView({ package: { budgetCny: '36', spentCny }, purchased: { points: 0 } }, '中文').usageLimitsPercent, expected)
}

async function main() {
  const requests = [], payments = []
  let reply = { statusCode: 200, result: { code: 200, data: { orderId: 'order', status: 'pending', payment: { package: 'prepay_id=test' } } } }
  const api = { module: { exports: {} }, callHttp: async (...args) => { requests.push(args); return reply },
    setTimeout: callback => callback(), wx: { requestPayment: options => { payments.push(options.package); options.success() } } }
  vm.runInNewContext(fs.readFileSync('request/billing.js', 'utf8').replace(/^import .*$/mg, '').replace(/export /g, '') +
    '\nmodule.exports={createBillingOrder,payBillingOrder,waitBillingOrder,getBillingSummary}', api)
  const client = api.module.exports
  for (const amount of [0, -1, 1.4, '30', true, 1, 29, 31, 10000]) assert.throws(() => client.createBillingOrder('points_purchase', amount, 'same-key'))
  assert.equal(requests.length, 0)
  await client.payBillingOrder('points_purchase', 30, 'same-key')
  assert.equal(requests[0][1].clientRequestId, 'same-key')
  assert.equal(requests[0][1].amountYuan, 30)
  assert.deepEqual(payments, ['prepay_id=test'])
  reply = { statusCode: 200, result: { code: 200, data: { status: 'paid', fulfilled: true } } }
  assert.equal((await client.waitBillingOrder('order')).fulfilled, true)
  reply = { statusCode: 402, result: { code: 'QUOTA_INSUFFICIENT', msg: '余额不足' } }
  await assert.rejects(client.getBillingSummary(), /余额不足/)

  let definition, releasePayment, submitCount = 0
  const notices = []
  const sandbox = { Page: value => { definition = value }, Date, Math,
    payBillingOrder: (product, amount) => { assert.equal(product, 'points_purchase'); assert.equal(amount, 30); submitCount++; return new Promise(resolve => { releasePayment = resolve }) },
    waitBillingOrder: async () => ({ fulfilled: false }),
    require: name => name.includes('i18n') ? { messages } : name.includes('themeBinding') ? { bindPageTheme() {} } : name.includes('store') ? { store: { applicationSettings: { language: '中文' } } } : {},
    wx: { getWindowInfo: () => ({ screenWidth: 375, screenHeight: 812 }), worklet: { runOnJS: value => value }, showToast: value => notices.push(value), showModal: value => notices.push(value) } }
  vm.runInNewContext(fs.readFileSync('pages/usageLimits/purchase/index.js', 'utf8').replace(/^import .*$/mg, ''), sandbox)
  const page = { ...definition, data: { ...definition.data }, setData(value) { Object.assign(this.data, value) } }
  page.onLoad()
  assert.equal(page.data.screenHeight, 812)
  assert.ok(Math.abs(page.data.sheetSize * 812 - (0.3 * 812 + 36)) < 1e-9)
  assert.equal(page.data.amountYuan, 30)
  assert.equal(page.data.grantPoints, 2000)
  assert.equal(page.changeAmount, undefined)
  const purchaseTemplate = fs.readFileSync('pages/usageLimits/purchase/index.wxml', 'utf8')
  assert.doesNotMatch(purchaseTemplate, /<input\b|bindinput=/)
  assert.match(purchaseTemplate, /¥\{\{amountYuan\}\}/)
  assert.match(purchaseTemplate, /initial-child-size="\{\{sheetSize\}\}"/)
  const purchaseStyles = fs.readFileSync('pages/usageLimits/purchase/index.wxss', 'utf8')
  for (const selector of ['purchase-plan', 'purchase-button']) {
    const rule = purchaseStyles.match(new RegExp('\\.' + selector + ' \\{([^}]+)\\}'))[1]
    assert.match(rule, /width: calc\(100% - 36rpx\)/)
    assert.match(rule, /min-height: 132rpx/)
  }
  assert.equal(messages('中文').usageLimits.purchaseDescription, '额度自购买之日起12个月内有效')
  const first = page.purchase()
  await page.purchase()
  assert.equal(submitCount, 1, 'rapid taps cannot create a second payment')
  const key = page._purchaseRequestId
  releasePayment({ orderId: 'order', status: 'pending' })
  await first
  assert.equal(page._purchaseRequestId, key, 'unknown fulfillment keeps the original order key')
  assert.equal(notices.at(-1).title, messages('中文').usageLimits.paymentPending)
  assert.equal(page.data.purchasing, false)
  sandbox.payBillingOrder = async () => { throw { code: 'PAYMENT_UNAVAILABLE', message: '支付服务尚未配置' } }
  await page.purchase()
  assert.equal(notices.at(-1).content, messages('中文').usageLimits.purchaseUnavailable)
  assert.equal(notices.at(-1).confirmText, messages('中文').common.done)
  assert.equal(notices.at(-1).showCancel, false)
  sandbox.payBillingOrder = async () => { throw new Error('网络异常') }
  await page.purchase()
  assert.equal(notices.at(-1).content, '网络异常')
  const settingsSource = fs.readFileSync('pages/setting/index.js', 'utf8')
  const navigation = [], failures = []
  const entry = vm.runInNewContext('({' + settingsSource.slice(
    settingsSource.indexOf('  openQuotaPurchase()'), settingsSource.indexOf('  openUpgradePage()')) + '})', {
    wx: { navigateTo: options => navigation.push(options), showToast: options => failures.push(options) }
  })
  const settings = { ...entry, data: { usageLimitsLoading: true, i18n: messages('中文') } }
  settings.openQuotaPurchase()
  assert.equal(navigation.length, 0, 'loading skeleton cannot open a purchase')
  settings.data.usageLimitsLoading = false
  settings.openQuotaPurchase()
  settings.openQuotaPurchase()
  assert.equal(navigation.length, 1, 'rapid taps open one purchase sheet')
  assert.equal(navigation[0].url, '/pages/usageLimits/purchase/index')
  assert.equal(navigation[0].routeType, 'upRouterBuilder')
  navigation[0].fail()
  navigation[0].complete()
  assert.equal(failures[0].title, messages('中文').common.loadFailed)
  settings.openQuotaPurchase()
  assert.equal(navigation.length, 2, 'navigation failure releases the entry for retry')
  navigation[1].complete()
  settings._unloaded = true
  settings.openQuotaPurchase()
  assert.equal(navigation.length, 2)
  assert.match(fs.readFileSync('pages/setting/index.wxml', 'utf8'), /bind:tap="openQuotaPurchase"[^>]*aria-role="button"/)
  assert.doesNotMatch(fs.readFileSync('pages/setting/index.js', 'utf8'), /usageLimitsPercent:\s*75/)
  assert.match(fs.readFileSync('pages/setting/index.wxml', 'utf8'), /usageLimitsPurchasedPoints/)
  console.log('billing: whole-yuan orders, callback-confirmed fulfillment, request races and real allowance display passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
