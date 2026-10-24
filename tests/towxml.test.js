const assert = require('node:assert/strict')
const fs = require('node:fs')
const towxml = require('../mdPackage/components/towxmlstream/index')
const {
  createRenderContext,
  createEventContext,
  getRenderContext,
  destroyRenderContext,
  retainRenderContext,
  releaseRenderContext,
} = require('../mdPackage/components/towxmlstream/render-context')

const markdown = '# 标题\n\n```js\nconst answer = 42\n```\n\n==重点=='
const tableMarkdown = '| 阶段 | 核心动作 |\n| :--- | :--- |\n| **启动准备** | `SpringApplication.run()` |'
const staticNodes = towxml.static(markdown, 'markdown', { theme: 'light' })
const streamNodes = towxml(markdown, 'markdown')
const legacyNodes = towxml.static('**粗体**', 'markdown', { skyline: false })
const listNodes = towxml.static('- one\n- two', 'markdown')
const inlineNodes = towxml.static('**foo** *bar*', 'markdown')
const inlineCodeNodes = towxml.static('普通文本 `SERVLET` 以及 `REACTIVE`。', 'markdown')
const tableNodes = towxml.static(tableMarkdown, 'markdown')
const multilineCodeNodes = towxml.static('```json\n{\n  "items": [1, 2, 3]\n}\n```', 'markdown')
const complexCodeMarkdown = '```python\nimport requests\n\nclass Client:\n    def fetch(self):\n        return requests.get("/health")\n```'
const complexCodeNodes = towxml.static(complexCodeMarkdown, 'markdown')
const complexStreamCodeNodes = towxml(complexCodeMarkdown, 'markdown')
const plainCodeNodes = towxml.static('```\nplain\n```', 'markdown')
const latexMarkdownNodes = towxml.static('$$a+b$$', 'markdown')
const yumlMarkdownNodes = towxml.static('```yuml\n[User]->[Account]\n```', 'markdown')
const mermaidMarkdownNodes = towxml.static('```mermaid\nflowchart TD\nA-->B\n```', 'markdown')
const imageMarkdownNodes = towxml.static('![失效图片](https://invalid.example/image.png)', 'markdown')
const deliveredImage = { type:'artifact', artifactType:'image', artifactId:'tiger', width:576, height:768,
  status:'completed', displayMode:'inline', url:'https://cdn.example.com/generated/tiger_(1)?signed=1' }
const imageAnswer = '![老虎](' + deliveredImage.url + ')'
const collectImageNodes = tree => {
  const cards = [], text = []
  const visit = node => {
    if (node.generatedImage) cards.push(node.generatedImage)
    if (node.text) text.push(node.text)
    for (const child of node.children || []) visit(child)
  }
  visit(tree)
  return { cards, text:text.join('') }
}
const deliveredFile = {type:'attachment', attachmentType:'file', artifactId:'guide', assetId:'guide_asset',
  fileID:'owned/guide.md', status:'completed', url:'https://cdn.example.com/guide_(1).md?sign=confirmed&expires=123'}
const fileAnswer = '[**出行指南**](' + deliveredFile.url + ')'
const flattenNodes = tree => [tree, ...(tree.children || []).flatMap(flattenNodes)]
for (const parse of [towxml, towxml.static]) {
  for (const body of [fileAnswer, '[**出行指南**](<' + deliveredFile.url + '> "下载")',
    '[**出行指南**](' + deliveredFile.url.replace(/([()])/g,'\\$1') + ')']) {
    for (let end=body.indexOf('(')+1; end<body.length; end++) {
      const tree=parse(body.slice(0,end),'markdown',{files:[deliveredFile]})
      assert.equal(collectImageNodes(tree).text,'出行指南','an unfinished file link displays only its formatted title')
      assert.equal(tree.pendingLink,true)
      assert.equal(flattenNodes(tree).some(node=>node.attrs?.href || node.artifactLink),false,
        'partial URLs never become clickable or authorize a file')
    }
    const tree=parse(body,'markdown',{files:[deliveredFile]})
    assert.equal(flattenNodes(tree).find(node=>node.artifactLink).attrs.href,deliveredFile.url)
  }
  for (const source of ['`'+fileAnswer.slice(0,-1)+'`','```md\n'+fileAnswer.slice(0,-1)+'\n```',
    '\\'+fileAnswer.slice(0,-1),'<code>'+fileAnswer.slice(0,-1)+'</code>'])
    assert.equal(parse(source,'markdown',{files:[deliveredFile]}).pendingLink,undefined,
      'code and escaped examples keep their original content')
}
assert.equal(towxml('[其他](https://other.example/file','markdown',{files:[deliveredFile]}).pendingLink,undefined,
  'unrelated links cannot borrow delivered file metadata')
for (const patch of [{status:'failed'}, {unavailableReason:'storage_deleted'}, {assetId:''}, {fileID:''}])
  assert.equal(towxml(fileAnswer.slice(0,-1),'markdown',{files:[{...deliveredFile,...patch}]}).pendingLink,undefined,
    'only this message\'s confirmed file deliveries participate in waiting links')
for (let end=2; end < imageAnswer.length; end++) {
  const result = collectImageNodes(towxml(imageAnswer.slice(0,end), 'markdown', { images:[deliveredImage] }))
  assert.equal(result.cards.length, 1, 'every partial image link is an image placeholder')
  assert.equal(result.cards[0].status, 'generating')
  assert.equal(result.cards[0].url, '', 'partial URLs never become network requests')
  assert.equal(result.text, '', 'partial image syntax and URL never enter displayed text')
}
for (const parse of [towxml, towxml.static]) {
  const result = collectImageNodes(parse(imageAnswer, 'markdown', { images:[deliveredImage] }))
  assert.equal(result.cards[0].url, deliveredImage.url)
  assert.equal(result.cards[0].status, 'completed')
  assert.equal(result.cards[0].height, 768, 'extensionless signed URLs use the delivered image geometry')
  for (const text of ['[文件](artifact://file_1)', '[文件](https://cdn.example.com/report.png)',
    '`' + imageAnswer.slice(0,-1) + '`', '```text\n' + imageAnswer.slice(0,-1) + '\n```',
    '\\' + imageAnswer, '<code>' + imageAnswer.slice(0,-1) + '</code>'])
    assert.equal(collectImageNodes(parse(text, 'markdown', { images:[deliveredImage] })).cards.length, 0,
      'files, escaped text and code cannot become image cards')
}
assert.equal(collectImageNodes(towxml.static(imageAnswer.slice(0,-1), 'markdown', {
  images:[deliveredImage] })).cards[0].url, deliveredImage.url, 'a stopped partial reference retains the confirmed delivered image')
