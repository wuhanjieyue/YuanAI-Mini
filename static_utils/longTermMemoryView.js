const { t } = require('./i18n/index')

// Project memory records into the summary presentation.
function memorySections(items, language) {
  return items.map((item, index) => ({ id: item.id,
    title: item.title || t(language, 'memory.item', { index: index + 1 }), body: item.content }))
}

module.exports = { memorySections }
