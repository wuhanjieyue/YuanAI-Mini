const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.join(__dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function loadComponent(relativePath) {
  let definition
  const absolutePath = path.join(root, relativePath)
  const source = read(relativePath).replace(/^import .*$/gm, '')
  vm.runInNewContext(source, {
    require: (request) => require(path.resolve(path.dirname(absolutePath), request)),
    rpx2px: (rpx, screenWidth) => Math.floor((screenWidth / 750) * Number(rpx)),
    appStaticRoot: 'https://assets.example.test/app_static',
    wx: {
      getWindowInfo: () => ({ screenWidth: 375 }),
      worklet: {
        shared: (value) => ({ value }),
        timing: (value, options) => ({ value, options })
      }
    },
    Component: (value) => { definition = value }
  })
  return definition
}

for (const [name, base] of [
  ['yb-file-list', 'components/yb-file-list']
]) {
  const source = read(`${base}/index.js`)
  const config = JSON.parse(read(`${base}/index.json`))
  const template = read(`${base}/index.wxml`)
  const styles = read(`${base}/index.wxss`)

  assert.equal(config.styleIsolation, 'isolated')
  assert.doesNotMatch(source, /selectOwnerComponent|getApp|static_utils/)
  assert.match(source, /triggerEvent\('heightchange'/)
  assert.doesNotMatch(template, /\/static\//)
  assert.match(styles, /@import ['"](?:\.\.\/)+_shared\/iconfont\.wxss['"];/)
}

const funBase = 'components/_self/yb-fun-list'
const funSource = read(`${funBase}/index.js`)
const funConfig = JSON.parse(read(`${funBase}/index.json`))
const funTemplate = read(`${funBase}/index.wxml`)
const funStyles = read(`${funBase}/index.wxss`)
assert.equal(funConfig.styleIsolation, 'isolated')
assert.doesNotMatch(funSource, /selectOwnerComponent|getApp/)
assert.match(funSource, /static_utils\/otherUtils/)
assert.match(funSource, /triggerEvent\('heightchange'/)
assert.doesNotMatch(funTemplate, /\/static\//)
assert.match(funStyles, /@import ['"]\/static_wxss\/skyfontline\.wxss['"];/)

const sharedIconfont = read('components/_shared/iconfont.wxss')
assert.match(sharedIconfont, /font-family:\s*"iconfont"\s*!important/)
assert.doesNotMatch(sharedIconfont, /@font-face|data:font|https?:/)

const fileDefinition = loadComponent('components/yb-file-list/index.js')
const fileEvents = []
const fileContext = {
  fileHeight: { value: 0 },
  setHeight: fileDefinition.methods.setHeight,
  triggerEvent: (name, detail) => fileEvents.push({ name, detail: { ...detail } })
}
fileDefinition.methods.showFun.call(fileContext)
assert.equal(fileContext.fileHeight.value.value, 96)
assert.deepEqual(fileEvents, [{ name: 'heightchange', detail: { height: 96, duration: 160 } }])

const funDefinition = loadComponent('components/_self/yb-fun-list/index.js')
const skillCatalog = JSON.parse(read('tests/fixtures/backend-contracts/feature_logos.json'))
for (const [feature,id] of Object.entries({thinking:'deep_research',searching:'web_search',imging:'image_generation',studying:'study'})) {
  const logo = skillCatalog.find(item => item.id === id).logoUrl.split('/skills/')[1]
  assert.equal(funDefinition.data.featureLogos[feature], `https://assets.example.test/app_static/skills/${logo}`)
  assert.ok(funTemplate.includes(`src="{{featureLogos.${feature}}}"`))
}
assert.doesNotMatch(funTemplate,/feature-icon|icon-deep-thinking|icon-web-search|icon-image-create|icon-agent/)
const skillLabelContext={data:{},setData(patch){Object.assign(this.data,patch)}}
const bilingualSkill={title:'文案创作',titleEn:'Copywriter'}
funDefinition.observers['skill, language'].call(skillLabelContext,bilingualSkill,'English')
assert.equal(skillLabelContext.data.skillTitle,'Copywriter')
funDefinition.observers['skill, language'].call(skillLabelContext,bilingualSkill,'中文')
assert.equal(skillLabelContext.data.skillTitle,'文案创作')
const funEvents = []
const funContext = {
  data: { thinking: true, searching: false, imging: false, studying: false },
  funHeight: { value: 0 },
  expandedHeight: 46,
  setHeight: funDefinition.methods.setHeight,
  triggerEvent: (name, detail) => funEvents.push({ name, detail: { ...detail } })
}
funDefinition.methods.reshowFun.call(funContext)
assert.equal(funContext.funHeight.value.value, 46)
assert.deepEqual(funEvents, [{ name: 'heightchange', detail: { height: 46, duration: 160 } }])

const chatTemplate = read('components/_self/yb-chat-view/index.wxml')
const chatSource = read('components/_self/yb-chat-view/index.js')
assert.doesNotMatch(chatSource, /getApp\(|appInit/)
assert.match(chatSource, /static_utils\/otherUtils/)
assert.match(chatSource, /static_utils\/haptic/)
assert.doesNotMatch(chatSource, /_shared\/utils/)
assert.match(chatTemplate, /<yb-fun-list[^>]+bind:heightchange="changeFunHeight"/)
assert.match(chatTemplate, /<yb-file-list[^>]+bind:heightchange="changeFileHeight"/)
assert.match(chatSource, /changeFunHeight\(e\)[\s\S]*?this\.funHeight\.value = timing\(e\.detail\.height,\{duration:e\.detail\.duration\}\)/)
assert.match(chatSource, /changeFileHeight\(e\)[\s\S]*?this\.fileHeight\.value = timing\(e\.detail\.height,\{duration:e\.detail\.duration\}\)/)

const sendAllFile = chatSource.slice(chatSource.indexOf('sendAllFile(){'), chatSource.indexOf('fIconAn(', chatSource.indexOf('sendAllFile(){')))
assert.match(sendAllFile, /selectComponent\('#fileList'\)/)
assert.doesNotMatch(sendAllFile, /this\.fileHeight\.value/)

const inputBase = 'components/_self/yb-chat-input'
const inputSource = read(`${inputBase}/index.js`)
const inputConfig = JSON.parse(read(`${inputBase}/index.json`))
const inputTemplate = read(`${inputBase}/index.wxml`)
assert.equal(inputConfig.styleIsolation, 'isolated')
assert.doesNotMatch(inputSource, /getApp\(/)
assert.match(inputSource, /static_utils\/otherUtils/)
assert.match(inputSource, /static_utils\/haptic/)
assert.doesNotMatch(inputSource, /_shared\/utils/)
assert.match(inputSource, /selectOwnerComponent\(\)/)
assert.match(read(`${inputBase}/index.wxss`), /@import ['"]\/static_wxss\/skyother\.wxss['"];/)
assert.match(read(`${inputBase}/index.wxss`), /@import ['"]\/static_wxss\/skyfontline\.wxss['"];/)

for (const [name, base] of [
  ['yb-reasoning-slider', 'components/_self/yb-reasoning-slider'],
  ['yb-user-content', 'components/_self/yb-user-content']
]) {
  const source = read(`${base}/index.js`)
  const config = JSON.parse(read(`${base}/index.json`))
  assert.equal(config.styleIsolation, 'isolated')
  assert.doesNotMatch(source, /getApp\(/)
  assert.match(source, /static_utils\/(?:otherUtils|haptic)/)
  assert.doesNotMatch(source, /_shared\/utils/)
  assert.match(source, /selectOwnerComponent\(\)/)
}
assert.match(read('components/_self/yb-user-content/index.wxss'), /@import ['"]\/static_wxss\/skyfontline\.wxss['"];/)
assert.doesNotMatch(read('components/_self/yb-user-content/index.wxml'), /share-element/)

console.log('composer component boundary tests passed')
