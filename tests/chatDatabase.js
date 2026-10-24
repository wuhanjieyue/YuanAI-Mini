const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { EventEmitter } = require('node:events')

// Serial transactions with rollback; concurrent route preparations still run independently.
function database() {
  const rows = new Map()
  let pending = Promise.resolve()
  let writeCount = 0
  const clone = value => structuredClone(value)
  const db = {
    rows, failWriteAt: 0,
    command: {
      and: (...tests) => value => tests.every(test => test(value)),
      remove: () => ({ op: 'remove' }),
      set: value => ({ op: 'set', value }), inc: value => ({ op: 'inc', value }),
      in: list => value => list.includes(value), neq: expected => value => value !== expected,
      gte: expected => value => value >= expected, gt: expected => value => value > expected,
      lt: expected => value => value < expected, lte: expected => value => value <= expected
    },
    collection(name) { return collection(rows, name) },
    async runTransaction(callback) {
      const previous = pending
      let unlock
      pending = new Promise(resolve => { unlock = resolve })
      await previous
      const snapshot = clone(rows)
      try { return await callback(db) }
      catch (error) { rows.clear(); for (const [key, value] of snapshot) rows.set(key, value); throw error }
      finally { unlock() }
    }
  }
  function collection(rows, name) {
    if (!rows.has(name)) rows.set(name, new Map())
    const docs = () => rows.get(name)
    const write = () => { if (++writeCount === db.failWriteAt) throw new Error('injected write failure') }
    const update = (doc, patch) => {
      for (const [key, value] of Object.entries(patch)) {
        if (value?.op === 'remove') { delete doc[key]; continue }
        doc[key] = value?.op === 'set' ? clone(value.value) : value?.op === 'inc' ? (doc[key] || 0) + value.value : clone(value)
      }
    }
    const api = {
      doc(id) { return {
        async get() { return { data: clone(docs().get(id)) } },
        async set(value) { write(); docs().set(id, { ...clone(value), _id: id }); return { updated: 1 } },
        async update(patch) { write(); const doc = docs().get(id); if (!doc) throw new Error(`missing ${name}/${id}`); update(doc, patch); return { updated: 1 } },
        async remove() { write(); return { deleted: Number(docs().delete(id)) } }
      } },
      async add(value) { const id = `auto-${docs().size}`; await api.doc(id).set(value); return { id } },
      where(where) {
        let limit = 100, offset = 0, order
        const matches = doc => Object.entries(where).every(([key, value]) => typeof value === 'function' ? value(doc[key]) : doc[key] === value)
        const selected = () => [...docs().values()].filter(matches)
        return {
          limit(value) { limit = value; return this }, skip(value) { offset = value; return this },
          orderBy(key, direction) { order = { key, direction }; return this },
          field() { return this },
          async get() { const list = selected(); if (order) list.sort((a,b) => (a[order.key] < b[order.key] ? -1 : a[order.key] > b[order.key] ? 1 : 0) * (order.direction === 'desc' ? -1 : 1)); return { data: clone(list.slice(offset, offset + limit)) } },
          async count() { return { total: selected().length } },
          async update(patch) { const list = selected(); for (const doc of list) await api.doc(doc._id).update(patch); return { updated: list.length } },
          async remove() { const list = selected(); for (const doc of list) await api.doc(doc._id).remove(); return { deleted: list.length } }
        }
      }
    }
    return api
  }
  return db
}

function loadFunction(name, db, options = {}) {
  const filename = path.resolve(__dirname, `../cloudfunctions/${name}/index.js`)
  const localRequire = createRequire(filename)
  let route
  const invocations = []
  const exports = {}
  const context = {
    exports, require(name) {
      if (name === 'http') return { createServer(handler) { route = handler; return { listen() {} } } }
      if (name === '@cloudbase/node-sdk') return { init: () => ({
        database: () => db,
        callFunction: async value => { invocations.push(value) },
        ai: () => ({ bot: options.bot, createModel: () => ({ streamText: options.streamText || (async () => ({ dataStream:(async function*(){ yield { choices:[{ delta:{ content:'answer' } }] } })() })) }) })
      }) }
      return localRequire(name)
    },
    process: { env: options.env || {} }, Buffer, Date, URL, console, setTimeout, clearTimeout, setInterval, clearInterval
  }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename })
  return {
    main: exports.main, invocations,
    request(url, body, openId = 'test-owner', headers = {}) {
      return new Promise(resolve => {
        const req = new EventEmitter()
        Object.assign(req, { method: 'POST', url, headers: { 'x-wx-openid': openId, 'x-wx-appid': 'test-app', ...headers } })
        const res = new EventEmitter()
        Object.assign(res, { output: '', writeHead(status) { this.status = status; this.headersSent = true },
          write(text) { this.output += text }, end(text = '') { this.output += text; this.writableEnded = true; resolve(this) } })
        route(req, res); req.emit('data', Buffer.from(JSON.stringify(body))); req.emit('end')
      })
    }
  }
}
module.exports = { database, loadFunction }
