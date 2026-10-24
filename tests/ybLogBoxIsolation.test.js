const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')

const base = 'components/_self/yb-log-box'
const source = fs.readFileSync(`${base}/index.js`, 'utf8')
const template = fs.readFileSync(`${base}/index.wxml`, 'utf8')
const styles = fs.readFileSync(`${base}/index.wxss`, 'utf8')
const projectStyles = fs.readFileSync('static_wxss/skyother.wxss', 'utf8')
const config = JSON.parse(fs.readFileSync(`${base}/index.json`, 'utf8'))
const logo = fs.readFileSync('static/logs/glog.png')
const host = fs.readFileSync('components/_self/yb-chat-view/index.wxml', 'utf8')
const { t } = require('../static_utils/i18n/index')

assert.equal(config.styleIsolation, 'isolated')
assert.match(source, /wx\.getWindowInfo\(\)\.screenHeight/)
assert.match(source, /selectOwnerComponent\(\)[\s\S]*?keyHeight\.value/)
assert.doesNotMatch(source, /getApp/)
assert.match(source, /static_utils\/i18n\/behavior/)
assert.match(template, /temporaryMode/)
assert.match(template, /catch:tap="showTemporaryInfo"/)
assert.match(template, /src="\/static\/logs\/glog\.png"/)
assert.doesNotMatch(template, /_shared\/assets/)
assert.match(source, /workMode:\s*\{\s*type: Boolean,\s*value: false/)
assert.match(host, /work-mode="\{\{modeId == 'work'\}\}"/)
assert.doesNotMatch(host, /workWelcomeVisible/)
assert.match(template, /<text class="mr8\b[^\"]*">\{\{i18n.chat.work\}\}<\/text>/)
assert.match(template, /workMode \? i18n.chat.workReady : i18n.chat.ready/)
assert.equal(t('中文', 'chat.work'), 'Yuan Bot')
assert.equal(t('English', 'chat.work'), 'Yuan Bot')
assert.equal(t('中文', 'chat.workReady'), '专属于你的云端助理机器人')
assert.equal(t('English', 'chat.workReady'), 'Your personal cloud assistant bot')

assert.match(styles, /@import '\/static_wxss\/skyother\.wxss';/)
assert.doesNotMatch(styles, /_shared\/flex\.wxss/)

const expectedSharedStyles = {
  dc: 'display:flex;flex-direction:column;box-sizing:border-box;',
  dr: 'display:flex;flex-direction:row;box-sizing:border-box;',
  ac: 'align-items:center;',
  jc: 'justify-content:center;',
  tc: 'text-align:center;',
  mr8: 'margin-right:8rpx;',
  mt16: 'margin-top:16rpx;',
  mt24: 'margin-top:24rpx;',
  ft24: 'font-size:24rpx;'
}
const expectedLocalStyles = {}
assert.match(styles, /@import '\/static_wxss\/skycolor\.wxss';/)
assert.match(fs.readFileSync('static_wxss/skycolor.wxss', 'utf8'), /\.text-l1\s*\{\s*color:\s*var\(--text-l1\)/)

for (const [className, declarations] of Object.entries(expectedSharedStyles)) {
  const match = projectStyles.match(new RegExp(`\\.${className}\\s*\\{([^}]*)\\}`))
  assert.ok(match, `missing project .${className}`)
  assert.equal(match[1].replace(/\s/g, ''), declarations)
}
for (const [className, declarations] of Object.entries(expectedLocalStyles)) {
  const match = styles.match(new RegExp(`\\.${className}\\s*\\{([^}]*)\\}`))
  assert.ok(match, `missing .${className}`)
  assert.equal(match[1].replace(/\s/g, ''), declarations)
}

assert.equal(crypto.createHash('sha256').update(logo).digest('hex'), '4f861f03b3298d0c48ee06ad923897416e608c0ef93302c2c26db29db7a1df44')

console.log('yb-log-box isolation tests passed')
