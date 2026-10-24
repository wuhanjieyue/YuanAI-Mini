const assert = require('node:assert/strict')
const fs = require('node:fs')
const { mergeGeneratedImages } = require('../static_utils/generatedImages')
const wxml = fs.readFileSync(require.resolve('../mdPackage/components/generatedImages/index.wxml'), 'utf8')
assert.match(wxml, /<view wx:if="\{\{cards.length\}\}" class="generated-images /)
assert.match(wxml, /<template wx:if="\{\{cards.length === 1\}\}" is="generated-image-card" data="\{\{item: cards\[0\],/)
assert.equal((wxml.match(/<scroll-view\b/g) || []).length, 1)
assert.match(wxml, /<scroll-view wx:if="\{\{cards.length > 1\}\}"[^>]*scroll-x="\{\{true\}\}"/)
assert.match(wxml, /<template wx:for="\{\{cards\}\}" wx:key="artifactId" is="generated-image-card"/)
for (const [width, height] of [[576, 768], [504, 896], [2048, 256], [256, 2048], [512, 512]]) {
  const card = mergeGeneratedImages([], [{ artifactId: 'image', width, height, status: 'generating' }])[0]
  assert.ok(card.canvasWidthRpx > 0 && card.canvasHeightRpx > 0)
  assert.ok(Math.abs(card.canvasWidthRpx / card.canvasHeightRpx - width / height) < 1e-9)
  assert.ok(card.canvasWidthRpx <= 75 * 7.5 - 56 + 1e-9)
  assert.ok(card.canvasHeightRpx <= card.heightVw * 7.5 - 56 + 1e-9)
  const replay = mergeGeneratedImages([card], [{ artifactId: 'image', width: 1024, height: 1024, status: 'completed', url: 'https://example.com/image.png' }])[0]
  assert.equal(replay.heightVw, card.heightVw)
  assert.equal(replay.canvasWidthRpx, card.canvasWidthRpx)
  assert.equal(replay.canvasHeightRpx, card.canvasHeightRpx)
}
console.log('generatedImagesGeometry: single/multiple containers, aspect ratio, bounds and history geometry passed')
