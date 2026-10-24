import { startHttpAudioUpload } from './http'

export function transcribeSpeech({ tempFilePath }) {
  const files = wx.getFileSystemManager()
  let cancelled = false, upload, rejectRequest
  const promise = new Promise((resolve, reject) => {
    rejectRequest = reject
    files.getFileInfo({ filePath:tempFilePath, success(info) {
      if(cancelled) return
      if(info.size > 1920000 || info.size < 6400 || info.size % 2) {
        reject(Object.assign(new Error('Invalid recording size'), { statusCode:400 }))
        return
      }
      files.readFile({ filePath:tempFilePath, success({ data }) {
        if(cancelled) return
        if(!data?.byteLength || data.byteLength > 1920000) { reject(new Error('Invalid recording')); return }
        upload = startHttpAudioUpload('/speech/transcriptions', data)
        upload.promise.then(resolve, reject)
      }, fail:reject })
    }, fail:reject })
  }).finally(() => files.unlink({ filePath:tempFilePath, fail() {} }))
  return { promise, abort() {
    if(cancelled) return
    cancelled = true
    upload?.abort()
    rejectRequest(new Error('Transcription cancelled'))
  } }
}
