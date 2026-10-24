const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { observable, reaction } = require('mobx-miniprogram')
const { getAccentTheme, POINT_COLOR_OPTIONS } = require('../static_utils/accentColor')

function loadComponent(file, requireModule = require) {
  let definition
  vm.runInNewContext(fs.readFileSync(require.resolve(file), 'utf8'), {
    Component: value => { definition = value }, require: requireModule,
    wx: { worklet: { shared: value => ({ value }) } }
  })
  return definition
}

const definition = loadComponent('../components/yb-dot-matrix-loading/index')
const dots = []
const ctx = { clearRect() { dots.length = 0 }, beginPath() {},
  arc(x, y, radius) { this.dot = { x, y, radius } },
  fill() { dots.push({ ...this.dot, color: this.fillStyle, alpha: this.globalAlpha }) } }
let scheduled = 0, cancelled
const loading = { ...definition.methods, data: { color: '', theme: 'light' },
  _running: true, _ctx: ctx, _width: 280, _height: 280, _phase: 0,
  schedule() { scheduled++ } }
for (const theme of ['light', 'dark']) {
  for (const { value } of POINT_COLOR_OPTIONS) {
    loading.data.color = getAccentTheme(value, theme).loadingColor
    loading.drawFrame(1000)
    assert.equal(dots.length, 400)
    assert.ok(dots.every(dot => dot.color === loading.data.color))
    assert.ok(dots.every(dot => dot.alpha >= 0.08 && dot.alpha <= 0.54))
    assert.equal(ctx.globalAlpha, 1, 'restore opacity after drawing')
  }
}
// At 1 second the focus reaches the old trajectory's 1.5-second position.
const t = 1.3 * 1.5
const cx = 280 * (0.5 + 0.22 * Math.sin(t * 0.42) + 0.1 * Math.sin(t * 0.93))
const cy = 280 * (0.52 + 0.26 * Math.cos(t * 0.31) + 0.12 * Math.sin(t * 0.71))
const focus = Math.max(0, 1 - Math.hypot(dots[210].x - cx, dots[210].y - cy) / (280 * 0.38))
assert.ok(Math.abs(dots[210].radius - (0.55 + focus * focus * (3 - 2 * focus) * 2.15)) < 1e-10)
loading._raf = 7
loading._canvas = { cancelAnimationFrame(id) { cancelled = id } }
definition.lifetimes.detached.call(loading)
const frames = scheduled
loading.drawFrame(2000)
assert.equal(cancelled, 7)
assert.equal(scheduled, frames, 'unmounted Canvas schedules no more frames')

const store = observable({ applicationSettings: { pointColor: '蓝色' }, effectiveTheme: 'light' })
const images = loadComponent('../mdPackage/components/generatedImages/index', name =>
  name === 'mobx-miniprogram' ? { reaction } : name === '../../../store/index' ? { store } :
    name === '../../../static_utils/accentColor' ? { getAccentTheme } : {})
const host = { data: {}, setData(patch) { Object.assign(this.data, patch) }, animateEntrance() {} }
images.lifetimes.attached.call(host)
assert.equal(host.data.loadingColor, '#3A83F7')
store.applicationSettings.pointColor = '绿色'
assert.equal(host.data.loadingColor, '#53B559')
store.applicationSettings.pointColor = '黑色'
store.effectiveTheme = 'dark'
assert.equal(host.data.loadingColor, '#E6E6E6')
images.lifetimes.detached.call(host)
store.applicationSettings.pointColor = '紫色'
assert.equal(host.data.loadingColor, '#E6E6E6', 'unmount releases the color subscription')
for (const [file, color] of [
  ['../mdPackage/components/generatedImages/index.wxml', 'loadingColor'],
  ['../pages/setting/index.wxml', 'accentLoadingColor'],
  ['../mdPackage/pages/filePreview/index.wxml', 'accentLoadingColor']
]) {
  assert.match(fs.readFileSync(require.resolve(file), 'utf8'),
    new RegExp(`<yb-dot-matrix-loading[^>]*color="\\{\\{${color}\\}\\}"`))
}
console.log('dotMatrixLoading: ok')
