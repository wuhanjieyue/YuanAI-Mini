const WEB_URL = /^https?:\/\/([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::([0-9]{1,5}))?(?:[/?#][^\s\x00-\x1f]*)?$/i

function sourceLogo(value) {
  if (typeof value !== 'string' || value.length > 4096) return ''
  const url = value.trim()
  const match = WEB_URL.exec(url)
  if (!match || /[\x00-\x20\x7f\\]/.test(url) || match[2] && !(Number(match[2]) > 0 && Number(match[2]) <= 65535)) return ''
  const host = match[1].toLowerCase()
  // ponytail: DNS-host logos only; extend validation if a provider returns public IP logos.
  if (!host.includes('.') || /(?:^|\.)(?:localhost|local|internal)$/.test(host) ||
      host.split('.').every(label => /^(?:0x[0-9a-f]+|[0-9]+)$/.test(label))) return ''
  return url
}

function normalizeCitations(value) {
  const input = Array.isArray(value) ? value.slice(0, 160) : []
  const limit = input.some(item => Number.isInteger(item?.reference_id) && item.reference_id > 0 && item.reference_id <= 160) ? 160 : 20
  const seen = new Set()
  const result = []
  for (const item of input) {
    if (!item || typeof item.url !== 'string' || item.url.length > 4096) continue
    const url = item.url.trim()
    // Display/copy only: no server-side URL fetching or guessed favicon endpoint.
    const match = WEB_URL.exec(url)
    if (!match || seen.has(url)) continue
    seen.add(url)
    const hostLogo = sourceLogo(item.hostLogo)
    result.push({
      url,
      ...(hostLogo ? { hostLogo } : {}),
      ...(Number.isInteger(item.reference_id) && item.reference_id > 0 && item.reference_id <= 160 ? { reference_id:item.reference_id } : {}),
      ...(typeof item.siteName === 'string' && item.siteName.trim() ? { siteName:item.siteName.trim().slice(0, 100) } : {}),
      ...(typeof item.description === 'string' && item.description.trim() ? { description:item.description.trim().slice(0, 500) } : {}),
      title: typeof item.title === 'string' && item.title.trim()
        ? item.title.trim().slice(0, 200) : match[1],
      domain: match[1].toLowerCase().replace(/^www\./, '')
    })
    if (result.length === limit) break
  }
  return result
}

function knowledgeCitationId(url) {
  // Extract only the ID; evidence is resolved through our authenticated API, never the link host.
  const match = typeof url === 'string' && /^https?:\/\/[^/?#@]+\/knowledge\/citations\/(kc_[a-f0-9]{48})$/.exec(url)
  return match ? match[1] : ''
}

module.exports = { normalizeCitations, knowledgeCitationId }
