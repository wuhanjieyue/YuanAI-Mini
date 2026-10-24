const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

let definition
vm.runInNewContext(fs.readFileSync('mdPackage/components/messageAttachments/index.js', 'utf8'), {
  Component: value => { definition = value }, require: () => ({})
})
const files = ['开发交接文档.md', '开发交接文档.html', '给 Codex 的入口提示词.md'].map((name, index) => ({
  attachmentType: 'file', name, assetId: `owned_${index}`, fileID: `owned/${name}`
}))
const image = { attachmentType: 'image', name: '图片.png', assetId: 'owned_image' }
const attachments = [files[0], image, files[1], files[2]]
const events = []
const instance = {
  data: {}, properties: { attachments },
  setData(patch) { Object.assign(this.data, patch) },
  triggerEvent(name, detail) { events.push({ name, detail }) }
}
assert.equal(definition.properties.delivery.value, false, 'user attachments keep their existing default')
definition.observers.attachments.call(instance, attachments)
assert.deepEqual(Array.from(instance.data.files), files)
assert.deepEqual(Array.from(instance.data.images), [image])
definition.methods.previewFile.call(instance, { currentTarget: { dataset: { kind: 'file', index: 2 } } })
assert.equal(events[0].name, 'previewFile')
assert.equal(events[0].detail.attachment, files[2], 'row indices select the correct owned file in mixed attachments')
assert.equal(events[0].detail.attachments, attachments, 'preview keeps the original ownership metadata')
definition.methods.previewFile.call(instance, { currentTarget: { dataset: { kind: 'file', index: 99 } } })
assert.equal(events.length, 1)
definition.observers.attachments.call(instance, null)
assert.equal(instance.data.files.length, 0)
assert.equal(instance.data.images.length, 0)
assert.match(fs.readFileSync('mdPackage/components/messageAttachments/index.wxml', 'utf8'),
  /<text class="delivery-file-name[^>]*>\{\{item\.unavailableReason \? i18n\.assets\.fileDeleted : item\.name\}\}/,
  'deleted deliveries keep a visible unavailable label')

for (const path of ['mdPackage/components/assisDone/index.wxml',
  'mdPackage/components/assisStream/index.wxml', 'mdPackage/pages/archivedChat/index.wxml']) {
  const source = fs.readFileSync(path, 'utf8')
  const delivery = source.match(/<message-attachments[^>]*delivery="\{\{true\}\}"[^>]*\/>/g) || []
  assert.equal(delivery.length, 1, `${path}: one delivery list per response`)
  const position = source.indexOf(delivery[0])
  assert.ok(position > source.indexOf('<towxml'), `${path}: files follow the response body`)
  assert.ok(position < source.indexOf('<assis-act'), `${path}: files precede the action bar`)
  if (path.includes('assisStream')) {
    assert.match(delivery[0], /wx:if="\{\{settled\}\}"/, 'streaming output never mounts delivery cards')
    assert.match(source, /<message-attachments language="\{\{language\}\}" attachments="\{\{attachments\}\}"/,
      'streaming user uploads retain their existing placement')
  }
}
console.log('fileDeliveryList: completion-only tail placement and owned preview events passed')
