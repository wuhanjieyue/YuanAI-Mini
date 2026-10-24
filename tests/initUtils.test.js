const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const filename = path.join(__dirname, '../static_utils/initUtils.js')
const source = fs.readFileSync(filename, 'utf8')
  .replace('export default initUtils;', 'module.exports = initUtils')
const appSource = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8')
const privateConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../project.private.config.json'), 'utf8'))

let ready
let failed
let applyCalls = 0
const modals = []
const sandbox = {
  module: { exports: {} },
  wx: {
    canIUse: () => true,
    getUpdateManager: () => {
      return {
        onUpdateReady: (listener) => { ready = listener },
        onUpdateFailed: (listener) => { failed = listener },
        applyUpdate: () => { applyCalls += 1 }
      }
    },
    showModal: (options) => { modals.push(options) }
  }
}

vm.runInNewContext(source, sandbox, { filename })
assert.equal(sandbox.module.exports.versionUpdate(), true)

ready()
modals[0].success({ confirm: true })
failed()

assert.equal(applyCalls, 1)
assert.equal(modals.length, 2)
assert.match(modals[1].content, /版本更新失败/)
assert.match(appSource, /if \(wx\.getDeviceInfo\(\)\.platform !== 'devtools'\) initUtils\.versionUpdate\(\)/)
assert.equal(privateConfig.setting.useApiHook, false)

console.log('initUtils: ok')
