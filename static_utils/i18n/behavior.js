const { messages } = require('./index')
const createBehavior = typeof Behavior === 'function' ? Behavior : (definition) => definition

module.exports = createBehavior({
  properties: {
    language: {
      type: String,
      value: '中文'
    }
  },
  data: {
    i18n: messages('中文')
  },
  observers: {
    language(language) {
      this.setData({ i18n: messages(language) })
    }
  }
})
