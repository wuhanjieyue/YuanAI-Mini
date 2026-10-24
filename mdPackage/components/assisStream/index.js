const { stoppedSegments } = require('../../../static_utils/chatSegments')
const { finishGeneratedImages } = require('../../../static_utils/generatedImages')
const { normalizeCitations } = require('../../../static_utils/chatSources')
const i18nBehavior = require('../../../static_utils/i18n/behavior')
const { t } = require('../../../static_utils/i18n/index')
const {shared,spring,timing,runOnJS} = wx.worklet
const { observeTurn } = require('../../services/chatStream/index')
const { currentProcessNode, formatProcessDuration, formatStoppedDuration, publicProcessText, assistantProcessTimeline, processPresentation, isVisibleProcessNode } = require('../../../static_utils/processTrace')
const { getMessageAttachments } = require('../../../static_utils/chatAttachment')
const { artifactAttachmentDetail } = require('../../../static_utils/chatArtifacts')
const pendingImage = {
  artifactId:'retry_pending', width:576, height:768, heightVw:75 * 768 / 576,
  status:'generating', type:'artifact', artifactType:'image'
}

function processTextWindow(text){
  return Array.from(String(text || '').replace(/\r\n|[\r\n\t]/g, ' ')).slice(-40).join('')
}

function advanceProcessText(state, kind){
  const char = String.fromCodePoint(state.text.codePointAt(state.cursor))
  state.cursor += char.length
  if(kind === 'command') state.visible += char
  else if(kind === 'source'){if(char !== '\n') state.visible += char}
  else if(kind === 'reasoning'){
    if(state.sentenceEnded && !char.trim()) return
    if(state.sentenceEnded) state.visible = ''
    if(state.visible || char.trim()) state.visible += char
    state.sentenceEnded = /[。？！!?；;.!…\n]/.test(char)
  }
  else if(/[。？！!?；;.!…\n]/.test(char)) state.visible = ''
  else if(state.visible || char.trim()) state.visible += char
}

