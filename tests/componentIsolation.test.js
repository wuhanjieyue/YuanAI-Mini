const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const componentsRoot = path.join(root, 'components')
const sharedFontPath = path.join(root, 'static_wxss/skyfontline.wxss')
const componentSharedRoot = path.join(componentsRoot, '_shared')
const componentSharedIconfontPath = path.join(componentSharedRoot, 'iconfont.wxss')

function collectComponentDirs(directory, directories = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const target = path.join(directory, entry.name)
    if (fs.existsSync(path.join(target, 'index.json'))) directories.push(target)
    else collectComponentDirs(target, directories)
  }
  return directories
}

const componentDirs = collectComponentDirs(componentsRoot).sort()
const componentNames = componentDirs
  .map((directory) => path.basename(directory))
  .sort()
const componentDirByName = new Map(componentDirs.map((directory) => [path.basename(directory), directory]))
const standaloneComponents = componentDirs
  .filter((directory) => path.dirname(directory) === componentsRoot)
  .map((directory) => path.basename(directory))
const projectIconfontConsumers = new Set([
  'yb-task-menu',
  'yb-reasoning-slider',
  'yb-read-aloud',
  'yb-asset-actions',
  'yb-chat-input',
  'yb-chat-view',
  'yb-create-view',
  'yb-fun-list',
  'yb-left-center',
  'yb-library-view',
  'yb-knowledge-view',
  'yb-plugins-view',
  'yb-subsetting-personalization',
  'yb-trending-search',
  'yb-user-content'
])
const standaloneIconfontConsumers = new Set(['yb-file-list', 'yb-subsetting-list-card'])

const nonIsolated = []
const ownerCoupled = []

