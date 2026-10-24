const assert = require('assert')
const fs = require('fs')
const vm = require('vm')
let sensor, reaction, starts = 0, stops = 0, navigations = 0, lastNavigation
const store = { shakeToReport: true, applicationSettings: { language: '中文' } }
let pages = [{ route: 'pages/index/index' }]
const wx = {
  onAccelerometerChange: fn => { sensor = fn }, offAccelerometerChange: () => { sensor = null },
  startAccelerometer: () => starts++, stopAccelerometer: () => stops++,
  navigateTo: options => { navigations++; lastNavigation = options; options.complete() }, showToast() {}
}
const context = { wx, Number, Math, Date, getCurrentPages: () => pages, upRouterBuilder() {}, settingRouterBuilder() {}, SETTING_ROUTE_TYPE:'settingRouterBuilder',
  require: name => name.includes('store') ? { store } : name.includes('mobx') ? { reaction: (read, fn) => { reaction = fn; return () => {} } } : { messages: () => ({ common: {} }) } }
vm.createContext(context)
vm.runInContext(fs.readFileSync('static_utils/errorReporting.js', 'utf8').replace(/^import .*\n/gm, '').replace(/export function /g, 'function '), context)
let detect = context.createShakeDetector()
for (let n = 0; n < 100; n++) assert.equal(detect({ x: Math.sin(n) * .2, y: 0, z: 1 }, n * 100), false)
detect = context.createShakeDetector()
assert.equal(detect({ x: 0, y: 0, z: 1 }, 1000), false)
assert.equal(detect({ x: 3, y: 0, z: 1 }, 1100), false)
assert.equal(detect({ x: -3, y: 0, z: 1 }, 1200), false)
assert.equal(detect({ x: 3, y: 0, z: 1 }, 1300), false)
assert.equal(detect({ x: -3, y: 0, z: 1 }, 1400), true)
for (let n = 0; n < 20; n++) assert.equal(detect({ x: n % 2 ? 3 : -3, y: 0, z: 1 }, 1500 + n * 100), false)
detect = context.createShakeDetector()
let triggers = 0
for (let n = 0; n < 100; n++) {
  if (detect({x: 4 * Math.sin(n * .02 * Math.PI * 6), y: 0, z: 1}, 1000 + n * 20)) triggers++
}
assert.equal(triggers, 1, '20ms sensor events detect sustained strong shakes once')
context.setReportForeground(true); context.setReportForeground(true)
assert.equal(starts, 1)
store.shakeToReport = false; reaction(); assert.equal(stops, 1); assert.equal(sensor, null)
store.shakeToReport = true; reaction(); assert.equal(starts, 2)
context.setReportForeground(false); assert.equal(stops, 2)
context.openErrorReport(); assert.equal(navigations, 1)
assert.equal(lastNavigation.routeType, 'settingRouterBuilder'); assert.equal(lastNavigation.routeOptions.stacked, true)
pages.push({route:'pages/reportError/index'}); context.openErrorReport(); assert.equal(navigations, 1)

let definition, sends = [], toast = 0, close = 0, rejectSend, resolveSend
vm.runInNewContext(fs.readFileSync('pages/reportError/index.js', 'utf8'), {
  require: name => name.includes('settingRouter') ? { getSettingSheetMetrics:()=>({sheetHeight:700}) } : name.includes('themeBinding') ? { bindPageTheme(){}, unbindPageTheme(){}, syncThemeNavigation(){} } :
    name.includes('store') ? {store} : name.includes('i18n') ? {messages:()=>({common:{sent:'sent'},report:{failed:'failed'}}),t:()=>''} :
    {submitErrorReport: report => {sends.push(report);return new Promise((resolve,reject)=>{rejectSend=reject;resolveSend=resolve})}},
  Page: value => {definition=value}, wx: {getDeviceInfo:()=>({}),getAppBaseInfo:()=>({}),getAccountInfoSync:()=>({miniProgram:{}}),getWindowInfo:()=>({screenHeight:800}),worklet:{runOnJS:fn=>fn},showToast:()=>toast++,navigateBack:()=>close++}, Date, Math
})
const page = {...definition, data:{...definition.data, i18n:{common:{sent:'sent'},report:{failed:'failed'}}},setData(patch){Object.assign(this.data,patch)}}
;(async()=>{
 let measuredHeight = 320, measurement
 page.createSelectorQuery = () => ({select(){return this}, boundingClientRect(fn){measurement=fn;return this}, exec(){measurement({height:measuredHeight})}})
 page.data.prompt = true; page.fitPromptHeight(); assert.equal(page.data.sheetHeight,324)
 measuredHeight=900; page.fitPromptHeight(); assert.equal(page.data.sheetHeight,680)
 page.data.prompt=false; measurement({height:200}); assert.equal(page.data.sheetHeight,680)
 page.onLoad({route:'pages%2Fsetting%2Findex'}); assert.equal(page._context.route,'pages/setting/index')
 page.onLoad({route:'pages/index?token=secret'}); assert.equal(page._context.route,'')
 page.handleInput({detail:{value:'   '}}); await page.handleSend(); assert.equal(sends.length,0)
 page.handleInput({detail:{value:'broken'}}); page._requestId='report_1234567890'; page._context={}
 const pending=page.handleSend(); await page.handleSend(); assert.equal(sends.length,1)
 rejectSend(new Error('network')); await pending
 assert.equal(page.data.content,'broken');assert.equal(page.data.sending,false);assert.equal(toast,0);assert.equal(close,0)
 page.handleInput({detail:{value:'changed'}}); assert.equal(page.data.content,'broken')
 const retry=page.handleSend(); assert.strictEqual(sends[1],sends[0]);rejectSend(new Error('offline'));await retry
 const success=page.handleSend(); resolveSend({reportId:'report_ok'}); await success
 assert.equal(toast,1); assert.equal(close,1)
 assert(!fs.readFileSync('pages/reportError/index.wxml','utf8').includes('toggleScreenshot'))
 console.log('errorReports: shake thresholds, cooldown, lifecycle, navigation and failed submission retry passed')
})().catch(error=>{console.error(error);process.exitCode=1})
