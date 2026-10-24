const { bindPageTheme, unbindPageTheme, syncThemeNavigation } = require('../../../static_utils/themeBinding')
import { getConversationMessages, unarchiveConversation } from '../../../request/chatStream'
import { store } from '../../../store/index'
const { messages: translations } = require('../../../static_utils/i18n/index')
const { getAccentStyle } = require('../../../static_utils/accentColor')
const { getMessageAttachments } = require('../../../static_utils/chatAttachment')
const { previewStorageFile, openStorageUpgrade } = require('../../../static_utils/filePreview')
const { artifactAttachmentDetail } = require('../../../static_utils/chatArtifacts')
const { normalizeCitations } = require('../../../static_utils/chatSources')
const { normalizeProcessTrace, isVisibleProcessNode, formatProcessDuration } = require('../../../static_utils/processTrace')
const { static: parseMarkdown } = require('../../components/towxmlstream/index')

function renderMessage(message, theme = 'light', language = '中文') {
  if (!message?.messageId || !['user', 'assistant'].includes(message.role)) return null
  const content = typeof message.content === 'string' ? message.content : ''
  const processTrace = normalizeProcessTrace(message.processTrace).filter(isVisibleProcessNode)
  const processDurationMs = Number(message.processDurationMs) || 0
  return {
    thinking: processTrace.length > 0,
    thinkStatus: 2, thinkOpen: false,
    processTrace, processDurationMs,
    thinkDurationText: processDurationMs > 0 ? formatProcessDuration(processDurationMs, language) : '',
    feedback: message.feedback || null,
    messageId: message.messageId,
    domId: `archive-message-${message.messageId}`,
    role: message.role,
    content,
    contentParts: message.contentParts || [],
    attachments: getMessageAttachments(message.contentParts),
    citations: normalizeCitations(message.citations),
    article: message.role === 'assistant' && content.trim()
      ? parseMarkdown(content, 'markdown', { theme, citations:message.citations, images:message.contentParts })
      : null
  }
}

Page({
  async previewArtifact(e) {
    const message = this.data.messages.find(item => item.messageId === e.currentTarget.dataset.messageId)
    const detail = artifactAttachmentDetail(message?.contentParts, e.detail?.link)
    if (!detail) return wx.showToast({ title: this.data.i18n.assets.previewFailed, icon: 'none' })
    await this.previewMessageAttachment({ detail })
  },
  async previewMessageAttachment(e) {
    const { attachment, attachments } = e.detail || {}
    if (!attachment) return
    if (attachment.unavailableReason) return this.openDeletedMessageAsset()
    await previewStorageFile(attachment, { relatedItems: attachments, language: this.data.language })
  },
  openDeletedMessageAsset() { this.selectComponent('#deletedAssetNotice')?.show(this.data.i18n.assets.fileDeleted) },
  openStorageUpgrade() {
    this.selectComponent('#deletedAssetNotice')?.hide()
    openStorageUpgrade()
  },
  onShow() { syncThemeNavigation(this) },
  data: {
    title: '', messages: [], nextCursor: null, hasMore: true,
    loading: false, failed: false, unarchiving: false, canUnarchive: false,
    scrollIntoView: '', language: '中文', i18n: translations('中文'), safeBottom: 20
  },

  onLoad(options) {
    bindPageTheme(this)
    this._alive = true
    this._conversationId = options.conversationId || ''
    this._eventChannel = this.getOpenerEventChannel()
    const system = wx.getWindowInfo()
    const language = store.applicationSettings.language
    const i18n = translations(language)
    this.setData({
      language, i18n, title: i18n.archive.title,
      accentStyle: getAccentStyle(store.applicationSettings.pointColor, store.effectiveTheme),
      safeBottom: Math.max(0, system.screenHeight - (system.safeArea?.bottom || system.screenHeight)) + 20
    })
    this.loadMessages()
  },

  onUnload() {
    unbindPageTheme(this)
    this._alive = false
  },

  async loadMessages() {
    if (this._loading || this.data.unarchiving) return
    if (this.data.messages.length && !this.data.hasMore) return
    if (!this._conversationId) {
      this.setData({ failed: true })
      return
    }
    this._loading = true
    this.setData({ loading: true, failed: false })
    try {
      const res = await getConversationMessages({ conversationId: this._conversationId, beforeSeq: this.data.nextCursor })
      if (!this._alive) return
      const page = res?.data
      if (!Array.isArray(page?.messages) || page.conversation?.conversationId !== this._conversationId) {
        throw new Error(this.data.i18n.archive.messageLoadFailed)
      }
      const existingIds = new Set(this.data.messages.map(item => item.messageId))
      const earlier = page.messages.filter(item => !existingIds.has(item.messageId)).map(item => renderMessage(item, this.data.effectiveTheme, this.data.language)).filter(Boolean)
      this._scrollTarget = this.data.messages[0]?.domId || 'archive-bottom'
      this.setData({
        title: page.conversation.title || this.data.i18n.archive.title,
        canUnarchive: page.conversation.status === 'archived',
        messages: earlier.concat(this.data.messages),
        nextCursor: page.nextCursor, hasMore: page.hasMore === true,
        loading: false, scrollIntoView: ''
      }, () => this.finishScroll())
    } catch (error) {
      if (this._alive) this.setData({ loading: false, failed: true })
    } finally {
      this._loading = false
    }
  },

  finishScroll() {
    if (!this._alive || !this._scrollTarget) return
    const target = this._scrollTarget
    this._scrollTarget = ''
    wx.nextTick(() => {
      if (this._alive) this.setData({ scrollIntoView: target })
    })
  },

  async unarchive() {
    if (this.data.unarchiving || !this.data.canUnarchive) return
    this.setData({ unarchiving: true })
    try {
      await unarchiveConversation({ conversationId: this._conversationId })
      store.resetChatHistory()
      this._eventChannel.emit('unarchived', { conversationId: this._conversationId })
      if (this._alive) this.closePage()
    } catch (error) {
      if (this._alive) wx.showToast({ title: error?.message || this.data.i18n.archive.actionFailed, icon: 'none' })
    } finally {
      if (this._alive) this.setData({ unarchiving: false })
    }
  },

  copyMessage(e) {
    wx.setClipboardData({ data: e.detail.content || '' })
  },

  openSources(e) {
    const citations = normalizeCitations(e.detail?.citations)
    if (!citations.length) return
    wx.navigateTo({
      url: '/pages/sourcesPage/index', routeType: 'upRouterBuilder',
      success: res => res.eventChannel.emit('showSources', { citations })
    })
  },

  openReasoning(e) {
    const detail = e.detail || {}
    if (!detail.processTrace?.length && !String(detail.content || '').trim()) return
    wx.navigateTo({
      url: '/pages/reasoningPage/index', routeType: 'upRouterBuilder',
      success: res => res.eventChannel.emit('showReasoning', detail)
    })
  },

  closePage() {
    wx.navigateBack()
  }
})
