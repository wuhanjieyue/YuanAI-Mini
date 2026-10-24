const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

const source = fs.readFileSync(require.resolve('../pages/setting/index.js'), 'utf8')
const methods = source.slice(source.indexOf('  async savePanel()'), source.indexOf('  // --- Personalization handlers ---'))
const markup = fs.readFileSync(require.resolve('../pages/setting/index.wxml'), 'utf8')
const styles = fs.readFileSync(require.resolve('../pages/setting/index.wxss'), 'utf8')
assert.match(markup, /icon-loading_flow_iconfont header-save-loading/)
assert.match(markup, /icon-check header-save-icon/)
assert.doesNotMatch(markup, /header-save-anchor/)
assert.match(markup, /class="header-action-btn dr ac jc glass-view" bind:tap="handleHeaderAction"/)
assert.match(source, /handleHeaderAction\(\)[\s\S]*this\.savePanel\(\)/)
assert.match(source, /applyAnimatedStyle\('\.header-action-btn'/)
assert.match(source, /paddingLeft: `\$\{padding\}px`/)
assert.match(source, /applyAnimatedStyle\('\.header-save-label-wrap'/)
assert.match(source, /applyAnimatedStyle\('\.header-action-icon-wrap'/)
assert.doesNotMatch(styles.match(/\.header-action-btn\s*\{[^}]*\}/)[0], /\b(?:width|height):/)

async function exercise(fail) {
  let settle
  const timers = []
  const toasts = []
  const page = vm.runInNewContext(`({${methods}})`, {
    SAVE_PANEL_KEYS: ['personalization', 'memory'],
    savePersonalization: () => new Promise((resolve, reject) => { settle = fail ? reject : resolve }),
    timing: value => value, Curves: { easeOutCubic: 1 },
    wx: { showToast: value => toasts.push(value) },
    setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length },
    clearTimeout: () => {}
  })
  page.data = { activePanel: 'personalization', panelConfigKey: 'personalization',
    saveButtonState: 'idle', personalizationDraft: { basicTone: 'test' }, i18n: { common: { saved: '已保存' } } }
  page._saveMorph = { value: 0 }
  page.setData = (values, callback) => { Object.assign(page.data, values); callback?.() }
  page.setPersonalization = draft => { page.saved = draft }
  page.closePanel = () => { throw Error('save must not close the panel') }

  const saving = page.savePanel()
  assert.equal(page.data.saveButtonState, 'saving')
  assert.equal(page._saveMorph.value, 1)
  await page.savePanel()
  assert.equal(page.data.saveButtonState, 'saving', 'repeated tap is ignored')
  settle(fail ? Error('offline') : undefined)
  await saving
  assert.equal(page.data.saveButtonState, fail ? 'idle' : 'done')
  assert.equal(timers.length, fail ? 0 : 1)
  if (!fail) assert.equal(timers[0].delay, 1500)
  assert.equal(!!page.saved, !fail)
  assert.equal(toasts.length, fail ? 0 : 1)
  if (fail) {
    assert.equal(page._saveMorph.value, 0)
    return
  }
  await page.savePanel()
  assert.equal(page.data.saveButtonState, 'done', 'check state is not clickable')
  timers[0].fn()
  assert.equal(page.data.saveButtonState, 'idle')
  assert.equal(page._saveMorph.value, 0)
}

async function exerciseClosedPanel() {
  let settle
  const page = vm.runInNewContext(`({${methods}})`, {
    SAVE_PANEL_KEYS: ['personalization', 'memory'],
    savePersonalization: () => new Promise(resolve => { settle = resolve }),
    timing: value => value, Curves: { easeOutCubic: 1 },
    wx: { showToast() {} }, setTimeout() { throw Error('closed panel must not schedule a timer') }, clearTimeout() {}
  })
  page.data = { activePanel: 'memory', panelConfigKey: 'memory', saveButtonState: 'idle',
    personalizationDraft: {}, i18n: { common: { saved: '已保存' } } }
  page._saveMorph = { value: 0 }
  page.setData = (values, callback) => { Object.assign(page.data, values); callback?.() }
  page.setPersonalization = () => {}
  const saving = page.savePanel()
  page._saveButtonToken = 1
  page.setData({ activePanel: 'personalization', panelConfigKey: 'personalization', saveButtonState: 'idle' })
  settle()
  await saving
  assert.equal(page.data.saveButtonState, 'idle', 'late response must not change a newly opened panel')
}

Promise.all([exercise(false), exercise(true), exerciseClosedPanel()]).then(() => console.log('settingSaveButton: ok'))
