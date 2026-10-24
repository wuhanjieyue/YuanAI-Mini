import { callHttp, downloadHttpFile } from './http'

async function request(funName) {
  const { statusCode, result } = await callHttp('/user', { funName })
  if (statusCode !== 200 || result.code !== 200) throw new Error(result.msg || '请求失败')
  return result.data
}

export const startDataExport = () => request('startDataExport')
export const getDataExport = () => request('getDataExport')
export const deleteAccount = () => request('deleteAccount')
export const getAccountDeletion = () => request('getAccountDeletion')

export async function shareDataExport(job) {
  if (!/^[a-f0-9]{32}$/.test(job.jobId)) throw new Error('导出文件不可用')
  const path = await downloadHttpFile('/user-data/export/' + job.jobId)
  await new Promise((resolve, reject) => {
    const options = { filePath: path, success: resolve, fail: reject }
    const platform = wx.getDeviceInfo().platform
    if (platform === 'windows' || platform === 'mac') wx.saveFileToDisk(options)
    else wx.shareFileMessage({ ...options, fileName: job.fileName })
  })
}
