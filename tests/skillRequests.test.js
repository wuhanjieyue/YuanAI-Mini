const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

const source = fs.readFileSync(require.resolve('../request/skills'), 'utf8')
const requests = []
const list = { items: [{ id: 'web_search', title: 'web-search', description: '后端原始描述', logoUrl: 'https://example.test/logo.png', installed: true, enabled: true, updatedAt: '2026-10-13T00:00:00.000Z' }] }
const cursor = 'eyJxdWVyeSI6InNlYXJjaCJ9.opaque-cursor'
const recommendation = { ...list, nextCursor: cursor, hasMore: true }
const detail = { ...list.items[0], markdown: '# Web search\n\nComplete Markdown body.' }
let response, failure
const context = {
  module: { exports: {} },
  callHttp: async (path, data) => {
    requests.push({ path, data: { ...data } })
    if (failure) throw failure
    return response || { statusCode: 200, result: { code: 200, msg: 'success', data: path === '/skills/detail' ? detail : path === '/skills/recommended' ? recommendation : list } }
  }
}
vm.runInNewContext(source.replace(/^import .*$/gm, ''), context)
const { listInstalledSkills, listRecommendedSkills, getSkillDetail, trySkill, enableSkill, removeSkill } = context.module.exports

async function main() {
  const installedRequest = listInstalledSkills({ query: ' Search ', language: 'English', limit: 1, cursor: 'ignored', owner: 'never-send' })
  assert.equal(typeof installedRequest.then, 'function')
  assert.equal(await installedRequest, list, 'installed returns the full server data unchanged')
  assert.deepEqual(requests.at(-1), { path: '/skills/installed', data: { query: ' Search ' } }, 'installed has no pagination, client identity or locale fields')
  assert.equal(await listInstalledSkills(), list)
  assert.deepEqual(requests.at(-1).data, { query: '' })

  assert.equal(await listRecommendedSkills(), recommendation)
  assert.deepEqual(requests.at(-1), { path: '/skills/recommended', data: { query: '', cursor: '', limit: 25 } })
  assert.equal(await listRecommendedSkills({ query: 'Web', cursor, limit: 25, language: 'English' }), recommendation)
  assert.deepEqual(requests.at(-1).data, { query: 'Web', cursor, limit: 25 }, 'opaque server cursors pass through unchanged')
  assert.equal(recommendation.items[0].title, 'web-search', 'server titles are not localized')
  assert.equal(recommendation.items[0].description, '后端原始描述')
  assert.equal(await getSkillDetail({ id: 'web_search', language: 'English' }), detail)
  assert.deepEqual(requests.at(-1), { path: '/skills/detail', data: { id: 'web_search' } })
  assert.equal(detail.markdown.startsWith('# '), true, 'frontmatter stripping belongs to the backend')
  await trySkill({ id: 'web_search', ownerId: 'must-not-send', enabled: false })
  assert.deepEqual(requests.at(-1), { path: '/skills/try', data: { id: 'web_search' } }, 'the server derives owner and enables the selected Skill')
  for (const [action, name] of [[enableSkill,'enable'], [removeSkill,'remove']]) {
    await action({ id:'web_search', ownerId:'must-not-send', enabled:true })
    assert.deepEqual(requests.at(-1), { path:`/skills/${name}`, data:{id:'web_search'} })
  }

  const beforeInvalid = requests.length
  for (const limit of [0, -1, 1.5, 26]) await assert.rejects(listRecommendedSkills({ limit }), /Invalid skill page limit/)
  for (const cursor of [null, 25]) await assert.rejects(listRecommendedSkills({ cursor }), /Invalid skill cursor/)
  assert.equal(requests.length, beforeInvalid, 'invalid pagination does not reach HTTP')
  response = { statusCode: 409, result: { code: 'SKILL_DEFINITION_UNAVAILABLE', msg: 'Skill definition unavailable', data: null } }
  await assert.rejects(listInstalledSkills(), error => error.message === 'Skill definition unavailable' && error.statusCode === 409 && error.errorCode === 'SKILL_DEFINITION_UNAVAILABLE')
  response = { statusCode: 200, result: { code: 404, msg: 'Skill not found' } }
  await assert.rejects(getSkillDetail({ id: 'unknown' }), /Skill not found/)
  response = { statusCode: 200, result: { code: 200 } }
  await assert.rejects(listRecommendedSkills(), /Invalid Skill response/)
  response = null
  failure = new Error('Network offline')
  await assert.rejects(listInstalledSkills(), error => error === failure, 'network errors retain the original failure for UI retry')
  assert.doesNotMatch(source, /skillCatalog|SKILLS|messages|mock|matchingSkills/)
  assert.equal(fs.existsSync(require.resolve('../static_utils/assetPresentation').replace('assetPresentation.js', 'skillCatalog.js')), false, 'the bundled static catalog is removed')
  console.log('skillRequests: HTTP data, full installed list, opaque cursors, raw copy and error propagation passed')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
