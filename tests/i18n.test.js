const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const zhCN = require('../static_utils/i18n/locales/zh-CN')
const enUS = require('../static_utils/i18n/locales/en-US')
const { DEFAULT_LOCALE, toLocale, t } = require('../static_utils/i18n')

function keys(value, prefix = '') {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return child && typeof child === 'object' ? keys(child, path) : [path]
  })
}

function messages(value, prefix = '', result = {}) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (child && typeof child === 'object') messages(child, path, result)
    else result[path] = child
  }
  return result
}

assert.equal(DEFAULT_LOCALE, 'zh-CN')
assert.equal(toLocale('中文'), 'zh-CN')
assert.equal(toLocale('中文（简体）'), 'zh-CN')
assert.equal(toLocale('English'), 'en-US')
assert.equal(toLocale('unsupported'), 'zh-CN')
assert.equal(t('English', 'settings.language.title'), 'App language')
assert.equal(t('中文', 'chat.smart'), '深入思考')
assert.equal(t('English', 'chat.smart'), 'Deep Thinking')
assert.equal(t('unsupported', 'settings.language.title'), '应用语言')
assert.equal(t('English', 'notification.channels.combined', { channels: 'Email' }), 'Email')
assert.equal(t('English', 'notification.channels.wechat'), 'WeChat')
assert.equal(t('English', 'auth.upgradeRequired', { plan: 'Plus' }), 'Upgrade to Plus')
assert.equal(t('English', 'reasoning.efforts.light'), 'Light')
assert.equal(t('English', 'reasoning.efforts.ultra-high'), 'Max')
assert.equal(t('English', 'notification.channels.combined'), '{channels}')
assert.equal(t('English', 'missing.key'), 'missing.key')
const zhMessages = messages(zhCN)
const enMessages = messages(enUS)
assert.ok(Object.keys(zhMessages).length >= 280)
assert.deepEqual(keys(enUS).sort(), keys(zhCN).sort())
for (const key of Object.keys(zhMessages)) {
  const placeholders = (message) => [...new Set(
    [...message.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1])
  )].sort()
  assert.deepEqual(placeholders(enMessages[key]), placeholders(zhMessages[key]), `${key} placeholders differ`)
}

for (const root of ['pages', 'components', 'mdPackage']) {
  for (const file of fs.readdirSync(root, { recursive:true }).filter(file => file.endsWith('.js'))) {
    const source = fs.readFileSync(path.join(root, file), 'utf8')
    assert.doesNotMatch(source, /require\(['"][^'"]*static_utils\/i18n['"]\)/, `${path.join(root, file)} must require i18n/index explicitly`)
  }
}

console.log('i18n: ok')

const {serverNode} = require('./serverPresentation')
const {localizeProcessNode,publicProcessText,normalizeProcessTrace,isVisibleProcessNode} = require('../static_utils/processTrace')
const input = serverNode({id:'server',callId:'server',name:'web',kind:'tool',status:'running',responseContent:'server text tools.web() 😀'})
const cached = normalizeProcessTrace(JSON.parse(JSON.stringify([input])))[0]
assert.equal(localizeProcessNode(cached,'中文').title,input.presentation.locales['zh-CN'].title)
assert.equal(localizeProcessNode(cached,'English').title,input.presentation.locales['en-US'].title)
assert.equal(publicProcessText(cached,'English'),input.presentation.locales['en-US'].content)
assert.equal(publicProcessText(cached,'中文'),'server text tools.web() 😀','no second frontend word replacement')
assert.equal(isVisibleProcessNode({...cached,presentation:null}),false)
for(const name of ['tools','stages','toolStates','commandStates','thinkingStates','contextCompactionStates','progressPhases','execErrors','fixedMessages','toolCompleted','stepTitle']){
  assert.equal(Object.hasOwn(zhCN.reasoning,name),false,name+' is owned by the backend')
  assert.equal(Object.hasOwn(enUS.reasoning,name),false)
}
for(const name of ['static_utils/processTrace.js','mdPackage/components/thinkItem/index.js','pages/reasoningPage/index.js']){
  const source=fs.readFileSync(name,'utf8')
  assert.doesNotMatch(source,/publicNarration|localizeFixedMessage|normalizeExecError|execChildren|progressPhases|toolCompleted|stepTitle|commandStates|thinkingStates/)
}
console.log('process i18n: server-owned bilingual content, offline cache and no frontend copy dictionaries passed')
