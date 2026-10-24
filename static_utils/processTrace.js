const { identities, normalizeSegments, mainTextProjection } = require('./chatSegments')
const { messages, toLocale } = require('./i18n/index')
const terminalStates = ['completed', 'partial', 'failed', 'cancelled', 'unknown']
const MAX_NODES = 512
const MAX_DETAILS = 6
const MAX_RESPONSE_CHARS = 64 * 1024
function normalizePresentation(value){
  if(value?.version !== 1 || !value.locales || typeof value.locales !== 'object') return null
  const locales = {}
  for(const locale of ['zh-CN','en-US']){
    const source = value.locales[locale]
    if(!source || typeof source.title !== 'string' || typeof source.content !== 'string') return null
    const fields = {}
    for(const key of ['title','endedTitle','detailTitle','groupTitle','content','summary','errorMessage','statusLabel'])
      fields[key] = typeof source[key] === 'string' ? source[key].slice(0,key === 'content' ? MAX_RESPONSE_CHARS : key === 'summary' ? 4000 : 512) : ''
    fields.details = (Array.isArray(source.details) ? source.details : []).filter(x => typeof x === 'string').slice(0,7).map(x => x.slice(0,4000))
    fields.responseItems = (Array.isArray(source.responseItems) ? source.responseItems : []).filter(item =>
      ['source','answer','reasoning'].includes(item?.kind) && Number.isInteger(item.start) && Number.isInteger(item.end) &&
      item.start >= 0 && item.end >= item.start && item.end <= fields.content.length).slice(0,64)
    locales[locale] = fields
  }
  return {version:1,locales,visible:value.visible !== false,hasDetails:value.hasDetails === true,
    format:['text','code','reasoning'].includes(value.format) ? value.format : 'text'}
}

function processPresentation(node, language){
  return node?.presentation?.version === 1 ? node.presentation.locales?.[toLocale(language)] : null
}

function applyProcessPresentations(trace, updates){
  const next = normalizeProcessTrace(trace)
  for(const update of (Array.isArray(updates) ? updates : []).slice(0,MAX_NODES * 4)){
    const node = next.find(node => node.id === update?.id)
    if(!node || node.status !== update.status || ['runId','modelRequestId','parentCallId'].some(key =>
      node[key] !== update[key])) continue
    const patch = update.presentation
    if(!patch || typeof patch !== 'object') continue
    const value = {...node.presentation,...patch,locales:{...node.presentation?.locales}}
    let valid = true
    for(const locale of ['zh-CN','en-US']){
      const fields = patch.locales?.[locale]
      if(!fields) continue
      const row = {...value.locales[locale],...fields}
      if(fields.contentAppend){
        const append = fields.contentAppend
        if(typeof append.text !== 'string' || append.offset !== (value.locales[locale]?.content || '').length){valid = false; break}
        row.content = (value.locales[locale]?.content || '') + append.text
        delete row.contentAppend
      }
      value.locales[locale] = row
    }
    const normalized = valid && normalizePresentation(value)
    if(normalized) node.presentation = normalized
  }
  return next
}

function publicProcessText(node, language, projectedItems = []) {
  const presentation = processPresentation(node, language)
  if(!presentation) return ''
  projectedItems.push(...presentation.responseItems)
  return presentation.content
}

function publicMainTextProjection(rows) {
  return mainTextProjection(rows)
}

function assistantProcessTimeline(assistant, language) {
  if(!Array.isArray(assistant.textSegments) || !assistant.textSegments.length && assistant.content) return null
  return streamProcessTimeline(assistant.processTrace, assistant.textSegments, language, assistant.modelRequests)
}

