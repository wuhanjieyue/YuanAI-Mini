import { callHttp } from './http'
import { chatRuntime } from './chatRuntime'

async function taskRequest(action, body = {}) {
  const epoch = chatRuntime.epoch
  const { statusCode, result } = await callHttp('/tasks/' + action, body)
  if (epoch !== chatRuntime.epoch) throw new Error('账号已切换，请重新打开计划任务')
  if (statusCode !== 200 || result?.code !== 200) throw new Error(result?.msg || '计划任务请求失败')
  return result.data
}
export function listTasks(cursor = '', status = 'active') { return taskRequest('list', { cursor, status }) }
export function taskStatus(ids) { return taskRequest('status', { ids }) }
export function saveTask(task) { return taskRequest('save', { id:task.id, revision:task.revision || 0, task }) }
export function taskAction(id, action) { return taskRequest(action, { id }) }
export function taskView(task) {
  const status = task.pending ? (task.lastStatus === 'running' ? '运行中' : '排队中') : ({ failed:'执行失败', cancelled:'已取消' }[task.lastStatus] || '')
  const lastRun = task.lastRunAt ? new Date(task.lastRunAt).toLocaleString() : '尚未执行'
  return { ...task, lastRun:status || lastRun }
}
