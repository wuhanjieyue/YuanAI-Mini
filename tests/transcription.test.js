const assert = require('node:assert/strict')
const fs = require('node:fs'), vm = require('node:vm')
const tick = () => new Promise(resolve => setImmediate(resolve))

async function check() {
  let definition
  const events = [], requests = [], deleted = [], starts = [], handlers = {}, registrations = []
  let stops = 0
  const recorder = { start(options) { starts.push(options) }, stop() { stops++ } }
  for(const event of ['Stop','FrameRecorded','Error','InterruptionBegin']) {
    recorder[`on${event}`] = callback => { registrations.push(event); handlers[event] = callback }
  }
  const shared = value => ({value})
  const wx = { getWindowInfo:() => ({screenWidth:375,screenHeight:800}), getStorageSync:() => 0,
    getSetting:({success}) => success({authSetting:{'scope.record':true}}), nextTick(){},
    getRecorderManager:() => recorder, getFileSystemManager:() => ({unlink(options) { deleted.push(options.filePath) }}),
    worklet:{shared,timing:value => value,sequence:(...values) => values.at(-1),Easing:{ease:'ease'}} }
  vm.runInNewContext(fs.readFileSync('components/_self/yb-chat-input/index.js','utf8').replace(/^import .*\n/gm,''), {
    wx, Component:value => {definition=value}, require:name => name.endsWith('behavior') ? {} : {t:(_,key) => key},
    rpx2px:value => value/2, triggerHaptic(){}, transcribeSpeech(item) {
      const request = {item,abort(){this.aborted=true}}
      request.promise = new Promise((resolve,reject) => {request.resolve=resolve;request.reject=reject})
      requests.push(request);return request
    }
  })
  function create() {
    const input = {...definition.methods,data:{...definition.data,settings:{hideKey:true}},properties:{language:'中文'},
      _that:{btSca:shared(1),btTrax:shared(0),btTray:shared(0),leftIconWitdh:shared(102),keyHeight:shared(36),pressFlag:shared(false)},
      voiceScax:shared(0),riconScale:shared(1),updateInputLayout(){},setAreaHeight(){},
      setData(patch,callback){
        const old={...this.data};Object.assign(this.data,patch)
        for(const key of ['askText']) {
          if(key in patch && old[key]!==patch[key]) definition.observers[key].call(this,patch[key])
        }
        callback?.()
      },triggerEvent(name,detail){events.push({name,detail})}}
    definition.lifetimes.attached.call(input)
    return input
  }
  const input = create()
  assert.equal(stops,0,'attaching must not request microphone access by calling stop')
  input.tapVoice();assert.equal(starts.length,1)
  assert.equal(starts[0].format,'PCM');assert.equal(starts[0].sampleRate,16000)
  assert.equal(starts[0].numberOfChannels,1);assert.equal(starts[0].duration,60000)
  handlers.FrameRecorded({frameBuffer:new Int16Array([10000,1000,20000]).buffer})
  assert.equal(input.data.bars.length,52)
  assert.ok(input.data.bars.at(-1).height > 12)
  input.stopVoice();input.stopVoice();assert.equal(stops,1,'duplicate stop or send cannot repeat recognition')
  handlers.Stop({tempFilePath:'/recording.pcm'})
  assert.equal(requests.length,1);assert.equal(input.data.voiceLoading,true)
  input.tap();assert.equal(starts.length,1)
  requests[0].resolve('你好，世界。');await tick()
  assert.equal(input.data.askText,'你好，世界。');assert.equal(input.data.touchEndStatus,'input')
  assert.equal(input.data.inputFocus,true)
  assert.equal(events.some(event => event.name==='startChat'),false,'dictation only fills the draft')

  input.startRecordAnim();input.stopVoice();handlers.Stop({tempFilePath:'/append.pcm'})
  requests.at(-1).resolve('第二句话。');await tick()
  assert.equal(input.data.askText,'你好，世界。\n第二句话。','existing draft is retained')
  for(const statusCode of [422,429,502]) {
    input.startRecordAnim();input.stopVoice();handlers.Stop({tempFilePath:'/failed.pcm'})
    requests.at(-1).reject({statusCode});await tick()
    assert.equal(input.data.askText,'你好，世界。\n第二句话。')
    assert.equal(input.data.voiceLoading,false)
    assert.equal(events.at(-1).detail.message,`dictation.${statusCode===422?'empty':statusCode===429?'busy':'failed'}`)
  }
  input.setAskText('')
  const sentBefore=events.filter(event=>event.name==='sendTranscription').length
  input.startRecordAnim();input.tap();input.tap()
  handlers.Stop({tempFilePath:'/direct-send.pcm'})
  requests.at(-1).resolve('识别后直接发送。');await tick()
  const sent=events.filter(event=>event.name==='sendTranscription')
  assert.equal(sent.length,sentBefore+1,'right send submits exactly once')
  assert.equal(sent.at(-1).detail.askText,'识别后直接发送。')
  assert.equal(sent.at(-1).detail.keyHeight,36,'direct voice send keeps the keyboard closed')
  assert.equal(input.data.voiceLoading,true,'stay disabled until the chat accepts the recognized text')
  assert.equal(input.data.inputFocus,false,'direct send must not open the keyboard')
  const version=sent.at(-1).detail.voiceVersion
  input.acceptSend('识别后直接发送。')
  assert.equal(input.data.voiceLoading,false)
  assert.equal(input.data.askText,'')
  assert.equal(input.data.askStatus,1,'accepted direct send shows the normal response Stop state')
  input.finishVoiceSend(version,true)
  assert.equal(input.data.inputFocus,false,'late completion must not focus a cleared accepted draft')
  input.finish();assert.equal(input.data.askStatus,2)

  input.startRecordAnim();input.tap();handlers.Stop({tempFilePath:'/blocked-send.pcm'})
  requests.at(-1).resolve('保留未发送的文字。');await tick()
  input.finishVoiceSend(input._voiceVersion,true)
  assert.equal(input.data.voiceLoading,false)
  assert.equal(input.data.askText,'保留未发送的文字。')
  assert.equal(input.data.askStatus,0,'a blocked send restores an editable send button')
  assert.equal(input.data.inputFocus,true)
  input.startRecordAnim();input.tap();handlers.Stop({tempFilePath:'/stale-send.pcm'})
  requests.at(-1).resolve('新文字');await tick()
  const oldVersion=input._voiceVersion
  input.setAskText('新会话草稿')
  input.startRecordAnim();input.stopVoice();handlers.Stop({tempFilePath:'/new-dictation.pcm'})
  input.finishVoiceSend(oldVersion,true)
  assert.equal(input.data.voiceLoading,true,'late send completion cannot unlock a newer recognition')
  requests.at(-1).resolve('新识别');await tick()
  assert.equal(input.data.askText,'新会话草稿\n新识别')

  input.startRecordAnim();handlers.Stop({tempFilePath:'/auto-stop.pcm'})
  assert.equal(input.data.voiceLoading,true,'native duration limit still starts transcription')
  const old = requests.at(-1)
  input.setAskText('另一个聊天的草稿')
  assert.equal(old.aborted,true)
  old.resolve('旧识别');await tick()
  assert.equal(input.data.askText,'另一个聊天的草稿')
  input.startRecordAnim();input.cancelVoice();handlers.Stop({tempFilePath:'/cancelled.pcm'})
  assert.ok(deleted.includes('/cancelled.pcm'))
  const count = requests.length
  const second = create()
  assert.equal(registrations.length,4,'singleton listeners do not accumulate on remount')
  definition.lifetimes.detached.call(input)
  const priorStops=stops
  definition.lifetimes.detached.call(input)
  assert.equal(stops,priorStops)
  second.startRecordAnim();handlers.InterruptionBegin();handlers.Stop({tempFilePath:'/interrupted.pcm'})
  assert.equal(second.data.touchEndStatus,'input');assert.equal(requests.length,count)
  assert.equal(events.at(-1).detail.message,'dictation.interrupted')
  second.startRecordAnim();handlers.Error()
  assert.equal(second.data.touchEndStatus,'input')
  assert.equal(events.at(-1).detail.message,'dictation.recordFailed')
  second.startRecordAnim();second.stopVoice();handlers.Stop({tempFilePath:'/hidden.pcm'})
  const hidden=requests.at(-1)
  definition.pageLifetimes.hide.call(second);hidden.resolve('迟到');await tick()
  assert.equal(hidden.aborted,true);assert.equal(second.data.askText,'')
  second.startRecordAnim();definition.lifetimes.detached.call(second)
  handlers.Stop({tempFilePath:'/unmounted.pcm'})
  assert.ok(deleted.includes('/unmounted.pcm'))
  assert.equal(requests.length,count+1)
  assert.match(fs.readFileSync('components/_self/yb-chat-view/index.js','utf8'), /leaveConversation\(save = true\)\{\s*this\.selectComponent\('#readAloud'\)\?\.stop\(\)\s*this\.selectComponent\('#chatInput'\)\?\.cancelVoice\?\.\(\)/)
  assert.match(fs.readFileSync('components/_self/yb-chat-view/index.wxml','utf8'), /bind:voiceError="voiceError"/)

  const hostTemplate=fs.readFileSync('components/_self/yb-chat-view/index.wxml','utf8')
  const inputTemplate=fs.readFileSync('components/_self/yb-chat-input/index.wxml','utf8')
  assert.match(inputTemplate,/wx:if="\{\{voiceLoading\}\}" class="iconfont icon-loading_flow_iconfont/)
  assert.match(hostTemplate,/bind:sendTranscription="sendTranscription"/)
  assert.match(inputTemplate,/voiceLoading \? 'input-action-disabled'/)
  assert.match(inputTemplate,/aria-disabled="\{\{voiceLoading \|\|/)
  const cancelButton=hostTemplate.match(/<view wx:if="\{\{leftIcon == 'stop'\}\}"[^>]+>/)[0]
  assert.match(cancelButton,/catch:tap="cancelVoice"/)
  assert.doesNotMatch(cancelButton,/aria-disabled/)
  const stopButton=inputTemplate.match(/<view wx:if="\{\{([^}]+)\}\}" class="voice-stop[^>]+>/)[0]
  assert.match(stopButton,/catch:tap="stopVoice"/)
  const stopVisible=stopButton.match(/wx:if="\{\{([^}]+)\}\}"/)[1]
  for(const [touchEndStatus,voiceLoading,expected] of [
    ['input',false,false],['recording',false,true],['recording2send',false,true],['input',true,true]
  ]) assert.equal(vm.runInNewContext(stopVisible,{touchEndStatus,voiceLoading}),expected)
  assert.match(hostTemplate,/iconfont icon-x ft40 voice-cancel-icon/)
  assert.doesNotMatch(inputTemplate,/icon-loader|voice-load/)
  assert.match(inputTemplate,/wx:if="\{\{voiceLoading\}\}" class="dictation-label[^>]*>\{\{i18n\.chat\.transcription\}\}/)
  assert.match(inputTemplate,/class="wave-area row-centered ac surface-bg bg-l0 \{\{voiceLoading \? 'jc' : ''\}\}">\s*<text wx:if="\{\{voiceLoading\}\}"[^>]*>\{\{i18n\.chat\.transcription\}\}<\/text>\s*<block wx:else>\s*<view\s+class="wave-bar/)
  const spinner=fs.readFileSync('components/_self/yb-chat-input/index.wxss','utf8')
  assert.match(spinner,/\.dictation-loading \{ animation:dictation-spin 1\.5s linear infinite/)

  const permission = create()
  let authCallback
  wx.getSetting=options=>{authCallback=options.success}
  const recordedBeforeAuth=starts.length
  permission.tap()
  permission.cancelVoice()
  authCallback({authSetting:{'scope.record':true}})
  assert.equal(starts.length,recordedBeforeAuth,'late authorization cannot record in a new conversation')
  wx.getSetting=({success})=>success({authSetting:{'scope.record':true}})
  permission.startRecordAnim()
  permission._that.pressFlag.value=true
  const beforeMove=starts.length
  permission.setData({touchEndStatus:'recording'})
  permission.startX=0;permission.startY=0
  permission.touchmove({touches:[{pageX:0,pageY:-180}]})
  assert.equal(starts.length,beforeMove,'dragging an active recording must not restart the singleton')
  assert.equal(permission.data.touchEndStatus,'recording2send')
  permission.touchend({})
  assert.equal(permission._that.pressFlag.value,false)
  permission.cancelVoice();handlers.Stop({tempFilePath:'/touch-cancel.pcm'})
  assert.ok(deleted.includes('/touch-cancel.pcm'))
  assert.match(fs.readFileSync('components/_self/yb-chat-input/index.wxml','utf8'),/bind:touchcancel="cancelVoice"/)

  const uploads=[],files={}
  const api=vm.runInNewContext(fs.readFileSync('request/transcription.js','utf8').replace(/^import .*\n/gm,'').replace('export function ','function ')+'\ntranscribeSpeech', {
    wx:{getFileSystemManager:() => files},startHttpAudioUpload(path,data){
      const upload={path,data,abort(){this.aborted=true}}
      upload.promise=new Promise((resolve,reject)=>{upload.resolve=resolve;upload.reject=reject})
      uploads.push(upload);return upload
    }
  })
  const info=[],reads=[],unlinks=[]
  files.getFileInfo=options=>info.push(options)
  files.readFile=options=>reads.push(options)
  files.unlink=options=>unlinks.push(options.filePath)
  const first=api({tempFilePath:'/local.pcm'})
  info.at(-1).success({size:32000});reads.at(-1).success({data:new ArrayBuffer(32000)})
  assert.equal(uploads.at(-1).path,'/speech/transcriptions')
  uploads.at(-1).resolve('测试');assert.equal(await first.promise,'测试')
  assert.ok(unlinks.includes('/local.pcm'))
  const cancelled=api({tempFilePath:'/cancel.pcm'})
  const rejected=assert.rejects(cancelled.promise);cancelled.abort();info.at(-1).success({size:32000});await rejected
  assert.equal(uploads.length,1,'cancel before file read prevents upload')
  const reading=api({tempFilePath:'/reading.pcm'})
  info.at(-1).success({size:32000});const readResult=reads.at(-1)
  const readRejected=assert.rejects(reading.promise);reading.abort();readResult.success({data:new ArrayBuffer(32000)});await readRejected
  assert.equal(uploads.length,1,'late file read cannot submit audio')
  const sending=api({tempFilePath:'/sending.pcm'})
  info.at(-1).success({size:32000});reads.at(-1).success({data:new ArrayBuffer(32000)})
  const sentRejected=assert.rejects(sending.promise);sending.abort();await sentRejected
  assert.equal(uploads.at(-1).aborted,true)
  for(const size of [0,6399,32001,1920002]) {
    const invalid=api({tempFilePath:'/invalid.pcm'});info.at(-1).success({size});await assert.rejects(invalid.promise)
  }
  console.log('transcription: recording, draft fill, cancellation, remount, interruption, stale responses and private file cleanup passed')
}
check().catch(error=>{console.error(error);process.exitCode=1})
