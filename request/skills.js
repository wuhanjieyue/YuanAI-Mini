import { callHttp } from './http'

async function skillRequest(path, options) {
  const { statusCode, result } = await callHttp(path, options)
  if (statusCode !== 200 || result.code !== 200) {
    throw Object.assign(new Error(result.msg || 'Skill request failed'), { statusCode, errorCode: result.code })
  }
  if (!result.data || typeof result.data !== 'object') throw new Error('Invalid Skill response')
  return result.data
}

async function listInstalledSkills({ query = '' } = {}) {
  return skillRequest('/skills/installed', { query })
}

async function listRecommendedSkills({ query = '', cursor = '', limit = 25, category = '' } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 25) throw new RangeError('Invalid skill page limit')
  if (typeof cursor !== 'string') throw new TypeError('Invalid skill cursor')
  return skillRequest('/skills/recommended', { query, cursor, limit, ...(category ? { category } : {}) })
}

async function getSkillDetail({ id }) {
  return skillRequest('/skills/detail', { id })
}

async function trySkill({ id }) {
  return skillRequest('/skills/try', { id })
}

async function enableSkill({ id }) {
  return skillRequest('/skills/enable', { id })
}

async function removeSkill({ id }) {
  return skillRequest('/skills/remove', { id })
}

module.exports = { listInstalledSkills, listRecommendedSkills, getSkillDetail, trySkill, enableSkill, removeSkill }
