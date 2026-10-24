const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const options = require('../components/_self/yb-chat-view/workDirectories.mock')
const source = fs.readFileSync('components/yb-cascader/index.js', 'utf8')

function mount(windowWidth = 375, windowHeight = 800) {
  let definition
  const pending = []
  const styles = {}
  const events = []
  let writes = 0
  let openedAnchor
  const animate = (value, config, finish) => { if (finish) pending.push(finish); return value }
  vm.runInNewContext(source, {
    Component: value => { definition = value },
    require: name => require(path.resolve('components/yb-cascader', name)),
    wx: {
      getWindowInfo: () => ({ windowWidth, windowHeight }),
      nextTick: fn => pending.push(fn),
      worklet: { shared: initial => {
        let value = initial
        return { get value() { return value }, set value(next) { value = next; writes++ } }
      }, timing: animate, spring: animate, runOnJS: fn => fn }
    }
  })
  const instance = {
    data: { ...definition.data, options, title: '工作目录' },
    ...definition.methods,
    setData(value, done) { Object.assign(this.data, value); if (done) done() },
    applyAnimatedStyle(selector, fn) { styles[selector] = fn },
    selectComponent: () => ({ open(anchor) { openedAnchor = anchor }, close() { pending.push(() => instance.handleAfterClose()) } }),
    triggerEvent(name, detail) { events.push({ name, detail }) }
  }
  const flush = () => { while (pending.length) pending.shift()() }
  const open = () => { instance.open({ left: 20, top: 100, width: 200, height: 40 }); flush() }
  const choose = index => { instance.choose({ currentTarget: { dataset: { depth: instance.data.depth, index } } }); flush() }
  return { instance, flush, open, choose, styles, events, writes: () => writes, anchor: () => openedAnchor }
}

const h = mount()
h.open()
assert.equal(h.instance.data.depth, 0)
assert.equal(h.instance.data.layers[0].listHeight, 275, 'root shows five data rows')
const { calculatePosition } = require('../components/yb-flyout/position')
const located = calculatePosition({ windowInfo: { windowWidth:375, windowHeight:800 }, anchorRect:h.anchor(),
  popupWidthRpx:640, edgeGapRpx:0, maxHeightRatio:1, measuredHeight:h.instance.data.stageHeight })
assert.equal(located.viewportTop + h.instance.data.stageHeight - h.instance.data.layers[0].height - h.instance.data.layers[0].bottom, 140,
  'visible card starts at the welcome container bottom')
assert.equal(located.viewportLeft + 18, 20, 'visible card aligns with the trigger left edge')
h.choose(0) // projects
assert.equal(h.instance.data.depth, 1)
assert.equal(h.instance._motion[0].inset.value, 0.05)
assert.equal(h.instance.data.layers[1].trigger.label, '项目空间')
assert.equal(h.instance._motion[1].height.value, h.instance.data.layers[1].height)
assert.equal(h.instance._motion[1].scale.value, 1.05)
const grandparent = h.styles['.cascade-card-0']()
h.choose(0) // YuanAI
assert.deepEqual(h.styles['.cascade-card-0'](), grandparent)
assert.equal(h.instance.data.depth, 2)
const ancestors = [h.styles['.cascade-card-0'](), h.styles['.cascade-card-1']()]
h.choose(0) // Mini Program
assert.equal(h.instance.data.depth, 3)
assert.deepEqual(h.styles['.cascade-card-0'](), ancestors[0])
assert.deepEqual(h.styles['.cascade-card-1'](), ancestors[1])
assert.equal(h.instance.data.layers[3].items.length, 20)
assert.equal(h.instance.data.layers[3].listHeight, 4 * 55, 'parent row plus four visible children')
h.choose(4) // disabled
assert.equal(h.events.length, 0)
h.instance.back(); h.flush()
assert.equal(h.instance.data.depth, 2)
assert.deepEqual(h.styles['.cascade-card-0'](), ancestors[0])
h.choose(1) // leaf at level three
assert.deepEqual(Array.from(h.events[0].detail.path, item => item.id), ['projects', 'yuanai', 'roadmap'])
assert.equal(h.instance._opened, false)
h.open(); h.choose(1)
assert.equal(h.events.filter(event => event.name === 'select').at(-1).detail.value, 'inbox')
h.open(); h.choose(4); h.choose(1) // empty children is a leaf
assert.equal(h.events.filter(event => event.name === 'select').at(-1).detail.value, 'finished')

