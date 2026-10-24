import { apiBaseUrl } from '../app_config'

let session = null
let loginPromise = null

function requestUrl(path) {
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('接口路径不合法')
  return apiBaseUrl + path
}

function requestJson(path, data, credential) {
  return new Promise((resolve, reject) => wx.request({
    url: requestUrl(path), method: 'POST', data, dataType: 'json',
    header: { 'Content-Type': 'application/json',
      ...(credential ? { Authorization: `Bearer ${credential}` } : {}) },
    success: resolve, fail: reject
  }))
}

function responseData(response) {
  const result = typeof response?.data === 'string' ? JSON.parse(response.data) : response?.data
  if (!result || typeof result !== 'object') throw new Error('响应格式不合法')
  return result
}

async function issueSession() {
  const login = await new Promise((resolve, reject) => wx.login({ success: resolve, fail: reject }))
  if (!login?.code) throw new Error('微信登录凭证获取失败')
  const response = await requestJson('/auth/session', { code: login.code })
  const result = responseData(response)
  if (response.statusCode !== 200 || result.code !== 200 || !result.data?.token) {
    throw new Error(result.msg || '微信身份校验失败')
  }
  session = { token: result.data.token, expiresAt: Date.now() + (result.data.expiresIn - 60) * 1000 }
  return session.token
}

async function token() {
  if (session?.expiresAt > Date.now()) return session.token
  if (!loginPromise) loginPromise = issueSession().finally(() => { loginPromise = null })
  return loginPromise
}

export async function callHttp(path, data) {
  const credential = await token()
  let response = await requestJson(path, data, credential)
  if (response.statusCode === 401) {
    if (session?.token === credential) session = null
    response = await requestJson(path, data, await token())
  }
  return { statusCode: response.statusCode, result: responseData(response) }
}

export function startHttpBinary(path, data) {
  const requestId = 'tts_' + Date.now() + '_' + Math.random().toString(36).slice(2, 12)
  let cancelled = false, task = null, rejectRequest
  const promise = new Promise((resolve, reject) => {
    rejectRequest = reject
    const open = async () => {
      let credential = await token()
      for (let attempt = 0; attempt < 2; attempt++) {
        if (cancelled) return
        const response = await new Promise((resolve, reject) => {
          task = wx.request({ url:requestUrl(path), method:'POST', data,
            responseType:'arraybuffer', timeout:330000,
            header:{ 'Content-Type':'application/json', Accept:'audio/mpeg', Authorization:`Bearer ${credential}`, 'Idempotency-Key': requestId },
            success:resolve, fail:reject })
        })
        if (cancelled) return
        if (response.statusCode === 401 && attempt === 0) {
          if (session?.token === credential) session = null
          credential = await token()
          continue
        }
        const headers = response.header || {}
        const type = headers[Object.keys(headers).find(key => key.toLowerCase() === 'content-type')] || ''
        if (response.statusCode !== 200 || !/^audio\/mpeg(?:;|$)/i.test(type) || !response.data?.byteLength) {
          let problem = {}
          if (/^application\/json(?:;|$)/i.test(type) && response.data?.byteLength <= 16384) {
            try {
              const encoded = Array.from(new Uint8Array(response.data), byte => '%' + byte.toString(16).padStart(2, '0')).join('')
              const parsed = JSON.parse(decodeURIComponent(encoded))
              problem = parsed && typeof parsed === 'object' ? parsed : {}
            } catch (_) {}
          }
          throw Object.assign(new Error(problem.msg || 'Audio request failed'), { statusCode:response.statusCode, code:problem.code })
        }
        resolve(response.data)
        return
      }
    }
    open().catch(reject)
  })
  return { promise, abort() {
    if (cancelled) return
    cancelled = true
    task?.abort()
    rejectRequest(new Error('Audio request cancelled'))
  } }
}

