import { currentLocation } from './location'
import { store } from '../store/index'
import { toLocale } from '../static_utils/i18n/index'
import { callHttp, startHttpSse } from './http'
import eventBus, { ASSET_LIST_INVALIDATED } from '../static_utils/eventBus'

function createQueue() {
  const items = []
  let waiting = null
  let closed = false
  let failed = null

  function flush() {
    if (!waiting) return
    const current = waiting
    waiting = null
    if (items.length) {
      current.resolve({ value: items.shift(), done: false })
      return
    }
    if (failed) {
      current.reject(failed)
      return
    }
    if (closed) {
      current.resolve({ value: undefined, done: true })
    }
  }

  return {
    push(item) {
      if (closed || failed) return
      items.push(item)
      flush()
    },
    close() {
      if (closed || failed) return
      closed = true
      flush()
    },
    fail(error) {
      if (closed || failed) return
      failed = error
      flush()
    },
    stream: {
      [Symbol.asyncIterator]() {
        return {
          next() {
            if (items.length) {
              return Promise.resolve({ value: items.shift(), done: false })
            }
            if (failed) return Promise.reject(failed)
            if (closed) {
              return Promise.resolve({ value: undefined, done: true })
            }
            return new Promise((resolve, reject) => {
              waiting = { resolve, reject }
            })
          }
        }
      }
    }
  }
}

function createDecoder() {
  if (typeof TextDecoder === 'function') return new TextDecoder('utf-8')
  let pending = []
  return { decode(buffer) {
    const bytes = pending.concat(Array.from(new Uint8Array(buffer)))
    let text = '', index = 0
    while (index < bytes.length) {
      const first = bytes[index]
      const length = first < 0x80 ? 1 : first >= 0xc2 && first <= 0xdf ? 2 : first >= 0xe0 && first <= 0xef ? 3 : first >= 0xf0 && first <= 0xf4 ? 4 : 0
      if (!length) { text += '\uFFFD'; index += 1; continue }
      if (index + length > bytes.length) break
      const next = bytes.slice(index, index + length)
      const valid = next.slice(1).every(byte => byte >= 0x80 && byte <= 0xbf)
        && !(first === 0xe0 && next[1] < 0xa0 || first === 0xed && next[1] > 0x9f || first === 0xf0 && next[1] < 0x90 || first === 0xf4 && next[1] > 0x8f)
      if (!valid) { text += '\uFFFD'; index += 1; continue }
      let point = first & (length === 1 ? 0x7f : 0x7f >> length)
      for (let cursor = 1; cursor < length; cursor += 1) point = (point << 6) | (next[cursor] & 0x3f)
      text += String.fromCodePoint(point)
      index += length
    }
    pending = bytes.slice(index)
    return text
  } }
}

function getClientSceneContext() {
  const context = { locale:toLocale(store.applicationSettings.language) }
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (timeZone) context.timeZone = timeZone
  } catch (error) {}
  return context
}

function parseSseBlock(block) {
  const lines = block.split('\n')
  const data = []
  let event = 'message'

  lines.forEach((line) => {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
      return
    }
    if (line.startsWith('data:')) {
      data.push(line.slice(5).replace(/^ /, ''))
    }
  })

  if (!data.length) return null
  return { event, data: data.join('\n') }
}

function drainSseBuffer(buffer, onEvent) {
  let normalized = buffer.replace(/\r\n/g, '\n')
  let index = normalized.indexOf('\n\n')

  while (index >= 0) {
    const block = normalized.slice(0, index)
    normalized = normalized.slice(index + 2)
    const event = parseSseBlock(block)
    if (event) onEvent(event)
    index = normalized.indexOf('\n\n')
  }

  return normalized
}