Component({
  behaviors: ['wx://component-export', i18nBehavior],
  /**
   * 组件的属性列表
   */
  properties: {
    theme: { type: String, value: 'light' },
    hapticFeedback: { type: Boolean, value: false },
    branchLoadingTurnId: { type: String, value: '' },
    shareLoading: { type: Boolean, value: false },
    streamContent:{
      type:String,
      value:""
    },
    thinking:{
      type:Boolean,
      value:false
    },
    imging:{
      type:Boolean,
      value:false
    },
    searching:{
      type:Boolean,
      value:false
    },
    studying:{
      type:Boolean,
      value:false
    },
    modeId:{ type:String, value:'chat' },
    reasoningEnabled:{ type:Boolean, value:false },
    feature:{
      type:String,
      value:''
    },
    featureLabel:{
      type:String,
      value:''
    },
    contentParts:{
      type:Array,
      value:[]
    },
    attachments:{
      type:Array,
      value:[]
    },
    conversationId:{
      type:String,
      value:''
    },
    ephemeralMessages:{ type:Array, value:[] },
    layoutOwner:{
      type:Boolean,
      value:false
    },
    responseOnly:{
      type:Boolean,
      value:false
    },
    skipUserEntrance:{
      type:Boolean,
      value:false
    },
    turnKey:{
      type:String,
      value:''
    },
    modelName:{ type:String, value:'' }
  },
  observers:{
    language(language){
      if(this.data.processDurationMs > 0) this.setData({
        thinkDurationText:(this.data.terminalStatus === 'cancelled' || this.data.terminalStatus === 'cancelling' ? formatStoppedDuration : formatProcessDuration)(this.data.processDurationMs, language)
      })
      if(!this._destroyed && this._displayAssistant) this.applyCloudSnapshot(this._displayAssistant)
    },
    layoutOwner(value){
      if(this.layoutOwnerEnabled) this.layoutOwnerEnabled.value = value ? 1 : 0
    }
  },
  /**
   * 组件的初始数据
   */
  data: {
    isFinish:false,
    mdText:{text:''},
    markdownKeys:[0], // 每次重置仅重建打字器，释放上一轮的 batch 和游标。
    timelineMode:false,
    timelineEntries:[],
    timelineTrace:[],
    timelineSummaryPending:false,
    timelineWaitingTools:false,
    processCollapsed:false,
    finalStarted:false,
    thinkStatus:0,
    responseStarted:false,
    turnCreated:false,
    thinkingStarted:false,
    displayProcessTrace:null,
    thinkOpen:false,
    thinkVisibleText:'',
    thinkDurationText:'',
    generatedFiles:[],
    generatedImages:[],
    standaloneImages:[],
    markdownImageIds:[],
    citations:[],
    processTrace:[],
    processDurationMs:0,
    askStatus:false,
    modelId:'',
    effortId:'',
    settled:false,
    assistantItem:null,
    stopping:false,
    connectionStatus:'detached',
    terminalStatus:'',

    // 结束wxml
    article:{}
  },
  lifetimes:{
    attached(){
      this._destroyed = false
      this._ready = false
      wx.nextTick(()=>{
        if(this._destroyed) return
        this._that = this.selectOwnerComponent()
        this.scale = shared(this.data.skipUserEntrance ? 1 : 0)
        this.userOpacity = shared(1)
        this.streamMinHeight = shared(0)
        this.layoutOwnerEnabled = shared(this.data.layoutOwner ? 1 : 0)
        this.processHeight = shared(-1)
        this.processOpacity = shared(1)
        this._ready = true
  
        this.applyAnimatedStyle('.ass-full',()=>{
          'worklet'
          const minHeight = this.layoutOwnerEnabled.value ? this.streamMinHeight.value : 0
          return {minHeight:`${minHeight}px`}
        })
        this.applyAnimatedStyle('.stream-user-content', () => {
          'worklet'
          return {
            transform: `scale(${this.scale.value},${this.scale.value})`,
            opacity: `${this.userOpacity.value}`
          }
        })
        if(!this.data.skipUserEntrance) this.scale.value = spring(1,{mass:0.8})
        this.startPendingTurn()
        this.triggerEvent('streammounted', { turnKey:this.data.turnKey }, {})
      })
    },
    detached(){
      this.clearSearchTyping()
      this._destroyed = true
      this._ready = false
      this._pendingTurn = null
      this._renderEpoch = (this._renderEpoch || 0) + 1
      this._finishEpoch = 0
      if(this._unsubscribeTurn) this._unsubscribeTurn()
      this.clearToolRotation()
      this.clearThinkTyping()
      this.clearTimelineDisplay()
    }
  },
  /**
   * 组件的方法列表
   */
  methods:{
    startTurn(turn = {}){
      if(!turn.turnKey || turn.turnKey !== this.data.turnKey) return
      this._pendingTurn = turn
      this.startPendingTurn()
    },

    startPendingTurn(){
      const turn = this._pendingTurn
      if(this._destroyed || !this._ready || !turn) return
      const runtimeKey = turn.runtimeKey || turn.turnKey
      if(this._freezeRequested){
        if(!this._unsubscribeTurn && !this._chatMeta?.turnId) this.observeTurn(runtimeKey, turn.turnKey)
        this._pendingTurn = null
        return
      }
      if(this._startedTurnKey === turn.turnKey){
        if(!turn.runtimeKey || runtimeKey === turn.turnKey){
          this._pendingTurn = null
          return
        }
      }
      if(this._startedTurnKey === runtimeKey){
        this._pendingTurn = null
        return
      }
      this._regenerating = turn.regenerating === true
      this._startedTurnKey = runtimeKey
      this._pendingTurn = null
      this.setData({
        modelId:turn.modelId || '',
        effortId:turn.effortId || '',
        modelName:turn.modelName || '',
        askStatus:true, thinkStatus:0, turnCreated:false, thinkingStarted:false, responseStarted:false, thinkOpen:turn.thinkOpen === true
      }, () => {
        if(this._destroyed || this._startedTurnKey !== runtimeKey) return
        if(!this._freezeRequested) this.triggerEvent('stramready', { turnKey:turn.turnKey }, {})
        this.observeTurn(runtimeKey, turn.turnKey)
      })
    },

    reloadResponse(turn = {}){
      if(this._destroyed || !turn.turnKey || turn.turnKey !== this.data.turnKey) return
      this._previousResponse = {
        data:{
          streamContent:this.data.streamContent,
          contentParts:this.data.contentParts,
          attachments:this.data.attachments,
          askStatus:this.data.askStatus,
          mdText:this.data.mdText,
          thinkStatus:this.data.thinkStatus,
          responseStarted:this.data.responseStarted,
          turnCreated:this.data.turnCreated,
          thinkingStarted:this.data.thinkingStarted,
          displayProcessTrace:this.data.displayProcessTrace,
          thinkOpen:this.data.thinkOpen,
          thinkVisibleText:this.data.thinkVisibleText,
          thinkDurationText:this.data.thinkDurationText,
          generatedImages:this.data.generatedImages,
          standaloneImages:this.data.standaloneImages,
          generatedFiles:this.data.generatedFiles,
          citations:this.data.citations,
          processTrace:this.data.processTrace,
          processDurationMs:this.data.processDurationMs,
          isFinish:this.data.isFinish,
          modelName:this.data.modelName,
          assistantItem:this.data.assistantItem,
          stopping:this.data.stopping,
          connectionStatus:this.data.connectionStatus,
          terminalStatus:this.data.terminalStatus,
          settled:this.data.settled,
          timelineMode:this.data.timelineMode, timelineEntries:this.data.timelineEntries, timelineTrace:this.data.timelineTrace,
          processCollapsed:this.data.processCollapsed, finalStarted:this.data.finalStarted
        },
        textSegments:this._textSegments,
        modelRequests:this._modelRequests,
        streamText:this._streamText,
        startedTurnKey:this._startedTurnKey,
        chatMeta:this._chatMeta,
        cloudStatus:this._cloudStatus,
        hasThinkSnapshot:this._hasThinkSnapshot,
        displayModelRequestId:this._displayModelRequestId,
        mainBodyRequests:[...(this._mainBodyRequests || [])],
        selectedCallId:this._selectedCallId,
        scale:this.scale?.value || 1,
        layoutOwnerEnabled:this.layoutOwnerEnabled?.value || 0,
        streamMinHeight:this.streamMinHeight?.value || 0
      }
      this.resetStream()
      if(this.streamMinHeight) this.streamMinHeight.value = this._previousResponse.streamMinHeight
      if(this.scale) this.scale.value = 1
      if(this.layoutOwnerEnabled) this.layoutOwnerEnabled.value = this.data.layoutOwner ? 1 : 0
      this._pendingTurn = turn
      this.startPendingTurn()
    },

    restoreResponse(){
      const previous = this._previousResponse
      if(!previous) return
      if(this._unsubscribeTurn) this._unsubscribeTurn()
      this._unsubscribeTurn = null
      this._renderEpoch = (this._renderEpoch || 0) + 1
      this._finishEpoch = 0
      this._startedTurnKey = previous.startedTurnKey || ''
      this._pendingTurn = null
      this.clearToolRotation()
      this.clearThinkTyping()
      this.clearTimelineDisplay()
      this._textSegments = previous.textSegments || []
      this._modelRequests = previous.modelRequests || []
      this._streamText = previous.streamText
      this._chatMeta = previous.chatMeta
      this._cloudStatus = previous.cloudStatus
      this._hasThinkSnapshot = previous.hasThinkSnapshot
      this._displayModelRequestId = previous.displayModelRequestId
      this._mainBodyRequests = new Set(previous.mainBodyRequests || [])
      this._selectedCallId = previous.selectedCallId
      if(this.scale) this.scale.value = previous.scale
      if(this.layoutOwnerEnabled) this.layoutOwnerEnabled.value = previous.layoutOwnerEnabled
      if(this.streamMinHeight) this.streamMinHeight.value = previous.streamMinHeight
      this.setData({...previous.data, markdownKeys:[this.data.markdownKeys[0] + 1], markdownImageIds:[]})
      if(this.processHeight) this.processHeight.value = previous.data.processCollapsed ? 0 : -1
      if(this.processOpacity) this.processOpacity.value = previous.data.processCollapsed ? 0 : 1
      this._previousResponse = null
    },

    observeTurn(turnKey, renderKey = turnKey){
      if(!this._freezeRequested){
        this._renderEpoch = (this._renderEpoch || 0) + 1
        this._finishEpoch = 0
        this._streamText = ''
        this._stoppedText = null
        this.clearToolRotation()
        this.clearThinkTyping()
        this.clearTimelineDisplay()
        this._hasThinkSnapshot = false
        this._displayModelRequestId = ''
        this._mainBodyRequests = new Set()
        this._selectedCallId = ''
        this._parallelCallIds = new Set()
        this.setData({ responseStarted:false, turnCreated:false, thinkingStarted:false })
        if(!this._regenerating) this.streamMinHeight.value = this._that.chatHeight.value
      }
      const renderEpoch = this._renderEpoch
      this._unsubscribeTurn = observeTurn(turnKey, record => {
        if(renderEpoch !== this._renderEpoch || this._destroyed || this.data.settled && !this._freezeRequested) return
        const metaChanged = this._chatMeta?.turnId !== record.meta.turnId
        this._chatMeta = record.meta
        if(metaChanged && record.meta.conversationId){
          if(this._freezeRequested && this.data.assistantItem) this.setData({assistantItem:{...this.data.assistantItem,
            conversationId:record.meta.conversationId, turnId:record.meta.turnId,
            messageId:record.meta.assistantMessageId || '', runId:record.meta.runId || ''}})
          this.triggerEvent('conversationready', { ...record.meta, turnKey:renderKey }, {})
        }
        if(this._freezeRequested){
          if(record.meta.turnId && this._unsubscribeTurn) this._unsubscribeTurn()
          return
        }
        this._cloudStatus = record.status
        this.setData({ stopping:record.status === 'cancelling', connectionStatus:record.connection, terminalStatus:record.status })
        this.applyCloudSnapshot({ ...record.assistant, status:record.status })
        if(record.user){
          this.setData({
            streamContent:record.user.content || '',
            contentParts:record.user.contentParts || [],
            attachments:Array.isArray(record.user.attachments)
              ? getMessageAttachments(record.user.attachments)
              : this.data.attachments
          })
        }
        if(record.status === 'cancelling'){ this.stopDisplay(record.cancelView?.processDurationMs); return }
        if(['completed', 'failed', 'cancelled'].includes(record.status)){
          if(record.status === 'failed' && !(this._streamText || '').trim() && !this.data.generatedImages.some(image => image.status === 'completed')) this.completeWithFallback(renderEpoch,
            record.error?.code === 'ATTACHMENT_UPLOAD_FAILED' ? t(this.properties.language, 'attachments.attachmentUploadFailed') : '')
          else this.endStream()
        }
      })
    },

    stopDisplay(stoppedDuration){
      if(this._freezeRequested) return {contentLength:(this._stoppedText || '').length, processDurationMs:this.data.processDurationMs}
      this._freezeRequested = true
      this._renderEpoch = this._renderEpoch || 1
      const created = new Date(this._chatMeta?.createdAt || 0).getTime()
      const started = this._processingStartedAt || (Number.isFinite(created) && created > 0 ? created : 0)
      const duration = typeof stoppedDuration === 'number' ? stoppedDuration : started
        ? Math.max(0, Date.now() - started) : this.data.processDurationMs || 0
      this.clearToolRotation()
      this.clearThinkTyping()
      this.clearTimelineDisplay()
      this.clearSearchTyping()
      const text = this.selectComponent?.('#streamMarkdown')?.stopTyping?.()
      this._stoppedText = typeof text === 'string' ? text : ''
      this._streamText = this._stoppedText
      this._textSegments = stoppedSegments(this._textSegments, this._stoppedText.length)
      this._cloudStatus = 'cancelled'
      if(this.processHeight) this.processHeight.value = 0
      if(this.processOpacity) this.processOpacity.value = 0
      const images = finishGeneratedImages(this.data.generatedImages)
      this.setData({ stopping:true, terminalStatus:'cancelled', thinkStatus:2, thinkOpen:false,
        thinkVisibleText:'', displayProcessTrace:null, processCollapsed:true,
        processDurationMs:duration, thinkDurationText:formatStoppedDuration(duration, this.properties.language),
        mdText:{...this.data.mdText, text:this._stoppedText},
        generatedImages:images, ...this.imageTimeline(this.data.timelineEntries, images) })
      if(this._chatMeta?.turnId && this._unsubscribeTurn) this._unsubscribeTurn()
      this._finishEpoch = this._renderEpoch
      this.finish()
      return {contentLength:this._stoppedText.length, processDurationMs:duration}
    },

    onTypingStopped(e){
      if(e.currentTarget?.dataset?.markdownKey !== undefined && String(e.currentTarget.dataset.markdownKey) !== String(this.data.markdownKeys[0])) return
      if(!this._freezeRequested || this.data.settled || this._stoppedText !== null) return
      this._stoppedText = e.detail?.text || ''
      this._streamText = this._stoppedText
      this.setData({ mdText:{ ...this.data.mdText, text:this._stoppedText } })
    },

    applyCloudSnapshot(assistant){
      if(!assistant || this._freezeRequested) return
      this._displayAssistant = assistant
      this._textSegments = assistant.textSegments || []
      this._modelRequests = assistant.modelRequests || []
      const timeline = assistantProcessTimeline(assistant, this.properties.language)
      if(timeline){
        this.applyTimelineSnapshot(assistant, timeline)
        return
      }
      this.applyBodySnapshot(assistant)
    },

    applyBodySnapshot(assistant){
      if(this.data.timelineMode){
        this.clearTimelineDisplay()
        if(this.processHeight) this.processHeight.value = -1
        if(this.processOpacity) this.processOpacity.value = 1
        this.setData({timelineMode:false, timelineEntries:[], timelineTrace:[], processCollapsed:false, finalStarted:false})
      }
      const projection = {
        displayContent:assistant.displayContent || assistant.content || '',
        displayModelRequestId:assistant.displayModelRequestId || ''
      }
      const bodyStarted = Boolean(projection.displayContent)
      const languageChanged = this._displayLanguage && this._displayLanguage !== this.properties.language
      const bodyChanged = bodyStarted &&
        ((this._displayModelRequestId && projection.displayModelRequestId && this._displayModelRequestId !== projection.displayModelRequestId) ||
          (languageChanged && projection.displayContent !== this._streamText))
      this._displayLanguage = this.properties.language
      if(bodyStarted && projection.displayModelRequestId)
        this._displayModelRequestId = projection.displayModelRequestId
      this._streamText = projection.displayContent
      const processTrace = Array.isArray(assistant.processTrace) ? assistant.processTrace : []
      const bodyRequests = this._mainBodyRequests || (this._mainBodyRequests = new Set())
      if(projection.displayContent && projection.displayModelRequestId) bodyRequests.add(projection.displayModelRequestId)
      const bodyWithoutRequestId = Boolean(projection.displayContent && !projection.displayModelRequestId)
      // Body output supersedes all queued main-node text for that request.
      // Keep the complete trace for the process sheet and leave tool execution intact.
      const liveTrace = processTrace.filter(node => isVisibleProcessNode(node) && !(['main_reasoning','public_commentary'].includes(node.stage) && !node.parentCallId &&
        (bodyRequests.has(node.modelRequestId) || bodyWithoutRequestId))).map(node => {
          const presentation = processPresentation(node, this.properties.language)
          return presentation ? {...node,responseContent:presentation.content,responseItems:presentation.responseItems} : node
        })
      const selected = currentProcessNode(liveTrace, this._selectedCallId)
      const process = selected && ['proposed','ready','running'].includes(selected.status) ? selected : null
      const actualTool = process?.callId && process.name !== 'exec' && process.status === 'running'
      const parallel = this._parallelCallIds || (this._parallelCallIds = new Set())
      const skipBuffered = actualTool && this._selectedCallId !== process.callId && parallel.has(process.callId)
      if(actualTool){
        parallel.delete(process.callId)
        for(const node of processTrace) if(node.callId && node.callId !== process.callId && node.name !== 'exec' &&
            node.status === 'running' && process.parentCallId && node.parentCallId === process.parentCallId) parallel.add(node.callId)
        this._selectedCallId = process.callId
      }
      const responseStarted = this.data.responseStarted || this._modelRequests.some(request => request.responseStarted === true) ||
        processTrace.some(node => node.callId || node.responseContent) || Boolean(assistant.content)
      const turnCreated = Boolean(this._chatMeta?.turnId && this._chatMeta?.runId || assistant.turnId && assistant.runId)
      const thinkingStarted = this.data.thinkingStarted || Boolean(projection.displayContent) ||
        processTrace.some(node => ['main_reasoning','public_commentary'].includes(node.stage) && node.responseContent)
      const restore = !this._hasThinkSnapshot
      // Source stages play their entries; actual functions use the selected-node sentence typer.
      this._searchNodes = liveTrace.filter(node => !node.callId && node.stage !== 'main_reasoning' && Array.isArray(node.responseItems) && node.responseItems.length)
      this._searchCursors = this._searchCursors || {}
      for(const node of this._searchNodes){
        if(restore) this._searchCursors[node.id] = (node.responseContent || '').length
        else if(this._searchCursors[node.id] === undefined) this._searchCursors[node.id] = 0
      }
      if(['cancelling', 'cancelled', 'failed'].includes(assistant.status)){
        for(const node of this._searchNodes) this._searchCursors[node.id] = (node.responseContent || '').length
        this.clearSearchTyping()
      }
      const pendingSearch = !actualTool && this.hasSearchTyping()
      const processComplete = ['completed', 'failed', 'cancelled'].includes(assistant.status) && !pendingSearch
      const thinkStatus = processTrace.length || turnCreated || thinkingStarted || assistant.status === 'cancelling' || assistant.status === 'cancelled'
        ? (processComplete || assistant.status === 'cancelling' ? 2 : 1) : 0
      const artifacts = this.snapshotArtifacts(assistant)
      this.setData({
        ...artifacts,
        mdText:{ text:this._streamText, citations:artifacts.citations },
        ...(bodyChanged ? {markdownKeys:[this.data.markdownKeys[0] + 1], markdownImageIds:[]} : {}),
        processTrace,
        responseStarted,
        turnCreated,
        thinkingStarted,
        processDurationMs:assistant.processDurationMs || 0,
        thinkDurationText:assistant.status === 'cancelled' || assistant.status === 'cancelling'
          ? formatStoppedDuration(assistant.processDurationMs, this.properties.language)
          : assistant.processDurationMs ? formatProcessDuration(assistant.processDurationMs, this.properties.language) : '',
        thinkStatus
      })
      if(pendingSearch){
        this._hasThinkSnapshot = true
        this.clearThinkTyping()
        if(!this._searchTimer) this.consumeSearchText()
      }else{
        if(this._searchTimer){
          this.clearSearchTyping()
          this._searchVisible = ''
          this._searchItemKey = ''
        }
        this.setData({ displayProcessTrace:process ? [process] : liveTrace.length !== processTrace.length ? [] : null },
          () => this.showPendingImage())
        if(!process?.callId && process?.responseItems?.length && process.stage !== 'main_reasoning'){
          this._hasThinkSnapshot = true
          this.clearThinkTyping()
          if(restore){
            const item = process.responseItems[process.responseItems.length - 1]
            const text = (process.responseContent || '').slice(item.start, item.end)
            this.setData({ thinkVisibleText:processTextWindow(text.trim()) })
          }
          if(thinkStatus !== 1 || assistant.status === 'cancelling') this.setData({ thinkVisibleText:'' })
        }else if(assistant.status === 'cancelling' || !process && projection.displayContent) {
          this._hasThinkSnapshot = true
          this.clearThinkTyping()
          this.setData({ thinkVisibleText:'' })
        }else this.syncThinkText(process ? publicProcessText(process, this.properties.language) :
          '', process?.id || '', skipBuffered, Boolean(actualTool),
          process?.presentation?.format === 'code' ? 'command' : process?.presentation?.format === 'reasoning' ? 'reasoning' : undefined)
      }
      this.syncToolRotation(actualTool ? process : null, assistant)
    },

    markdownImageCards(e){
      if(this._destroyed || e.currentTarget?.dataset?.markdownKey !== undefined &&
        String(e.currentTarget.dataset.markdownKey) !== String(this.data.markdownKeys[0])) return
      this.setData({markdownImageIds:e.detail.artifactIds || []})
    },

    showPendingImage(){
      const status = this._displayAssistant?.status || this.data.terminalStatus
      if(this._destroyed || this._freezeRequested || this.data.settled || !this.data.turnCreated ||
        ['completed','failed','cancelled','cancelling'].includes(status) || this.data.generatedImages.length) return
      const trace = this.data.timelineMode ? this.data.timelineEntries.filter(entry => !entry.hidden && !entry.playbackStopped).map(entry => entry.node)
        : this.data.displayProcessTrace || this.data.processTrace
      const node = trace.find(node => node.name === 'image_generation' && node.status === 'running')
      if(node){
        const images = [{...pendingImage, ...(node.callId ? {callId:node.callId} : {})}]
        this.setData({generatedImages:images, ...this.imageTimeline(this.data.timelineEntries, images)})
      }
    },

    imageTimeline(entries, images = this.data.generatedImages, trace = this.data.processTrace){
      const requests = new Map((trace || []).filter(node => node.callId && node.name !== 'exec')
        .map(node => [node.callId, node.modelRequestId || '']))
      const visible = new Set(entries.filter(entry => entry.node.callId).map(entry => entry.node.modelRequestId || ''))
      const groups = new Map(), standaloneImages = []
      for(const image of images){
        const request = requests.get(image.callId)
        if(request === undefined || (this.data.processCollapsed || this._freezeRequested) && !visible.has(request)){
          standaloneImages.push(image)
          continue
        }
        if(!groups.has(request)) groups.set(request, [])
        groups.get(request).push(image)
      }
      return {standaloneImages, timelineEntries:entries.map(entry => ({...entry,
        images:entry.node.callId ? groups.get(entry.node.modelRequestId || '') || [] : []}))}
    },

    snapshotArtifacts(assistant){
      const parts = assistant.contentParts || []
      const images = parts.filter(item => item?.artifactType === 'image')
      if(!images.length && !['completed','failed','cancelled'].includes(assistant.status) &&
        this.data.generatedImages[0]?.artifactId === 'retry_pending') images.push(this.data.generatedImages[0])
      return {generatedImages:images, generatedFiles:getMessageAttachments(parts.filter(item => item?.type === 'attachment')),
        citations:normalizeCitations(assistant.citations)}
    },

    applyTimelineSnapshot(assistant, projection){
      if(!this.data.timelineMode){
        this.clearToolRotation()
        this.clearThinkTyping()
        this.clearSearchTyping()
        this.setData({thinkVisibleText:'', displayProcessTrace:null})
      }
      this._streamText = projection.finalContent
      const terminal = ['completed','failed','cancelled'].includes(assistant.status)
      const turnCreated = Boolean(this._chatMeta?.turnId && this._chatMeta?.runId || assistant.turnId && assistant.runId)
      const artifacts = this.snapshotArtifacts(assistant)
      this.setData({...artifacts, timelineMode:true, turnCreated,
        ...(this.data.processCollapsed || this._timelineCollapsing
          ? this.imageTimeline(this.data.timelineEntries, artifacts.generatedImages, assistant.processTrace) : {}),
        processTrace:assistant.processTrace || [], timelineTrace:projection.processTrace,
        responseStarted:Boolean(projection.entries.length || this._streamText),
        thinkStatus:this.data.processCollapsed || ['cancelling','cancelled'].includes(assistant.status) ? 2
          : turnCreated || projection.entries.length ? 1 : 0,
        ...(assistant.processDurationMs ? {processDurationMs:assistant.processDurationMs,
          thinkDurationText:(assistant.status === 'cancelled' ? formatStoppedDuration : formatProcessDuration)(assistant.processDurationMs, this.properties.language)} : {})})
      if(!this.data.processCollapsed && !this._timelineCollapsing){
        this.syncTimelineEntries(projection.entries)
      }
      if(this._streamText){
        if(this.data.processCollapsed) this.setData({mdText:{text:this._streamText, citations:this.data.citations}})
        else this.collapseTimeline()
      }else if(terminal) this.collapseTimeline()
      if(turnCreated && !terminal && !this.data.finalStarted && !this._freezeRequested) this.updateProcessClock()
      else this.stopProcessClock()
    },

    syncTimelineEntries(entries){
      this._timelineEntries = entries
      const restore = !this._hasTimelineSnapshot
      this._hasTimelineSnapshot = true
      const states = this._timelineStates || (this._timelineStates = new Map())
      const previous = new Map((this.data.timelineEntries || []).map(entry => [entry.id, entry]))
      const summaryRequests = new Set([...previous.values()].filter(entry => entry.kind === 'commentary' && entry.displayText)
        .map(entry => entry.node.modelRequestId))
      const tools = new Map()
      for(const entry of entries){
        if(!entry.node.callId) continue
        const request = entry.node.modelRequestId || ''
        if(!tools.has(request)) tools.set(request, [])
        tools.get(request).push(entry.node)
      }
      for(const [request, nodes] of tools){
        const ended = previous.get('tools_' + request)
        const actual = nodes.filter(node => node.name !== 'exec')
        const failedExec = nodes.find(node => node.name === 'exec' && ['failed','unknown'].includes(node.status))
        tools.set(request, failedExec && !actual.some(node => ['proposed','ready','running'].includes(node.status)) ? failedExec : ended?.handoffEnded && nodes.find(node => node.id === ended.node.id) ||
          currentProcessNode(actual.length ? actual : nodes, this._selectedCallId))
      }
      const parallel = this._parallelCallIds || (this._parallelCallIds = new Set())
      const selected = entries.filter(entry => !entry.node.callId ||
        tools.get(entry.node.modelRequestId || '')?.id === entry.node.id)
      const terminal = ['completed','failed','cancelled'].includes(this._displayAssistant?.status)
      const completedRequests = new Set((this._modelRequests || []).filter(model =>
        !model.parentCallId && model.status === 'completed').map(model => model.modelRequestId))
      const successors = new Set(), laterRequests = new Set()
      let executionStarted = false
      for(const entry of [...selected].reverse()){
        if(executionStarted || laterRequests.size > 1 || laterRequests.size === 1 && !laterRequests.has(entry.node.modelRequestId))
          successors.add(entry.id)
        if(entry.node.modelRequestId) laterRequests.add(entry.node.modelRequestId)
        executionStarted = executionStarted || Boolean(entry.node.callId && entry.node.status !== 'proposed')
      }
      const items = []
      let summaryPending = false
      for(const [index, original] of selected.entries()){
        let entry = original
        const id = entry.node.callId ? 'tools_' + (entry.node.modelRequestId || '') : entry.id
        const prior = previous.get(id)
        const handoffEnded = Boolean(prior?.handoffEnded || index < selected.length - 1 || this._streamText || terminal)
        const playbackStopped = Boolean(handoffEnded || prior?.playbackStopped && prior.node.id === entry.node.id ||
          !['proposed','ready','running'].includes(entry.node.status))
        if(entry.kind === 'commentary'){
          let state = states.get(entry.node.id)
          const node = state?.finished ? state.node : entry.node
          const isFinish = Boolean(prior?.isFinish || terminal || this._streamText ||
            !['proposed','ready','running'].includes(entry.node.status) ||
            completedRequests.has(entry.node.modelRequestId) || successors.has(entry.id))
          const text = state?.finished || isFinish ? publicProcessText(node, this.properties.language) : entry.text
          if(!state || state.language !== this.properties.language || !text.startsWith(state.text)){
            state = {text, node, language:this.properties.language, cursor:0, renderedCursor:0, visible:'', finished:false}
            states.set(entry.node.id, state)
          }else if(!state.finished){
            if(state.text !== text) state.waitingSince = null
            state.text = text; state.node = node
          }
          state.isFinish = isFinish
          if(isFinish && state.renderedCursor >= state.text.length) state.finished = true
          items.push({...entry, node:state.node, text:state.text, displayText:state.visible.trimEnd(),
            isFinish, summaryFinished:state.finished})
          if(!state.finished){summaryPending = true; break}
          continue
        }
        let skipBuffered = false
        if(entry.node.callId){
          const request = entry.node.modelRequestId || ''
          entry = {...entry, id}
          if(!playbackStopped && entry.node.name !== 'exec' && entry.node.status === 'running'){
            skipBuffered = this._selectedCallId !== entry.node.callId && parallel.has(entry.node.callId)
            parallel.delete(entry.node.callId)
            for(const peer of entries) if(peer.node.callId && peer.node.callId !== entry.node.callId &&
              peer.node.name !== 'exec' && peer.node.status === 'running' && entry.node.parentCallId &&
              peer.node.parentCallId === entry.node.parentCallId && peer.node.modelRequestId === entry.node.modelRequestId)
              parallel.add(peer.node.callId)
            this._selectedCallId = entry.node.callId
          }
        }
        let state = states.get(entry.node.id)
        if(!state || !entry.text.startsWith(state.text)){
          const last = entry.responseItems?.[entry.responseItems.length - 1]
          const source = last?.kind === 'source' && last.end === entry.text.length
          state = {text:entry.text, cursor:restore || skipBuffered ? entry.text.length : 0, itemStart:restore ? last?.start : undefined,
            visible:skipBuffered ? '' : restore ? source ? entry.text.slice(last.start, last.end).trim()
              : entry.node.presentation.format === 'code' ? entry.text : entry.text.split(/[。？！!?；;.!…\n]/).pop().trimStart() : ''}
          states.set(entry.node.id, state)
        }else state.text = entry.text
        if(playbackStopped){
          state.cursor = entry.text.length
          if(handoffEnded || entry.node.stage !== 'main_reasoning') state.visible = ''
        }
        const completedTools = playbackStopped && entry.node.callId && !entries.some(row => row.node.callId &&
          row.node.modelRequestId === entry.node.modelRequestId && ['failed','partial','unknown','cancelled'].includes(row.node.status)) ? entries.filter(row => row.node.callId &&
          row.node.name !== 'exec' && row.node.modelRequestId === entry.node.modelRequestId &&
          row.node.status === 'completed').map(({node}) => ({callId:node.callId,name:node.name,title:node.title,
            ...(node.presentation ? {presentation:node.presentation} : {})})) : []
        items.push({...entry, handoffEnded, playbackStopped, hidden:entry.node.stage === 'main_reasoning' &&
          Boolean(prior?.hidden || summaryRequests.has(entry.node.modelRequestId)),
          completedTools, displayText:processTextWindow(state.visible)})
      }
      if(items.some(entry => entry.playbackStopped && !previous.get(entry.id)?.playbackStopped)){
        if(this._timelineTimer) clearTimeout(this._timelineTimer)
        this._timelineTimer = null
      }
      this.setData({...this.imageTimeline(items), timelineSummaryPending:summaryPending,
        timelineWaitingTools:this.isWaitingForNextNode(items)}, () => this.showPendingImage())
      if(!this._timelineTimer) this.consumeTimelineText()
      const active = [...this.data.timelineEntries].reverse().find(entry => !entry.playbackStopped && entry.node.callId &&
        entry.node.name !== 'exec' && entry.node.status === 'running')
      this.syncToolRotation(active?.node || null, this._displayAssistant || {})
    },

    consumeTimelineText(){
      if(this._destroyed || this._freezeRequested || this._timelineCollapsing || this.data.processCollapsed) return
      let pending = false
      let summaryFrame = null
      const patch = {}
      this.data.timelineEntries.forEach((entry, index) => {
        const state = this._timelineStates?.get(entry.node.id)
        if(entry.playbackStopped || !state || state.cursor >= state.text.length) return
        if(entry.kind === 'commentary'){
          const char = String.fromCodePoint(state.text.codePointAt(state.cursor))
          state.cursor += char.length
          state.visible += char
          pending = pending || state.cursor < state.text.length
          summaryFrame = {state, cursor:state.cursor}
          const displayText = state.visible.trimEnd()
          patch[`timelineEntries[${index}].displayText`] = displayText
          if(displayText && !entry.displayText) this.data.timelineEntries.forEach((row, rowIndex) => {
            if(row.node.stage === 'main_reasoning' && row.node.modelRequestId === entry.node.modelRequestId && !row.hidden)
              patch[`timelineEntries[${rowIndex}].hidden`] = true
          })
          return
        }
        const part = entry.responseItems?.find(part => state.cursor >= part.start && state.cursor < part.end)
        if(state.itemStart !== part?.start){state.itemStart = part?.start; state.visible = ''}
        advanceProcessText(state, entry.node.presentation.format === 'code' ? 'command' : entry.node.presentation.format === 'reasoning' ? 'reasoning' : part?.kind)
        if(this._toolIdle?.nodeId === entry.node.id) this._toolIdle.lastOutputAt = Date.now()
        pending = pending || state.cursor < state.text.length
        patch[`timelineEntries[${index}].displayText`] = processTextWindow(state.visible)
      })
      if(Object.keys(patch).length){
        const epoch = this._renderEpoch
        this.setData(patch, () => {
          if(!summaryFrame || epoch !== this._renderEpoch || this._destroyed || this._freezeRequested ||
            this._timelineStates.get(summaryFrame.state.node.id) !== summaryFrame.state) return
          const state = summaryFrame.state
          state.renderedCursor = Math.max(state.renderedCursor, summaryFrame.cursor)
          if(state.renderedCursor < state.text.length) return
          if(state.waitingSince == null) state.waitingSince = Date.now()
          if(state.isFinish) state.finished = true
          this.syncTimelineEntries(this._timelineEntries || [])
          if(!this.data.timelineSummaryPending && (this._streamText ||
            ['completed','failed','cancelled'].includes(this._displayAssistant?.status))) this.collapseTimeline()
        })
      }
      if(pending){
        const epoch = this._renderEpoch
        const timer = setTimeout(() => {
          if(this._timelineTimer !== timer || epoch !== this._renderEpoch || this._destroyed) return
          this._timelineTimer = null
          this.consumeTimelineText()
        }, 24)
        this._timelineTimer = timer
      }
    },

    isWaitingForNextNode(entries = this.data.timelineEntries){
      const last = entries[entries.length - 1]
      const state = this._timelineStates?.get(last?.node.id)
      return Boolean(last?.kind === 'commentary' && last.displayText && state && state.renderedCursor >= state.text.length &&
        (last.isFinish || state.waitingSince != null && Date.now() - state.waitingSince >= 500) && !this._streamText &&
        !['completed','failed','cancelled'].includes(this._displayAssistant?.status))
    },

    updateProcessClock(){
      if(this._processClockTimer) return
      if(!this._processingStartedAt){
        const created = new Date(this._chatMeta?.createdAt || 0).getTime()
        this._processingStartedAt = Number.isFinite(created) && created > 0 ? created : Date.now() - (this.data.processDurationMs || 0)
      }
      const duration = Math.max(this.data.processDurationMs || 0, Date.now() - this._processingStartedAt)
      this.setData({processDurationMs:duration, thinkDurationText:formatProcessDuration(duration, this.properties.language)})
      if(!this.data.timelineWaitingTools && !this._timelineCollapsing && !this.data.processCollapsed &&
        this.isWaitingForNextNode()) this.setData({timelineWaitingTools:true})
      const epoch = this._renderEpoch
      this._processClockTimer = setTimeout(() => {
        this._processClockTimer = null
        if(epoch !== this._renderEpoch || this._destroyed || this._freezeRequested || this.data.finalStarted || !this.data.timelineMode) return
        this.updateProcessClock()
      }, 1000)
    },

    stopProcessClock(){
      if(this._processClockTimer) clearTimeout(this._processClockTimer)
      this._processClockTimer = null
    },

    collapseTimeline(){
      if(this.data.timelineSummaryPending || this._timelineCollapsing || this.data.processCollapsed) return
      this._timelineCollapsing = true
      this.clearToolRotation()
      if(this._timelineTimer) clearTimeout(this._timelineTimer)
      this._timelineTimer = null
      const epoch = this._renderEpoch
      const complete = this.completeTimelineCollapse.bind(this)
      // The watchdog bounds the display handoff even if a layout callback is lost.
      this._collapseTimer = setTimeout(() => complete(epoch), 900)
      this.createSelectorQuery().selectAll('.stream-process-row').boundingClientRect(rects => {
        if(epoch !== this._renderEpoch || this._destroyed || !this._timelineCollapsing) return
        if(!rects?.some(rect => rect.height) || !this.processHeight){ complete(epoch); return }
        // Collapse process rows only; their sibling image components keep their identity and loaded state.
        const progress = this.processHeight, opacity = this.processOpacity
        progress.value = 1
        this._processRowStyles = rects.filter(rect => rect.height && rect.id).map(rect => {
          const height = rect.height
          return this.applyAnimatedStyle('#' + rect.id, () => {
            'worklet'
            return {height:`${height * progress.value}px`, opacity:opacity.value}
          })
        })
        this.processOpacity.value = timing(0, {duration:650})
        this.processHeight.value = timing(0, {duration:650}, finished => {
          'worklet'
          if(finished) runOnJS(complete)(epoch)
        })
      }).exec()
    },

    completeTimelineCollapse(epoch){
      if(epoch !== this._renderEpoch || this._destroyed || !this._timelineCollapsing || this._freezeRequested) return
      if(this._collapseTimer) clearTimeout(this._collapseTimer)
      this._collapseTimer = null
      this._timelineCollapsing = false
      this.stopProcessClock()
      if(this.processHeight) this.processHeight.value = 0
      if(this.processOpacity) this.processOpacity.value = 0
      this.setData({processCollapsed:true, finalStarted:Boolean(this._streamText), thinkStatus:2,
        markdownKeys:[this.data.markdownKeys[0] + 1],
        markdownImageIds:[],
        mdText:{text:this._streamText || '', citations:this.data.citations}}, () => {
        if(this._endAfterTimeline){ this._endAfterTimeline = false; this.endStream() }
      })
    },

    clearTimelineDisplay(){
      if(this._timelineTimer) clearTimeout(this._timelineTimer)
      if(this._collapseTimer) clearTimeout(this._collapseTimer)
      this._timelineTimer = this._collapseTimer = null
      this._timelineCollapsing = false
      for(const id of this._processRowStyles || []) if(id !== undefined) this.clearAnimatedStyle(id)
      this._processRowStyles = []
      if(this.processHeight) this.processHeight.value = this.data.processCollapsed ? 0 : -1
      if(this.processOpacity) this.processOpacity.value = this.data.processCollapsed ? 0 : 1
      this._endAfterTimeline = false
      this._hasTimelineSnapshot = false
      this._timelineStates = new Map()
      this._timelineEntries = []
      this.setData({timelineSummaryPending:false, timelineWaitingTools:false})
      this._processingStartedAt = null
      this.stopProcessClock()
    },

    syncToolRotation(process, assistant){
      const sameBatch = node => process && node.callId && node.name !== 'exec' &&
        node.status === 'running' && (node.parentCallId || '') === (process.parentCallId || '') &&
        (node.runId || '') === (process.runId || '') && (node.modelRequestId || '') === (process.modelRequestId || '')
      const peers = (assistant.processTrace || []).filter(sameBatch)
      if(this._destroyed || this._freezeRequested || this.data.settled || assistant.status !== 'running' || peers.length < 2){
        if(this._toolRotationTimer) clearTimeout(this._toolRotationTimer)
        this._toolRotationTimer = null
        this._toolIdle = null
        return
      }
      const text = process.responseContent || ''
      if(this._toolIdle?.callId !== process.callId){
        if(this._toolRotationTimer) clearTimeout(this._toolRotationTimer)
        this._toolRotationTimer = null
        this._toolIdle = {callId:process.callId, nodeId:process.id, text, lastOutputAt:Date.now()}
      }else if(this._toolIdle.text !== text){
        this._toolIdle.text = text
        this._toolIdle.lastOutputAt = Date.now()
      }
      if(this._toolRotationTimer) return
      const idle = this._toolIdle
      this._toolRotationTimer = setTimeout(() => {
        if(this._toolIdle !== idle || this._destroyed || this._freezeRequested || this.data.settled) return
        this._toolRotationTimer = null
        const latest = this._displayAssistant
        if(!latest || latest.status !== 'running') return
        const elapsed = Date.now() - idle.lastOutputAt
        if(elapsed >= 3000){
          const active = (latest.processTrace || []).filter(sameBatch)
          const index = active.findIndex(node => node.callId === idle.callId)
          if(index >= 0 && active.length > 1){
            this._selectedCallId = active[(index + 1) % active.length].callId
          }
        }
        this.applyCloudSnapshot(latest)
      }, Math.max(1, 3000 - (Date.now() - idle.lastOutputAt)))
    },

    clearToolRotation(){
      if(this._toolRotationTimer) clearTimeout(this._toolRotationTimer)
      this._toolRotationTimer = null
      this._toolIdle = null
      this._toolTypingStates = new Map()
    },

    clearSearchTyping(){
      if(this._searchTimer) clearTimeout(this._searchTimer)
      this._searchTimer = null
      this._searchEpoch = (this._searchEpoch || 0) + 1
    },

    hasSearchTyping(){
      return (this._searchNodes || []).some(node => (this._searchCursors?.[node.id] || 0) < (node.responseContent || '').length)
    },

    consumeSearchText(){
      if(this._destroyed) return
      const node = (this._searchNodes || []).find(item => (this._searchCursors[item.id] || 0) < (item.responseContent || '').length)
      if(!node){
        this._searchTimer = null
        this.setData({ displayProcessTrace:null })
        if(this._endAfterSearch){
          this._endAfterSearch = false
          this.setData({ thinkStatus:2 })
          this.endStream()
        }
        return
      }
      const cursor = this._searchCursors[node.id] || 0
      const item = node.responseItems.find(part => cursor >= part.start && cursor < part.end)
      const key = node.id + ':' + (item?.start || 0)
      if(this._searchItemKey !== key){ this._searchItemKey = key; this._searchVisible = '' }
      const char = String.fromCodePoint(node.responseContent.codePointAt(cursor))
      this._searchCursors[node.id] = cursor + char.length
      if(item?.kind === 'source'){
        if(char !== '\n') this._searchVisible += char
      }else if(/[。？！!?；;.!…\n]/.test(char)) this._searchVisible = ''
      else this._searchVisible += char
      this.setData({ thinkVisibleText:processTextWindow(this._searchVisible),
        displayProcessTrace:[{ ...node, status:'running' }] })
      const epoch = this._searchEpoch || 0
      this._searchTimer = setTimeout(() => {
        if(epoch !== (this._searchEpoch || 0) || this._destroyed) return
        this._searchTimer = null
        this.consumeSearchText()
      }, 24)
    },

    syncThinkText(value, nodeId, skipBuffered = false, retainToolCursor = false, kind){
      const firstSnapshot = !this._hasThinkSnapshot
      this._hasThinkSnapshot = true
      if(this.data.thinkStatus !== 1){
        this.clearThinkTyping()
        this.setData({ thinkVisibleText:'' })
        return
      }
      const text = String(value || '').replace(/\r/g, '')
      let state = this._thinkTyping
      const replaced = state?.nodeId === nodeId && !text.startsWith(state.text)
      if(!state || state.nodeId !== nodeId || replaced){
        this.clearThinkTyping()
        const saved = retainToolCursor && this._toolTypingStates?.get(nodeId)
        const restore = firstSnapshot || replaced || skipBuffered
        state = saved && text.startsWith(saved.text) ? {...saved, text} : { nodeId, text, cursor:restore ? text.length : 0,
          visible:skipBuffered ? '' : restore ? kind === 'command' ? text : text.split(/[。？！!?；;.!…\n]/).pop().trimStart() : '' }
        this._thinkTyping = state
        this.setData({ thinkVisibleText:processTextWindow(state.visible) })
      }else{
        state.text = text
      }
      state.kind = kind
      if(retainToolCursor){
        if(!this._toolTypingStates) this._toolTypingStates = new Map()
        this._toolTypingStates.set(nodeId, state)
      }
      if(!this._thinkTimer) this.consumeThinkText()
    },

    consumeThinkText(){
      const state = this._thinkTyping
      if(!state || this._destroyed || this.data.thinkStatus !== 1 || state.cursor >= state.text.length) return
      advanceProcessText(state, state.kind)
      if(this._toolIdle?.nodeId === state.nodeId) this._toolIdle.lastOutputAt = Date.now()
      this.setData({ thinkVisibleText:processTextWindow(state.visible) })
      if(state.cursor < state.text.length){
        this._thinkTimer = setTimeout(() => {
          if(this._thinkTyping !== state) return
          this._thinkTimer = null
          this.consumeThinkText()
        }, 24)
      }
    },

    clearThinkTyping(){
      if(this._thinkTimer) clearTimeout(this._thinkTimer)
      this._thinkTimer = null
      this._thinkTyping = null
    },

    completeWithFallback(renderEpoch, message = ''){
      if(renderEpoch !== this._renderEpoch || this._destroyed || this.data.settled || this._finishEpoch === renderEpoch) return
      const separator = (this._streamText || '').trim() ? '\n\n' : ''
      this._streamText = `${this._streamText || ''}${separator}${message || t(this.properties?.language, 'chat.fallback')}`
      if(this.data.timelineMode && !this.data.processCollapsed){
        this.setData({generatedImages:finishGeneratedImages(this.data.generatedImages)})
        this.collapseTimeline()
        this.endStream()
        return
      }
      this.setData({
        'mdText.text':this._streamText,
        generatedImages:finishGeneratedImages(this.data.generatedImages)
      }, () => {
        if(renderEpoch !== this._renderEpoch || this._destroyed || this.data.settled || this._finishEpoch === renderEpoch) return
        this.endStream()
      })
    },

    endStream(){
      if(this.data.timelineMode && (this.data.timelineSummaryPending || this._timelineCollapsing)){
        this._endAfterTimeline = true; return
      }
      if(this.hasSearchTyping()){ this._endAfterSearch = true; return }
      if(this.data.settled || this._finishEpoch === this._renderEpoch) return
      this.clearToolRotation()
      this.clearThinkTyping()
      this.stopProcessClock()
      if(this._unsubscribeTurn) this._unsubscribeTurn()
      this._finishEpoch = this._renderEpoch
      const images = finishGeneratedImages(this.data.generatedImages)
      this.setData({
        'mdText.text': this._streamText || this.data.mdText.text,
        isFinish:true,
        generatedImages:images,
        ...(this.data.timelineMode ? this.imageTimeline(this.data.timelineEntries, images) : {})
      }, () => {
        if (!(this._streamText || '').trim()) this.finish()
      });
    },

    resetStream(){
      this.clearTimelineDisplay()
      if(this.processHeight) this.processHeight.value = -1
      if(this.processOpacity) this.processOpacity.value = 1
      this._displayAssistant = null
      this._displayLanguage = null
      this.clearSearchTyping()
      this._searchNodes = []
      this._searchCursors = {}
      this._searchItemKey = null
      this._searchVisible = ''
      this._endAfterSearch = false
      this.setData({ displayProcessTrace:null })
      this._renderEpoch = (this._renderEpoch || 0) + 1
      this.clearToolRotation()
      this.clearThinkTyping()
      this._hasThinkSnapshot = false
      this._displayModelRequestId = ''
      this._mainBodyRequests = new Set()
      this._selectedCallId = ''
      this._parallelCallIds = new Set()
      if(this._unsubscribeTurn) this._unsubscribeTurn()
      this._finishEpoch = 0
      this._startedTurnKey = ''
      this._pendingTurn = null
      this._chatMeta = null
      this._textSegments = []
      this._modelRequests = []
      this._streamText = ''
      this._stoppedText = null
      this._freezeRequested = false
      this.setData({
        askStatus:false,
        modelId:'',
        effortId:'',
        modelName:'',
        settled:false,
        assistantItem:null,
        isFinish:false,
        mdText:{text:''},
        markdownKeys:[this.data.markdownKeys[0] + 1],
        timelineMode:false, timelineEntries:[], timelineTrace:[], processCollapsed:false, finalStarted:false,
        thinkStatus:0,
        responseStarted:false,
        turnCreated:false,
        thinkingStarted:false,
        thinkOpen:false,
        thinkVisibleText:'',
        thinkDurationText:'',
        generatedFiles:[],
        generatedImages:[],
        standaloneImages:[],
        markdownImageIds:[],
        citations:[],
        processTrace:[],
        processDurationMs:0,
        stopping:false,
        terminalStatus:'',
        connectionStatus:'detached'
      })
      if(this.scale) this.scale.value = this.data.skipUserEntrance ? 1 : 0
      if(this.userOpacity) this.userOpacity.value = 1
      if(this.streamMinHeight) this.streamMinHeight.value = 0
      if(this.layoutOwnerEnabled) this.layoutOwnerEnabled.value = 0
    },
    restartLocalTurn(turn){
      this.resetStream()
      if(this.scale) this.scale.value = 1
      if(this.layoutOwnerEnabled) this.layoutOwnerEnabled.value = this.data.layoutOwner ? 1 : 0
      this.startTurn(turn)
    },
    showContent(){
      if(this.userOpacity) this.userOpacity.value = 1
    },
    copy(e){
      this.triggerEvent('copy', e.detail || {}, {})
    },
    retryLocal(){
      this.triggerEvent('retryLocal', { turnKey:this.data.turnKey }, {})
    },
    share(e){
      this.triggerEvent('share', e.detail || {}, {})
    },
    moreAction(e){
      this.triggerEvent('moreAction', e.detail || {}, {})
    },
    pressContent(){
      const selector = `#stream-user-${this.data.turnKey} .user-content`
      this.createSelectorQuery().select(selector).fields({ rect:true, size:true, computedStyle:['font-size', 'font-family', 'font-weight', 'line-height', 'letter-spacing', 'text-align', 'white-space', 'word-break'] }, content => {
        if(!content || !this._that) return

        this.userOpacity.value = 0
        this._that.contentShow.value = 0

        this.triggerEvent('showUserContent', {
          content:this.data.streamContent,
          rect:content,featureLabel:this.data.featureLabel,
          turnKey:this.data.turnKey
        }, {})
      }).exec()
    },
    openSources(e){
      this.triggerEvent('openSources', e.detail || {}, {})
    },
    previewFile(e){
      this.triggerEvent('previewFile', e.detail || {}, {})
    },
    previewArtifact(e){
      const detail = artifactAttachmentDetail([...this.data.generatedImages, ...(this.data.generatedFiles || [])], e.detail?.link)
      if(detail) this.triggerEvent('previewFile', detail, {})
      else wx.showToast({ title:t(this.properties.language, 'assets.previewFailed'), icon:'none' })
    },
    unavailableImage(){
      this.triggerEvent('unavailableImage', {}, {})
    },
    markUnavailableFileIds(fileIDs){
      if (!fileIDs?.size) return
      const images = this.data.generatedImages.map(item => fileIDs.has(item.fileID)
        ? { ...item, url:'', status:'unavailable', unavailableReason:'storage_deleted' } : item)
      this.setData({ generatedImages:images,
        ...(this.data.timelineMode ? this.imageTimeline(this.data.timelineEntries, images) : {}),
        generatedFiles:(this.data.generatedFiles || []).map(item => fileIDs.has(item.fileID)
          ? { ...item, unavailableReason:'storage_deleted' } : item) })
    },
    open(e){
      this.triggerEvent('openReasoning', {
        ...e.detail,
        turnKey:this._startedTurnKey || this.data.turnKey
      }, {})
    },
    finish(e){
      if(e?.currentTarget?.dataset?.markdownKey !== undefined && String(e.currentTarget.dataset.markdownKey) !== String(this.data.markdownKeys[0])) return
      if(!this._finishEpoch || this._finishEpoch !== this._renderEpoch) return
      const renderEpoch = this._renderEpoch
      this._finishEpoch = 0
      if(this.data.settled) return
      const feature = this._chatMeta?.feature || this.data.feature
      const featureLabel = this.data.featureLabel
      const contentParts = Array.isArray(this.data.contentParts) ? this.data.contentParts : []
      const processTrace = this.data.timelineMode ? this.data.timelineTrace : this.data.processTrace
      const hasProcessTrace = processTrace.length > 0
      const newChat = [{
        "role": "assistant",
        "runId":this._chatMeta?.runId || '', "textSegments":this._textSegments || [], "modelRequests":this._modelRequests || [],
        "feature":feature,
        "status":this._cloudStatus,
        ...(this._freezeRequested ? {displayStop:{contentLength:(this._stoppedText || '').length, processDurationMs:this.data.processDurationMs}} : {}),
        "contentParts":[...this.data.generatedImages, ...(this.data.generatedFiles || [])],
        "attachments":this.data.generatedFiles || [],
        "content":this._streamText || this.data.mdText.text,
        "conversationId": this._chatMeta?.conversationId || this.data.conversationId || '',
        "turnId": this._chatMeta?.turnId || '',
        "messageId": this._chatMeta?.assistantMessageId || '',
        "modelId": this.data.modelId || this._chatMeta?.modelId || '',
        "effortId": this.data.effortId || this._chatMeta?.effortId || '',
        "modelName": this.data.modelName || '',
        "createdAt": this._chatMeta?.createdAt || null,
        "thinking":this._cloudStatus === 'cancelled' || hasProcessTrace,
        "thinkStatus":this._cloudStatus === 'cancelled' || hasProcessTrace ? 2 : 0,
        "thinkOpen":this.data.thinkOpen,
        "thinkDurationText":this.data.thinkDurationText,
        "citations":this.data.citations,
        "processTrace":processTrace,
        "processDurationMs":this.data.processDurationMs
      },{
        "role":"user",
        "content":this.data.streamContent,
        "contentParts":contentParts,
        "attachments":this.data.attachments,
        "feature":feature,
        "featureLabel":featureLabel,
        "conversationId": this._chatMeta?.conversationId || this.data.conversationId || '',
        "turnId": this._chatMeta?.turnId || '',
        "messageId": this._chatMeta?.userMessageId || ''
      }]
      if(this.data.responseOnly) newChat.pop()
      if(this._freezeRequested && !this._chatMeta?.turnId) for(const message of newChat) message.localTurnKey = this.data.turnKey
      const conversationId = this._chatMeta?.conversationId || this.data.conversationId || ''
      const complete = () => {
        if(renderEpoch !== this._renderEpoch || this._destroyed) return
        this.setData({
          askStatus:false,
          settled:true,
          assistantItem:newChat[0]
        }, () => {
          if(renderEpoch !== this._renderEpoch || this._destroyed) return
          this.triggerEvent('finish', {
            chats: newChat,
            conversationId,
            turnKey:this.data.turnKey
          }, {})
        })
      }

      if(this._freezeRequested){ complete(); return }
      this.createSelectorQuery().select('.ass-full').boundingClientRect(rect =>{
        if(!rect){
          complete()
          return
        }
        this.createSelectorQuery().select('.ass-stram-item').boundingClientRect(crect =>{
          if(crect && !this._regenerating) this._that.chatHeight.value = rect.bottom - crect.bottom
          complete()
        }).exec()
      }).exec()
    },

  }
})