const secondDeliveredImage={...deliveredImage, artifactId:'second', url:'https://cdn.example.com/generated/second'}
const ambiguousImage=towxml('![图片](', 'markdown', {images:[deliveredImage,secondDeliveredImage]})
assert.equal(ambiguousImage.pendingImage,true)
assert.equal(collectImageNodes(ambiguousImage).cards.length,0,'multiple existing cards stay visible until the reference identifies an image')
const identifiedImage=collectImageNodes(towxml('![图片]('+deliveredImage.url.slice(0,-2),'markdown', {
  images:[deliveredImage,secondDeliveredImage]}))
assert.equal(identifiedImage.cards[0].artifactId,'tiger')
assert.equal(identifiedImage.cards[0].url,'')
assert.equal(collectImageNodes(towxml.static('![未完成示例','markdown', {
  images:[{type:'attachment', attachmentType:'file',artifactId:'file_1'}]})).cards.length,0,
  'file-only metadata cannot authorize an unfinished static image reference')
const complexLinkNodes = towxml.static('<a href="/pages/index/index"><strong>链接</strong></a>', 'html')
const nestedTextNodes = towxml.static('<text><strong>文本</strong></text>', 'html')
const themedNodes = towxml.static('<latex value="x" type="inline"></latex>', 'html', { theme: 'dark' })
const eventNodes = towxml.static('<p>可点击</p>', 'html', { events: { tap() {} } })
const appConfig = JSON.parse(fs.readFileSync('app.json', 'utf8'))
const mainStyle = fs.readFileSync(
  'mdPackage/components/towxmlstream/style/main.wxss',
  'utf8'
)
const lightStyle = fs.readFileSync('mdPackage/components/towxmlstream/style/theme/light.wxss', 'utf8')
const darkStyle = fs.readFileSync('mdPackage/components/towxmlstream/style/theme/dark.wxss', 'utf8')
const decodeWxml = fs.readFileSync(
  'mdPackage/components/towxmlstream/decode.wxml',
  'utf8'
)
const batchWxml = fs.readFileSync(
  'mdPackage/components/towxmlstream/batch/batch.wxml',
  'utf8'
)
const tableWxml = fs.readFileSync(
  'mdPackage/components/towxmlstream/table/table.wxml',
  'utf8'
)
const tableJs = fs.readFileSync(
  'mdPackage/components/towxmlstream/table/table.js',
  'utf8'
)
const yumlWxml = fs.readFileSync(
  'mdPackage/components/towxmlstream/yuml/yuml.wxml',
  'utf8'
)
const latexWxml = fs.readFileSync(
  'mdPackage/components/towxmlstream/latex/latex.wxml',
  'utf8'
)
const todoWxml = fs.readFileSync(
  'mdPackage/components/towxmlstream/todogroup/todogroup.wxml',
  'utf8'
)
const typableTextWxml = fs.readFileSync(
  'mdPackage/components/towxmlstream/typable-text/typable-text.wxml',
  'utf8'
)
const typableTextJs = fs.readFileSync(
  'mdPackage/components/towxmlstream/typable-text/typable-text.js',
  'utf8'
)
const batchJs = fs.readFileSync('mdPackage/components/towxmlstream/batch/batch.js', 'utf8')
const latexJs = fs.readFileSync('mdPackage/components/towxmlstream/latex/latex.js', 'utf8')
const yumlJs = fs.readFileSync('mdPackage/components/towxmlstream/yuml/yuml.js', 'utf8')
const imgWxml = fs.readFileSync('mdPackage/components/towxmlstream/img/img.wxml', 'utf8')
const imgWxss = fs.readFileSync('mdPackage/components/towxmlstream/img/img.wxss', 'utf8')
const towxmlJs = fs.readFileSync('mdPackage/components/towxmlstream/towxml.js', 'utf8')
const chatPageWxml = fs.readFileSync('components/_self/yb-chat-view/index.wxml', 'utf8')
const decodeJs = fs.readFileSync(
  'mdPackage/components/towxmlstream/decode.js',
  'utf8'
)
const towxmlWxml = fs.readFileSync('mdPackage/components/towxmlstream/towxml.wxml', 'utf8')
const echartsJs = fs.readFileSync('mdPackage/components/towxmlstream/echarts/echarts.js', 'utf8')
const echartsWxml = fs.readFileSync('mdPackage/components/towxmlstream/echarts/echarts.wxml', 'utf8')
const wxCanvasJs = fs.readFileSync('mdPackage/components/towxmlstream/echarts/wx-canvas.js', 'utf8')
const audioPlayerJs = fs.readFileSync('mdPackage/components/towxmlstream/audio-player/audio-player.js', 'utf8')
const towxmlConfig = fs.readFileSync('mdPackage/components/towxmlstream/config.js', 'utf8')
const { openCitationSource } = require('../mdPackage/components/towxmlstream/citation')

let towxmlComponentDefinition
const originalTowxmlComponent = global.Component
global.Component = definition => { towxmlComponentDefinition = definition }
delete require.cache[require.resolve('../mdPackage/components/towxmlstream/towxml')]
require('../mdPackage/components/towxmlstream/towxml')
if (originalTowxmlComponent === undefined) delete global.Component
else global.Component = originalTowxmlComponent
const stoppedEvents = []
const stoppedTyper = { _typedText:'已显示', triggerEvent(name, detail){ stoppedEvents.push({ name, detail }) } }
assert.equal(towxmlComponentDefinition.methods.stopTyping.call(stoppedTyper), '已显示')
assert.equal(stoppedTyper._stopAtCurrent, true)
assert.deepEqual(stoppedEvents, [{ name:'stopped', detail:{ text:'已显示' } }])
const halfEmoji = {_typedText:'已显示\uD83D',triggerEvent(){}}
assert.equal(towxmlComponentDefinition.methods.stopTyping.call(halfEmoji),'已显示','Stop excludes an incomplete Unicode character from its persisted prefix')
let freezeObserved = false
towxmlComponentDefinition.observers.freeze.call({ stopTyping(){ freezeObserved = true } }, true)
assert.equal(freezeObserved, true)

