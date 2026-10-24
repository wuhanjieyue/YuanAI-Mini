const { normalizeCitations } = require('./chatSources')
function sourceIconUrl(source) {
  const item = normalizeCitations([source])[0]
  return item?.hostLogo || ''
}
function sourceIcons(citations) {
  const seen = new Set()
  return normalizeCitations(citations).filter(item => {
    if (!item.hostLogo || seen.has(item.domain)) return false
    seen.add(item.domain)
    return true
  }).slice(0, 3).map(item => ({ domain:item.domain, url:item.hostLogo }))
}
module.exports = { sourceIconUrl, sourceIcons }
