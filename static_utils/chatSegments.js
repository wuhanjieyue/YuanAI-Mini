const MAX_TEXT_SEGMENTS = 128
const MAX_PROCESS_NODES = 512
const MAX_TEXT_CHARS = 64 * 1024
const IDENTITY_KEYS = ['runId', 'modelRequestId', 'messageId', 'itemId', 'parentCallId', 'providerResponseId', 'providerItemId']
const MAIN_PURPOSES = ['pending', 'commentary', 'final']
const TEXT_PURPOSES = [...MAIN_PURPOSES, 'tool_result']

function identities(value) {
  return Object.fromEntries(IDENTITY_KEYS.filter(key => typeof value?.[key] === 'string' &&
    (/^[A-Za-z0-9_.:-]{1,256}$/.test(value[key]) || key === 'parentCallId' && value[key] === ''))
    .map(key => [key, value[key]]))
}

function normalizeSegments(rows) {
  const normalized = []
  for (const row of (Array.isArray(rows) ? rows : []).slice(0, MAX_TEXT_SEGMENTS)) {
    const identity = identities(row)
    if (!identity.messageId) continue
    normalized.push({
      ...identity,
      purpose: TEXT_PURPOSES.includes(row.purpose) ? row.purpose : 'pending',
      content: String(row.content || '').slice(0, MAX_TEXT_CHARS),
      ended: row.ended === true
    })
  }
  return normalized
}

function applySegment(rows, event) {
  const next = normalizeSegments(rows)
  let row = next.find(row => row.messageId === event.messageId)
  if (!row) {
    if (event.op !== 'start' || next.length >= MAX_TEXT_SEGMENTS) return next
    row = { ...identities(event), purpose: event.purpose || 'pending', content: '', ended: false }
    next.push(row)
  }
  if (row.runId !== event.runId || row.modelRequestId !== event.modelRequestId) return next
  if (event.op === 'delta' && event.offset === row.content.length) row.content = (row.content + event.text).slice(0, MAX_TEXT_CHARS)
  if (event.op === 'end') Object.assign(row, identities(event), { ended: true })
  if (event.op === 'purpose' && row.purpose === 'pending' && ['commentary', 'final'].includes(event.purpose)) row.purpose = event.purpose
  return next
}

const finalContent = rows => rows.filter(row => row.purpose === 'final').map(row => row.content).join('')

function mainTextProjection(rows, renderContent = row => row.content) {
  const main = normalizeSegments(rows).filter(row => !row.parentCallId && MAIN_PURPOSES.includes(row.purpose))
  const request = [...main].reverse().find(row => row.content)?.modelRequestId || ''
  return {
    displayContent: main.filter(row => row.modelRequestId === request).map(renderContent).join(''),
    displayModelRequestId: request
  }
}

function stoppedSegments(rows, contentLength) {
  let remaining = contentLength
  return normalizeSegments(rows).map(row => {
    if (row.parentCallId || row.purpose !== 'final') return row
    const content = row.content.slice(0, remaining)
    remaining = Math.max(0, remaining - row.content.length)
    return { ...row, content, ended:true }
  })
}

function projectSegments(trace, rows) {
  const visible = rows.filter(row => ['pending', 'commentary'].includes(row.purpose) && row.content)
  const next = trace.filter(node => node.stage !== 'public_commentary' || visible.some(row => row.messageId === node.id))
    .map(node => ({ ...node }))
  for (const row of visible) {
    const node = {
      ...identities(row), id: row.messageId, kind: 'stage', stage: 'public_commentary',
      activityIcon: 'icon-skill-tool', purpose: row.purpose,
      status: row.ended ? 'completed' : 'running', details: [], responseContent: row.content
    }
    const existing = next.find(item => item.id === row.messageId)
    if (existing) Object.assign(existing, node)
    else next.push(node)
  }
  return next.slice(0, MAX_PROCESS_NODES)
}

module.exports = { identities, normalizeSegments, applySegment, finalContent, mainTextProjection, stoppedSegments, projectSegments }