// One display group per main request; raw events and execution identities stay intact.
function streamProcessTimeline(trace, rows, language, modelRequests = []) {
  const main = normalizeSegments(rows).filter(row => !row.parentCallId && ['pending','commentary','final'].includes(row.purpose))
  const models = (Array.isArray(modelRequests) ? modelRequests : []).slice(0,128)
    .filter(row => !row.parentCallId && identities(row).modelRequestId)
  const normalized = normalizeProcessTrace(trace)
  const nodes = normalized.filter(node => isVisibleProcessNode(node, normalized))
  const finalContent = main.filter(row => row.purpose === 'final').map(row => row.content || '').join('')
  const requests = [...new Set(nodes.filter(node => !['public_commentary','context_compaction'].includes(node.stage)).map(node => node.modelRequestId || ''))]
  const mainRequests = [...new Set([...models, ...main].map(row => row.modelRequestId || ''))]
  for(const [index, request] of mainRequests.entries()){
    if(requests.includes(request)) continue
    const next = mainRequests.slice(index + 1).find(id => requests.includes(id))
    if(next === undefined) requests.push(request)
    else requests.splice(requests.indexOf(next), 0, request)
  }
  const entries = []
  const processEntry = node => {
    const responseItems = []
    const text = publicProcessText(node, language, responseItems)
    return {id:node.id, kind:'process', node:localizeProcessNode(node, language), text, responseItems}
  }
  for(const request of requests){
    const group = nodes.filter(node => node.stage !== 'context_compaction' && (node.modelRequestId || '') === request)
    const model = models.find(row => row.modelRequestId === request)
    if(model?.presentation && !group.some(node => node.stage === 'main_reasoning')){
      group.unshift(...normalizeProcessTrace([{...identities(model), id:'thinking_' + request,
        kind:'stage', stage:'main_reasoning', status:model.status, responseContent:'',presentation:model.presentation}]))
    }
    const hasCall = group.some(node => node.callId && !node.parentCallId)
    const summaries = main.filter(row => (row.modelRequestId || '') === request && row.content &&
      (row.purpose === 'commentary' || row.purpose === 'pending' && hasCall))
    const addProcess = node => entries.push(processEntry(node))
    group.filter(node => node.stage === 'main_reasoning').forEach(addProcess)
    for(const row of summaries){
      const node = group.find(node => node.id === row.messageId)
      if(node) entries.push({id:row.messageId,kind:'commentary',node,text:publicProcessText(node,language)})
    }
    group.filter(node => node.stage !== 'main_reasoning' && node.stage !== 'public_commentary').forEach(addProcess)
  }
  // Compaction has no main request ID; keep each stage between its real request groups.
  for(let index = nodes.length - 1; index >= 0; index--){
    const node = nodes[index]
    if(node.stage !== 'context_compaction') continue
    const previous = nodes.slice(0,index).reverse().find(item => !['context_compaction','public_commentary'].includes(item.stage))
    const position = previous ? entries.map(entry => entry.node.stage === 'context_compaction'
      ? null : entry.node.modelRequestId || '').lastIndexOf(previous.modelRequestId || '') + 1 : 0
    entries.splice(position,0,processEntry(node))
  }
  return {entries, finalContent, processTrace:entries.map(entry => entry.node)}
}

function isVisibleProcessNode(node) {
  return Boolean(processPresentation(node, 'zh-CN') && node.presentation.visible)
}

function localizeProcessNode(node, language, ended = false) {
  if(!node) return node
  const presentation = processPresentation(node, language)
  return {...node,title:presentation ? ended ? presentation.endedTitle : presentation.title : '',
    details:presentation?.details || [], public:{...node.public,summary:presentation?.summary || ''},
    error:node.error || presentation?.errorMessage ? {...node.error,message:presentation?.errorMessage || ''} : null}
}

