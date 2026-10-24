const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const read = file => fs.readFileSync(file, 'utf8')
const files = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(directory, entry.name)
  return entry.isDirectory() ? files(file) : [file]
})
const rulePattern = /([^{}]+)\{([^{}]*)\}/g
const rules = css => [...css.matchAll(rulePattern)].map(match => ({ selector: match[1].replace(/\/\*[\s\S]*?\*\//g, '').trim(), body: match[2] }))
const commonFiles = ['skyother', 'skycolor'].map(name => path.join(root, 'static_wxss', `${name}.wxss`))
const commonClasses = new Set(commonFiles.flatMap(file => rules(read(file)).flatMap(rule => /^\.[\w-]+$/.test(rule.selector) ? [rule.selector.slice(1)] : [])))
const styleCache = new Map()
function styles(file, seen = new Set()) {
  if (!fs.existsSync(file) || seen.has(file)) return ''
  seen.add(file)
  if (styleCache.has(file)) return styleCache.get(file)
  const css = read(file)
  const imports = [...css.matchAll(/@import\s+['"]([^'"]+)['"]/g)].map(match => styles(match[1].startsWith('/') ? path.join(root, match[1]) : path.resolve(path.dirname(file), match[1]), seen)).join('\n')
  const result = `${imports}\n${css}`
  styleCache.set(file, result)
  return result
}
function outputClasses(value) {
  return value.split(/({{[\s\S]*?}})/).flatMap((part, index) => index % 2
    ? [...part.matchAll(/(?:[?:]|&&|\|\|)\s*(['"])([^'"]*)\1/g)].flatMap(match => match[2].split(/\s+/))
    : part.split(/\s+/)).filter(Boolean)
}
const templates = ['pages', 'components', 'mdPackage'].flatMap(dir => files(path.join(root, dir))).filter(file => file.endsWith('.wxml'))
let buttons = 0
let classUses = 0
const templateStyles = new Map()
for (const file of templates) {
  const base = file.slice(0, -5)
  const config = fs.existsSync(`${base}.json`) ? JSON.parse(read(`${base}.json`)) : {}
  const source = fs.existsSync(`${base}.js`) ? read(`${base}.js`) : ''
  const isolation = config.styleIsolation || source.match(/styleIsolation:\s*['"]([^'"]+)/)?.[1]
  const isPage = file.startsWith(path.join(root, 'pages') + path.sep) || file.startsWith(path.join(root, 'mdPackage/pages') + path.sep)
  const css = (isPage || ['shared', 'apply-shared'].includes(isolation) ? styles(path.join(root, 'app.wxss')) : '') + styles(`${base}.wxss`)
  templateStyles.set(file, css)
  const scopeRules = rules(css)
  for (const match of read(file).matchAll(/<([\w:-]+)(?:[^<>"']|"[^"]*"|'[^']*')*>/g)) {
    const attrs = Object.fromEntries([...match[0].matchAll(/([\w:-]+)\s*=\s*(['"])(.*?)\2/gs)].map(attr => [attr[1], attr[3]]))
    const classes = outputClasses(attrs.class || '')
    if (match[1] === 'button') {
      buttons++
      assert.ok(attrs.style, `${file}: button needs an inline style`)
      for (const binding of (attrs.class || '').matchAll(/{{([\s\S]*?)}}/g)) {
        assert.match(binding[1], /\?\s*['"][\w\s-]*['"]\s*:\s*['"][\w\s-]*['"]/, `${file}: button may only choose literal node markers`)
      }
      assert.ok(!attrs['hover-class'] || attrs['hover-class'] === 'none', `${file}: button pressed state belongs on its view wrapper`)
      for (const name of classes) {
        assert.ok(!commonClasses.has(name), `${file}: button uses public class ${name}`)
        assert.ok(!scopeRules.some(rule => rule.selector.split(',').some(selector => new RegExp(`\\.${name}(?![\\w-])`).test(selector))), `${file}: button class ${name} still has stylesheet rules`)
      }
      continue
    }
    const styleClasses = ['class', 'hover-class', 'placeholder-class', 'popup-class'].flatMap(name => outputClasses(attrs[name] || ''))
    for (const name of styleClasses.filter(name => commonClasses.has(name))) {
      classUses++
      assert.ok(scopeRules.some(rule => rule.selector.split(',').some(selector => selector.trim() === `.${name}`)), `${file}: .${name} is unavailable in its isolated scope`)
    }
  }
}
assert.equal(buttons, 16, 'retain all native share, phone authorization and action buttons')
const { getAttachmentPresentation } = require('../static_utils/chatAttachment')
assert.ok(getAttachmentPresentation({ extension: 'pdf' }).colorClass.split(/\s+/).includes('text-main-l1'))
assert.match(templateStyles.get(path.join(root, 'mdPackage/components/messageAttachments/index.wxml')), /\.text-main-l1\s*\{/)
assert.ok(classUses > 0, 'public classes cover the page and component templates')
for (const name of ['library', 'create', 'plugins', 'knowledge', 'archived']) {
  const directory = name === 'archived' ? 'yb-archived-chats' : `yb-${name}-view`
  const template = read(path.join(root, `components/_self/${directory}/index.wxml`))
  const tag = template.match(new RegExp(`<view\\b[^>]*class="${name}-clear floating-search-clear"[^>]*>`))?.[0] || ''
  assert.ok(tag, `${name}: keep the animated clear button class stable when query is cleared`)
  assert.match(tag, /style="pointer-events:\{\{query \? 'auto' : 'none'\}\};"/, `${name}: only hit testing follows query`)
}
const glassSurfaces = {
  'static_wxss/skyother.wxss': ['.setting-option-pop-surface'],
  'components/_self/yb-feature-popup/index.wxss': ['.feature-popup-surface'],
  'mdPackage/components/assisAct/index.wxss': ['.feedback-popup', '.more-popup'],
  'components/yb-models-select/index.wxss': ['.models-base', '.other-model-panel.is-open'],
  'components/yb-cascader/index.wxss': ['.cascade-card']
}
for (const [file, selectors] of Object.entries(glassSurfaces)) {
  const sheetRules = rules(read(path.join(root, file)))
  for (const selector of selectors) {
    const body = sheetRules.filter(rule => rule.selector.split(',').some(value => value.trim() === selector)).map(rule => rule.body).join('\n')
    const backgrounds = [...body.matchAll(/\bbackground:\s*([^;]+);/g)]
    assert.match(backgrounds.at(-1)?.[1] || '', /^var\(--glass-72,/, `${file}: ${selector} uses 72% glass`)
    assert.match(body, /backdrop-filter:\s*blur\(10px\)/, `${file}: ${selector} retains blur`)
  }
}
console.log(`sharedStyles: ${templates.length} templates, ${classUses} public class uses and ${buttons} inline native buttons passed`)
