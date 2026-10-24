const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const template = fs.readFileSync(require.resolve('../components/_self/yb-library-view/index.wxml'), 'utf8')
const preview = fs.readFileSync(require.resolve('../components/_self/yb-asset-actions/index.wxml'), 'utf8')
const sharedStyles = fs.readFileSync(require.resolve('../static_wxss/asset-cards.wxss'), 'utf8')
assert.match(template, /view-mode="\{\{viewMode\}\}"/)
assert.match(template, /class="iconfont \{\{viewMode === 'list' \? 'icon-list_check_line' : 'icon-menus'\}\} floating-search-clear-icon"/)
for (const match of template.matchAll(/data-id="(grid|list|uploaded|generated)"[^>]*>([\s\S]*?)<\/view>/g)) {
  assert.ok(match[2].indexOf('icon-check') > match[2].indexOf('library-menu-label'), `${match[1]} check belongs after the label`)
}
for (const name of ['row', 'icon', 'copy', 'title', 'description']) {
  assert.ok(template.includes(`asset-list-${name}`) && preview.includes(`asset-list-${name}`), 'lifted rows reuse the original geometry')
  assert.ok(sharedStyles.includes(`.asset-list-${name}`))
}
for (const name of ['title', 'description']) {
  const text = template.match(new RegExp(`<text class="asset-list-${name}[^>]*>[^<]*<\\/text>`))[0]
  assert.ok(preview.includes(text), 'lifted names, metadata, font and truncation match the list')
}
assert.match(preview, /viewMode === 'list' \? 'asset-list-row dr ac' : 'asset-card'/)
assert.match(sharedStyles, /\.asset-list-row\s*\{[^}]*box-sizing: border-box/)
let definition, fetchOptions, closed = 0, loads = 0
const callbacks = []
vm.runInNewContext(fs.readFileSync(require.resolve('../components/_self/yb-library-view/index.js'), 'utf8').replace(/^import .*$/gm, ''), {
  Component: value => { definition = value },
  require: name => name.endsWith('i18n/index') ? require('../static_utils/i18n') : {},
  listStorageFiles: async options => { fetchOptions = options; return { files: [] } },
  setTimeout,
  wx: { hideKeyboard() {}, worklet: { Easing: { ease: 'ease' }, timing: (value, options, done) => { if (done) callbacks.push(done); return value }, spring: value => value, runOnJS: fn => fn } }
})
const view = {
  ...definition.methods, properties: { conversationFiles: [], conversationScope: false }, data: { ...definition.data },
  _keyboardOffset: { value: 0 }, _searchCloseKeyboardHeight: { value: 0 },
  _sourceProgress: { value: 0 }, _sourceScale: { value: 0 }, _filterInset: { value: 0 },
  _searchAssets: { cancel() {} }, events: [],
  setData(patch, done) { Object.assign(this.data, patch); done?.() },
  triggerEvent(name, detail) { this.events.push({ name, detail }) },
  selectComponent: () => ({ open: async () => true, close() { closed++ } }),
  loadAssetPage() { loads++ }, mergeAssetImageState: items => items, ensureAssetImages() {}
}
const event = id => ({ currentTarget: { dataset: { id } } })
;(async () => {
  await view.openFilterMenu()
  assert.equal(view.data.actionsOpen, true)
  view.toggleSourceMenu()
  assert.equal(view.data.sourceMenuOpen, true)
  assert.equal(view._sourceProgress.value, 1)
  view.handleFilterMask()
  assert.equal(closed, 0, 'first mask tap collapses only the source layer')
  assert.equal(view.data.sourceMenuOpen, true, 'keep the glass card until reverse animation finishes')
  view.handleFilterMask()
  assert.equal(closed, 1, 'a second mask tap during collapse closes the flyout instead of reopening the source layer')
  callbacks.at(-1)(true)
  assert.equal(view.data.sourceMenuOpen, false)
  view.toggleSourceMenu(); view.toggleSourceMenu()
  const stale = callbacks.at(-1)
  view.toggleSourceMenu(); stale(true)
  assert.equal(view.data.sourceMenuOpen, true, 'late close cannot collapse a reopened layer')
  view.filterMenuClosed()
  assert.equal(view.data.actionsOpen, false)
  view.data.query = 'cat'
  view.data.activeCategory = 'favorites'
  view.selectOrigin(event('generated'))
  assert.equal(view.data.origin, 'generated')
  assert.equal(loads, 1)
  assert.equal(view.data.query, 'cat')
  assert.equal(view.data.activeCategory, 'favorites')
  await view.fetchAssetPage({ cursor: 'next' })
  assert.equal(fetchOptions.origin, 'generated')
  assert.equal(fetchOptions.cursor, 'next')
  view.selectViewMode(event('list'))
  assert.equal(view.data.viewMode, 'list')
  assert.equal(loads, 1, 'presentation changes preserve pages and do not query again')
  view.selectOrigin(event('generated'))
  assert.equal(view.data.origin, '', 'selecting the checked origin restores all files')
  view.selectOrigin(event('invalid')); view.selectViewMode(event('invalid'))
  assert.equal(loads, 2)
  view.properties.conversationFiles = [
    { id:'upload', attachmentType:'image', name:'cat.png', origin:'uploaded' },
    { id:'generated', attachmentType:'image', name:'poster.png', tags:['cat'], origin:'generated' },
    { id:'doc', attachmentType:'file', name:'cat.pdf', origin:'generated' }
  ]
  view.data.activeCategory = 'image'; view.data.origin = 'generated'
  view.loadScopedAssets()
  assert.deepEqual(Array.from(view.data.items, item => item.id), ['generated'])
  view.data.activeCategory = 'document'; view.loadScopedAssets()
  assert.deepEqual(Array.from(view.data.items, item => item.id), ['doc'])
  view.filterMenuClosed()
  let opens = 0
  view.selectComponent = () => ({ open: async () => { opens++; throw Error('layout unavailable') }, close() {} })
  await view.openFilterMenu()
  assert.equal(view.data.actionsOpen, false, 'failed measurement restores the trigger and gesture lock')
  assert.equal(opens, 1)
  view._keyboardOffset.value = 300
  const pendingOpen = view.openFilterMenu()
  view.closeFilterMenu()
  await pendingOpen
  assert.equal(opens, 1, 'page hide cancels an opening menu that is waiting for keyboard dismissal')
  console.log('libraryFilters: nested menu, reverse/stale animation, origin query, scoped search and presentation passed')
})().catch(error => { console.error(error); process.exitCode = 1 })