function createClientMessageId() {
  return `msg_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function callChatHTTP(path, data) {
  return callHttp(path, data).then(res => {
    const result = res.result
    if (res.statusCode >= 400 || result?.code >= 400) {
      throw Object.assign(new Error(result?.msg || `请求失败：${res.statusCode}`), {
        code: result?.code, statusCode: res.statusCode >= 400 ? res.statusCode : result.code,
        data: result?.data
      })
    }
    return result
  })
}

function requestEventStream(path, data, timeoutMs = 45000, initialTicket) {
  const queue = createQueue()
  const decoder = createDecoder()
  let buffer = ''
  let done = false
  let closed = false
  let requestTask = null
  const timeout = setTimeout(() => {
    clearTimeout(timeout)
    const error = new Error('流式连接已到期')
    error.code = 'STREAM_RECONNECT'
    fail(error)
  }, timeoutMs + 5000)

  const close = () => {
    closed = true
    clearTimeout(timeout)
    queue.close()
    if (requestTask && typeof requestTask.abort === 'function') requestTask.abort()
  }
  const fail = (error) => {
    if (closed) return
    closed = true
    clearTimeout(timeout)
    queue.fail(error)
    requestTask?.abort()
  }
  const complete = (res) => {
    if (closed) return
    if (res && res.statusCode >= 400) {
      const error = new Error(`流式请求失败：${res.statusCode}`)
      error.statusCode = res.statusCode
      fail(error)
      return
    }
    if (!done) {
      const error = new Error('流式连接已断开')
      error.code = 'STREAM_RECONNECT'
      fail(error)
    }
  }

  try {
    requestTask = startHttpSse(path, data, onChunk, complete, fail, initialTicket)
  } catch (error) {
    fail(error)
  }
  return { eventStream: queue.stream, close }

  function onChunk(res) {
    if (closed) return
    buffer += decoder.decode(res.data, { stream: true })
    buffer = drainSseBuffer(buffer, (event) => {
      if (closed) return
      if (event.event === 'error') {
        const error = new Error(event.data || '流式响应失败')
        error.code = 'TURN_FAILED'
        fail(error)
        return
      }
      if (event.data === '[DONE]') done = true
      queue.push({ data: event.data })
      if (done) {
        close()
      }
    })
  }
}

export function createChatTurn(data) {
  return callChatHTTP('/turns', { ...data, location: currentLocation() })
}

export function attachChatTurn({ conversationId, turnId, runId, afterSeq = -1, initialTicket }) {
  return requestEventStream('/turns/events', { conversationId, turnId, runId, afterSeq,
    locale:toLocale(store.applicationSettings.language) }, 45000, initialTicket)
}

export function getChatTurnsStatus({ turns = [], discoverActive = false, offset = 0 } = {}) {
  return callChatHTTP('/turns/status', { turns, discoverActive, offset, locale:toLocale(store.applicationSettings.language) })
}

export function cancelChatTurn({ conversationId, turnId, runId, displayStop }) {
  return callChatHTTP('/turns/cancel', { conversationId, turnId, runId, ...(displayStop ? {displayStop} : {}) })
}

export function updateChatFeedback({ messageId, value, reason = '' }) {
  return callChatHTTP('/feedback', { messageId, value, reason })
}

export function listConversations({ pageSize = 25, offset = 0, status = 'active', pinned, keyword = '' } = {}) {
  const data = { pageSize, offset, status }
  if (typeof pinned === 'boolean') data.pinned = pinned
  if (keyword) data.keyword = keyword
  return callChatHTTP('/conversations', data)
}

export function listArchivedConversations({ pageSize = 100, offset = 0, keyword = '' } = {}) {
  return listConversations({ pageSize, offset, status: 'archived', keyword })
}

export function updateConversationPin({ conversationId, pinned }) {
  return callChatHTTP('/conversations/pin', { conversationId, pinned })
}

export function renameConversation({ conversationId, title }) {
  return callChatHTTP('/conversations/rename', { conversationId, title })
}

export function createConversationBranch({ conversationId, turnId }) {
  return callChatHTTP('/conversations/branch', { conversationId, turnId })
}

export function deleteConversation({ conversationId }) {
  return callChatHTTP('/conversations/delete', { conversationId })
}

export function archiveConversation({ conversationId }) {
  return callChatHTTP('/conversations/archive', { conversationId })
}

export function unarchiveConversation({ conversationId }) {
  return callChatHTTP('/conversations/unarchive', { conversationId })
}

export function deleteArchivedConversation({ conversationId }) {
  return callChatHTTP('/conversations/delete-archived', { conversationId })
}

export function archiveAllConversations() {
  return callChatHTTP('/conversations/archive-all', {})
}

export function deleteAllConversations() {
  return callChatHTTP('/conversations/delete-all', {}).finally(() => {
    eventBus.emit(ASSET_LIST_INVALIDATED, { source: 'library' })
    eventBus.emit(ASSET_LIST_INVALIDATED, { source: 'mine' })
  })
}

export function getConversationsStatus() {
  return callChatHTTP('/conversations/status', {})
}

export function markConversationRead({ conversationId, completedRunId }) {
  return callChatHTTP('/conversations/read', { conversationId, completedRunId })
}

export function getConversationMessages({ conversationId, beforeSeq = null, turnId, limit } = {}) {
  return callChatHTTP('/messages', { conversationId, beforeSeq, ...(turnId ? { turnId } : {}),
    ...(limit === undefined ? {} : { limit }),
    locale:toLocale(store.applicationSettings.language) })
}

export function createConversationShare({ conversationId, scope, turnId = '' }) {
  return callChatHTTP('/shares', { conversationId, scope, turnId })
}

export function importConversationShare({ shareId, conversationId, turnId = '' }) {
  return callChatHTTP('/shares/import', { shareId, conversationId, turnId })
}

export function getConversationMessagesStatus({ conversationId } = {}) {
  return callChatHTTP('/messages/status', { conversationId })
}

export function getModelCatalog() {
  return callChatHTTP('/models', {})
}

export function getLongTermMemory({ cursor = null, limit = 30 } = {}) {
  return callChatHTTP('/long-term-memory', { cursor, limit })
}

export function refreshLongTermMemory() {
  return callChatHTTP('/long-term-memory/refresh', {})
}

export function deleteLongTermMemory() {
  return callChatHTTP('/long-term-memory/delete-all', {})
}

export function prepareChatTurn({ askText, thinking, imging, searching, studying, modeId, modelId, reasoningEnabled, effortId, feature, skillIds, contentParts, conversationId, clientMessageId, regenerateFromTurnId, ephemeralMessages }) {
  const data = {
    askText,
    thinking: thinking === true,
    imging: imging === true,
    searching: searching === true,
    studying: studying === true,
    modeId,
    modelId,
    effortId,
    ...(regenerateFromTurnId && feature === undefined ? {} : { feature:feature || '' }),
    contentParts: Array.isArray(contentParts) ? contentParts : [],
    conversationId: conversationId || '',
    clientMessageId: clientMessageId || createClientMessageId(),
    regenerateFromTurnId: regenerateFromTurnId || '',
    utcOffsetMinutes: -new Date().getTimezoneOffset(),
    ...getClientSceneContext()
  }
  if (modeId === 'temporary') data.ephemeralMessages = Array.isArray(ephemeralMessages) ? ephemeralMessages : []
  if (typeof reasoningEnabled === 'boolean') data.reasoningEnabled = reasoningEnabled
  if (Array.isArray(skillIds)) data.skillIds = skillIds.slice()
  return data
}

export function getDailyRecommendations(start = false, force = false) {
  return callChatHTTP(start ? '/recommendations/daily' : '/recommendations/status', force ? { force:true } : {})
}
