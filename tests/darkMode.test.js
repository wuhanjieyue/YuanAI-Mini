const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const { createRequire } = require('node:module')
const { resolveTheme, getThemeStyle, THEME_VARIABLES, readSystemTheme } = require('../static_utils/theme')
const { getAccentTheme, POINT_COLOR_OPTIONS } = require('../static_utils/accentColor')

for (const system of ['light', 'dark']) {
  assert.equal(resolveTheme('系统', system), system)
  assert.equal(resolveTheme('浅色', system), 'light')
  assert.equal(resolveTheme('深色', system), 'dark')
}
assert.equal(resolveTheme('unknown', undefined), 'light')
global.wx = { getAppBaseInfo: () => ({ theme: 'dark' }) }
assert.equal(readSystemTheme(), 'dark')
global.wx = { getSystemInfoSync: () => ({ theme: 'light' }) }
assert.equal(readSystemTheme(), 'light')
global.wx = { getAppBaseInfo: () => { throw new Error('unavailable') } }
assert.equal(readSystemTheme(), 'light')
delete global.wx

const palette = fs.readFileSync(path.join(__dirname, '../static_wxss/skycolor.wxss'), 'utf8')
const values = Object.fromEntries([...palette.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2]]))
assert.equal(new Set(THEME_VARIABLES).size, THEME_VARIABLES.length)
for (const mode of ['light', 'dark']) {
  const style = getThemeStyle(mode)
  for (const key of THEME_VARIABLES) {
    const slot = `--palette-${mode}-${key.slice(2)}`
    assert.ok(values[slot], `missing ${slot}`)
    assert.ok(style.includes(`${key}:var(${slot})`))
  }
}
function luminance(hex) {
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
assert.ok(contrast(values['--palette-dark-text-l0'], values['--palette-dark-bg-l0']) >= 4.5)
for (const { value } of POINT_COLOR_OPTIONS) {
  const dark = getAccentTheme(value, 'dark')
  assert.ok(contrast(dark.softText, dark.softColor) >= 4.5, `${value}: dark bubble`)
  assert.ok(contrast(dark.chatText, dark.chatColor) >= 4.5, `${value}: dark chat button`)
}

// Exercise the real MobX store and binding, including lifecycle disposal and late settings restore.
const storePath = path.resolve(__dirname, '../store/index.js')
const stored = { applicationSettings: { appearance: '浅色', pointColor: '默认', language: '中文' } }
const wxMock = {
  getStorageSync: key => stored[key],
  setStorageSync: (key, value) => { stored[key] = value },
  setNavigationBarColor: value => navigation.push(value)
}
const storeContext = { require: createRequire(storePath), module: { exports: {} }, wx: wxMock }
let storeSource = fs.readFileSync(storePath, 'utf8')
  .replace(/import \{ observable, action \} from 'mobx-miniprogram'/, "const { observable, action } = require('mobx-miniprogram')")
  .replace(/export const /g, 'const ')
vm.runInNewContext(storeSource + '\nmodule.exports = store', storeContext)
const store = storeContext.module.exports
const navigation = []
const page = { data: {}, setData(update) { Object.assign(this.data, update) } }
let pages = [page]
const bindingPath = path.resolve(__dirname, '../static_utils/themeBinding.js')
const bindingContext = {
  module: { exports: {} }, wx: wxMock, getCurrentPages: () => pages,
  require: name => name === '../store/index' ? { store } : createRequire(bindingPath)(name)
}
vm.runInNewContext(fs.readFileSync(bindingPath, 'utf8'), bindingContext)
const { bindPageTheme, unbindPageTheme, syncThemeNavigation } = bindingContext.module.exports
bindPageTheme(page)
assert.equal(page.data.effectiveTheme, 'light')
store.setSystemTheme('dark')
assert.equal(page.data.effectiveTheme, 'light', 'manual light wins over a dark system')
store.setApplicationSettings({ ...store.applicationSettings, appearance: '系统' })
assert.equal(page.data.effectiveTheme, 'dark')
assert.equal(navigation.at(-1).frontColor, '#ffffff')
store.setApplicationSettings({ ...store.applicationSettings, appearance: '深色' })
store.setSystemTheme('light')
assert.equal(page.data.effectiveTheme, 'dark')
store.setApplicationSettings({ ...store.applicationSettings, appearance: '浅色' })
assert.equal(page.data.effectiveTheme, 'light', 'late remote settings also update the page')
store.setApplicationSettings({ ...store.applicationSettings, pointColor: '蓝色' })
assert.ok(page.data.accentStyle.includes('--accent-action-bg:#3A83F7'))
assert.equal(page.data.accentLoadingColor, '#3A83F7')
pages = [page, {}]
const navigationCount = navigation.length
store.setApplicationSettings({ ...store.applicationSettings, appearance: '深色' })
assert.equal(page.data.effectiveTheme, 'dark', 'background pages still update')
assert.equal(navigation.length, navigationCount, 'background pages must not change foreground navigation')
pages = [page]
syncThemeNavigation(page)
assert.equal(navigation.at(-1).frontColor, '#ffffff')
unbindPageTheme(page)
store.setApplicationSettings({ ...store.applicationSettings, appearance: '浅色' })
assert.equal(page.data.effectiveTheme, 'dark', 'unloaded pages stop receiving updates')
const native = require('../theme.json')
assert.equal(native.dark.pageBackground, '#171717')
assert.equal(native.light.pageBackground, '#F8F7F5')

const app = require('../app.json')
assert.equal(app.darkmode, true)
assert.equal(app.themeLocation, 'theme.json')
const pluginSheetTemplate = fs.readFileSync(path.resolve(__dirname, '../pages/filePage/index.wxml'), 'utf8')
const pluginSheetStyle = fs.readFileSync(path.resolve(__dirname, '../pages/filePage/index.wxss'), 'utf8')
assert.match(pluginSheetTemplate, /^<page-meta\b[^>]*root-background-color="#ffffff00"/)
assert.doesNotMatch(pluginSheetTemplate.match(/^<page-meta\b[^>]*>/)[0], /\sbackground-color=/, 'transparent plugin route must not paint an opaque native background')
assert.match(pluginSheetStyle, /page\s*\{\s*background-color:\s*transparent;/, 'transparent plugin route must clear the Skyline page surface')
for (const route of ['pages/leftpage', 'pages/sourcesPage', 'pages/reasoningPage', 'mdPackage/pages/filePreview']) {
  const template = fs.readFileSync(path.resolve(__dirname, '..', route, 'index.wxml'), 'utf8')
  assert.match(template, /^<page-meta\b[^>]*root-background-color="#ffffff00"/, `${route}: native transparent backgrounds require a hex color`)
}
for (const route of [...app.pages, ...app.subPackages.flatMap(s => s.pages.map(p => `${s.root}/${p}`))]) {
  const template = fs.readFileSync(path.resolve(__dirname, '..', route + '.wxml'), 'utf8')
  assert.match(template, /^<page-meta\b/)
  assert.match(template.slice(template.indexOf('\n')), /style="{{themeStyle}}/, `${route}: explicit root variables`)
}
for (const file of ['towxml.wxml', 'decode.wxml', 'batch/batch.wxml']) {
  const template = fs.readFileSync(path.resolve(__dirname, '../mdPackage/components/towxmlstream', file), 'utf8')
  for (const tag of template.match(/<(?:decode|batch|latex|yuml|echarts)\b[^>]*>/g) || []) {
    assert.ok(tag.includes('theme="{{theme}}"'), `${file}: every recursive renderer receives the live theme`)
  }
}
console.log('darkMode: ok')

// Canvas colors respond to the input theme without adding another animation loop.
let gaugeDefinition
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../components/yb-gauge-trigger/index.js'), 'utf8'), {
  Component: definition => { gaugeDefinition = definition }, wx: { worklet: {} }
})
let redrawProgress
const gauge = { _displayProgress: 0.6, drawRing: value => { redrawProgress = value } }
gaugeDefinition.properties.theme.observer.call(gauge)
assert.equal(redrawProgress, 0.6)

// Re-theme a chart using raw options, preserving interaction state but dropping old theme defaults.
let chartDefinition, disposed = false, selectedTheme, appliedOption
const chartMock = {
  getOption: () => ({ backgroundColor: '#ffffff', dataZoom: [{ start: 20, end: 80 }], legend: [{ selected: { A: false } }] }),
  getWidth: () => 320, getHeight: () => 240,
  dispose: () => { disposed = true }
}
const chartSource = fs.readFileSync(path.resolve(__dirname, '../mdPackage/components/towxmlstream/echarts/echarts.js'), 'utf8')
  .replace(/^import .+;$/gm, '')
vm.runInNewContext(chartSource, {
  Component: definition => { chartDefinition = definition }, require: () => ({}),
  echarts: { registerTheme() {}, init: (_, theme) => { selectedTheme = theme; return { setOption: option => { appliedOption = option } } } }
})
chartDefinition.properties.theme.observer.call({
  chart: chartMock, _wxCanvas: { setChart() {} }, data: { theme: 'dark' },
  _themeOption: { series: [{ data: [1, 2, 3] }], legend: { top: 10 }, dataZoom: { type: 'inside' } }
})
assert.equal(disposed, true)
assert.equal(selectedTheme, 'dark')
assert.equal(appliedOption.backgroundColor, undefined)
assert.equal(appliedOption.legend[0].top, 10)
assert.equal(appliedOption.legend[0].selected.A, false)
assert.equal(appliedOption.dataZoom[0].start, 20)
assert.equal(appliedOption.series[0].data[2], 3)
console.log('darkMode Canvas: ok')
const flyoutTemplate = fs.readFileSync(path.resolve(__dirname, '../components/yb-flyout/index.wxml'), 'utf8')
assert.match(flyoutTemplate, /style="{{themeStyle}};{{maskStyle}}"/)
const inputStyle = fs.readFileSync(path.resolve(__dirname, '../components/_self/yb-chat-input/index.wxss'), 'utf8')
assert.match(inputStyle, /\.input-icon-inverse\s*\{\s*color:\s*var\(--accent-action-text/)
assert.match(fs.readFileSync('components/_self/yb-chat-input/index.wxml', 'utf8'), /placeholder-class="text-l1"/)
for (const item of navigation) {
  assert.equal(item.backgroundColor, native[item.frontColor === '#ffffff' ? 'dark' : 'light'].pageBackground)
}

// The settings sheet must not expose or snapshot its unthemed first frame.
const settingTemplate = fs.readFileSync(path.resolve(__dirname, '../pages/setting/index.wxml'), 'utf8')
assert.match(settingTemplate, /<view class="sheet" style="\{\{themeStyle\}\};visibility:\{\{themeStyle \? 'visible' : 'hidden'\}\}"/)
const settingRoute = fs.readFileSync(path.resolve(__dirname, '../static_router/settingRouter.js'), 'utf8')
assert.match(settingRoute, /allowEnterRouteSnapshotting: false/)
