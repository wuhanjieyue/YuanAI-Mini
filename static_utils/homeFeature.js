const HOME_FEATURES = Object.freeze({
  CHAT: 'chat',
  LIBRARY: 'library',
  TASKS: 'tasks',
  KNOWLEDGE: 'knowledge',
  PLUGINS: 'plugins',
  CREATE: 'create'
})

function normalizeHomeFeature(value) {
  return Object.values(HOME_FEATURES).includes(value) ? value : HOME_FEATURES.CHAT
}

module.exports = {
  HOME_FEATURES,
  normalizeHomeFeature
}
