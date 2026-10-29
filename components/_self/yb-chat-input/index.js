import { rpx2px } from '../../../static_utils/otherUtils'
import { triggerHaptic } from '../../../static_utils/haptic'
import { transcribeSpeech } from '../../../request/transcription'
const i18nBehavior = require('../../../static_utils/i18n/behavior')
const { t } = require('../../../static_utils/i18n/index')
const { shared ,timing,Easing,sequence} = wx.worklet

function clamp(v, lower, upper) {
    'worklet'
    if (v < lower) return lower
    if (v > upper) return upper
    return v
}

const durationTime = 160
let keyHeightTmp
let keyEnd = 0; // 键盘高度结束值(用于中间计算)
let placeHolder = '询问任何问题'

let _idSeed = 0;
const initBars = []
for (let i = 0; i < 52; i++) {
  initBars.push({
    id: _idSeed++,
    height: 12,
    opacity: 0.4,
  })
}

const options = {
  duration: 60000,
  sampleRate: 16000,
  numberOfChannels: 1,
  encodeBitRate: 24000,
  format: 'PCM',
  frameSize: 0.5
}
let recordAuth = false
let recorderManager, recorderOwner

// RecorderManager is a singleton; register once and route events to its current owner.
function recorder() {
  if(recorderManager) return recorderManager
  recorderManager = wx.getRecorderManager()
  recorderManager.onStop(res => {
    const owner = recorderOwner
    recorderOwner = null
    owner?.recordingStopped(res)
  })
  recorderManager.onFrameRecorded(res => recorderOwner?.recordingFrame(res))
  recorderManager.onError(() => {
    const owner = recorderOwner
    recorderOwner = null
    owner?.recordingError()
  })
  recorderManager.onInterruptionBegin(() => {
    const owner = recorderOwner
    owner?.cancelVoice()
    if(owner && !owner._disposed) owner.voiceError('interrupted')
  })
  return recorderManager
}

