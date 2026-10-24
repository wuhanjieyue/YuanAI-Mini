const assert = require('assert')
const fs = require('fs')
const vm = require('vm')

const app = JSON.parse(fs.readFileSync('app.json', 'utf8'))
const setting = fs.readFileSync('pages/setting/index.js', 'utf8')
const page = fs.readFileSync('pages/upgrade/index.js', 'utf8')
const template = fs.readFileSync('pages/upgrade/index.wxml', 'utf8')
const styles = fs.readFileSync('pages/upgrade/index.wxss', 'utf8')
const { messages } = require('../static_utils/i18n/index')

assert(app.pages.includes('pages/upgrade/index'))
assert.match(setting, /url: '\/pages\/upgrade\/index'[\s\S]*routeType: SETTING_ROUTE_TYPE,[\s\S]*routeOptions: \{ stacked: true \}/)
assert.match(setting, /if \(key === 'upgrade_pro'\) \{[\s\S]*this\.openUpgradePage\(\)/)
assert.match(page, /closePage\(\) \{[\s\S]*wx\.navigateBack\(\)/)
assert.match(template, /class="upgrade-close[^"]*" bind:tap="closePage"/)
assert.match(styles, /\.upgrade-close\{[\s\S]*width: 92rpx;[\s\S]*height: 92rpx;/)
assert.match(styles, /@import '\/static_wxss\/skyother\.wxss';/)
assert(!styles.includes('skycommon.wxss'))

assert.match(template, /src="\/static\/logs\/blog\.png"/)
assert.match(template, /scroll-view[^>]*type="list"[^>]*associative-container="pop-gesture"/)
assert.match(template, /class="upgrade-primary"[^>]*bind:tap="getPro"/)
assert.match(template, /class="upgrade-secondary[^"]*"[^>]*bind:tap="closePage"/)
assert.match(page, /getPro\(\)[\s\S]*wx\.showModal\([\s\S]*i18n\.upgrade\.unavailable/)
assert.match(page, /createStoreBindings\(this,[\s\S]*i18n: \(state\) => messages\(state\.applicationSettings\?\.language\)/)
assert.match(page, /destroyStoreBindings\(\)/)
assert.doesNotMatch(template, /subtitle|description/)
for (const language of ['中文', 'English']) {
  const copy = messages(language).upgrade
  assert.strictEqual(copy.benefits.length, 6)
  assert(copy.title.includes('YuanAI Pro'))
  assert(copy.continueFree && copy.unavailable)
  assert.doesNotMatch(JSON.stringify(copy), /ChatGPT|\bPlus\b/)
}

async function verifyMembership() {
  const store = { user: { login: true, userId: 'account-a', subscription: 'pro' } }
  const requests = [], navigations = []
  const methods = setting.slice(setting.indexOf('  openUpgradePage()'), setting.indexOf('  async loadBillingUsage()'))
  const definition = vm.runInNewContext('({' + methods + '})', {
    store, SETTING_ROUTE_TYPE: 'setting', console: { warn() {} },
    fetchAccountSummary: () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
    wx: { navigateTo: value => { navigations.push(value); value.complete() } }
  })
  const settings = { ...definition, setUser(user) { store.user = user } }
  settings.openUpgradePage()
  assert.equal(navigations.length, 0, 'PRO cannot open upgrade from settings')
  store.user = { ...store.user, subscription: 'basic' }
  settings.openUpgradePage()
  assert.equal(navigations.length, 1, 'free members can upgrade')
  assert.match(fs.readFileSync('pages/setting/index.wxml', 'utf8'),
    /<block wx:if="\{\{item\.key !== 'upgrade_pro' \|\| user\.subscription !== 'pro'\}\}">/)
  assert.match(setting, /onShow\(\) \{[\s\S]*this\.refreshMembership\(\)/)

  let refresh = settings.refreshMembership()
  requests.at(-1).resolve({ login: true, userId: 'account-a', subscription: 'pro' })
  await refresh
  assert.equal(store.user.subscription, 'pro', 'external upgrade refreshes cached membership')
  refresh = settings.refreshMembership()
  requests.at(-1).resolve({ login: true, userId: 'account-a', subscription: 'basic' })
  await refresh
  assert.equal(store.user.subscription, 'basic', 'server expiry restores the free upgrade entry')

  const older = settings.refreshMembership(), oldRequest = requests.at(-1)
  const newer = settings.refreshMembership()
  requests.at(-1).resolve({ login: true, userId: 'account-a', subscription: 'pro' })
  await newer
  oldRequest.resolve({ login: true, userId: 'account-a', subscription: 'basic' })
  await older
  assert.equal(store.user.subscription, 'pro', 'a late response cannot overwrite newer membership')
  refresh = settings.refreshMembership()
  requests.at(-1).reject(new Error('offline'))
  await refresh
  assert.equal(store.user.subscription, 'pro', 'failed refresh preserves last confirmed membership')
  refresh = settings.refreshMembership()
  store.user = { login: true, userId: 'account-b', subscription: 'basic' }
  requests.at(-1).resolve({ login: true, userId: 'account-a', subscription: 'pro' })
  await refresh
  assert.equal(store.user.subscription, 'basic', 'account changes invalidate outstanding refreshes')
  refresh = settings.refreshMembership()
  settings._unloaded = true
  requests.at(-1).resolve({ login: true, userId: 'account-b', subscription: 'pro' })
  await refresh
  assert.equal(store.user.subscription, 'basic', 'unloaded settings cannot change membership')

  let upgrade, closes = 0, payments = 0
  vm.runInNewContext(page.replace(/^import .*$/mg, ''), {
    store, Page: value => { upgrade = value },
    require: name => name.includes('themeBinding') ? { syncThemeNavigation() {} } : { messages },
    wx: { navigateBack: () => { closes++ } },
    payBillingOrder: async () => { payments++; return { status: 'paid' } },
    initAppData: async () => {},
  })
  const screen = { ...upgrade, data: { purchasing: false } }
  store.user.subscription = 'pro'
  screen.onShow()
  await screen.getPro()
  assert.equal(closes, 2, 'an already subscribed member leaves the acquisition dialog')
  assert.equal(payments, 0, 'the acquisition dialog cannot accidentally bill an existing PRO')
}

verifyMembership().then(() => {
  console.log('upgradePage: membership refresh, expiry, stale responses and PRO navigation/payment guards passed')
}).catch(error => { console.error(error); process.exitCode = 1 })
