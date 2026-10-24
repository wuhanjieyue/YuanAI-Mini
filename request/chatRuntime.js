import { store } from '../store/index'
import { createChatTurn, prepareChatTurn, attachChatTurn, cancelChatTurn, getChatTurnsStatus, getConversationMessages, getConversationMessagesStatus } from './chatStream'
import { markConversationRead as markConversationReadRequest } from './chatStream'
import eventBus, { CHAT_SESSION_RESET } from '../static_utils/eventBus'
const { applyProcessEvent, applyProcessResponseContent, normalizeProcessTrace, applyProcessPresentations } = require('../static_utils/processTrace')
const { mergeGeneratedImages } = require('../static_utils/generatedImages')
const { normalizeCitations } = require('../static_utils/chatSources')
const { normalizeSegments, applySegment, finalContent, mainTextProjection, stoppedSegments, projectSegments } = require('../static_utils/chatSegments')

const active = status => ['submitting', 'queued', 'running', 'cancelling'].includes(status)
const terminal = status => ['completed', 'failed', 'cancelled'].includes(status)
const validRunIds = run => ['conversationId', 'turnId', 'runId'].every(key =>
  typeof run?.[key] === 'string' && run[key] && /^[A-Za-z0-9_-]+$/.test(run[key]))
const records = new Map()
const pendingTurns = new Map()
const runningTurns = new Map()
const viewStates = new Map()
const titleJobs = new Map()
const readJobs = new Map()
let unreadVersion = 0
let epoch = 0
let currentKey = ''
let foreground = false
let online = true
let pollTimer = null
let polling = false
let pollBlocked = false
let ownerKey = ''

function syncConversationTitle(conversation) {
  if (!conversation?.conversationId || conversation.modeId === 'temporary') return
  for (const [key, setter] of [['chatHistory', 'setChatHistory'], ['pinnedChatHistory', 'setPinnedChatHistory']]) {
    const history = store[key]
    if (!history || (history.ownerKey && history.ownerKey !== ownerKey)) continue
    let changed = false
    const conversations = (history.conversations || []).map(item => {
      if (item.conversationId !== conversation.conversationId ||
          (item.titleType === 'manual' && conversation.titleType !== 'manual')) return item
      if (item.title === conversation.title && item.titleType === conversation.titleType &&
          item.titleGenerationStatus === conversation.titleGenerationStatus) return item
      changed = true
      return { ...item, title: conversation.title, titleType: conversation.titleType,
        titleGenerationStatus: conversation.titleGenerationStatus }
    })
    if (changed) store[setter]({ ...history, conversations })
  }
}
function refreshConversationTitle(conversationId) {
  if (!conversationId || titleJobs.has(conversationId)) return
  const job = { attempts: 0, version: epoch }
  titleJobs.set(conversationId, job)
  checkTitle(conversationId, job)
}
async function checkTitle(id, job) {
  if (!foreground || !online || job.running) return
  const valid = () => epoch === job.version && titleJobs.get(id) === job
  job.running = true
  const cached = () => [store.chatHistory, store.pinnedChatHistory].flatMap(history =>
    (history?.conversations || []).filter(item => item.conversationId === id))
  const before = cached().map(item => `${item.titleType}:${item.title}`).join('|')
  let pending = true
  try {
    const response = await getConversationMessagesStatus({ conversationId: id })
    if (!valid()) return
    acceptOwner(response.data.ownerKey)
    const conversation = response.data.conversation
    // A manual rename or newer list response wins over an in-flight status request.
    if (before === cached().map(item => `${item.titleType}:${item.title}`).join('|')) syncConversationTitle(conversation)
    pending = conversation?.titleGenerationStatus === 'pending'
  } catch (error) {
    if (error.code === 'ACCOUNT_CHANGED' || [400, 401, 403, 404].includes(error.statusCode)) pending = false
  } finally {
    job.running = false
    if (valid()) {
      if (pending && ++job.attempts < 19) job.timer = setTimeout(() => checkTitle(id, job), 2000)
      else titleJobs.delete(id)
    }
  }
}

