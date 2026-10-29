const CHAT_MODE_IDS = {
  CHAT: 'chat',
  WORK: 'work',
  TEMPORARY: 'temporary'
}

const CHAT_MODE_OPTIONS = [
  { id: CHAT_MODE_IDS.CHAT, name: '聊天', icon: 'icon-chat_3_line' },
  { id: CHAT_MODE_IDS.WORK, name: 'Yuan Bot', icon: 'icon-agent' },
  { id: CHAT_MODE_IDS.TEMPORARY, name: '临时', icon: 'icon-ghost' }
]

function createSmartModePreferences(accessPlan = 'guest') {
  return {
    [CHAT_MODE_IDS.CHAT]: accessPlan === 'user' || accessPlan === 'pro',
    [CHAT_MODE_IDS.TEMPORARY]: false
  }
}

function resolveSmartMode(modeId, preferences = {}) {
  return modeId === CHAT_MODE_IDS.WORK || preferences[modeId] === true
}

function rememberSmartMode(preferences, modeId, enabled) {
  if (modeId === CHAT_MODE_IDS.WORK) return preferences
  return Object.assign({}, preferences, { [modeId]: enabled === true })
}

function filterVisibleConversations(conversations = []) {
  return (Array.isArray(conversations) ? conversations : [])
    .filter((conversation) => conversation?.modeId !== CHAT_MODE_IDS.TEMPORARY)
}

module.exports = {
  CHAT_MODE_IDS,
  CHAT_MODE_OPTIONS,
  createSmartModePreferences,
  resolveSmartMode,
  rememberSmartMode,
  filterVisibleConversations
}