h.open()
h.instance.choose({ currentTarget: { dataset: { depth: 0, index: 0 } } })
h.instance.close(); h.flush()
assert.equal(h.instance.data.layers.length, 0, 'closing cancels pending layer binding')
h.open(); assert.equal(h.instance.data.depth, 0)
h.instance.data.busy = true
const writes = h.writes()
h.choose(0); h.instance.back()
assert.equal(h.writes(), writes, 'rapid input is ignored during transitions')
h.instance.data.busy = false
h.instance.back(); h.flush()
assert.equal(h.instance._opened, false, 'root mask closes the picker')

// A caller supplying eleven levels still cannot open an eleventh panel.
const capped = mount()
let tree = [{ id: 'leaf', label: 'leaf' }]
for (let i = 10; i > 0; i--) tree = [{ id: String(i), label: String(i), children: tree }]
capped.instance.data.options = tree
capped.open()
for (let i = 0; i < 10; i++) capped.choose(0)
assert.equal(capped.events[0].detail.path.length, 10)

// Verify the actual stage/card metrics contain every layer's maximum spring scale.
for (const width of [320, 375, 430]) {
  for (const height of [500, 800]) {
    const g = mount(width, height)
    g.open()
    for (let depth = 0; depth < 10; depth++) {
      if (depth) g.choose(0)
      const card = g.instance.data.layers[depth]
      const bottom = card.bottom
      assert(g.instance.data.stageHeight - bottom - card.height * 1.35 > 0, 'top peak fits')
      assert((640 - 400 - 36) * width / 750 - g.instance.data.cardWidth * 0.35 > 0, 'left peak fits')
      assert.equal(g.instance._motion[depth].height.value, card.height)
    }
  }
}
const longList = mount()
longList.open(); longList.choose(0); longList.choose(0); longList.choose(0)
longList.instance.rememberScroll({ currentTarget:{ dataset:{depth:3} }, detail:{scrollTop:880} })
longList.choose(19)
assert.equal(longList.events[0].detail.value, 'mini-20', 'twentieth row remains selectable')
assert.equal(longList.events[0].detail.path.length, 4)
const wxml = fs.readFileSync('components/yb-cascader/index.wxml', 'utf8')
assert.doesNotMatch(wxml, /cascade-header|cascade-back|cascade-title/)
assert.match(wxml, /class="other-model-title\b[^\"]*" catch:tap="back"/)
assert.match(wxml, /layer.trigger.label/)
assert.match(source, /const DURATION = 160/)
assert.match(source, /spring\(1\.05, \{ velocity: 5, mass: 0\.8 \}/)
assert.match(wxml, /item.hasChildren && index != layer.items.length - 1/)
const host = fs.readFileSync('components/_self/yb-chat-view/index.wxml', 'utf8')
assert.doesNotMatch(host, /work-welcome|workDirectoryPicker|请选择工作目录/)
console.log('cascader: ten levels, leaf paths, disabled/empty children, back/reopen, stale callbacks and animation bounds passed')

const done = fs.readFileSync('mdPackage/components/assisDone/index.js', 'utf8')
assert.match(done, /showActions: \{ type: Boolean, value: true \}/)
assert.match(done, /this.triggerEvent\('contenttap', \{\}\)/)
assert.match(fs.readFileSync('mdPackage/components/assisDone/index.wxml', 'utf8'), /showActions &&/)

assert.match(wxml, /bind:masktap="close"/)
assert.match(wxml, /class="cascade-stage\b[^\"]*"[^>]*catch:tap="close"/)
assert.match(wxml, /catch:tap="handleCardTap"/)
const outsideClose = mount()
outsideClose.open()
outsideClose.choose(0)
outsideClose.choose(0)
outsideClose.instance.close()
outsideClose.flush()
assert.equal(outsideClose.instance._opened, false)
assert.equal(outsideClose.instance.data.layers.length, 0)

const deep = mount()
deep.open()
for (let depth = 1; depth < 10; depth++) {
  const frozenAncestors = deep.instance.data.layers.slice(0, -1).map((_, i) => deep.styles[`.cascade-card-${i}`]())
  deep.choose(0)
  assert.equal(deep.instance.data.depth, depth)
  frozenAncestors.forEach((style, i) => assert.deepEqual(deep.styles[`.cascade-card-${i}`](), style))
}
for (let depth = 8; depth >= 0; depth--) {
  deep.instance.back(); deep.flush()
  assert.equal(deep.instance.data.depth, depth)
}
for (let depth = 1; depth < 10; depth++) deep.choose(0)
deep.choose(0)
assert.equal(deep.events[0].detail.path.length, 10)
assert.equal(deep.events[0].detail.value, 'depth-ten')
assert.equal(deep.instance._opened, false)