// Copy uses the source token, before highlighting turns spaces and tabs into NBSP.
const copySource = '\tconst text = "<tag> & \\"中文 😀";  \n\n  next();\n\n'
for (const parse of [towxml, towxml.static]) {
  for (const source of [copySource, 'x\u00a0y\n', 'partial\ud83d']) {
    const nodes = parse('```js\n' + source + (source.endsWith('\n') ? '```' : ''), 'markdown')
    const code = nodes.children.find(node => node.tag === 'scroll-view')
    assert.equal(code.codeText, source)
    assert.equal(code.attrs['data-code-content'], undefined, 'discard the encoded duplicate after parsing')
  }
  assert.equal(parse('    one\n    two\n', 'markdown').children[0].codeText, 'one\ntwo\n')
  assert.equal(flattenNodes(parse('> ```js\n> const nested = 1\n> ```', 'markdown'))
    .find(node => node.tag === 'scroll-view').codeText, 'const nested = 1\n')
}

const oldWx = global.wx
let clipboardRequest, hiddenToasts = 0
global.wx = {
  getStorageSync: () => ({language:'中文'}),
  setClipboardData: options => { clipboardRequest = options },
  hideToast: () => { hiddenToasts++ },
  showToast: () => { assert.fail('code copy must use the notice capsule') }
}
const copyNotices = []
let closedCopyNotices = 0
const copyHost = {
  setData() {},
  selectComponent(selector) {
    assert.equal(selector, '#copyNotice')
    return {show: text => copyNotices.push(text), hide: () => { closedCopyNotices++ }}
  }
}
for (const path of ['decode', 'batch/batch']) {
  let definition
  global.Component = value => { definition = value }
  const modulePath = '../mdPackage/components/towxmlstream/' + path
  delete require.cache[require.resolve(modulePath)]
  require(modulePath)
  delete require.cache[require.resolve(modulePath)]
  definition.methods.copyCode.call({triggerEvent(name, detail, options) {
    assert.equal(name, 'codecopy')
    assert.deepEqual(options, {bubbles:true, composed:true})
    towxmlComponentDefinition.methods.copyCode.call(copyHost, {detail})
  }}, {currentTarget:{dataset:{code:copySource}}})
  assert.equal(clipboardRequest.data, copySource)
  const beforeSuccess = copyNotices.length
  clipboardRequest.success()
  assert.equal(copyNotices.length, beforeSuccess + 1)
  assert.equal(copyNotices.at(-1), '代码已复制')
}
assert.equal(hiddenToasts, 2, 'hide the clipboard API default toast on success')
towxmlComponentDefinition.methods.hideCopyNotice.call(copyHost)
assert.equal(closedCopyNotices, 1)
clipboardRequest.fail()
assert.equal(copyNotices.at(-1), '复制失败，请重试')
copyHost._destroyed = true
const beforeDetached = copyNotices.length
clipboardRequest.success()
clipboardRequest.fail()
assert.equal(copyNotices.length, beforeDetached, 'late clipboard callbacks cannot reopen an unmounted notice')
clipboardRequest = null
towxmlComponentDefinition.methods.copyCode.call(copyHost, {detail:{text:''}})
towxmlComponentDefinition.methods.copyCode.call(copyHost, {detail:{text:42}})
assert.equal(clipboardRequest, null)
if (oldWx === undefined) delete global.wx
else global.wx = oldWx
if (originalTowxmlComponent === undefined) delete global.Component
else global.Component = originalTowxmlComponent
assert.match(towxmlWxml, /catch:codecopy="copyCode"/)
assert.match(towxmlWxml, /<yb-notice-capsule[^>]*duration="\{\{500\}\}"/)
assert.match(towxmlWxml, /slot="suffix"[^>]*catch:tap="hideCopyNotice"/)
assert.equal(JSON.parse(fs.readFileSync('mdPackage/components/towxmlstream/towxml.json', 'utf8'))
  .usingComponents['yb-notice-capsule'], '/components/yb-notice-capsule/index')

let latexDefinition
const originalComponent = global.Component
global.Component = definition => { latexDefinition = definition }
delete require.cache[require.resolve('../mdPackage/components/towxmlstream/latex/latex')]
require('../mdPackage/components/towxmlstream/latex/latex')
if (originalComponent === undefined) delete global.Component
else global.Component = originalComponent

const latexUpdates = []
const latexInstance = {
  data: {
    data: { attrs: { value: 'a+b', class: 'h2w__latex', type: 'block' } },
    theme: 'light',
    attrs: { src: '', class: '' }
  },
  setData(update) {
    latexUpdates.push(update)
    Object.assign(this.data, update)
  }
}
latexInstance.updateSource = latexDefinition.methods.updateSource
latexDefinition.observers['data, theme'].call(latexInstance)
assert.match(latexInstance.data.attrs.src, /tex=a%2Bb&theme=light/)
assert.equal(latexInstance.data.size.w, 2)
latexInstance.data.theme = 'dark'
latexDefinition.observers['data, theme'].call(latexInstance)
assert.match(latexInstance.data.attrs.src, /theme=dark/)
latexInstance.data.data = { attrs: { value: '' } }
latexDefinition.observers['data, theme'].call(latexInstance)
assert.equal(latexInstance.data.attrs.src, '')
assert.equal(latexUpdates.length, 3)

let imgDefinition
global.Component = definition => { imgDefinition = definition }
delete require.cache[require.resolve('../mdPackage/components/towxmlstream/img/img')]
require('../mdPackage/components/towxmlstream/img/img')
if (originalComponent === undefined) delete global.Component
else global.Component = originalComponent
const imgInstance = { ...imgDefinition.methods, data:{data:{}, size:{}, styleObj:{}, generatedImages:[]},
  setData(update){Object.assign(this.data,update)} }
for (const body of [imageAnswer.slice(0,-1), imageAnswer]) {
  const tree=towxml(body,'markdown',{images:[deliveredImage]})
  imgInstance.data.data=tree.children[0].children.find(node=>node.generatedImage)
  imgDefinition.observers.data.call(imgInstance)
  assert.equal(imgInstance.data.generatedImages[0].url,body===imageAnswer ? deliveredImage.url : '',
    'the same Markdown img instance switches from a waiting card to its confirmed image')
}
imgInstance.data.data={attrs:{src:'https://example.com/ordinary.png'}}
imgDefinition.observers.data.call(imgInstance)
assert.deepEqual(imgInstance.data.generatedImages,[])
assert.equal(imgInstance.data.attrs.src,'https://example.com/ordinary.png','ordinary images still update on the reused node')

