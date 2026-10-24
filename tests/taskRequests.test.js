const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const source = fs.readFileSync(require('node:path').join(__dirname, '../request/tasks.js'), 'utf8')
const runtime = { epoch:1 }
let calls = [], response = { statusCode:200, result:{ code:200, data:{ items:[] } } }, hook
const context = { chatRuntime:runtime, callHttp:async (path, body) => { calls.push({path,body}); if (hook) hook(); return response } }
vm.createContext(context)
vm.runInContext(source.replace(/^import .+$/gm,'').replace(/^export /gm,''),context)
;(async () => {
  await context.listTasks('cursor_a')
  assert.equal(calls[0].path,'/tasks/list')
  assert.equal(calls[0].body.cursor,'cursor_a')
  assert.equal(calls[0].body.status,'active')
  await context.saveTask({ id:'task_a', revision:4, name:'name' })
  assert.equal(calls[1].body.revision,4)
  assert(!('ownerId' in calls[1].body))
  await context.taskAction('task_a','run')
  assert.equal(calls[2].path,'/tasks/run')
  for (const status of ['paused','completed']) {
    await context.listTasks('next',status)
    assert.equal(calls.at(-1).body.status,status)
    assert.equal(calls.at(-1).body.cursor,'next')
  }
  response = { statusCode:409, result:{ code:409, msg:'版本冲突' } }
  await assert.rejects(context.saveTask({id:'task_a'}),/版本冲突/)
  hook = () => runtime.epoch++
  await assert.rejects(context.listTasks(),/账号已切换/)
  assert.equal(context.taskView({ pending:true,lastStatus:'running' }).lastRun,'运行中')
  console.log('taskRequests: API errors, revision and account fencing passed')
})().catch(error => { console.error(error); process.exitCode=1 })
