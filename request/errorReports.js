import { callHttp } from './http'

export async function submitErrorReport(report) {
  const { statusCode, result } = await callHttp('/user', { funName: 'submitErrorReport', ...report })
  if (statusCode !== 200 || result.code !== 200 || !result.data?.reportId) {
    throw new Error(result.msg || 'Report failed')
  }
  return result.data
}
