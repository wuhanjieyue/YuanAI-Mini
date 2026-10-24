const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const filename = path.join(__dirname, '../static_utils/appInit.js')
const source = fs.readFileSync(filename, 'utf8')
  .replace('export default appInit', 'module.exports = appInit')

const app = { globalData: { su_init: false } }
let getAppCalls = 0
let windowCalls = 0
let menuCalls = 0
const sandbox = {
  module: { exports: {} },
  getApp: () => {
    getAppCalls += 1
    return app
  },
  wx: {
    getWindowInfo: () => {
      windowCalls += 1
      return { screenWidth: 390, screenHeight: 844 }
    },
    getMenuButtonBoundingClientRect: () => {
      menuCalls += 1
      return { width: 87, height: 32 }
    }
  }
}

vm.runInNewContext(source, sandbox, { filename })
const appInit = sandbox.module.exports

appInit(app)
appInit()

assert.equal(getAppCalls, 1)
assert.equal(windowCalls, 1)
assert.equal(menuCalls, 1)
assert.equal(app.globalData.su_init, true)
assert.equal(app.globalData.su_system.screenWidth, 390)
assert.equal(app.globalData.su_menu.height, 32)

console.log('appInit: ok')
