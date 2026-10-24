// Recorded backend responses; tests supply dynamic public text without a frontend copy engine.
const responses = require('./fixtures/backend-contracts/process_presentations.json')
const recorded = Symbol('recorded server fixture')

function serverNode(node, copy = {}) {
  if(node.presentation && !node[recorded]) return node
  const kind = node.name === 'exec' && node.public?.toolNames?.length ? 'exec-' + node.public.toolNames.join(',') : node.name || node.stage || 'legacy'
  const key = [kind,node.status || 'completed',node.error?.code || ''].join('|')
  const base = responses[key] || responses[[node.name || node.stage || 'legacy',node.status || 'completed',''].join('|')] || responses['legacy|completed|']
  const presentation = JSON.parse(JSON.stringify(base))
  for(const locale of ['zh-CN','en-US']){
    const fields = presentation.locales[locale]
    const text = copy[locale] || {}
    if(node.name !== 'exec'){
      fields.content = presentation.format === 'code' ? node.public?.command || '' : node.responseContent || node.public?.result || ''
      fields.summary = node.public?.summary || ''
      fields.details = node.details || []
      fields.responseItems = node.responseItems || []
      presentation.hasDetails = Boolean(presentation.hasDetails || fields.content || fields.summary || fields.details.length || node.public?.query || node.public?.files?.length || node.public?.sources?.length)
    }
    if(node.stage === 'public_commentary'){
      fields.detailTitle = fields.content.trim()
      presentation.visible = Boolean(fields.content.trim())
      presentation.hasDetails = false
    }
    Object.assign(fields,text)
  }
  if(!responses[key] && node.title) for(const fields of Object.values(presentation.locales))
    fields.title = fields.endedTitle = fields.detailTitle = node.title
  return {...node,presentation,[recorded]:true}
}

const serverTrace = trace => trace.map(node => serverNode(node))
module.exports = {serverNode,serverTrace}
