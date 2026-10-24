const assert = require('node:assert/strict')
const { layoutContent } = require('../static_utils/userContentLayout')
for (const height of [52,112,600,1200,8000]) {
  for (const sourceTop of [-500,0,100,550,900]) {
    const result = layoutContent({top:sourceTop},height,844,110,118,810)
    assert.ok(result.scale > 0 && result.scale <= 1)
    assert.ok(result.top >= 110)
    assert.equal(result.menuTop,result.top + height * result.scale + 12)
    assert.ok(result.menuTop + 118 <= 798.000001)
  }
}
assert.equal(layoutContent({top:250},52,844,110,118,810).scale,1)
console.log('userContentLayout: short/multiline/very long text, clipped anchors and menu bounds passed')
