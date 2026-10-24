const assert = require('node:assert/strict')
const {
  CHAT_FEATURES,
  getChatFeatureMeta,
  getChatFeatureFromContentParts,
  getChatMessageLabel,
  getSkillTitle
} = require('../static_utils/chatFeature')

assert.deepEqual(Object.keys(CHAT_FEATURES), ['thinking', 'searching', 'imging', 'studying'])
assert.equal(getChatFeatureMeta('thinking').messageLabel, '深度研究')
assert.equal(getChatFeatureMeta('unknown').value, '')
Object.keys(CHAT_FEATURES).forEach((value) => {
  assert.ok(getChatFeatureMeta(value).messageLabel)
  assert.equal(getChatFeatureFromContentParts([{ type: 'feature', value }]), value)
})
assert.equal(getChatFeatureFromContentParts([{ type: 'feature', value: 'searching' }]), 'searching')
assert.equal(getChatFeatureFromContentParts([{ type: 'feature', feature: 'imging' }]), 'imging')
assert.equal(getChatFeatureFromContentParts([{ type: 'feature', value: 'unknown' }]), '')
assert.equal(getChatFeatureFromContentParts([]), '')
const skill = { type:'skill', id:'copywriter', title:'copywriter' }
assert.equal(getChatMessageLabel([skill]), 'copywriter')
assert.equal(getChatMessageLabel([skill, skill, {type:'attachment'}]), 'copywriter')
assert.equal(getChatMessageLabel([{type:'feature', value:'searching'}, skill]), '网页搜索、copywriter')
assert.equal(getChatMessageLabel([{type:'skill', title:null}]), '')
assert.equal(getChatMessageLabel(null), '')
const bilingual = { ...skill, title:'文案创作', titleEn:'Copywriting' }
assert.equal(getSkillTitle(bilingual, 'English'), 'Copywriting')
assert.equal(getSkillTitle(bilingual, 'zh-CN'), '文案创作')
assert.equal(getSkillTitle({title:'文案创作'}, 'en-US'), '文案创作')
assert.equal(getSkillTitle(null, 'English'), '')
assert.equal(getChatMessageLabel([bilingual], 'English'), 'Copywriting')
assert.equal(getChatMessageLabel([{type:'feature',value:'searching'}, bilingual], 'English'), 'Web search, Copywriting')

console.log('chatFeature: ok')
