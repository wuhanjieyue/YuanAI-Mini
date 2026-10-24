const zhCN = require('./locales/zh-CN')
const enUS = require('./locales/en-US')

const DEFAULT_LOCALE = 'zh-CN'
const LOCALE_MAP = {
  '中文': DEFAULT_LOCALE,
  '中文（简体）': DEFAULT_LOCALE,
  'zh-CN': DEFAULT_LOCALE,
  English: 'en-US',
  'en-US': 'en-US'
}
const DICTIONARIES = { 'zh-CN': zhCN, 'en-US': enUS }

function toLocale(language) {
  return LOCALE_MAP[language] || DEFAULT_LOCALE
}

function messages(language) {
  return DICTIONARIES[toLocale(language)] || zhCN
}

function getMessage(dictionary, key) {
  return key.split('.').reduce((value, part) => value && value[part], dictionary)
}

function t(language, key, params = {}) {
  const locale = toLocale(language)
  const message = getMessage(messages(locale), key) || getMessage(zhCN, key)
  if (typeof message !== 'string') return key
  return message.replace(/\{([A-Za-z0-9_]+)\}/g, (token, name) => (
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : token
  ))
}

module.exports = { DEFAULT_LOCALE, messages, toLocale, t }