assert.equal(typeof towxml.static, 'function')
assert.equal(appConfig.renderer, 'skyline')
assert.equal(appConfig.componentFramework, 'glass-easel')
assert.equal(staticNodes.theme, 'light')
assert.ok(staticNodes.children.length > 0)
assert.match(JSON.stringify(staticNodes), /h2w__span/)
assert.match(JSON.stringify(staticNodes), /h2w__mark/)
assert.match(JSON.stringify(staticNodes), /"tag":"span"/)
assert.match(JSON.stringify(staticNodes), /"tag":"scroll-view"/)
const multilineCodeBlock = multilineCodeNodes.children
  .find(node => node.tag === 'scroll-view')
  .children.find(node => node.codeLines)
const complexCodeBlock = complexCodeNodes.children
  .find(node => node.tag === 'scroll-view')
  .children.find(node => node.codeLines)
const complexStreamCodeBlock = complexStreamCodeNodes.children
  .find(node => node.tag === 'scroll-view')
  .children.find(node => node.codeLines)
const codeLineText = line => line.tokens.map(token => token.text).join('').replace(/\u00a0/g, ' ')
assert.equal(multilineCodeNodes.children.find(node => node.tag === 'scroll-view').scrollMinHeight, 157)
assert.equal(staticNodes.children.find(node => node.tag === 'scroll-view').codeLanguage, 'js')
assert.equal(multilineCodeNodes.children.find(node => node.tag === 'scroll-view').codeLanguage, 'json')
assert.equal(plainCodeNodes.children.find(node => node.tag === 'scroll-view').codeLanguage, 'text')
assert.deepEqual(multilineCodeBlock.codeLines.map(codeLineText), [
  '{',
  '  "items": [1, 2, 3]',
  '}'
])
assert.deepEqual(complexCodeBlock.codeLines.map(codeLineText), [
  'import requests',
  '',
  'class Client:',
  '    def fetch(self):',
  '        return requests.get("/health")'
])
assert.deepEqual(complexStreamCodeBlock.codeLines, complexCodeBlock.codeLines)
assert.equal(complexCodeNodes.children.find(node => node.tag === 'scroll-view').scrollMinHeight, 247)
assert.match(JSON.stringify(listNodes), /"listMarker":"•"/)
assert.equal(tableNodes.children.some(node => node.tag === 'table'), true)
assert.equal(tableNodes.children.find(node => node.tag === 'table').scrollMinHeight, 136)
assert.equal(latexMarkdownNodes.children.find(node => node.tag === 'latex').attrs.value, 'a+b\n')
assert.equal(yumlMarkdownNodes.children.find(node => node.tag === 'yuml').attrs.value, '[User]->[Account]')
assert.equal(yumlMarkdownNodes.children.find(node => node.tag === 'yuml').attrs.format, 'yuml')
assert.equal(mermaidMarkdownNodes.children.find(node => node.tag === 'yuml').attrs.format, 'mermaid')
const imageNode = imageMarkdownNodes.children
  .find(node => node.tag === 'view')
  .children.find(node => node.tag === 'img')
