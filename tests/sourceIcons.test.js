const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { normalizeCitations, knowledgeCitationId } = require('../static_utils/chatSources')
const { sourceIcons, sourceIconUrl } = require('../static_utils/sourceIcons')

const citation = { url:'https://www.example.com/article', title:'景点指南', description:'可核验摘要',
  siteName:'景点官网', reference_id:7, hostLogo:' https://cdn.example.com/logo.png?size=48 ' }
const logo = citation.hostLogo.trim()
const normalized = normalizeCitations([citation])[0]
assert.equal(normalized.hostLogo, logo)
assert.equal(normalized.title, citation.title)
assert.equal(normalized.description, citation.description)
assert.equal(normalized.reference_id, 7)
assert.equal(sourceIconUrl(citation), logo)
assert.equal(sourceIconUrl({ url:citation.url }), '')
assert.equal(sourceIconUrl({ url:'javascript:alert(1)', hostLogo:logo }), '')

for (const hostLogo of [null, 123, '', 'javascript:alert(1)', 'data:image/png;base64,AAAA',
  '//cdn.example.com/icon.png', 'https://user:pass@example.com/icon.png', 'http://localhost/a',
  'http://a.local/a', 'http://a.internal/a', 'http://127.0.0.1/a', 'http://169.254.169.254/a',
  'http://2130706433/a', 'http://0x7f000001/a', 'http://[::1]/a',
  'https://cdn.example.com/a\\b', 'https://cdn.example.com/a\nb',
  'https://cdn.example.com:0/icon.png', 'https://cdn.example.com:65536/icon.png',
  'https://cdn.example.com/' + 'x'.repeat(4096)]) {
  assert.equal(sourceIconUrl({ ...citation, hostLogo }), '', String(hostLogo))
  assert.equal('hostLogo' in normalizeCitations([{ ...citation, hostLogo }])[0], false)
}
assert.deepEqual(sourceIcons([{ url:'https://example.com/no-logo' }, citation,
  { ...citation, url:'https://example.com/another' },
  ...['second', 'third', 'fourth'].map(host => ({ url:`https://${host}.example.com/`, hostLogo:logo }))
]), [
  { domain:'example.com', url:logo }, { domain:'second.example.com', url:logo },
  { domain:'third.example.com', url:logo }
])
assert.deepEqual(sourceIcons([{ url:'https://example.com/' }]), [])
assert.doesNotMatch(fs.readFileSync('static_utils/sourceIcons.js', 'utf8'), /icon\.horse/)

let page, onSources
const copied = []
const sourceStore = { applicationSettings:{ language:'中文' }, assetCacheEpoch:1 }
let finishEvidence
let modalCount = 0
vm.runInNewContext(fs.readFileSync('pages/sourcesPage/index.js', 'utf8'), {
  Page:value => { page = value },
  getApp:() => ({ globalData:{ su_system:{ screenHeight:800 }, su_menu:{ bottom:80 } } }),
  require:name => name.includes('themeBinding') ? { bindPageTheme() {}, unbindPageTheme() {}, syncThemeNavigation() {} }
    : name.includes('sourceIcons') ? { sourceIconUrl }
    : name.includes('/knowledge') ? { knowledgeCitationId, resolveKnowledgeCitation:() => new Promise(resolve => { finishEvidence = resolve }) }
    : name.includes('chatSources') ? { normalizeCitations }
    : name.includes('store/index') ? { store:sourceStore }
    : require('../static_utils/i18n'),
  wx:{ worklet:{ shared:value => ({ value }), runOnJS:fn => fn },
    setClipboardData:options => copied.push(options.data), showModal:async () => { modalCount++; return {} }, showToast() {} }
})
page.setData = update => {
  for (const [key, value] of Object.entries(update)) {
    const field = /^citations\[(\d+)\]\.iconUrl$/.exec(key)
    if (field) page.data.citations[Number(field[1])].iconUrl = value
    else page.data[key] = value
  }
}
page.getOpenerEventChannel = () => ({ on:(_name, handler) => { onSources = handler } })
page.applyAnimatedStyle = () => {}
page.onLoad()
const evidenceId = 'kc_' + 'a'.repeat(48)
const knowledgeSources = ['http://127.0.0.1:9000','https://knowledge.example.com'].map(host => ({
  url:host+'/knowledge/citations/'+evidenceId, title:'rules.txt', description:'制度原文摘要'
}))
onSources({ citations:[citation, { url:'https://legacy.example.com/', description:'旧来源摘要' },
  ...knowledgeSources, { url:'http://127.0.0.1:9000/article', title:'普通网页' }] })
assert.equal(page.data.citations[0].showSite, true)
assert.equal(page.data.citations[1].showSite, true)
assert.equal(page.data.citations[4].showSite, true, 'ordinary webpages keep their domain row')
for(const item of page.data.citations.slice(2,4)){
  assert.equal(item.showSite, false, 'knowledge sources hide both IP and domain rows')
  assert.equal(item.showTitle, true)
  assert.equal(item.title, 'rules.txt')
  assert.equal(item.description, '制度原文摘要')
}
assert.match(fs.readFileSync('pages/sourcesPage/index.wxml','utf8'), /<view wx:if="\{\{item\.showSite\}\}" class="source-site /)
assert.equal(page.data.citations[0].iconUrl, logo)
assert.equal(page.data.citations[0].showTitle, true)
assert.equal(page.data.citations[1].iconUrl, '')
page.iconError({ currentTarget:{ dataset:{ index:0 } } })
assert.equal(page.data.citations[0].iconUrl, '')
assert.equal(page.data.citations[0].description, citation.description)
page.copySource({ currentTarget:{ dataset:{ index:0 } } })
assert.deepEqual(copied, [citation.url])
for (const file of ['pages/sourcesPage/index.wxml', 'mdPackage/components/assisAct/index.wxml']) {
  assert.match(fs.readFileSync(file, 'utf8'), /wx:else class="iconfont icon-web-search/)
}
console.log('sourceIcons: ok')
;(async () => {
  const reading = page.openKnowledgeEvidence('owned-evidence')
  sourceStore.assetCacheEpoch++
  finishEvidence({ title:'private old account', text:'secret' })
  await reading
  assert.equal(modalCount, 0, 'late evidence must not be displayed after account switching')
})().catch(error => { console.error(error); process.exitCode=1 })
