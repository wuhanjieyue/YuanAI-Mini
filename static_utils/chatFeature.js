const { toLocale, t } = require('./i18n/index')
const EMPTY_FEATURE = { value: '', messageLabel: '' }

const CHAT_FEATURES = {
  thinking: { value: 'thinking', messageLabel: '深度研究' },
  searching: { value: 'searching', messageLabel: '网页搜索' },
  imging: { value: 'imging', messageLabel: '创建图片' },
  studying: { value: 'studying', messageLabel: '研究与学习' }
}

function getChatFeatureMeta(value) {
  return CHAT_FEATURES[value] || EMPTY_FEATURE
}

function getChatFeatureFromContentParts(contentParts) {
  if (!Array.isArray(contentParts)) return ''
  const part = contentParts.find((item) => item && item.type === 'feature')
  return getChatFeatureMeta(part && (part.value || part.feature)).value
}

function getSkillTitle(skill, language = '中文') {
  return (toLocale(language) === 'en-US' && skill?.titleEn) || skill?.title || skill?.titleEn || ''
}

function getChatMessageLabel(contentParts, language = '中文') {
  const feature = getChatFeatureFromContentParts(contentParts)
  const keys = { thinking:'research', searching:'webSearch', imging:'image', studying:'study' }
  const featureLabel = feature ? t(language, `tools.${keys[feature]}`) : ''
  const skills = (Array.isArray(contentParts) ? contentParts : [])
    .filter(part => part?.type === 'skill' && typeof part.title === 'string' && part.title.trim())
    .map(part => getSkillTitle(part, language))
  return [...new Set([featureLabel, ...skills].filter(Boolean))].join(toLocale(language) === 'en-US' ? ', ' : '、')
}

module.exports = {
  CHAT_FEATURES,
  getChatFeatureMeta,
  getChatFeatureFromContentParts,
  getChatMessageLabel,
  getSkillTitle
}