function current(record, version = epoch) { return version === epoch && records.get(record.key) === record }
function setRun(run) {
  const previous = store.chatRuns[run.conversationId]
  if (previous?.turnId !== run.turnId && new Date(previous?.createdAt || 0) > new Date(run.createdAt || 0)) return
  store.setChatRun(run.conversationId, { ...run, ownerKey })
}
function publish(record) {
  if (!current(record)) return
  if (record.meta?.conversationId && record.request?.modeId !== 'temporary' && record.meta.modeId !== 'temporary') {
    setRun({ ...record.meta, status: record.status, connection: record.connection })
    if (record.status === 'completed' && record.assistant.status === 'completed' &&
        foreground && currentKey === record.key && !record.readRequested) {
      record.readRequested = true
      chatRuntime.markConversationRead(record.meta.conversationId, record.meta.runId)
    }
    if (record.meta.conversation && !record.listed) {
      const pinned = Boolean(record.meta.conversation.pinnedAt)
      const history = (pinned ? store.pinnedChatHistory : store.chatHistory) || {}
      const items = history.conversations || []
      const id = record.meta.conversationId
      const exists = items.some(item => item.conversationId === id)
      const updateHistory = pinned ? store.setPinnedChatHistory : store.setChatHistory
      updateHistory.call(store, { ...history, ownerKey, latestModifiedAt: '',
        conversations: [record.meta.conversation, ...items.filter(item => item.conversationId !== id)],
        nextOffset: (history.nextOffset ?? items.length) + (exists ? 0 : 1) })
      record.listed = true
    }
  }
  if (terminal(record.status) && record.meta.conversationId && !record.titleChecked &&
      record.request?.modeId !== 'temporary' && record.meta.modeId !== 'temporary') {
    record.titleChecked = true
    refreshConversationTitle(record.meta.conversationId)
  }
  for (const listener of record.listeners) listener(record)
  const running = runningTurns.get(record.group)
  if (terminal(record.status) && (running?.key === record.key || (running?.turnId && running.turnId === record.meta.turnId))) {
    runningTurns.delete(record.group)
    startNext(record.group, currentKey === record.key)
  }
}
function closeConnection(record) {
  record.generation += 1
  if (record.transport) record.transport.close()
  record.transport = null
  if (record.wake) record.wake()
  record.connection = online ? 'detached' : 'offline'
}
function delay(record, ms) {
  return new Promise(resolve => {
    const timer = setTimeout(done, ms)
    function done() { clearTimeout(timer); record.wake = null; resolve() }
    record.wake = done
  })
}
function acceptOwner(value) {
  if (!value) throw new Error('缺少账号标识')
  if (ownerKey && value !== ownerKey) throw Object.assign(new Error('账号已改变'), { code: 'ACCOUNT_CHANGED' })
  ownerKey = value
  store.setChatOwnerKey(value)
}