export function startHttpAudioUpload(path, data) {
  const requestId = 'asr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 12)
  let cancelled = false, task = null, rejectRequest
  const promise = new Promise((resolve, reject) => {
    rejectRequest = reject
    const open = async () => {
      let credential = await token()
      for (let attempt = 0; attempt < 2; attempt++) {
        if (cancelled) return
        const response = await new Promise((resolve, reject) => {
          task = wx.request({ url:requestUrl(path), method:'POST', data,
            responseType:'text', dataType:'json', timeout:120000,
            header:{ 'Content-Type':'application/octet-stream', Accept:'application/json', Authorization:`Bearer ${credential}`, 'Idempotency-Key': requestId },
            success:resolve, fail:reject })
        })
        if (cancelled) return
        if (response.statusCode === 401 && attempt === 0) {
          if (session?.token === credential) session = null
          credential = await token()
          continue
        }
        const result = responseData(response)
        if (response.statusCode !== 200 || result.code !== 200 || typeof result.data?.text !== 'string' || !result.data.text.trim()) {
          throw Object.assign(new Error(result.msg || 'Transcription request failed'), { statusCode:response.statusCode, code:result.code })
        }
        resolve(result.data.text)
        return
      }
    }
    open().catch(reject)
  })
  return { promise, abort() {
    if (cancelled) return
    cancelled = true
    task?.abort()
    rejectRequest(new Error('Transcription request cancelled'))
  } }
}

export function startHttpSse(path, data, onChunk, onComplete, onFail, initialTicket) {
  let cancelled = false
  let active = null
  const scope = { conversationId: data.conversationId, turnId: data.turnId, runId: data.runId }
  const detach = attempt => {
    attempt.task?.offChunkReceived?.(attempt.chunk)
    attempt.task?.offHeadersReceived?.(attempt.headers)
  }
  const fail = error => {
    if (cancelled) return
    cancelled = true
    if (active) { detach(active); active.task?.abort() }
    onFail(error)
  }
  const ticket = async () => {
    const response = await callHttp('/turns/ticket', scope)
    if (response.statusCode !== 200 || response.result.code !== 200 || !response.result.data?.ticket) {
      throw Object.assign(new Error(response.result.msg || '流式票据获取失败'), { statusCode: response.statusCode })
    }
    return response.result.data.ticket
  }
  const open = async (credential, renewed = false) => {
    if (!credential) credential = await ticket()
    if (cancelled) return
    const attempt = { status: 0, sse: false, task: null }
    active = attempt
    const current = () => !cancelled && active === attempt
    attempt.headers = res => {
      if (!current()) return
      attempt.status = res.statusCode
      const headers = res.header || {}
      const key = Object.keys(headers).find(key => key.toLowerCase() === 'content-type')
      attempt.sse = /^text\/event-stream(?:;|$)/i.test(String(headers[key] || ''))
    }
    attempt.chunk = res => { if (current() && attempt.status === 200 && attempt.sse) onChunk(res) }
    attempt.task = wx.request({
      url: requestUrl(path), method: 'POST', data, enableChunked: true, responseType: 'arraybuffer',
      header: { 'Content-Type': 'application/json', Accept: 'text/event-stream', Authorization: `Bearer ${credential}` },
      success: res => {
        if (!current()) return
        detach(attempt)
        if (res.statusCode === 401 && !renewed) {
          active = null
          ticket().then(value => open(value, true)).catch(fail)
          return
        }
        if (res.statusCode === 200 && !attempt.sse) {
          fail(new Error('流式响应格式不合法'))
          return
        }
        cancelled = true
        onComplete(res)
      },
      fail: error => { if (current()) fail(error) }
    })
    attempt.task.onHeadersReceived(attempt.headers)
    attempt.task.onChunkReceived(attempt.chunk)
    if (cancelled || active !== attempt) { detach(attempt); attempt.task.abort() }
  }
  open(initialTicket).catch(fail)
  return { abort() {
    cancelled = true
    if (active) { detach(active); active.task?.abort() }
  } }
}


export async function downloadHttpFile(path) {
  let credential = await token()
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await new Promise((resolve, reject) => wx.downloadFile({
      url: requestUrl(path), header: { Authorization: `Bearer ${credential}` },
      success: resolve, fail: reject
    }))
    if (response.statusCode === 401 && attempt === 0) {
      if (session?.token === credential) session = null
      credential = await token()
      continue
    }
    if (response.statusCode !== 200 || !response.tempFilePath) throw new Error('导出文件不可用，请重新导出')
    return response.tempFilePath
  }
}
