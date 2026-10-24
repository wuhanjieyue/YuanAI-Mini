const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const componentDir = path.join(__dirname, '../components/_self/yb-left-center')
const projectRoot = path.join(__dirname, '..')
const json = JSON.parse(fs.readFileSync(path.join(componentDir, 'index.json'), 'utf8'))
const js = fs.readFileSync(path.join(componentDir, 'index.js'), 'utf8')
const debounceSource = fs.readFileSync(path.join(projectRoot, 'static_utils/debounce.js'), 'utf8')
const wxml = fs.readFileSync(path.join(componentDir, 'index.wxml'), 'utf8')
const wxss = fs.readFileSync(path.join(componentDir, 'index.wxss'), 'utf8')
const iconfont = fs.readFileSync(path.join(projectRoot, 'static_wxss/skyfontline.wxss'), 'utf8')
const flex = fs.readFileSync(path.join(projectRoot, 'static_wxss/skyother.wxss'), 'utf8')

assert.equal(json.styleIsolation, 'isolated')
assert.match(js, /import debounce from '\.\.\/\.\.\/\.\.\/static_utils\/debounce'/)
assert.doesNotMatch(js, /_shared\/utils/)
assert.match(js, /const menuRect = wx\.getMenuButtonBoundingClientRect\(\)/)
assert.doesNotMatch(js, /\bgetApp\(\)|globalData\.su_menu|appName:/)
assert.match(wxml, /wx:if="\{\{loadingMoreConversations\}\}" class="loading-row\b[^\"]*"[\s\S]*\[68, 44\][\s\S]*conversation-item mlr16 dc jc conversation-skeleton-item/)
assert.match(wxml, /wx:if="\{\{searchLoading\}\}" class="conversation-list-skeleton\b[^\"]*"[\s\S]*\[34, 68, 52, 76, 44\]/)
assert.match(wxml, /wx:if="\{\{initialLoadingConversations\}\}" class="conversation-list-skeleton\b[^\"]*"[\s\S]*\[34, 68, 52, 76, 44\]/)
assert.equal((wxml.match(/class="conversation-item\b[^\"]*mlr16\b[^\"]*dc\b[^\"]*jc\b[^\"]*conversation-skeleton-item\b[^\"]*"/g) || []).length, 3)
assert.equal((wxml.match(/class="conversation-title-row\b[^\"]*dr\b[^\"]*ac\b[^\"]*"/g) || []).length, 5)
assert.match(wxml, /!searchLoading && !initialLoadingConversations/)
assert.doesNotMatch(wxml, /appStaticRoot|loading(?:-dark)?\.svg|loading-rotate/)
assert.doesNotMatch(js, /appStaticRoot/)
assert.match(wxml, /src="\/static\/logs\/glog\.png"/)
assert.doesNotMatch(wxml, /_shared\/assets/)
assert.equal((wxml.match(/class="iconfont\b[^\"]*icon-loading_flow_iconfont\b[^\"]*conversation-generating-icon\b[^\"]*text-l1\b[^\"]*"/g) || []).length, 2)
assert.equal((wxml.match(/wx:elif="\{\{unreadConversations\[item.conversationId\]\}\}"/g) || []).length, 2)
assert.match(js, /unreadConversations: 'unreadConversations'/)
assert.doesNotMatch(wxml, /i18n\.chat\.generating/)
assert.ok(fs.statSync(path.join(projectRoot, 'static/images/loading.svg')).size > 0)
assert.ok(fs.statSync(path.join(projectRoot, 'static/logs/glog.png')).size > 0)

assert.match(wxss, /@import '\/static_wxss\/skyfontline\.wxss';/)
assert.match(wxss, /@import '\/static_wxss\/skyother\.wxss';/)
assert.doesNotMatch(wxss, /at\.alicdn\.com|_shared/)
for (const [selector, glyph] of Object.entries({
  'icon-plugin': 'e7a8',
  'icon-time_line': 'e7a2',
  'icon-folde': 'e778',
  'icon-study': 'e793',
  'icon-x': 'e78f',
  'icon-image-create': 'e790',
  'icon-setting': 'e786',
  'icon-arrow-right': 'e77b',
  'icon-search': 'e77f'
})) {
  assert.match(wxss, new RegExp(`\\.${selector}::?before \\{ content: "\\\\${glyph}"; \\}`))
}
for (const selector of [
  'bg-gray', 'bg-l0', 'bg-l1', 'text-l0', 'text-l1', 'loading-row'
]) {
  assert.match(wxss + flex + fs.readFileSync(path.join(projectRoot, 'static_wxss/skycolor.wxss'), 'utf8'), new RegExp(`\\.${selector.replace('_', '\\_')}(?=[:\\s{])`))
}
for (const selector of [
  'mradius', 'xlradius', 'cradius', 'mlr16', 'mb24',
  'mtb24', 'mlr24', 'mt32', 'ml36', 'plr24', 'plr36', 'ft52', 'ft40',
  'ft36', 'ft32', 'wt6', 'wt9', 'glass-view', 'bl-01', 'jb'
]) {
  assert.match(flex, new RegExp(`\\.${selector}(?=[:\\s{])`))
  assert.doesNotMatch(wxss, new RegExp(`\\.${selector}\\s*\\{`))
}
for (const selector of ['dr', 'dc', 'ac', 'jc']) {
  assert.match(flex, new RegExp(`\\.${selector}(?=[:\\s{])`))
}

assert.match(iconfont, /font-family:\s*"iconfont"\s*!important/)
assert.match(iconfont, /\.icon-refresh:before\s*{\s*content:\s*"\\e76f";/)
assert.match(iconfont, /@font-face|data:font/)
assert.doesNotMatch(iconfont, /https?:|at\.alicdn\.com/)
assert.match(wxss, /\.conversation-title\s*{[^}]*flex:\s*1;[^}]*min-width:\s*0;/s)
assert.match(wxss, /\.conversation-generating-icon\s*{[^}]*flex-shrink:\s*0;[^}]*animation:\s*loadingRotate 1\.5s linear infinite;/s)
assert.match(wxss, /\.conversation-skeleton-item\s*{[^}]*min-height:\s*80rpx;/s)
assert.match(wxss, /\.conversation-skeleton-text\s*{[^}]*height:\s*30rpx;/s)
assert.doesNotMatch(wxss, /conversation-loading-mask|conversation-more-skeleton/)

let nextTimerId = 0
const timers = new Map()
const debounceSandbox = {
  module: { exports: {} },
  setTimeout: (callback) => {
    const id = ++nextTimerId
    timers.set(id, () => {
      timers.delete(id)
      callback()
    })
    return id
  },
  clearTimeout: (id) => timers.delete(id)
}
vm.runInNewContext(
  debounceSource.replace('export default debounce', 'module.exports = debounce'),
  debounceSandbox
)
const values = []
const debounced = debounceSandbox.module.exports((value) => values.push(value), 100)
debounced('first')
debounced('latest')
assert.equal(timers.size, 1)
timers.values().next().value()
assert.deepEqual(values, ['latest'])
debounced('cancelled')
debounced.cancel()
assert.equal(timers.size, 0)

console.log('yb-left-center isolation tests passed')