function acknowledgeRead(job) {
  if (job.running || !foreground || !online) return job.running
  const version = epoch
  unreadVersion += 1
  job.running = markConversationReadRequest({ conversationId:job.conversationId, completedRunId:job.runId })
    .then(response => {
      if (version !== epoch || readJobs.get(job.key) !== job) return
      acceptOwner(response.data.ownerKey)
      const local = store.unreadConversations[job.conversationId]
      const { completedRunId, unread } = response.data
      // A newer completion discovered while this receipt was in flight wins.
      if (!local || local === job.runId || local === completedRunId) {
        const next = { ...store.unreadConversations }
        if (unread && completedRunId) next[job.conversationId] = completedRunId
        else delete next[job.conversationId]
        store.setUnreadConversations(next)
      }
      readJobs.delete(job.key)
    }).catch(error => {
      if (version === epoch && (error.code === 'ACCOUNT_CHANGED' || [400, 401, 403, 404].includes(error.statusCode))) readJobs.delete(job.key)
    }).finally(() => {
      if (version === epoch) unreadVersion += 1
      job.running = null
    })
  return job.running
}
function recordFor(key) {
  if (!records.has(key)) records.set(key, { key, status: 'submitting', connection: 'detached', seq: -1,
    meta: {}, assistant: { content: '', contentParts: [], citations: [], processTrace: [] }, listeners: new Set(), generation: 0 })
  return records.get(key)
}
function enqueueTurn(record) {
  const queue = pendingTurns.get(record.group) || []
  queue.push(record)
  pendingTurns.set(record.group, queue)
  publish(record)
  startNext(record.group, true)
  if (['waiting', 'uploading'].includes(record.status) &&
      records.get(currentKey)?.group !== record.group) chatRuntime.setVisibleTurn(record.key)
}
function startNext(group, visible = false) {
  if (runningTurns.has(group)) return
  const known = store.chatRuns[group]
  if (known && validRunIds(known) && active(known.status)) {
    runningTurns.set(group, { turnId:known.turnId })
    schedulePoll()
    return
  }
  const queue = pendingTurns.get(group)
  if (!queue?.length) return
  if (queue[0].pendingReady) {
    // Keep visibility when the queue advances before the attachment is ready.
    if (visible) chatRuntime.setVisibleTurn(queue[0].key)
    return
  }
  const record = queue.shift()
  if (!queue.length) pendingTurns.delete(group)
  runningTurns.set(group, { key:record.key })
  record.status = 'submitting'
  record.connection = online ? 'detached' : 'offline'
  publish(record)
  startRecord(record, visible || currentKey === record.key)
}
function migrateGroup(record, conversationId) {
  const oldGroup = record.group
  if (!conversationId || oldGroup === conversationId) return
  const queued = pendingTurns.get(oldGroup) || []
  pendingTurns.delete(oldGroup)
  if (queued.length) {
    for (const item of queued) {
      item.group = conversationId
      if (item.request) item.request.conversationId = conversationId
      item.turn.conversationId = conversationId
    }
    pendingTurns.set(conversationId, [...(pendingTurns.get(conversationId) || []), ...queued])
  }
  for (const item of records.values()) if (item.group === oldGroup && item.status === 'failed' && !item.meta.turnId) {
    item.group = conversationId
    if (item.turn) item.turn.conversationId = conversationId
  }
  const running = runningTurns.get(oldGroup)
  if (running?.key === record.key) {
    runningTurns.delete(oldGroup)
    runningTurns.set(conversationId, running)
  }
  record.group = conversationId
}
function startRecord(record, visible) {
  if (record.creation) return
  const key = record.key
  const version = epoch
  record.creation = (async () => {
    let failures = 0
    while (current(record, version)) {
      if (!online) { await delay(record, 1000); continue }
      try {
        const response = await createChatTurn(record.request)
        if (!current(record, version)) return
        acceptOwner(response.data.ownerKey)
        if(viewStates.has(key)){ viewStates.set(response.data.conversationId, viewStates.get(key)); viewStates.delete(key) }
        migrateGroup(record, response.data.conversationId)
        const { streamTicket, ...turn } = response.data
        record.meta = turn
        record.firstSseTicket = streamTicket?.ticket ? {
          value: streamTicket.ticket,
          expiresAt: Date.now() + Math.max(0, Number(streamTicket.expiresIn) - 15) * 1000
        } : null
        if (terminal(response.data.status)) await finalSnapshot(record)
        else { record.status = record.cancelRequested ? 'cancelling' : response.data.status; publish(record) }
        if (record.cancelRequested) chatRuntime.cancelTurn(key).catch(() => schedulePoll())
        else if (currentKey === key && foreground && online) connect(record)
        schedulePoll()
        return
      } catch (error) {
        if (!current(record, version)) return
        const blocker = error.data?.activeTurn
        if (!record.regenerating && error.code === 'TURN_IN_PROGRESS' && validRunIds(blocker)) {
          runningTurns.set(record.group, { turnId:blocker.turnId })
          const blockerRecord = [...records.values()].find(item => item.meta.turnId === blocker.turnId)
            || recordFor(`cloud-${blocker.turnId}`)
          blockerRecord.group = record.group
          blockerRecord.meta = blocker
          blockerRecord.status = blocker.status
          const queue = pendingTurns.get(record.group) || []
          queue.unshift(record)
          pendingTurns.set(record.group, queue)
          record.status = 'waiting'
          record.connection = 'waiting'
          record.error = null
          publish(blockerRecord)
          publish(record)
          if (currentKey === record.key) chatRuntime.setVisibleTurn(blockerRecord.key)
          schedulePoll()
          return
        }
        if (error.statusCode && error.statusCode < 500 || error.code === 'ACCOUNT_CHANGED') {
          record.status = 'failed'; record.error = error; publish(record); return
        }
        record.connection = online ? 'reconnecting' : 'offline'; publish(record)
        await delay(record, Math.min(15000, 1000 * 2 ** Math.min(failures++, 4)))
      }
    }
  })().finally(() => { record.creation = null })
  if (visible) chatRuntime.setVisibleTurn(key)
}
function applySnapshot(record, assistant) {
  if(assistant?.runId && assistant.runId !== record.meta.runId) return
  if(Number.isInteger(assistant?.snapshotSeq) && assistant.snapshotSeq < record.seq) return
  if (record.cancelView) {
    record.seq = Number.isInteger(assistant?.snapshotSeq) ? assistant.snapshotSeq : record.seq
    record.cancelView = {...record.cancelView, processTrace:normalizeProcessTrace(assistant?.processTrace),
      modelRequests:assistant?.modelRequests || []}
    record.assistant = record.cancelView
    return
  }
  record.assistant = { ...assistant, textSegments:normalizeSegments(assistant?.textSegments), modelRequests:assistant?.modelRequests || [], content: assistant?.content || '', contentParts: assistant?.contentParts || [],
    citations: normalizeCitations(assistant?.citations), processTrace: normalizeProcessTrace(assistant?.processTrace) }
  if(record.assistant.textSegments.length && !record.assistant.displayStop) Object.assign(record.assistant,mainTextProjection(record.assistant.textSegments))
  record.seq = Number.isInteger(assistant?.snapshotSeq) ? assistant.snapshotSeq : -1
}
async function finalSnapshot(record) {
  const version = epoch
  const response = await getConversationMessages({ conversationId: record.meta.conversationId, turnId: record.meta.turnId })
  if (!current(record, version)) return
  acceptOwner(response.data.ownerKey)
  const messages = response.data.turnMessages || []
  const assistant = messages.find(item => item.role === 'assistant')
  const turn = response.data.turn
  if (!turn || turn.conversationId !== record.meta.conversationId || turn.turnId !== record.meta.turnId || turn.runId !== record.meta.runId ||
      (assistant?.runId && assistant.runId !== record.meta.runId) ||
      (assistant?.turnId && assistant.turnId !== record.meta.turnId) ||
      (assistant?.conversationId && assistant.conversationId !== record.meta.conversationId)) throw new Error('轮次标识不一致')
  if (!assistant || !terminal(assistant.status) || assistant.status !== turn.status) throw new Error('终态快照尚未就绪')
  if (Number.isSafeInteger(assistant.snapshotSeq) && assistant.snapshotSeq < record.seq) {
    if (assistant.snapshotSeq < -1 || assistant.snapshotSeq !== turn.lastEventSeq) throw new Error('恢复快照不合法')
    // Status discovery may finish a hidden run after its live buffer was lost on restart.
    record.seq = assistant.snapshotSeq
  }
  applySnapshot(record, assistant)
  record.user = messages.find(item => item.role === 'user') || record.user
  record.status = assistant.status
  if (record.cancelView) record.assistant = record.cancelView
  record.meta = { ...record.meta, ...turn }
  record.connection = 'detached'
  publish(record)
}
async function connect(record) {
  closeConnection(record)
  const generation = record.generation
  const version = epoch
  const valid = () => current(record, version) && record.generation === generation && currentKey === record.key && foreground && online
  let failures = 0
  while (valid() && active(record.status) && record.meta.turnId) {
    record.connection = failures ? 'reconnecting' : 'connecting'
    publish(record)
    try {
      const firstTicket = record.firstSseTicket
      record.firstSseTicket = null
      const transport = attachChatTurn({ ...record.meta, afterSeq: record.seq,
        initialTicket: firstTicket?.expiresAt > Date.now() ? firstTicket.value : undefined })
      record.transport = transport
      let terminalEvent = false
      for await (const event of transport.eventStream) {
        if (!valid()) return
        if (event.data === '[DONE]') { terminalEvent = true; break }
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        if (data.conversationId !== record.meta.conversationId || data.turnId !== record.meta.turnId || data.runId !== record.meta.runId) throw new Error('轮次标识不一致')
        if (data.type === 'snapshot') {
          acceptOwner(data.ownerKey)
          const { assistant, type, protocolVersion, snapshotSeq, resetCursor, ...meta } = data
          if (resetCursor === true) {
            if (!Number.isSafeInteger(snapshotSeq) || snapshotSeq < -1 || assistant?.snapshotSeq !== snapshotSeq ||
                (assistant?.runId && assistant.runId !== record.meta.runId) ||
                (assistant?.turnId && assistant.turnId !== record.meta.turnId) ||
                (assistant?.conversationId && assistant.conversationId !== record.meta.conversationId)) {
              throw new Error('恢复快照不合法')
            }
            // A restarted server can only restore its durable checkpoint, below our live cursor.
            record.seq = snapshotSeq
          }
          record.meta = { ...record.meta, ...meta }
          // Ordinary older snapshots must not roll back a newer in-memory projection.
          if (Number.isInteger(data.snapshotSeq) && data.snapshotSeq >= record.seq) applySnapshot(record, data.assistant)
          record.status = record.cancelRequested && active(data.status) ? 'cancelling' : data.status
          record.connection = 'connected'
          failures = 0
          if (terminal(data.status)) { applySnapshot(record, data.assistant); terminalEvent = true }
          publish(record)
          if (terminalEvent) break
          continue
        }
        if (data.type === 'reconnect') break
        if (data.protocolVersion !== 1 || !Number.isInteger(data.seq)) throw new Error('事件协议不合法')
        if (data.seq <= record.seq) continue
        if (data.seq !== record.seq + 1) { record.seq = -1; break }
        record.seq = data.seq
        if (['done', 'cancelled', 'error'].includes(data.type)) { terminalEvent = true; break }
        if (record.cancelView) {
          const update = data.payload?.choices?.[0]?.delta || {}
          if(update.process_event && (!update.process_event.runId || update.process_event.runId === record.meta.runId))
            record.cancelView.processTrace = applyProcessEvent(record.cancelView.processTrace,update.process_event)
          if(update.process_event) record.cancelView.processTrace = applyProcessPresentations(record.cancelView.processTrace,update.presentation_updates)
          record.assistant = record.cancelView
          publish(record)
          continue
        }
        const delta = data.payload?.choices?.[0]?.delta || {}
        const assistant = record.assistant
        if(delta.message_segment && delta.message_segment.runId === record.meta.runId){
          assistant.textSegments = applySegment(assistant.textSegments,delta.message_segment)
          assistant.content = finalContent(assistant.textSegments)
          Object.assign(assistant,mainTextProjection(assistant.textSegments))
          assistant.processTrace = projectSegments(assistant.processTrace,assistant.textSegments)
        }
        if(delta.model_request && delta.model_request.runId === record.meta.runId){
          const requests = assistant.modelRequests || (assistant.modelRequests = [])
          const previous = requests.find(row => row.modelRequestId === delta.model_request.modelRequestId)
          if(previous){
            if(!['completed','failed','cancelled','unknown'].includes(previous.status)) Object.assign(previous,delta.model_request)
          }
          else if(requests.length < 32) requests.push(delta.model_request)
        }
        if (delta.content) assistant.content += delta.content
        if (delta.process_content && (!delta.process_content.runId || delta.process_content.runId === record.meta.runId)) assistant.processTrace = applyProcessResponseContent(assistant.processTrace, delta.process_content.text, delta.process_content)
        if (delta.process_event && (!delta.process_event.runId || delta.process_event.runId === record.meta.runId)) assistant.processTrace = applyProcessEvent(assistant.processTrace, delta.process_event)
        if (delta.reasoning_content) {
          if (assistant.processTrace.length) assistant.processTrace = applyProcessResponseContent(assistant.processTrace, delta.reasoning_content)
          else assistant.reasoningContent = (assistant.reasoningContent || '') + delta.reasoning_content
        }
        if (delta.citations) assistant.citations = normalizeCitations(delta.citations)
        if(delta.presentation_updates) assistant.processTrace = applyProcessPresentations(assistant.processTrace,delta.presentation_updates)
        if (Array.isArray(delta.file_delivery)) {
          const files = delta.file_delivery.filter(x => x && x.type === 'attachment' && x.assetId)
          const ids = new Set(files.map(x => x.assetId))
          assistant.contentParts = [...assistant.contentParts.filter(x => !ids.has(x.assetId)), ...files]
          assistant.attachments = assistant.contentParts.filter(x => x.type === 'attachment')
        }
        if (delta.image_generation) assistant.contentParts = mergeGeneratedImages(assistant.contentParts, delta.image_generation)
        publish(record)
      }
      transport.close()
      if (record.transport === transport) record.transport = null
      if (!valid()) return
      if (terminalEvent) {
        if (!terminal(record.status)) await finalSnapshot(record)
        return
      }
      // A bounded subscription renews immediately; only failed connections back off.
    } catch (error) {
      if (!valid()) return
      if (record.transport) record.transport.close()
      record.transport = null
      if (error.code === 'ACCOUNT_CHANGED' || [400, 401, 403, 404].includes(error.statusCode)) {
        record.error = error
        record.status = 'failed'
        record.connection = 'detached'
        publish(record)
        return
      }
      record.connection = 'reconnecting'
      publish(record)
      schedulePoll()
      await delay(record, Math.min(15000, 1000 * 2 ** Math.min(failures++, 4)) + Math.floor(Math.random() * 250))
    }
  }
}
function schedulePoll() {
  clearTimeout(pollTimer)
  pollTimer = null
  if (!pollBlocked && foreground && online) {
    pollTimer = setTimeout(() => discover().catch(() => {}), 5000)
  }
}
async function discover() {
  if (!foreground || !online || polling) return
  const version = epoch
  const readVersion = unreadVersion
  polling = true
  try {
    for (const run of Object.values(store.chatRuns)) {
      if (active(run.status) && !validRunIds(run)) store.removeChatRun(run.conversationId)
    }
    const known = Object.values(store.chatRuns).filter(run => validRunIds(run) && active(run.status))
    const identifiers = known.map(({ conversationId, turnId, runId }) => ({ conversationId, turnId, runId }))
    let offset = 0
    const turns = []
    do {
      const response = await getChatTurnsStatus({ turns: identifiers.slice(0, 50), discoverActive: true, offset })
      if (version !== epoch) return
      acceptOwner(response.data.ownerKey)
      if (offset === 0 && readVersion === unreadVersion && response.data.unreadConversations) {
        store.setUnreadConversations(response.data.unreadConversations)
      }
      turns.push(...response.data.turns.filter(validRunIds))
      offset = response.data.nextOffset
    } while (offset !== null && offset !== undefined)
    for (let index = 50; index < identifiers.length; index += 50) {
      const response = await getChatTurnsStatus({ turns: identifiers.slice(index, index + 50) })
      if (version !== epoch) return
      acceptOwner(response.data.ownerKey)
      turns.push(...response.data.turns.filter(validRunIds))
    }
    for (const run of turns) {
      if (version !== epoch) return
      setRun(run)
      if (terminal(run.status) && run.modeId !== 'temporary') refreshConversationTitle(run.conversationId)
      if (terminal(run.status) && runningTurns.get(run.conversationId)?.turnId === run.turnId) {
        runningTurns.delete(run.conversationId)
        startNext(run.conversationId, currentKey === pendingTurns.get(run.conversationId)?.[0]?.key)
      }
      for (const record of records.values()) {
        if (record.meta.turnId !== run.turnId || !active(record.status)) continue
        if (terminal(run.status)) {
          closeConnection(record)
          await finalSnapshot(record)
        }
        else {
          record.status = record.cancelRequested && active(run.status) ? 'cancelling' : run.status
          publish(record)
          if (record.cancelRequested) await chatRuntime.cancelTurn(record.key)
          else if (currentKey === record.key && !record.transport) connect(record)
        }
      }
    }
    if (version !== epoch) return
    for (const job of readJobs.values()) acknowledgeRead(job)
    for (const run of known) if (!turns.some(item => item.turnId === run.turnId)) {
      store.removeChatRun(run.conversationId)
      for (const record of records.values()) if (record.meta.turnId === run.turnId && active(record.status)) {
        closeConnection(record)
        record.status = 'failed'
        record.error = Object.assign(new Error('轮次已不可用'), { statusCode: 404 })
        publish(record)
      }
      if (runningTurns.get(run.conversationId)?.turnId === run.turnId) {
        runningTurns.delete(run.conversationId)
        startNext(run.conversationId, currentKey === pendingTurns.get(run.conversationId)?.[0]?.key)
      }
    }
    pollBlocked = false
    const inactive = [...records.values()].filter(record => terminal(record.status) && record.meta.turnId && !record.listeners.size && record.key !== currentKey)
    for (const record of inactive.slice(0, Math.max(0, inactive.length - 10))) records.delete(record.key)
  } catch (error) {
    const status = Number(error?.statusCode || error?.errCode)
    if (error?.code === 'ACCOUNT_CHANGED' || (status >= 400 && status < 500)) pollBlocked = true
    throw error
  } finally {
    if (version === epoch) { polling = false; schedulePoll() }
  }
}

