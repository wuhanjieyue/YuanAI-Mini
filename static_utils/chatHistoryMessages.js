const { normalizeCitations } = require('./chatSources')
const { getChatFeatureMeta, getChatFeatureFromContentParts, getChatMessageLabel } = require('./chatFeature')
const { formatProcessDuration, formatStoppedDuration, normalizeProcessTrace, isVisibleProcessNode, assistantProcessTimeline } = require('./processTrace')
const { getMessageAttachments } = require('./chatAttachment')
const { t } = require('./i18n/index')

function normalizeHistoryMessage(message, language = '中文') {
  if (!message || (message.role !== 'user' && message.role !== 'assistant')) return null

  if (message.role === 'user') {
    const feature = getChatFeatureFromContentParts(message.contentParts)
    const featureMeta = getChatFeatureMeta(feature)
    const rawAttachments = Array.isArray(message.attachments) && message.attachments.length
      ? message.attachments
      : message.contentParts
    return {
      role: 'user',
      seq: message.seq,
      content: message.content || '',
      contentParts: message.contentParts || [],
      attachments: getMessageAttachments(rawAttachments),
      feature: featureMeta.value,
      featureLabel: getChatMessageLabel(message.contentParts, language),
      conversationId: message.conversationId || '',
      turnId: message.turnId || '',
      messageId: message.messageId || '',
      createdAt: message.createdAt || null
    }
  }

  const timeline = assistantProcessTimeline(message, language)
  const processTrace = timeline ? timeline.processTrace : normalizeProcessTrace(message.processTrace).filter(isVisibleProcessNode)
  const stopped = Boolean(message.displayStop) || ['cancelling', 'cancelled'].includes(message.status)
  let content = message.displayContent || message.content || (message.status === 'failed' ? t(language, 'chat.fallback') : '')
  if(stopped){
    content = message.content || ''
    if(!message.displayStop && timeline && (typeof message.content !== 'string' || !timeline.finalContent.startsWith(content))) content = timeline.finalContent
  }
  const processDurationMs = Number(message.processDurationMs) || 0
  return {
    role: 'assistant',
    runId:message.runId || '', textSegments:message.textSegments || [], modelRequests:message.modelRequests || [],
    displayContent:stopped ? content : message.displayContent || message.content || '', displayModelRequestId:message.displayModelRequestId || '',
    feature: message.feature || '',
    seq: message.seq,
    status: stopped ? 'cancelled' : message.status,
    ...(message.displayStop ? {displayStop:message.displayStop} : {}),
    contentParts: message.contentParts || [],
    attachments:getMessageAttachments(message.attachments?.length ? message.attachments : message.contentParts),
    content,
    citations: normalizeCitations(message.citations),
    conversationId: message.conversationId || '',
    turnId: message.turnId || '',
    messageId: message.messageId || '',
    modelName: message.modelName || '',
    modelId: message.modelId || '',
    createdAt: message.createdAt || null,
    feedback: message.feedback || null,
    thinking: stopped || processTrace.length > 0,
    thinkStatus: stopped || processTrace.length ? 2 : 0,
    thinkOpen: false,
    thinkDurationText: stopped ? formatStoppedDuration(processDurationMs, language)
      : processDurationMs > 0 ? formatProcessDuration(processDurationMs, language) : '',
    processTrace,
    processDurationMs
  }
}

module.exports = { normalizeHistoryMessage }
