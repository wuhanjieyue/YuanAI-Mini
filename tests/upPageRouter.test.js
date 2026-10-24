const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const source = fs.readFileSync(path.resolve(__dirname, '../static_router/upPageRouter.js'), 'utf8')
let builder
const calls = []

vm.runInNewContext(source
  .replace(/import \{[\s\S]*?\} from '\.\.\/static_utils\/routerUtil\.js'\n/, '')
  .replace('export default function upRouterBuilder()', 'function upRouterBuilder()')
  + '\nupRouterBuilder()', {
  CurveAnimation: ({ animation }) => animation,
  Curves: { linearToEaseOut() {}, easeInToLinear() {} },
  getApp: () => ({ globalData: { su_system: { screenHeight: 800 } } }),
  wx: {
    getWindowInfo: () => { throw new Error('su_system should be preferred') },
    router: {
      removeRouteBuilder: name => calls.push(['remove', name]),
      addRouteBuilder: (name, value) => { calls.push(['add', name]); builder = value }
    }
  }
})

assert.deepEqual(calls, [['remove', 'upRouterBuilder'], ['add', 'upRouterBuilder']])
const config = builder({
  primaryAnimation: { value: 0.5 },
  primaryAnimationStatus: { value: 1 },
  userGestureInProgress: { value: false }
})
assert.equal(config.handlePrimaryAnimation().transform, 'translateY(400px)')
assert.equal(config.allowEnterRouteSnapshotting, false)
assert.equal(config.allowExitRouteSnapshotting, true)

console.log('upPageRouter: shared route registration, geometry and snapshot policy passed')