export const chatRuntime = {
  acceptOwner,
  markConversationRead(conversationId, runId) {
    if (!conversationId || !runId) return
    const key = `${conversationId}:${runId}`
    if (!readJobs.has(key)) readJobs.set(key, { key, conversationId, runId })
    return acknowledgeRead(readJobs.get(key))
  },
  refreshConversationTitle,
  submitTurn(key, params) {
    pollBlocked = false
    const record = recordFor(key)
    if (record.request || record.pendingReady) return record
    record.request = JSON.parse(JSON.stringify(prepareChatTurn(params)))
    record.group = params.queueGroup || params.conversationId || key
    record.regenerating = Boolean(params.regenerateFromTurnId)
    record.turn = { ...params, requestReady:true }
    if (record.regenerating) {
      runningTurns.set(record.group, { key })
      startRecord(record, true)
      return record
    }
    record.status = 'waiting'
    record.connection = 'waiting'
    enqueueTurn(record)
    return record
  },
  submitTurnWhenReady(key, turn, ready) {
    pollBlocked = false
    const record = recordFor(key)
    if(record.request || record.pendingReady) return record
    const version = epoch
    record.group = turn.queueGroup || turn.conversationId || key
    record.turn = { ...turn, requestReady:true }
    record.pendingReady = true
    record.status = 'uploading'
    record.connection = 'uploading'
    record.error = null
    enqueueTurn(record)
    Promise.resolve(ready).then(params => {
      if(!current(record, version) || !record.pendingReady) return
      const turn = { ...params, conversationId:record.turn.conversationId || params.conversationId, requestReady:true }
      const request = JSON.parse(JSON.stringify(prepareChatTurn(turn)))
      record.pendingReady = false
      record.turn = turn
      record.request = request
      record.status = 'waiting'
      record.connection = 'waiting'
      publish(record)
      startNext(record.group, currentKey === key)
    }).catch(error => {
      if(!current(record, version) || !record.pendingReady) return
      record.pendingReady = false
      const pending = pendingTurns.get(record.group) || []
      const remaining = pending.filter(item => item !== record)
      if(remaining.length) pendingTurns.set(record.group, remaining)
      else pendingTurns.delete(record.group)
      record.status = 'failed'
      record.connection = 'detached'
      record.error = error
      publish(record)
      startNext(record.group, currentKey === key)
    })
    return record
  },
  failLocalTurn(key, turn, error) {
    const record = recordFor(key)
    record.group = turn.queueGroup || turn.conversationId || key
    record.turn = { ...turn, requestReady:true }
    record.status = 'failed'
    record.error = error
    publish(record)
    return record
  },
  retryLocalTurn(key, params) {
    const record = records.get(key)
    if (!record || record.status !== 'failed' || record.meta.turnId) return null
    record.request = null
    record.error = null
    record.cancelRequested = false
    record.meta = {}
    record.user = null
    record.assistant = { content:'', contentParts:[], citations:[], processTrace:[] }
    record.seq = -1
    return this.submitTurn(key, params)
  },
  retryTurnWhenReady(key, turn, ready) {
    const record = records.get(key)
    if(!record || record.status !== 'failed' || record.meta.turnId) return null
    record.request = null
    record.error = null
    record.cancelRequested = false
    record.meta = {}
    record.user = null
    record.assistant = { content:'', contentParts:[], citations:[], processTrace:[] }
    record.seq = -1
    return this.submitTurnWhenReady(key, turn, ready)
  },
  getPendingTurns(conversationId) {
    return [...records.values()].filter(record => record.group === conversationId && record.turn &&
      !record.meta.turnId && !record.regenerating && ['uploading', 'waiting', 'submitting', 'failed'].includes(record.status))
      .reverse().map(record => ({ ...record.turn, localStatus:record.status, layoutOwner:false }))
  },
  getRunningKey(conversationId) {
    const running = runningTurns.get(conversationId)
    if (running) return running.key || [...records.values()].find(record => record.meta.turnId === running.turnId)?.key || ''
    return pendingTurns.get(conversationId)?.[0]?.key || ''
  },
  restoreConversation(data) {
    acceptOwner(data.ownerKey)
    if (!data.activeTurn) return null
    const run = data.activeTurn
    const record = [...records.values()].find(item => item.meta.turnId === run.turnId) || recordFor(`cloud-${run.turnId}`)
    record.group = run.conversationId
    record.meta = run
    record.status = record.cancelRequested && active(run.status) ? 'cancelling'
      : terminal(record.assistant.status) ? record.assistant.status : run.status
    if (active(record.status) && !runningTurns.has(record.group)) runningTurns.set(record.group, { turnId:run.turnId })
    const messages = data.turnMessages || data.messages || []
    record.user = messages.find(item => item.messageId === run.userMessageId)
    const assistant = messages.find(item => item.messageId === run.assistantMessageId)
    if (Number.isInteger(assistant?.snapshotSeq) && assistant.snapshotSeq >= record.seq) applySnapshot(record, assistant)
    publish(record)
    return record
  },
  observe(key, listener) {
    const record = records.get(key)
    if (!record) return () => {}
    record.listeners.add(listener)
    listener(record)
    if (terminal(record.status)) record.listeners.delete(listener)
    return () => record.listeners.delete(listener)
  },
  setVisibleTurn(key = '') {
    if (currentKey === key) {
      const record = records.get(key)
      if (record && !record.transport && active(record.status) && foreground && online) connect(record)
      return
    }
    const previous = records.get(currentKey)
    if (previous) {
      closeConnection(previous)
      if (previous.group && previous.group !== records.get(key)?.group &&
          (previous.request?.modeId === 'temporary' || pendingTurns.get(previous.group)?.[0]?.turn?.modeId === 'temporary')) {
        const queue = pendingTurns.get(previous.group) || []
        for (const item of queue) records.delete(item.key)
        pendingTurns.delete(previous.group)
        if (previous.request?.modeId === 'temporary' && active(previous.status)) this.cancelTurn(previous.key).catch(() => {})
      }
    }
    currentKey = key
    const record = records.get(key)
    if (record && active(record.status) && foreground && online) connect(record)
    schedulePoll()
  },
  async cancelTurn(key, displayStop) {
    const record = records.get(key)
    if(record?.pendingReady){
      record.pendingReady = false
      const pending = pendingTurns.get(record.group) || []
      const remaining = pending.filter(item => item !== record)
      if(remaining.length) pendingTurns.set(record.group, remaining)
      else pendingTurns.delete(record.group)
      record.status = 'cancelled'
      publish(record)
      startNext(record.group, currentKey === key)
      return
    }
    if (!record || !active(record.status) && !displayStop) return
    if (!record.cancelRequested) {
      record.cancelRequested = true
      const startedAt = new Date(record.meta.createdAt || 0).getTime()
      record.cancelView = JSON.parse(JSON.stringify(record.assistant))
      if(displayStop){
        record.cancelView.content = record.cancelView.content.slice(0, displayStop.contentLength)
        record.cancelView.displayContent = record.cancelView.content
        record.cancelView.textSegments = stoppedSegments(record.cancelView.textSegments, record.cancelView.content.length)
      }
      record.cancelView.processTrace = normalizeProcessTrace(record.cancelView.processTrace)
      record.cancelView.processDurationMs = Number.isSafeInteger(displayStop?.processDurationMs) ? displayStop.processDurationMs : Number.isFinite(startedAt) && startedAt > 0
        ? Math.max(0, Date.now() - startedAt) : record.cancelView.processDurationMs || 0
      if(displayStop){
        record.displayStop = {contentLength:displayStop.contentLength, processDurationMs:record.cancelView.processDurationMs}
        record.cancelView.displayStop = record.displayStop
      }
      record.assistant = record.cancelView
      if(active(record.status)) record.status = 'cancelling'
      publish(record)
    }
    if (!record.meta.turnId) return
    if (record.cancellation) return record.cancellation
    const version = epoch
    record.cancellation = (async () => {
      let failures = 0
      while (current(record, version) && (active(record.status) || record.displayStop)) {
        if (!online) { await delay(record, 1000); continue }
        try {
          const response = await cancelChatTurn({...record.meta, ...(record.displayStop ? {displayStop:record.displayStop} : {})})
          if (!current(record, version)) return
          if (record.request?.modeId === 'temporary' && currentKey !== key) {
            closeConnection(record)
            records.delete(key)
            return
          }
          if (terminal(response.data.status)) await finalSnapshot(record)
          else { record.status = record.cancelRequested ? 'cancelling' : response.data.status; publish(record) }
          schedulePoll()
          return
        } catch (error) {
          if (!current(record, version)) return
          if (error.statusCode && error.statusCode < 500) throw error
          await delay(record, Math.min(15000, 1000 * 2 ** Math.min(failures++, 4)))
        }
      }
    })().finally(() => { record.cancellation = null })
    return record.cancellation
  },
  setForeground(value) {
    const entering = value && !foreground
    foreground = value
    clearTimeout(pollTimer)
    const record = records.get(currentKey)
    if (!value) {
      if (record) { closeConnection(record); if (record.request?.modeId === 'temporary') this.cancelTurn(record.key).catch(() => {}) }
      return
    }
    if (online) {
      if (entering) pollBlocked = false
      for (const [id, job] of titleJobs) { clearTimeout(job.timer); checkTitle(id, job) }
      if (record && active(record.status)) connect(record)
      for (const job of readJobs.values()) acknowledgeRead(job)
      discover().catch(() => {})
    }
  },
  setOnline(value) {
    online = value
    const record = records.get(currentKey)
    if (record) { closeConnection(record); publish(record) }
    if (foreground && value) this.setForeground(true)
  },
  saveView(conversationId, state) {
    if (!conversationId) return
    viewStates.delete(conversationId)
    viewStates.set(conversationId, state)
    while (viewStates.size > 10) viewStates.delete(viewStates.keys().next().value)
  },
  getView(conversationId) { return viewStates.get(conversationId) },
  get epoch() { return epoch },
  reset() {
    epoch += 1
    clearTimeout(pollTimer)
    for (const record of records.values()) closeConnection(record)
    for (const job of titleJobs.values()) clearTimeout(job.timer)
    titleJobs.clear(); readJobs.clear(); unreadVersion += 1
    records.clear(); pendingTurns.clear(); runningTurns.clear(); viewStates.clear(); currentKey = ''; ownerKey = ''; polling = false; pollBlocked = false
    store.resetChatRuns()
  }
}

eventBus.on(CHAT_SESSION_RESET, ({ reason } = {}) => {
  if (reason !== 'new-chat') { chatRuntime.reset(); if(foreground && online) discover().catch(() => {}) }
})
