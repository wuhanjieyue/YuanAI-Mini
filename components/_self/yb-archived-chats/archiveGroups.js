const { t } = require('../../../static_utils/i18n/index')

function timestamp(value) {
  const time = new Date(value || 0).getTime()
  return Number.isFinite(time) ? time : 0
}

function groupLabel(value, nowValue, language) {
  const date = new Date(value)
  const now = new Date(nowValue)
  const monthDiff = (now.getFullYear() - date.getFullYear()) * 12 + now.getMonth() - date.getMonth()
  if (monthDiff <= 0) return t(language, 'archive.thisMonth')
  if (monthDiff < 12) return t(language, 'archive.monthsAgo', { count: monthDiff })
  const yearDiff = now.getFullYear() - date.getFullYear()
  return yearDiff === 1 ? t(language, 'archive.lastYear') : t(language, 'archive.yearsAgo', { count: yearDiff })
}

function groupArchivedConversations(conversations = [], query = '', nowValue = Date.now(), language = '中文') {
  const keyword = String(query || '').trim().toLowerCase()
  const groups = []
  const map = {}

  conversations
    .filter((item) => !keyword || String(item.title || '').toLowerCase().includes(keyword))
    .slice()
    .sort((a, b) => timestamp(b.archivedAt) - timestamp(a.archivedAt))
    .forEach((item) => {
      const label = groupLabel(item.archivedAt || item.updatedAt || item.lastMessageAt, nowValue, language)
      let group = map[label]
      if (!group) {
        group = { label, items: [] }
        map[label] = group
        groups.push(group)
      }
      group.items.push(item)
    })

  return groups
}

module.exports = { groupArchivedConversations }