for (const base of componentDirs) {
  const name = path.basename(base)
  const isStandalone = path.dirname(base) === componentsRoot
  const configPath = path.join(base, 'index.json')
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  if (config.styleIsolation !== 'isolated') nonIsolated.push(name)

  for (const extension of ['js', 'wxml', 'wxss']) {
    const file = path.join(base, `index.${extension}`)
    if (!fs.existsSync(file)) continue
    const source = fs.readFileSync(file, 'utf8')
    if (isStandalone) assert.doesNotMatch(source, /\/static\//, `${name} 仍依赖顶层 static 资源`)
    if (extension === 'wxss') assert.doesNotMatch(source, /yb-iconfont/)
    if (extension === 'js') {
      if (isStandalone) {
        assert.doesNotMatch(
          source,
          /static_utils\/(?:otherUtils|haptic|appInit|debounce)/,
          `${name} 仍依赖宿主项目工具`
        )
      }
      if (/selectOwnerComponent\(\)/.test(source)) ownerCoupled.push(name)
    }
    if (extension === 'wxss') {
      assert.doesNotMatch(source, /at\.alicdn|url\(['"]?\/\//, `${name} 仍依赖运行时样式 CDN`)
    }
  }

  assert(!fs.existsSync(path.join(base, 'iconfont.wxss')), `${name} 不应保留重复字体基类`)
  const componentStyles = fs.readFileSync(path.join(base, 'index.wxss'), 'utf8')
  const sharedIconfontImport = `@import '${path.relative(base, componentSharedIconfontPath).split(path.sep).join('/')}';`
  if (standaloneIconfontConsumers.has(name)) {
    assert(componentStyles.trimStart().startsWith(sharedIconfontImport), `${name} 应先导入组件公共字体基类`)
  } else if (projectIconfontConsumers.has(name)) {
    assert(componentStyles.trimStart().startsWith("@import '/static_wxss/skyfontline.wxss';"), `${name} 应先导入项目字体样式`)
  } else {
    assert.doesNotMatch(componentStyles, /_shared\/iconfont\.wxss/, `${name} 不应导入未使用的字体基类`)
    assert.doesNotMatch(componentStyles, /\/static_wxss\/skyfontline\.wxss/, `${name} 不应导入未使用的项目字体样式`)
  }
}

const componentSharedIconfont = fs.readFileSync(componentSharedIconfontPath, 'utf8')
assert.match(componentSharedIconfont, /font-family:\s*"iconfont"\s*!important/)
assert.doesNotMatch(componentSharedIconfont, /@font-face|data:font|https?:|at\.alicdn/)

const sharedUtils = require('../components/_shared/utils')
assert.equal(sharedUtils.rpx2px(100, 375), 50)
assert.deepEqual(Object.keys(sharedUtils), ['rpx2px'])

const modelsSelectSource = fs.readFileSync(path.join(componentDirByName.get('yb-models-select'), 'index.js'), 'utf8')
assert.match(modelsSelectSource, /_shared\/utils/)
assert.doesNotMatch(modelsSelectSource, /^(?:function|const) rpx2px\b/m)

for (const name of [
  'yb-archived-chats', 'yb-chat-input', 'yb-chat-view', 'yb-fun-list',
  'yb-library-view', 'yb-reasoning-slider', 'yb-subsetting-personalization'
]) {
  const source = fs.readFileSync(path.join(componentDirByName.get(name), 'index.js'), 'utf8')
  assert.match(source, /static_utils\/otherUtils/)
  assert.doesNotMatch(source, /_shared\/utils/)
  assert.doesNotMatch(source, /^(?:function|const) rpx2px\b/m)
}

for (const name of ['yb-chat-input', 'yb-chat-view', 'yb-user-content']) {
  const source = fs.readFileSync(path.join(componentDirByName.get(name), 'index.js'), 'utf8')
  assert.match(source, /static_utils\/haptic/)
  assert.doesNotMatch(source, /_shared\/utils/)
  assert.doesNotMatch(source, /^function triggerHaptic\b/m)
}

const sharedLoading = fs.readFileSync(path.join(componentSharedRoot, 'assets/loading.svg'))
const projectLoading = fs.readFileSync(path.join(root, 'static/images/loading.svg'))
const projectLogo = fs.readFileSync(path.join(root, 'static/logs/glog.png'))
assert.equal(crypto.createHash('sha256').update(sharedLoading).digest('hex'), 'ddc9bb2e32994197e18279336372a7d95fbba683238591e92562d75b37abd524')
assert.equal(crypto.createHash('sha256').update(projectLoading).digest('hex'), 'ddc9bb2e32994197e18279336372a7d95fbba683238591e92562d75b37abd524')
assert.equal(crypto.createHash('sha256').update(projectLogo).digest('hex'), '4f861f03b3298d0c48ee06ad923897416e608c0ef93302c2c26db29db7a1df44')
assert(!fs.existsSync(path.join(componentSharedRoot, 'assets/glog.png')), '组件公共目录不应保留项目 Logo 副本')
for (const base of componentDirs) {
  assert(!fs.existsSync(path.join(base, 'assets/loading.svg')), `${path.basename(base)} 不应保留重复 loading`)
  assert(!fs.existsSync(path.join(base, 'assets/glog.png')), `${path.basename(base)} 不应保留重复 Logo`)
}

for (const [sharedStyle, consumers, localRule] of [
  ['flex.wxss', ['yb-confirm-dialog'], /^\.(?:dr|dc|ac|jc)\s*\{/m]
]) {
  const sharedStylePath = path.join(componentSharedRoot, sharedStyle)
  assert(fs.statSync(sharedStylePath).size > 0)
  for (const name of consumers) {
    const base = componentDirByName.get(name)
    const styles = fs.readFileSync(path.join(base, 'index.wxss'), 'utf8')
    const expectedImport = `@import '${path.relative(base, sharedStylePath).split(path.sep).join('/')}';`
    assert(styles.includes(expectedImport), `${name} 应导入 ${sharedStyle}`)
    assert.doesNotMatch(styles, localRule, `${name} 不应重复声明 ${sharedStyle}`)
  }
}

for (const [name, localRule] of [
  ['yb-left-center', /^\.(?:dr|dc|ac|jc)\s*\{/m],
  ['yb-log-box', /^\.(?:dr|dc|ac|jc)\s*\{/m],
  ['yb-subsetting-personalization', /^\.(?:dr|dc|ac|jc|section-group|section-group-first|section-title|section-hint)\s*\{/m],
  ['yb-subsetting-data-control', /^\.section-(?:group|group-first|title|hint)\s*\{/m],
  ['yb-subsetting-notification', /^\.section-(?:group|group-first|title|hint)\s*\{/m]
]) {
  const base = componentDirByName.get(name)
  const styles = fs.readFileSync(path.join(base, 'index.wxss'), 'utf8')
  assert.match(styles, /@import '\/static_wxss\/skyother\.wxss';/, `${name} 应导入项目公共样式`)
  assert.doesNotMatch(styles, localRule, `${name} 不应重复声明项目公共样式`)
}
assert(!fs.existsSync(path.join(componentSharedRoot, 'settings.wxss')), '组件公共目录不应保留仅项目组件使用的设置样式')

const sharedFontSource = fs.readFileSync(sharedFontPath, 'utf8')
const sharedFontMatches = [...sharedFontSource.matchAll(/data:font\/ttf;base64,([A-Za-z0-9+/=]+)/g)]
assert.equal(sharedFontMatches.length, 1, '全局图标字体应只打包一份 TTF 数据')
const sharedFontHash = crypto
  .createHash('sha256')
  .update(Buffer.from(sharedFontMatches[0][1], 'base64'))
  .digest('hex')
assert.equal(sharedFontHash, '8e5620c5985f1c2661ad517006c443910d95de2bb1fc76549f79bce405c7806a')
for (const [icon, point] of Object.entries({ play_circle_line:'e7d7', pause_circle_line:'e7d8', fast_rewind_line:'e7d9', fast_forward_line:'e7da', tag_line:'e7db', package_2_line:'e7dc', list_check_line:'e7dd', filter_2_line:'e7de' })) {
  assert.match(sharedFontSource, new RegExp('\\.icon-' + icon + ':before\\s*\\{\\s*content:\\s*"\\\\' + point + '";'))
}
assert.match(sharedFontSource, /\.icon-thinking:before\s*\{\s*content:\s*"\\e7d6";/)
assert.match(sharedFontSource, /format\("truetype"\)/)
assert.doesNotMatch(sharedFontSource, /woff2?|yb-iconfont/)
assert.doesNotMatch(sharedFontSource, /https?:|at\.alicdn\.com|url\(['"]?\/\//)

const wxssFiles = []
function collectWxss(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'miniprogram_npm'].includes(entry.name)) continue
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) collectWxss(entryPath)
    else if (entry.name.endsWith('.wxss')) wxssFiles.push(entryPath)
  }
}
collectWxss(root)
const fontPayloadFiles = wxssFiles
  .filter((file) => /@font-face|data:font/.test(fs.readFileSync(file, 'utf8')))
  .map((file) => path.relative(root, file))
assert.deepEqual(fontPayloadFiles, ['static_wxss/skyfontline.wxss'])

const appStyles = fs.readFileSync(path.join(root, 'app.wxss'), 'utf8')
assert.equal((appStyles.match(/@import ['"]\/static_wxss\/skyfontline\.wxss['"];/g) || []).length, 1)

assert.deepEqual(nonIsolated, [])
assert(!componentNames.includes('yb-language-select'))
assert(!componentNames.includes('yb-guess-chats'))

for (const name of standaloneComponents) {
  const source = fs.readFileSync(path.join(componentDirByName.get(name), 'index.js'), 'utf8')
  assert.doesNotMatch(
    source,
    /(?:\.\.\/)+(?:store|request|static_utils|static_router)\//,
    `${name} 不应直接依赖宿主私有实现`
  )
  assert(!ownerCoupled.includes(name), `${name} 不应隐式读取宿主 shared 状态`)
}

const chatViewStyles = fs.readFileSync(path.join(componentDirByName.get('yb-chat-view'), 'index.wxss'), 'utf8')
assert.match(chatViewStyles, /@import '\.\/utilities\.wxss';/)
assert.match(fs.readFileSync(path.join(root, 'static_wxss/skyother.wxss'), 'utf8'), /\.loading-row\s*\{[^}]*width:\s*100%;[^}]*height:\s*120rpx;/)

console.log('component isolation tests passed')
