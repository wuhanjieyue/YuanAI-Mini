import { callHttp } from './http'
import eventBus, { ASSET_LIST_INVALIDATED } from '../static_utils/eventBus'
const { knowledgeCitationId } = require('../static_utils/chatSources')

async function knowledgeRequest(operation, params = {}) {
  const { statusCode, result } = await callHttp('/knowledge/' + operation, params)
  if (statusCode !== 200 || result?.code !== 200) {
    throw Object.assign(new Error(result?.msg || '知识库请求失败'), { errorCode:result?.code, statusCode })
  }
  return result.data
}

function listKnowledge(options = {}) { return knowledgeRequest('list', options) }
function getKnowledgeMembership(assetId) { return knowledgeRequest('membership', { assetId }) }
async function mutateKnowledge(operation, options) {
  const result = await knowledgeRequest(operation, options)
  eventBus.emit(ASSET_LIST_INVALIDATED, { source:'knowledge' })
  return result
}
function importKnowledge(assetIds) { return mutateKnowledge('import', { assetIds }) }
function renameKnowledge(id, name) { return mutateKnowledge('rename', { id, name }) }
function removeKnowledge(id) { return mutateKnowledge('remove', { id }) }
function retryKnowledge(id) { return mutateKnowledge('retry', { id }) }
function resolveKnowledgeCitation(id) { return knowledgeRequest('citation', { id }) }
function listKnowledgeChunks(id, options = {}) { return knowledgeRequest('chunks', { ...options, id }) }
function getKnowledgeChunk(id, chunkId, revision) { return knowledgeRequest('chunk', { id, chunkId, revision }) }

module.exports = { listKnowledge, getKnowledgeMembership, importKnowledge, renameKnowledge, removeKnowledge, retryKnowledge,
  knowledgeCitationId, resolveKnowledgeCitation, listKnowledgeChunks, getKnowledgeChunk }