function normalizeProcessTrace(trace) {
  return (Array.isArray(trace) ? trace : []).slice(0, MAX_NODES).map((item) => ({
    ...identities(item),
    ...(item?.callId ? { callId:String(item.callId), name:String(item.name || ''),
      public:item.name === 'exec' ? {toolNames:(Array.isArray(item.public?.toolNames) ? item.public.toolNames : [])
        .filter(name => typeof name === 'string' && name !== 'exec' && /^[a-z][a-z0-9_]{0,63}$/.test(name)).slice(0,21)} : item.public || {},
      error:item.error && typeof item.error === 'object' ? {code:item.error.code,stage:item.error.stage,
        recoverable:item.error.recoverable === true,executed:item.error.executed === true} : null } : {}),
    ...(item?.purpose ? {purpose:item.purpose} : {}),
    id:String(item?.id || ''),
    ...(normalizePresentation(item?.presentation) ? {presentation:normalizePresentation(item.presentation)} : {}),
    ...(typeof item?.stage === 'string' && item.stage ? { stage:item.stage.slice(0, 64) } : {}),
    ...(typeof item?.activityType === 'string' && item.activityType ? { activityType:item.activityType.slice(0, 64) } : {}),
    activityIcon:['main_reasoning','public_commentary'].includes(item?.stage) ? 'icon-thinking'
      : typeof item?.activityIcon === 'string' ? item.activityIcon.slice(0, 64) : 'icon-skill-tool',
    kind:item?.kind === 'tool' ? 'tool' : 'stage',
    title:String(item?.title || '').slice(0, item?.name === 'exec' ? 512 : 64),
    status:['proposed', 'ready', 'running', ...terminalStates].includes(item?.status) ? item.status : item?.kind === 'tool' ? 'unknown' : 'completed',
    details:(item?.callId && item.name === 'exec' ? [] : Array.isArray(item?.details) ? item.details : [])
      .filter((detail) => typeof detail === 'string' && detail.trim())
      .slice(0, MAX_DETAILS)
      .map((detail) => detail.slice(0, 240)),
    ...(item?.name !== 'exec' && Array.isArray(item?.responseItems) ? { responseItems:item.responseItems.filter(part =>
      ['source', 'answer', 'reasoning'].includes(part?.kind) && Number.isInteger(part.start) && Number.isInteger(part.end) &&
      part.start >= 0 && part.end >= part.start && part.end <= MAX_RESPONSE_CHARS).slice(0, 64).map(part => ({ kind:part.kind, start:part.start, end:part.end })) } : {}),
    responseContent:item?.callId && item.name === 'exec' ? '' : typeof item?.responseContent === 'string'
      ? item.responseContent.slice(0, MAX_RESPONSE_CHARS)
      : ''
  })).filter((item) => item.id && (item.presentation || item.stage || item.title))
}

function applyProcessEvent(trace, event) {
  const next = normalizeProcessTrace(trace)
  if(!event || typeof event !== 'object') return next
  let index = next.findIndex((item) => item.id === event.id)
  if(event.callId){
    if(index < 0){
      if(next.length < MAX_NODES) next.push({...event, details:[],responseContent:''})
    }else if(!['runId','modelRequestId','parentCallId','name'].some(key => typeof next[index][key] === 'string' && typeof event[key] === 'string' && next[index][key] !== event[key]) && !terminalStates.includes(next[index].status)){
      const order = {proposed:0,ready:1,running:2}
      if((order[event.status] ?? 3) >= (order[next[index].status] ?? 0)) Object.assign(next[index],event)
    }
    return normalizeProcessTrace(next)
  }
  if(index < 0){
    if(event.phase !== 'started' || next.length >= MAX_NODES) return next
    next.push({
      ...identities(event),
      id:String(event.id || ''),
      ...(typeof event.stage === 'string' && event.stage ? { stage:event.stage.slice(0, 64) } : {}),
      kind:event.kind === 'tool' ? 'tool' : 'stage',
      title:String(event.title || '').slice(0, 64),
      activityIcon:typeof event.activityIcon === 'string' ? event.activityIcon.slice(0, 64) : 'icon-skill-tool',
      status:'running',
      details:[],
      responseContent:''
    })
    index = next.length - 1
  }
  const node = next[index]
  if(terminalStates.includes(node.status) || ['runId','modelRequestId','parentCallId'].some(key =>
    typeof node[key] === 'string' && typeof event[key] === 'string' && node[key] !== event[key])) return next
  if(typeof event.activityType === 'string' && event.activityType) node.activityType = event.activityType.slice(0, 64)
  if(typeof event.activityIcon === 'string' && event.activityIcon) node.activityIcon = event.activityIcon.slice(0, 64)
  const detail = typeof event.detail === 'string' ? event.detail.trim().slice(0, 240) : ''
  if(detail && node.details.length < MAX_DETAILS && node.details[node.details.length - 1] !== detail){
    node.details.push(detail)
  }
  if(event.phase === 'completed') node.status = 'completed'
  if(event.phase === 'failed') node.status = 'failed'
  if(event.phase === 'cancelled') node.status = 'cancelled'
  return normalizeProcessTrace(next)
}