Component({
  behaviors: [i18nBehavior],
  /**
   * 组件的属性列表
   */
  properties: {
    placeholder: { type:String, value:'' },
    disabled: { type:Boolean, value:false },
    disabledPlaceholder: { type:String, value:'' },
      inputFocus: { // 输入框是否获取焦点
        type: Boolean,
        value: false
      },
      settings: { // 设置配置
        type: Object,
        value: {},
        
      },
      hapticFeedback: {
        type: Boolean,
        value: false
      },
      accessoryInsetRpx: {
        type: Number,
        value: 0
      },
  },

    lifetimes:{
      attached() {
        const systemInfo = wx.getWindowInfo()
        this.screenWidth = systemInfo.screenWidth
        const storedKeyHeight = wx.getStorageSync('keyHeight')
        keyHeightTmp = storedKeyHeight || systemInfo.screenHeight * 0.5

        wx.getSetting({
          success:(res)=> {
            if (res.authSetting['scope.record']) {
              recordAuth = true
            }
          }
        })

        this._disposed = false
        this._voiceVersion = 0
        this._voiceCancelled = false
        this.recordingStarted = false
        this.recorderManager = recorder()

        this.startX = 0;
        this.startY = 0;
      },
      ready() {
          if(this._disposed) return
          this._that = this.selectOwnerComponent()
          const screenWidth = this.screenWidth
          const singleAreaHeight = rpx2px(52, screenWidth)
          const actionHeight = rpx2px(64, screenWidth)
          const actionSlot = rpx2px(76, screenWidth)
          const expandedRightSlot = rpx2px(56, screenWidth)
          const expandedStartHeight = rpx2px(94, screenWidth) + actionHeight
          const maxInputHeight = rpx2px(42 * 5 + 10, screenWidth) + actionHeight
          this.inputAreaHeight = shared(singleAreaHeight)
          this.inputActionHeight = actionHeight
          this.accessoryInset = shared(rpx2px(this.data.accessoryInsetRpx, screenWidth))
          this._layoutState = 'compact'
          this._smartMode = this._that.data.smartMode === true
          this.setAreaHeight(this.data.askText, 0)
          this._pendingLayoutBindings = 2
          const inputHeight = this._that.inputHeight
          this.riconScale = shared(1)
          this.riconOpa = shared(1)
          this.applyAnimatedStyle('.right-icon', () => {
              'worklet'
              return {transform:  `scale(${this.riconScale.value},${this.riconScale.value})`,opacity:`${this.riconOpa.value}`}
          })

          this.applyAnimatedStyle('.input-content', () => {
              'worklet'
              return {height: `${Math.max(actionHeight, inputHeight.value)}px`}
          }, {}, () => this.finishLayoutBinding())

          // 输入框高度变化动画
          this.applyAnimatedStyle('.input-area', () => {
              'worklet'
              const progress = Math.max(0, Math.min(1, (inputHeight.value - singleAreaHeight) / (expandedStartHeight - singleAreaHeight)))
              return {
                height: `${this.inputAreaHeight.value}px`,
                left: `${actionSlot * (1 - progress)}px`,
                right: `${actionSlot - (actionSlot - expandedRightSlot) * progress + this.accessoryInset.value}px`
              }
          }, {}, () => this.finishLayoutBinding())

          // 录音音轨
          this.voiceScax = shared(0)
          this.applyAnimatedStyle('.voice-box', () => {
            'worklet'
            return {transform:  `scaleX(${this.voiceScax.value})` }
          })



          
          this.applyAnimatedStyle('.right-icon-clear', () => {
            'worklet'
            const visible = inputHeight.value >= maxInputHeight - 1
            const size = visible ? expandedRightSlot : 0
            return {
              width: `${size}px`,
              height: `${size}px`,
              lineHeight: `${size}px`,
              opacity: `${visible ? 1 : 0}`
            }
          })
      },
      detached(){
        this._disposed = true
        this.cancelVoice()
      }

    },
  /**
   * 组件的初始数据
   */
  pageLifetimes: {
    hide() { this.cancelVoice() }
  },
  data: {
      layoutReady:false,
      placeHolder:placeHolder,
      askText:'',
      askStatus:2,  // 问答状态 0:等待提问 1:正在响应 2:等待语音
      touchEndStatus:'input', //长按结束后的输入框状态
      bars: initBars, //音轨
      voiceLoading:false,
      cursor:0,
  },
  observers:{
    language(language) {
      placeHolder = t(language, 'chat.askAnything')
      if(this.data.touchEndStatus === 'input') this.setData({ placeHolder })
    },
    disabled(value) { if(value) this.cancelVoice() },
    accessoryInsetRpx: function (value) {
      if(!this.accessoryInset) return
      const screenWidth = this.screenWidth
      this.accessoryInset.value = timing(rpx2px(Number(value) || 0, screenWidth), { duration:durationTime })
    },
    askText: function (askText) {
      this.triggerEvent("getAskText",{askText:askText.trim(),hasValue:askText.length > 0},{})
      this.syncAskStatus(askText, this.data.askStatus === 1, true)
    },
  },

  /**
   * 组件的方法列表
   */
  methods: {
    finishLayoutBinding(){
      if(this._disposed) return
      this._pendingLayoutBindings -= 1
      // 原生 textarea 聚焦前，容器和文本区域都必须完成首帧布局绑定。
      if(this._pendingLayoutBindings === 0) this.setData({layoutReady:true})
    },
    syncAskStatus(askText = this.data.askText, responding = this.data.askStatus === 1, animate = false){
      const askStatus = responding ? 1 : (String(askText || '').trim().length > 0 ? 0 : 2)
      if(this.data.askStatus === askStatus) return
      if(animate && this.riconScale){
        this.riconScale.value = sequence(timing(.6,{duration:120}),timing(1,{duration:100}))
      }
      this.setData({askStatus})
    },

    setPlaceHolder(text){
      placeHolder = text
      this.setData({placeHolder:text})
    },
    setAskText(askText){
      this.cancelVoice()
      this.setData({askText:askText})
      this.setAreaHeight(askText)
    },
    setInputFocus(inputFocus){
      this.setData({inputFocus:inputFocus,cursor:this.data.askText.length})
    },
    setCopytext(askText){
      this.cancelVoice()
      this.setData({askText:askText})
      wx.nextTick(()=>{
        this.setData({inputFocus:true,cursor:this.data.askText.length})
      })
      this.setAreaHeight(askText)
    },
    clearText(){
      if(this.data.disabled) return
      this.setAskText('')
    },
    acceptSend(askText){
      this.finishVoiceSend(this._voiceVersion)
      if(this.data.askText !== askText){
        this.setData({askStatus:1})
        return
      }
      triggerHaptic(this.data.hapticFeedback, 'medium')
      if(this.data.settings.hideKey) this.setData({inputFocus:false})
      this.riconScale.value = sequence(timing(.6,{duration:120}),timing(1,{duration:100}))
      this.resetInputLayout()
      this.setData({askText:'',askStatus:1})
    },
    updateInputLayout(lineCount, expanded, duration = durationTime){
      if(!this._that || !this.inputAreaHeight) return
      const normalizedLineCount = Math.max(1, Math.min(5, lineCount))
      const screenWidth = this.screenWidth
      const areaHeight = normalizedLineCount === 1
        ? rpx2px(52, screenWidth)
        : rpx2px(42 * normalizedLineCount + 10, screenWidth)
      const totalHeight = expanded ? areaHeight + this.inputActionHeight : areaHeight
      this.inputAreaHeight.value = duration === 0 ? areaHeight : timing(areaHeight,{duration})
      this._that.inputHeight.value = duration === 0 ? totalHeight : timing(totalHeight,{duration})
    },
    resetInputLayout(duration = durationTime){
      this._layoutState = this._smartMode ? 'smart' : 'compact'
      this.updateInputLayout(this._smartMode ? 2 : 1, this._smartMode, duration)
    },
    setSmartMode(smartMode){
      this._smartMode = smartMode === true
      this.setAreaHeight()
    },
    setAreaHeight(askText = this.data.askText, duration = durationTime){
      const text = String(askText || '')
      if(text.length === 0){
        this.resetInputLayout(duration)
        return
      }
      const explicitLineCount = (text.match(/\n/g) || []).length + 1
      const estimatedLineCount = Math.max(explicitLineCount, Math.ceil(text.length / 20))
      const lineCount = Math.max(1, Math.min(5, estimatedLineCount))
      if(this._smartMode){
        const smartLineCount = Math.max(2, lineCount)
        this._layoutState = smartLineCount > 2 ? 'expanded' : 'smart'
        this.updateInputLayout(smartLineCount, true, duration)
        return
      }
      this._layoutState = lineCount > 1 ? 'expanded' : 'compact'
      this.updateInputLayout(lineCount, lineCount > 1, duration)
    },
    tap(){
      if(this.data.disabled && this.data.askStatus !== 1) return
      if(this.data.voiceLoading) return
      if(this.data.touchEndStatus !== 'input') return this.stopVoice(true)
      if(this.data.askStatus == 0){
        // 发送消息
        this.startChat()
      }else if(this.data.askStatus == 1){
        // 停止语音
        this.stopChat()
      }else{
        const version = this._voiceVersion
        const current = () => !this._disposed && !this.data.disabled && version === this._voiceVersion
        wx.getSetting({
          success:(res)=> {
            if(!current()) return
            if (!res.authSetting['scope.record']) {
              wx.authorize({
                scope: 'scope.record',
                success:()=> {
                  if(!current()) return
                  recordAuth = true
                  this.tapVoice()
                },
                fail:(e)=>{
                  if(!current()) return
                  wx.showModal({
                    title: t(this.properties.language, 'chat.microphoneTitle'),
                    content: t(this.properties.language, 'chat.microphoneMessage'),
                    success:(modelRes)=> {
                      if (current() && modelRes.confirm) {
                        wx.openSetting({
                          success: (setRes) => {
                            if (current() && setRes.authSetting['scope.record']) {
                              recordAuth = true
                              this.tapVoice()
                            }
                          },
                        })
                      }
                    },
                  })
                }
              })
            }else{
              recordAuth = true
              this.tapVoice()
            }
          }
        })
        
      }
    },
    tapVoice(e){
      if(this.data.disabled || this.data.voiceLoading) return
      
      if(this.data.touchEndStatus == 'input'){
        if(!this.startRecordAnim()) return

        // 初始化状态，变换成语音输入
        this.setData({touchEndStatus:'recording'})
        this.triggerEvent('changeLeftIcon',{leftIcon:'stop'},{})
      }else{
        this.stopVoice(true)
      }

    },
    longpress(e){
      if(this.data.disabled || this.data.voiceLoading || this.data.touchEndStatus !== 'input') return
      this._that.pressFlag.value = true
      this.startX = e.detail.x
      this.startY = e.detail.y
      this._that.btSca.value = timing(1.05,{duration:durationTime})

      // if(this.data.inputFocus) return;
      this.setData({touchEndStatus:'input',placeHolder:t(this.properties.language, 'chat.voiceHint')})
      // this.triggerEvent("press",{status:'open'},{})
    },
    touchmove(e){
      // if(this.data.inputFocus) return;

      if(this._that.pressFlag.value){
        const moveX = e.touches[0].pageX - this.startX
        const moveY = e.touches[0].pageY - this.startY 
        this._that.btTrax.value = clamp( moveX/50  ,-16,16)
        this._that.btTray.value = clamp((moveY) /50 ,-16,16)

        if(moveY < -150){

          if(this.data.touchEndStatus != 'recording2send'){
            // 开始识别语音
            if(this.recordingStarted) this.setData({touchEndStatus:'recording2send'})
            else if(!this.startRecordAnim()) return
            this._that.leftIconWitdh.value = timing(rpx2px(92,this.screenWidth),{duration:durationTime})
          }
        }else if(moveY < -70){
          if(this.data.touchEndStatus != 'recording' && this.data.touchEndStatus == 'recording2send'){
            // 不操作，但是恢复缩放动画            
            this._that.leftIconWitdh.value = timing(rpx2px(204,this.screenWidth),{duration:durationTime})
            this.setData({touchEndStatus:'recording'})
            this.triggerEvent('changeLeftIcon',{leftIcon:'stop'},{})
          }
        }

      }
    },
    touchend(e){
      if(! this._that.pressFlag.value) return;
      this._that.btSca.value = timing(1,{duration:durationTime})
      this._that.btTrax.value = 0
      this._that.btTray.value = 0
      
      this._that.leftIconWitdh.value = timing(rpx2px(204,this.screenWidth),{duration:durationTime})
      // this.setData({inputFocus:false})
      if(this.data.touchEndStatus == 'input'){
        this.triggerEvent('changeLeftIcon',{leftIcon:'moreFun'},{})
        this.setData({placeHolder:placeHolder})
      }else if(this.data.touchEndStatus == 'recording'){

      }else if(this.data.touchEndStatus == 'recording2send'){
        this.stopVoice(true)
      }

      this._that.pressFlag.value = false

    },

    stopVoice(send = false){
      if(this.data.voiceLoading || !this.recordingStarted) return
      this._sendAfterTranscription = send === true
      this.setData({voiceLoading:true})
      this.recordingStarted = false
      this.recorderManager.stop()
    },
    voiceError(key = 'failed'){
      this.triggerEvent('voiceError', { message:t(this.properties.language, `dictation.${key}`) })
    },
    recordingFrame(res){
      if(this._disposed || !this.recordingStarted || this._voiceCancelled) return
      const volume = this.normalizeVolume(this.getRMS(new Int16Array(res.frameBuffer)))
      const bars = this.data.bars.slice(1)
      bars.push({id:_idSeed++, height:12 + volume * 64, opacity:0.8})
      this.setData({ bars })
    },
    recordingError(){
      const active = !this._disposed && !this._voiceCancelled
      this.recordingStarted = false
      this.cancelVoice()
      if(active) this.voiceError('recordFailed')
    },
    async recordingStopped(res){
      this.recordingStarted = false
      if(this._disposed || this._voiceCancelled || this.data.disabled){
        if(res.tempFilePath) wx.getFileSystemManager().unlink({filePath:res.tempFilePath, fail(){}})
        return
      }
      const version = this._voiceVersion
      this.setData({voiceLoading:true})
      try {
        const request = transcribeSpeech(res)
        this._transcription = request
        const text = await request.promise
        if(this._disposed || version !== this._voiceVersion) return
        const draft = this.data.askText
        const askText = draft ? `${draft}\n${text}` : text
        this._voiceSubmitting = this._sendAfterTranscription === true
        this.reduction(askText, !this._voiceSubmitting, this._voiceSubmitting ? () => {
          this.triggerEvent('sendTranscription', { askText, keyHeight:36, voiceVersion:version })
        } : undefined)
      } catch(error) {
        if(this._disposed || version !== this._voiceVersion) return
        this._voiceSubmitting = false
        this.reduction(this.data.askText)
        this.voiceError(error.statusCode === 422 ? 'empty' : error.statusCode === 429 ? 'busy' : 'failed')
      } finally {
        if(version === this._voiceVersion) this._transcription = null
      }
    },
    cancelVoice(){
      this._voiceVersion = (this._voiceVersion || 0) + 1
      this._voiceCancelled = true
      this._voiceSubmitting = false
      this._sendAfterTranscription = false
      if(this._that?.pressFlag) this._that.pressFlag.value = false
      this._transcription?.abort()
      this._transcription = null
      if(recorderOwner === this && this.recordingStarted){
        this.recordingStarted = false
        this.recorderManager.stop()
      }
      if(!this._disposed && (this.data.touchEndStatus !== 'input' || this.data.voiceLoading)) this.reduction(this.data.askText, false)
    },
    finishVoiceSend(version, focus = false){
      if(this._disposed || version !== this._voiceVersion || !this._voiceSubmitting) return
      this._voiceSubmitting = false
      this.setData({ voiceLoading:false, inputFocus:focus })
      this.triggerEvent('changeLeftIcon', { leftIcon:'moreFun' })
    },

    // 识别语音
    reduction(askText = '', focus = true, onReady){
      askText = String(askText || '')
      const version = this._voiceVersion
      const submitting = this._voiceSubmitting === true
      this._that.btSca.value = timing(1,{duration:durationTime})
      this._that.btTrax.value = 0
      this._that.btTray.value = 0

      // 恢复左侧按钮
      this._that.leftIconWitdh.value = timing(rpx2px(204,this.screenWidth),{duration:durationTime})
      // 隐藏语音输入
      this.voiceScax.value = timing(0,{duration:durationTime})

// 恢复初始化
      this.setData({touchEndStatus:'input',placeHolder:placeHolder,askText,bars:initBars,voiceLoading:submitting,cursor:askText.length}, () => {
        if(this._disposed || version !== this._voiceVersion) return
        this.setAreaHeight(askText)
        this.setData({inputFocus:focus})
        if(onReady) onReady()
      })
      if(!submitting) this.triggerEvent('changeLeftIcon',{leftIcon:'moreFun'},{})
    },
      /**
       * 键盘获得焦点
       * @param e
       */
      keyFocus(e){
        this.triggerEvent('focusChange', { focused: true })
        this._that.keyHeight.value = timing(keyHeightTmp + 12,{duration:durationTime,easing:Easing.ease})
      },
      /**
       * 键盘失去焦点
       * @param e
       */
      keyBlur(e){
        this.triggerEvent('focusChange', { focused: false })

        if(this._that.pressFlag.value) {
          this.setData({inputFocus : true})
          return;
        }
        this._that.keyHeight.value = timing(36,{duration:durationTime,easing:Easing.ease})
        this.setData({inputFocus : false})
      },
      /**
       * 键盘高度变化
       * @param e
       */
      keybordChange(e){
          const keyHeightRes = e.detail.height
          if(keyHeightRes > 0 && keyHeightRes != keyEnd ){
              keyEnd = keyHeightRes
              keyHeightTmp = keyHeightRes
              wx.setStorage({key: "keyHeight",data: keyHeightRes})

              this._that.keyHeight.value = timing(keyHeightRes + 12,{duration:durationTime,easing:Easing.ease})
          }
      },
      /**
       * 输入框行数变化
       * @param e
       */
      linChange(e){
          if(this.data.touchEndStatus !== 'input') return
          const lineCount = clamp(e.detail.lineCount,1,5)
          if(this.data.askText.length === 0){
            this.resetInputLayout()
            return
          }
          if(this._smartMode){
            const smartLineCount = Math.max(2, lineCount)
            this._layoutState = smartLineCount > 2 ? 'expanded' : 'smart'
            this.updateInputLayout(smartLineCount, true)
            return
          }
          if(lineCount > 1){
            this._layoutState = 'expanded'
            this.updateInputLayout(lineCount, true)
            return
          }
          if(this._layoutState === 'expanded'){
            return
          }
          this._layoutState = 'compact'
          this.updateInputLayout(1, false)

      },

      /**
       * 输入框内容变化
       * @param e
       */
      inputAsk(e){
          if(this.data.disabled) return
          const openPlugins = e.detail.value === '@' && this.data.askText !== '@'
          this.setData({askText:e.detail.value})
          if (openPlugins) {
            this.setData({ inputFocus: false })
            this.triggerEvent('openPlugins')
          }

      },

      
      startChat(){
        // 准备问答
        if(this.data.disabled || this.data.voiceLoading || this.data.touchEndStatus !== 'input' || this.data.askText.trim().length == 0){
          return
        }
        // 父组件确认新轮次进入消息列表后，才清空草稿。
        const keyHeight = this.data.settings.hideKey ? 36 : keyHeightTmp + 12
        this.triggerEvent("startChat",{askText:this.data.askText,keyHeight},{});
      },
        // 停止回答
      stopChat(){
        this.triggerEvent("endStream",{},{});
      },
  
      getRMS(pcm) {
        let sum = 0
        const len = pcm.length
        for (let i = 0; i < len; i++) {
          const v = pcm[i] / 32768 // -1 ~ 1
          sum += v * v
        }
        return Math.sqrt(sum / len) // 0 ~ 1
      },
      
     normalizeVolume(rms) {
        const noiseFloor = 0.02   // 噪声
        const maxRms = 1.0
      
        let v = (rms - noiseFloor) / (maxRms - noiseFloor)
        v = Math.max(0, Math.min(v, 1))
        return v
      },
      // 开始“音轨滚动”
    startRecordAnim() {
      if(this.data.disabled || this._disposed || this.data.voiceLoading) return false
      if(!recordAuth) return false
      if(recorderOwner){
        if(recorderOwner !== this) this.voiceError('busy')
        return false
      }
      this._voiceVersion = (this._voiceVersion || 0) + 1
      this._voiceCancelled = false
      this._sendAfterTranscription = false
      this._voiceSubmitting = false
      recorderOwner = this
      triggerHaptic(this.data.hapticFeedback, 'heavy')
      this.voiceScax.value = timing(1,{duration:durationTime})
      this._layoutState = 'compact'
      this.updateInputLayout(1, false)
      this._that.keyHeight.value = timing(36,{duration:durationTime,easing:Easing.ease})

      this.setData({touchEndStatus:'recording2send',inputFocus:false})
      this.triggerEvent('changeLeftIcon',{leftIcon:'stop'},{})
      this.recordingStarted = true
      try { this.recorderManager.start(options) }
      catch(error) { recorderOwner = null; this.recordingError(); return false }
      return true
    },
    

    finish(){
      this.syncAskStatus(this.data.askText, false)
    },
  }
})
