import { callHttp } from './http'
const { toLocale } = require('../static_utils/i18n/index')
const { store } = require('../store/index')

async function mcpRequest(action, options = {}) {
  const { statusCode, result } = await callHttp(`/mcps/${action}`, {
    ...options, locale: toLocale(store.applicationSettings?.language)
  })
  if (statusCode !== 200 || result.code !== 200) {
    throw Object.assign(new Error(result.msg || 'MCP request failed'), { statusCode, errorCode: result.code })
  }
  if (!result.data || typeof result.data !== 'object') throw new Error('Invalid MCP response')
  return result.data
}

module.exports = {
  listInstalledMcps: () => mcpRequest('installed'),
  listRecommendedMcps: ({ query = '', cursor = '', limit = 25, category = '' } = {}) => mcpRequest('recommended', { query, cursor, limit, ...(category ? { category } : {}) }),
  getMcpDetail: ({ id }) => mcpRequest('detail', { id }),
  tryMcp: ({ id }) => mcpRequest('try', { id }),
  enableMcp: ({ id }) => mcpRequest('enable', { id }),
  removeMcp: ({ id }) => mcpRequest('remove', { id })
}
