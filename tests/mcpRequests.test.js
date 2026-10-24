const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
assert.match(fs.readFileSync(require.resolve('../request/mcps'), 'utf8'), /require\('..\/static_utils\/i18n\/index'\)/)
const calls = [], data = { items:[] }
const store = { applicationSettings:{ language:'English' } }
let response = { statusCode:200, result:{ code:200, data } }
const context = { module:{ exports:{} }, require:name => name.includes('store') ? { store } : require('../static_utils/i18n'),
  callHttp:async (path, body) => { calls.push({ path, body:{ ...body } }); return response } }
vm.runInNewContext(fs.readFileSync(require.resolve('../request/mcps'), 'utf8').replace(/^import .*$/gm, ''), context)
async function main() {
  const api = context.module.exports
  assert.equal(await api.listInstalledMcps(), data)
  assert.equal(calls.at(-1).body.locale, 'en-US')
  await api.listRecommendedMcps({ query:'stock', cursor:'opaque', limit:2, ownerId:'never-send' })
  assert.deepEqual(calls.at(-1), { path:'/mcps/recommended', body:{ query:'stock', cursor:'opaque', limit:2, locale:'en-US' } })
  for (const name of ['getMcpDetail','enableMcp','removeMcp','tryMcp']) {
    await api[name]({ id:'dashscope', ownerId:'never-send', url:'https://untrusted.test' })
    assert.deepEqual(calls.at(-1).body, { id:'dashscope', locale:'en-US' })
  }
  response = { statusCode:404, result:{ code:'MCP_NOT_FOUND', msg:'MCP not found' } }
  await assert.rejects(api.getMcpDetail({ id:'unknown' }), error => error.errorCode === 'MCP_NOT_FOUND')
  console.log('mcpRequests: owner-free requests, locale, cursors and errors passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