assert.equal(imageNode.attrs.src, 'https://invalid.example/image.png')
assert.match(imgWxml, /binderror="error"/)
assert.match(imgWxml, /<generated-images/)
assert.match(imgWxml, /i18n\.renderer\.imageFailed/)
assert.match(imgWxml, /size\.w \|\| 2/)
assert.doesNotMatch(imgWxml, /lazy-load/)
assert.match(imgWxss, /h2w__imgError/)
assert.doesNotMatch(imgWxml, /h2w__imgLoading/)
assert.doesNotMatch(imgWxss, /h2w__imgLoading/)
assert.doesNotMatch(towxmlConfig, /towxml\.vvadd\.com/)
assert.match(towxmlConfig, /\?tex/)
assert.match(towxmlConfig, /\?yuml/)
assert.match(towxmlConfig, /\?mermaid/)
assert.equal(listNodes.children.some(node => node.tag === undefined && /^\s*$/.test(node.text || '')), false)
const inlineParagraph = inlineNodes.children.find(node => node.attrs && node.attrs.class === 'h2w__p')
assert.equal(inlineParagraph.children.filter(node => node.tag === undefined).map(node => node.text).join(''), ' ')
const inlineCodeParagraph = inlineCodeNodes.children.find(node => node.attrs && node.attrs.class === 'h2w__p')
assert.equal(inlineCodeParagraph.inlineContent, true)
assert.equal(inlineCodeParagraph.children.filter(node => node.tag === 'span').length, 2)
assert.match(JSON.stringify(listNodes), /"inlineContent":true/)
const complexLink = complexLinkNodes.children[0]
assert.equal(complexLink.tag, 'navigator')
assert.equal(complexLink.navigatorPlain, true)
assert.equal(complexLink.navigatorText, '链接')
assert.equal(nestedTextNodes.children[0].textPlain, true)
assert.equal(nestedTextNodes.children[0].textValue, '文本')
assert.equal(themedNodes.children.find(node => node.tag === 'latex').theme, 'dark')
assert.equal(typeof eventNodes.eventContextId, 'string')
assert.equal(typeof getRenderContext(eventNodes.eventContextId).events.tap, 'function')
destroyRenderContext(eventNodes.eventContextId)
assert.ok(streamNodes.children.length > 0)
assert.match(JSON.stringify(legacyNodes), /"tag":"view"/)
assert.match(decodeWxml, /typable-text wx:if="\{\{streamMode\}\}"/)
assert.match(decodeWxml, /<text wx:else>\{\{item\.text\}\}<\/text>/)
assert.match(decodeWxml, /<span data-data="\{\{item\}\}"/)
assert.match(decodeWxml, /scroll-x="\{\{true\}\}" enable-flex="\{\{true\}\}" enable-passive="\{\{true\}\}"/)
assert.doesNotMatch(decodeWxml, /scroll-x="\{\{true\}\}" type="list"/)
assert.match(decodeWxml, /<view class="\{\{item\.attrs\.class\}\}" style="\{\{item\.attrs\.style\}\}">/)
assert.match(decodeWxml, /<view class="h2w__preHeader dr ac jb">/)
assert.match(decodeWxml, /<text class="ft24">\{\{item\.codeLanguage\}\}<\/text>/)
assert.match(decodeWxml, /icon-copy[^>]*data-code="\{\{item\.codeText\}\}"[^>]*catch:tap="copyCode"/)
assert.match(decodeWxml, /<scroll-view scroll-x="\{\{true\}\}" clip="\{\{false\}\}" enable-passive="\{\{true\}\}" class="h2w__preScroll"/)
assert.match(decodeWxml, /<view class="h2w__preContent">/)
assert.match(decodeWxml, /min-height:\{\{item\.scrollMinHeight\}\}rpx/)
assert.doesNotMatch(decodeWxml, /<scroll-view[^>]*enable-flex[^>]*class="h2w__preScroll"/)
assert.match(decodeWxml, /item\.codeLines/)
assert.match(decodeWxml, /<span class="h2w__codeLineText">/)
assert.match(decodeWxml, /<text wx:for="\{\{line\.tokens\}\}"/)
assert.doesNotMatch(decodeWxml, /h2w__codeLineText[\s\S]{0,300}<decode/)
assert.match(decodeWxml, /stream-mode="\{\{streamMode\}\}"/)
assert.match(decodeWxml, /item\.inlineContent/)
assert.match(decodeWxml, /item\.navigatorPlain/)
assert.match(decodeWxml, /item\.textPlain/)
assert.match(batchWxml, /item\.navigatorPlain/)
assert.match(batchWxml, /item\.textPlain/)
assert.match(batchWxml, /scroll-x="\{\{true\}\}" enable-flex="\{\{true\}\}" enable-passive="\{\{true\}\}"/)
assert.doesNotMatch(batchWxml, /scroll-x="\{\{true\}\}" type="list"/)
assert.match(batchWxml, /<view class="\{\{item\.attrs\.class\}\}" style="\{\{item\.attrs\.style\}\}">/)
assert.match(batchWxml, /<view class="h2w__preHeader dr ac jb">/)
assert.match(batchWxml, /<text class="ft24">\{\{item\.codeLanguage\}\}<\/text>/)
assert.match(batchWxml, /icon-copy[^>]*data-code="\{\{item\.codeText\}\}"[^>]*catch:tap="copyCode"/)
assert.match(batchWxml, /<scroll-view scroll-x="\{\{true\}\}" clip="\{\{false\}\}" enable-passive="\{\{true\}\}" class="h2w__preScroll"/)
assert.match(batchWxml, /<view class="h2w__preContent">/)
assert.match(batchWxml, /min-height:\{\{item\.scrollMinHeight\}\}rpx/)
assert.doesNotMatch(batchWxml, /<scroll-view[^>]*enable-flex[^>]*class="h2w__preScroll"/)
assert.match(batchWxml, /item\.codeLines/)
assert.match(batchWxml, /<span class="h2w__codeLineText">/)
assert.match(batchWxml, /<text wx:for="\{\{line\.tokens\}\}"/)
assert.doesNotMatch(batchWxml, /h2w__codeLineText[\s\S]{0,300}<decode/)
assert.match(decodeWxml, /<table[^>]+context-id="\{\{contextId\}\}"/)
assert.match(decodeWxml, /<todogroup[^>]+context-id="\{\{contextId\}\}"/)
assert.match(batchWxml, /<table[^>]+context-id="\{\{contextId\}\}"/)
assert.match(batchWxml, /<todogroup[^>]+context-id="\{\{contextId\}\}"/)
assert.match(tableWxml, /<decode[^>]+context-id="\{\{contextId\}\}"/)
assert.match(tableWxml, /<span[^>]+class="h2w__inlineContent">\s*<decode/)
assert.match(tableJs, /virtualHost:\s*true/)
assert.match(tableWxml, /scroll-x="\{\{true\}\}" clip="\{\{false\}\}" enable-passive="\{\{true\}\}"/)
assert.doesNotMatch(tableWxml, /enable-flex/)
assert.match(tableWxml, /min-height:\{\{data\.scrollMinHeight\}\}rpx/)
assert.doesNotMatch(tableWxml, /type="list"/)
assert.match(yumlWxml, /scroll-x="\{\{true\}\}" enable-flex="\{\{true\}\}" enable-passive="\{\{true\}\}"/)
assert.doesNotMatch(yumlWxml, /type="list"/)
assert.match(yumlWxml, /mode="\{\{attr\.mode\}\}"/)
assert.match(yumlWxml, /binderror="error"/)
assert.match(yumlWxml, /i18n\.renderer\.chartFailed/)
assert.doesNotMatch(yumlWxml, /h2w__imgLoading/)
assert.doesNotMatch(latexWxml, /h2w__imgLoading/)
assert.match(latexWxml, /preload="\{\{true\}\}"/)
assert.match(todoWxml, /<decode[^>]+context-id="\{\{contextId\}\}"/)
assert.match(batchJs, /require\("\.\.\/config"\)/)
assert.match(batchJs, /openCitationSource\(attrs\)/)
assert.match(decodeJs, /openCitationSource\(attrs\)/)
assert.match(batchJs, /_this\["_" \+ item\]/)
assert.match(batchJs, /virtualHost: true/)
assert.doesNotMatch(batchJs, /global\._events/)
assert.doesNotMatch(decodeJs, /global\._events/)
assert.doesNotMatch(fs.readFileSync('mdPackage/components/towxmlstream/todogroup/todogroup.js', 'utf8'), /global\._events/)
assert.match(typableTextWxml, /user-select="true"/)
assert.match(typableTextJs, /_renderTimer/)
assert.match(typableTextJs, /setTimeout\(/)
assert.match(typableTextJs, /_renderText\.flush/)
assert.match(typableTextJs, /const initialText = this\.data\.text \|\| ""/)
assert.match(typableTextJs, /setData\(\{ isShow: true \}\)/)
assert.doesNotMatch(batchJs, /data\.batchNodes\[index\]\s*=/)
assert.match(latexJs, /encodeURIComponent\(value\)/)
assert.match(latexJs, /'data, theme': function\(\)/)
assert.match(latexJs, /size:\{w:2,h:2\}/)
assert.match(yumlJs, /encodeURIComponent\(dataAttr\.value \|\| ''\)/)
assert.match(yumlJs, /config\[format\]\.api/)
assert.match(yumlJs, /const renderScale = 2/)
assert.match(towxmlJs, /const streamText = _this\._stopAtCurrent \? _this\._typedText/)
assert.match(towxmlJs, /if \(!isRunning\) return;/)
assert.match(towxmlJs, /textRenderCb\.value\.flush/)
assert.match(batchJs, /_renderBatch = \(index, node, callback\)/)
assert.match(towxmlJs, /customSetInterval\(\(elapsed\) =>/)
assert.match(towxmlJs, /frameBudgetRemainder/)
assert.match(towxmlJs, /frameIndex < frameBudget/)
assert.match(towxmlJs, /const parsePendingTree = \(end\) =>/)
assert.match(towxmlJs, /stableFirstLevelChildNodes/)
assert.match(towxmlJs, /parsePendingTree\(j\)/)
assert.doesNotMatch(towxmlJs, /towxml\(allText\.substring\(finishIndex/)
assert.match(chatPageWxml, /type="list" enable-passive="\{\{true\}\}"/)
assert.match(chatPageWxml, /wx:key="index" list-item(?:\s|>)/)
assert.match(decodeJs, /virtualHost:\s*true/)
assert.match(typableTextJs, /virtualHost:\s*true/)
assert.equal(appConfig.rendererOptions.skyline.enableScrollViewAutoSize, true)
assert.equal(appConfig.rendererOptions.skyline.sdkVersionBegin, '3.7.2')
const originalWx = global.wx
const navigations = []
const toasts = []
const errors = []
global.wx = {
  navigateTo(options) { navigations.push(options) },
  showToast(options) { toasts.push(options) }
}
const originalConsoleError = console.error
console.error = (...args) => errors.push(args)
try {
  assert.equal(openCitationSource({ 'data-citation':'true', href:'https://example.com/source' }), true)
  assert.equal(navigations.length, 1)
  let shownSources
  navigations[0].success({ eventChannel:{ emit:(name, payload) => { shownSources = { name, payload } } } })
  assert.equal(shownSources.name, 'showSources')
  assert.equal(shownSources.payload.citations[0].url, 'https://example.com/source')
  navigations[0].fail(new Error('route failed'))
  assert.equal(toasts[0].title, '来源加载失败')
  assert.equal(errors.length, 1)
  assert.equal(openCitationSource({ href:'https://example.com/plain' }), false)
} finally {
  console.error = originalConsoleError
  if (originalWx === undefined) delete global.wx
  else global.wx = originalWx
}
const firstContext = createRenderContext()
const secondContext = createRenderContext()
assert.notEqual(firstContext.id, secondContext.id)
firstContext.context.batchRenderCb.value[0] = () => {}
assert.equal(secondContext.context.batchRenderCb.value[0], undefined)
assert.equal(getRenderContext(firstContext.id), firstContext.context)
destroyRenderContext(firstContext.id)
assert.equal(getRenderContext(firstContext.id), undefined)
destroyRenderContext(secondContext.id)
// A complete snapshot must still display its first character through the real batch path.
for (const answer of ['你好呀。', '当然会。' + '这是长回答的开头。'.repeat(20) + '\n\n后面的内容。']) {
  const firstRenderContext = createRenderContext()
  const firstBatchNodes = []
  const earlyFinishEvents = []
  firstRenderContext.context.batchRenderCb.value[0] = (index, node) => {
    firstBatchNodes[index] = node
  }
  firstRenderContext.context.batchRenderCb.value[1] = () => {}
  const firstRenderInstance = {
    ...towxmlComponentDefinition.methods,
    data: { speed: 10, mdText: { text: '' }, isFinish: false, batchIds: [0, 1], batchSize: 40 },
    _renderContext: firstRenderContext.context,
    setData(update) { Object.assign(this.data, update) },
    triggerEvent(name) { earlyFinishEvents.push(name) },
    customSetInterval(callback) { this.tick = callback; return { cancel() {} } }
  }
  firstRenderInstance.startType()
  firstRenderInstance.tick(640)
  assert.equal(firstBatchNodes.length, 0)
  firstRenderInstance.data.mdText = { text: answer }
  firstRenderInstance.data.isFinish = true
  firstRenderInstance.tick(10)
  assert.deepEqual(firstBatchNodes, towxml(answer[0], 'markdown').children,
    'the first character must reach visible batch nodes before a newline or completion')
  assert.equal(earlyFinishEvents.length, 0)
  destroyRenderContext(firstRenderContext.id)
}
const finalRenderContext = createRenderContext()
const renderedBatchNodes = []
const pendingBatchCommits = []
finalRenderContext.context.batchRenderCb.value[0] = (index, node, callback) => {
  renderedBatchNodes[index] = node
  if (callback) pendingBatchCommits.push(callback)
}
finalRenderContext.context.batchRenderCb.value[1] = () => {}
finalRenderContext.context.textRenderCb.value = Object.assign(() => {}, { flush() {} })
const finishEvents = []
const streamInstance = {
  data: {
    speed: 10,
    mdText: { text: '- [example](https://example.com)' },
    isFinish: true,
    batchIds: [0, 1],
    batchSize: 40
  },
  dataNodes: [],
  _renderContext: finalRenderContext.context,
  setData(update, callback) {
    Object.assign(this.data, update)
    if (callback) callback()
  },
  triggerEvent(name, detail) {
    finishEvents.push({ name, detail })
  }
}
Object.assign(streamInstance, towxmlComponentDefinition.methods)
streamInstance.customSetInterval = callback => {
  streamInstance._typeTick = callback
  return { cancel() {} }
}
streamInstance.startType()
for (let index = 0; index < 10 && !pendingBatchCommits.length; index++) {
  streamInstance._typeTick(640)
}
assert.equal(finishEvents.length, 0)
assert.match(JSON.stringify(renderedBatchNodes), /https:\/\/example\.com/)
pendingBatchCommits.forEach(callback => callback())
assert.equal(finishEvents.length, 1)
assert.equal(finishEvents[0].name, 'finish')
destroyRenderContext(finalRenderContext.id)
// Exercise the actual typewriter, including the text fast path that used to print URLs.
const imageRenderContext = createRenderContext()
const imageBatch = [], imageEvents = [], appendedText = []
imageRenderContext.context.batchRenderCb.value[0] = (index, node, callback) => { imageBatch[index] = node; callback?.() }
imageRenderContext.context.batchRenderCb.value[1] = () => {}
imageRenderContext.context.textRenderCb.value = value => appendedText.push(value)
const imageTyper = {
  ...towxmlComponentDefinition.methods,
  data:{speed:10, images:[deliveredImage], mdText:{text:imageAnswer}, isFinish:false, batchIds:[0,1], batchSize:40},
  _renderContext:imageRenderContext.context,
  setData(update){Object.assign(this.data,update)},
  triggerEvent(name,detail){imageEvents.push({name,detail})},
  customSetInterval(callback){this.tick=callback;return {cancel(){}}}
}
imageTyper.startType()
for (let index=0; index<imageAnswer.length; index++) {
  imageTyper.tick(10)
  if (index>=1 && index<imageAnswer.length-1) {
    const result=collectImageNodes({children:imageBatch})
    assert.equal(result.cards[0].status,'generating')
    assert.equal(result.text,'')
  }
}
assert.equal(appendedText.some(value => /[/:]/.test(value)),false,'image URL characters bypass text callbacks')
assert.equal(collectImageNodes({children:imageBatch}).cards[0].url,deliveredImage.url)
assert.deepEqual(imageEvents.filter(event=>event.name==='imagecards').map(event=>event.detail.artifactIds),[['tiger']])
imageTyper.data.mdText.text+='尾巴'
imageTyper.tick(10)
assert.equal(collectImageNodes({children:imageBatch}).text,'尾','text immediately after an image resumes normal streaming')
imageTyper.tick(10)
imageTyper.data.isFinish=true
imageTyper.tick(10)
assert.equal(imageEvents.filter(event=>event.name==='finish').length,1)
destroyRenderContext(imageRenderContext.id)
const fileRenderContext = createRenderContext()
const fileBatch = [], fileEvents = [], fileAppendedText = []
fileRenderContext.context.batchRenderCb.value[0] = (index,node,callback) => {fileBatch[index]=node;callback?.()}
fileRenderContext.context.batchRenderCb.value[1] = () => {}
fileRenderContext.context.textRenderCb.value = value => fileAppendedText.push(value)
const fileTyper = {
  ...towxmlComponentDefinition.methods,
  data:{speed:10, files:[deliveredFile], mdText:{text:fileAnswer}, isFinish:false, batchIds:[0,1], batchSize:40},
  _renderContext:fileRenderContext.context,
  setData(update){Object.assign(this.data,update)},
  triggerEvent(name,detail){fileEvents.push({name,detail})},
  customSetInterval(callback){this.tick=callback;return {cancel(){}}}
}
fileTyper.startType()
for (let index=0;index<fileAnswer.length;index++) {
  fileTyper.tick(10)
  if (index>=fileAnswer.indexOf('(') && index<fileAnswer.length-1)
    assert.equal(collectImageNodes({children:fileBatch}).text,'出行指南',
      'the actual typewriter never displays a partial file destination')
}
assert.equal(fileAppendedText.some(value=>/[/:?=&]/.test(value)),false,'file URLs bypass incremental text callbacks')
assert.equal(flattenNodes({children:fileBatch}).find(node=>node.artifactLink).attrs.href,deliveredFile.url)
fileTyper.data.mdText.text+='尾巴'
fileTyper.tick(10)
assert.equal(collectImageNodes({children:fileBatch}).text,'出行指南尾')
fileTyper.tick(10)
fileTyper.data.isFinish=true
fileTyper.tick(10)
assert.equal(fileEvents.filter(event=>event.name==='finish').length,1)
destroyRenderContext(fileRenderContext.id)
const eventContext = createEventContext({ tap() {} })
retainRenderContext(eventContext.id)
assert.equal(getRenderContext(eventContext.id).eventRefCount, 1)
releaseRenderContext(eventContext.id)
assert.equal(getRenderContext(eventContext.id), undefined)
assert.match(towxmlWxml, /context-id="\{\{contextId\}\}"/)
assert.match(decodeWxml, /context-id="\{\{contextId\}\}"/)
assert.match(batchWxml, /context-id="\{\{contextId\}\}"/)
assert.match(echartsWxml, /type="2d"/)
assert.doesNotMatch(echartsWxml, /canvas-id=/)
assert.match(echartsJs, /fields\(\{ node: true, size: true \}\)/)
assert.doesNotMatch(echartsJs, /createCanvasContext/)
assert.match(wxCanvasJs, /canvasNode/)
assert.match(audioPlayerJs, /detached:function\(\)/)
assert.match(mainStyle, /\.h2w__tr\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*row;/)
assert.match(mainStyle, /\.h2w__th,[\s\S]*\.h2w__td\s*\{[\s\S]*flex:\s*0 0 auto;/)
assert.match(mainStyle, /\.h2w__table\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*100%;[^}]*flex-shrink:\s*0;/)
assert.match(mainStyle, /\.h2w__tableScroll\s*\{[\s\S]*display:\s*block;/)
assert.match(mainStyle, /\.h2w__pre\s*\{[\s\S]*width:\s*100%;[\s\S]*flex-shrink:\s*0;/)
assert.match(mainStyle, /\.h2w__preScroll\s*\{[\s\S]*display:\s*block;/)
assert.match(mainStyle, /\.h2w__a\s*\{[^}]*text-decoration-line:\s*underline;/)
assert.doesNotMatch(mainStyle, /\.h2w__a\s*\{[^}]*border-bottom/)
assert.match(lightStyle, /\.h2w-light \.h2w__a\s*\{[^}]*text-decoration-color:\s*var\(--accent-link\);/)
assert.match(darkStyle, /\.h2w-dark \.h2w__a\s*\{[^}]*text-decoration-color:\s*var\(--accent-link\);/)
assert.match(mainStyle, /\.h2w__preHeader\s*\{[\s\S]*height:\s*56rpx;/)
assert.match(mainStyle, /\.h2w__preHeader\s*\{[\s\S]*color:\s*var\(--text\);[\s\S]*background-color:\s*var\(--bg-l1\);/)
assert.match(mainStyle, /\.h2w__preContent\s*\{[\s\S]*padding:\s*10rpx 14rpx 10rpx 10rpx;[\s\S]*background-color:\s*var\(--bg-l1\);/)
assert.match(lightStyle, /\.h2w-light \.h2w__pre\s*\{[\s\S]*background-color:\s*var\(--bg-l1\);/)
assert.match(darkStyle, /\.h2w-dark \.h2w__pre\s*\{[\s\S]*background-color:\s*var\(--bg-l1\);/)
assert.match(mainStyle, /\.h2w__codeLine\s*\{[\s\S]*min-height:\s*45rpx;[\s\S]*line-height:\s*45rpx;/)
assert.match(mainStyle, /\.h2w__tr\s*\{[\s\S]*min-height:\s*68rpx;/)
assert.match(mainStyle, /\.h2w__codeLine\s*\{[\s\S]*white-space:\s*nowrap;/)
assert.doesNotMatch(mainStyle, /list-style(?:-type)?\s*:/)
assert.doesNotMatch(mainStyle, /overflow-[xy]\s*:/)
assert.doesNotMatch(mainStyle, /font-size\s*:\s*[^;]*%/)
assert.doesNotMatch(mainStyle, /border(?:-[a-z]+)?-style\s*:\s*double/)

console.log('towxml: ok')

const cited = towxml.static('事实<sup><a href="https://example.com/a?q=1&amp;b=2" data-citation="true">3</a></sup>', 'markdown')
const citedJson = JSON.stringify(cited)
assert.ok(citedJson.includes('https://example.com/a?q=1&b=2'))
assert.ok(citedJson.includes('h2w__citation'))
assert.ok(!citedJson.includes('navigator'))
assert.ok(!citedJson.includes('aboutWebView'))
assert.ok(citedJson.includes('h2w__sup'))
assert.equal(JSON.stringify(towxml.static('`[ref_3]` 普通[1]', 'markdown')).includes('data-citation'),false)

const refSources = [
  { reference_id:19, url:'https://example.com/nineteen' },
  { reference_id:11, url:'https://example.com/eleven?q=1&b=2' },
  { reference_id:18, url:'https://example.com/eighteen' },
  { reference_id:5, url:'javascript:alert(1)' }
]
const findRefLinks = node => [
  ...(node.attrs?.['data-citation'] === 'true' ? [node] : []),
  ...(node.children || []).flatMap(findRefLinks)
]
for (const parse of [towxml.static, towxml]) {
  const knowledgeUrl = 'http://127.0.0.1:9000/knowledge/citations/kc_' + 'a'.repeat(48)
  const knowledgeLinks = findRefLinks(parse(`[查看原文](${knowledgeUrl})`, 'markdown'))
  assert.equal(knowledgeLinks.length, 1, 'ordinary knowledge links must use the authenticated citation flow')
  assert.equal(knowledgeLinks[0].tag, 'span')
  assert.equal(knowledgeLinks[0].attrs.href, knowledgeUrl)
  assert.equal(knowledgeLinks[0].attrs.class.includes('h2w__citation'), false, 'full link titles retain the normal link size')
  for (const url of [knowledgeUrl + '?token=secret', 'https://example.com/plain']) {
    assert.equal(findRefLinks(parse(`[链接](${url})`, 'markdown')).length, 0)
  }
  assert.equal(findRefLinks(parse('`[查看原文](' + knowledgeUrl + ')`', 'markdown')).length, 0)
  const refs = parse('盟友[ref_11][ref_18][ref_19]。', 'markdown', { citations:refSources })
  const links = findRefLinks(refs)
  assert.deepEqual(links.map(node => node.attrs.href), [refSources[1].url, refSources[2].url, refSources[0].url])
  assert.deepEqual(links.map(node => node.children[0].text), ['11', '18', '19'])
  assert.ok(links.every(node => node.tag === 'span' && node.attrs.class.includes('h2w__citation')))
  assert.match(JSON.stringify(refs), /h2w__sup/)
  for (const text of [
    '`[ref_11]` 普通[1]', '\\[ref_11]', '```text\n[ref_11]\n```', '    [ref_11]',
    '[[ref_11]](https://example.com/explicit)', '[ref_11](https://example.com/explicit)',
    '<code>[ref_11]</code>', '<a href="https://example.com/explicit">[ref_11]</a>',
    '[ref_44][ref_5]'
  ]) {
    assert.equal(findRefLinks(parse(text, 'markdown', { citations:refSources })).length, 0, text)
  }
  assert.equal(findRefLinks(parse('隔离来源[ref_11]', 'markdown')).length, 0)
  assert.equal(findRefLinks(parse('[ref_11', 'markdown', { citations:refSources })).length, 0)
  assert.equal(findRefLinks(parse('| 来源 |\n| --- |\n| [ref_11] |', 'markdown', { citations:refSources })).length, 1)
}

// The source event follows the body: stable earlier blocks must be resolved before finish is emitted.
const lateRefContext = createRenderContext()
const lateRefNodes = []
const lateRefCommits = []
lateRefContext.context.batchRenderCb.value[0] = (index, node, callback) => {
  lateRefNodes[index] = node
  if (callback) lateRefCommits.push(callback)
}
lateRefContext.context.batchRenderCb.value[1] = () => {}
lateRefContext.context.textRenderCb.value = Object.assign(() => {}, { flush() {} })
const lateRefEvents = []
const lateRefStream = {
  ...towxmlComponentDefinition.methods,
  data: { speed:10, mdText:{text:'前段[ref_11]。\n\n后段[ref_18]。\n\n尾段。'}, isFinish:false, batchIds:[0,1], batchSize:40 },
  _renderContext:lateRefContext.context,
  setData(update) { Object.assign(this.data, update) },
  triggerEvent(name) { lateRefEvents.push(name) },
  customSetInterval(callback) { this.tick = callback; return { cancel() {} } }
}
lateRefStream.startType()
lateRefStream.tick(640)
assert.equal(lateRefStream._typedText, lateRefStream.data.mdText.text)
assert.equal(findRefLinks({children:lateRefNodes}).length, 0)
lateRefStream.data.mdText.citations = refSources
lateRefStream.data.isFinish = true
lateRefStream.tick(10)
assert.equal(findRefLinks({children:lateRefNodes}).length, 2)
assert.equal(lateRefEvents.length, 0)
lateRefCommits.forEach(callback => callback())
assert.deepEqual(lateRefEvents, ['finish'])
destroyRenderContext(lateRefContext.id)

// Citation taps reuse the source sheet and never invoke a WebView navigator.
const savedComponent = global.Component, savedWx = global.wx
let citationDecoder, sourceNavigation, sourcePayload
global.Component = definition => { citationDecoder = definition }
require('../mdPackage/components/towxmlstream/decode')
global.wx = { navigateTo(options) {
  sourceNavigation = options
  options.success({ eventChannel:{emit(name, data){ sourcePayload = {name, data} }} })
} }
try {
  const tap = href => citationDecoder.methods.invokeEvent.call({data:{}}, 'tap', [{currentTarget:{dataset:{data:{attrs:{'data-citation':'true',href}}}}}])
  tap('https://example.com/a?q=1&b=2')
  assert.equal(sourceNavigation.url, '/pages/sourcesPage/index')
  assert.equal(sourceNavigation.routeType, 'upRouterBuilder')
  assert.equal(sourcePayload.name, 'showSources')
  assert.equal(sourcePayload.data.citations[0].url, 'https://example.com/a?q=1&b=2')
  sourceNavigation = null
  tap('javascript:alert(1)')
  assert.equal(sourceNavigation, null)
} finally {
  global.Component = savedComponent
  global.wx = savedWx
}
