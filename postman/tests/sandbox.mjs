// Executes the exported request scripts with Postman's variable precedence.
// No network calls; callers explicitly choose whether to send the prepared request.
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

export class CollectionSandbox {
  constructor(collection, { environment = {}, data = {}, local = {}, expect, onAssertion = () => {} } = {}) {
    this.collection = collection
    this.values = new Map(collection.variable.map(item => [item.key, item.value]))
    this.environment = new Map(Object.entries(environment))
    this.data = new Map(Object.entries(data))
    this.initialLocal = local
    this.expect = expect
    this.onAssertion = onAssertion
  }

  prepare(prefix) {
    const original = this.collection.item.flatMap(folder => folder.item).find(item => item.name.startsWith(prefix))
    assert.ok(original, `Request exists: ${prefix}`)
    const item = structuredClone(original)
    const local = new Map(Object.entries(this.initialLocal))
    const get = key => local.has(key) ? local.get(key) : this.data.has(key) ? this.data.get(key) : this.environment.has(key) ? this.environment.get(key) : this.values.get(key)
    const replaceIn = value => value.replace(/\{\{([^}]+)\}\}/g, (_, key) => key === '$guid' ? randomUUID() : String(get(key) ?? `{{${key}}}`))
    const pm = {
      collectionVariables: { get: key => this.values.get(key), set: (key, value) => this.values.set(key, value), unset: key => this.values.delete(key) },
      variables: { get, set: (key, value) => local.set(key, value), unset: key => local.delete(key), replaceIn },
      request: { headers: { upsert: header => {
        const index = item.request.header.findIndex(value => value.key.toLowerCase() === header.key.toLowerCase())
        if (index < 0) item.request.header.push(header)
        else item.request.header[index] = header
      } } },
      expect: this.expect,
      test: (_name, callback) => { callback(); this.onAssertion() },
    }
    const context = vm.createContext({ pm })
    for (const event of item.event || []) if (event.listen === 'prerequest') vm.runInContext(event.script.exec.join('\n'), context, { timeout: 1000 })
    const headers = Object.fromEntries(item.request.header.map(({ key, value }) => [key, replaceIn(value)]))
    if (item.request.auth.type === 'bearer') headers.Authorization = 'Bearer ' + replaceIn(item.request.auth.bearer[0].value)
    return {
      item, local, pm,
      request: { url: replaceIn(item.request.url), method: item.request.method, headers, ...(item.request.body ? { body: replaceIn(item.request.body.raw) } : {}) },
      testResponse: (code, body) => {
        pm.response = { code, json: () => typeof body === 'string' ? JSON.parse(body) : body, text: () => typeof body === 'string' ? body : JSON.stringify(body) }
        for (const event of item.event || []) if (event.listen === 'test') vm.runInContext(event.script.exec.join('\n'), context, { timeout: 1000 })
      },
    }
  }
}