function applyProcessResponseContent(trace, text, event) {
  if(typeof text !== 'string' || !text) return normalizeProcessTrace(trace)
  const next = normalizeProcessTrace(trace)
  let index = event ? next.findIndex(item => item.id === event.processId) : -1
  if(event && (index < 0 || next[index].responseContent.length !== event.offset)) return next
  for(let cursor = event ? -1 : next.length - 1; cursor >= 0; cursor -= 1){
    if(next[cursor].status === 'running'){
      index = cursor
      break
    }
  }
  if(index < 0) index = next.length - 1
  if(index < 0) return next
  if(event && (next[index].status !== 'running' || ['runId','modelRequestId','parentCallId'].some(key =>
    typeof next[index][key] === 'string' && typeof event[key] === 'string' && next[index][key] !== event[key]))) return next
  if(event){
    const items = next[index].responseItems || []
    const end = Math.min(MAX_RESPONSE_CHARS, event.offset + text.length)
    if(event.kind !== 'source' && items[items.length - 1]?.kind === event.kind) items[items.length - 1].end = end
    else if(items.length < 64) items.push({ kind:event.kind, start:event.offset, end })
    next[index].responseItems = items
  }
  next[index].responseContent = `${next[index].responseContent || ''}${text}`.slice(0, MAX_RESPONSE_CHARS)
  return next
}

function completeProcessTrace(trace) {
  return normalizeProcessTrace(trace).map((item) => (
    ['proposed','ready','running'].includes(item.status) ? Object.assign({}, item, { status:item.kind === 'tool' ? 'unknown' : 'completed' }) : item
  ))
}

function currentProcessNode(trace, runningCallId = '') {
  const nodes = normalizeProcessTrace(trace).filter(isVisibleProcessNode)
  const actual = nodes.filter(item => item.callId && item.name !== 'exec' && item.status === 'running')
  const retained = actual.find(item => item.callId === runningCallId)
  if(retained) return retained
  const previous = nodes.find(item => item.callId === runningCallId)
  const next = actual.find(item => previous && item.parentCallId === previous.parentCallId) || actual[0]
  if(next) return next
  const ready = nodes.find(item => item.callId && item.name !== 'exec' && item.status === 'ready')
  if(ready) return ready
  const visible = nodes.filter(node => isVisibleProcessNode(node, nodes))
  return [...visible].reverse().find((item) => ['proposed','ready','running'].includes(item.status)) || visible[visible.length - 1]
}

function formatDuration(durationMs, language, useDays) {
  const units = messages(language).reasoning.durationUnits
  const separator = toLocale(language) === 'en-US' ? ' ' : ''
  const seconds = Math.max(1, Math.round((Number(durationMs) || 0) / 1000))
  if (seconds < 60) return `${seconds}${units.second}`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}${units.minute}${separator}${seconds % 60}${units.second}`
  if (!useDays || seconds < 86400) return `${Math.floor(seconds / 3600)}${units.hour}${separator}${Math.floor(seconds % 3600 / 60)}${units.minute}`
  return `${Math.floor(seconds / 86400)}${units.day}${separator}${Math.floor(seconds % 86400 / 3600)}${units.hour}`
}

function formatProcessDuration(durationMs, language = '中文') {
  return formatDuration(durationMs, language, true)
}

function formatStoppedDuration(durationMs, language = '中文') {
  return formatDuration(durationMs, language, false)
}

module.exports = {
  processPresentation,
  applyProcessPresentations,
  assistantProcessTimeline,
  streamProcessTimeline,
  publicProcessText,
  publicMainTextProjection,
  localizeProcessNode,
  isVisibleProcessNode,
  applyProcessEvent,
  applyProcessResponseContent,
  completeProcessTrace,
  currentProcessNode,
  formatProcessDuration,
  formatStoppedDuration,
  normalizeProcessTrace
}
