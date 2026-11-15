import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { CollectionSandbox } from './sandbox.mjs'

const collection = JSON.parse(fs.readFileSync(new URL('../E-Commerce.postman_collection.json', import.meta.url), 'utf8'))
const key = '11111111-1111-4111-8111-111111111111'
const stale = '22222222-2222-4222-8222-222222222222'
const setup = options => {
  const sandbox = new CollectionSandbox(collection, options)
  for (const [name, value] of Object.entries({ idempotency_key: key, customer_token: 'fresh-test-token', customer_id: 42, product_id: 24 })) sandbox.values.set(name, value)
  return sandbox
}

test('reproduces the previous environment shadowing defect', () => {
  const legacy = structuredClone(collection)
  const orders = legacy.item.find(folder => folder.name.startsWith('03')).item
  for (const item of orders) {
    if (item.name.startsWith('Prepare next order key')) item.event.find(event => event.listen === 'prerequest').script.exec = ["pm.collectionVariables.set('idempotency_key', pm.variables.replaceIn('{{$guid}}'));"]
    if (item.name.startsWith('Create order')) item.event.find(event => event.listen === 'prerequest').script.exec = ["if (!pm.collectionVariables.get('idempotency_key')) pm.collectionVariables.set('idempotency_key', pm.variables.replaceIn('{{$guid}}'));"]
  }
  const sandbox = new CollectionSandbox(legacy, { environment: { idempotency_key: stale } })
  sandbox.prepare('Prepare next order key')
  const prepared = sandbox.values.get('idempotency_key')
  const sent = sandbox.prepare('Create order').request.headers['Idempotency-Key']
  assert.equal(sent, stale)
  assert.notEqual(sent, prepared)
})

test('prepare and create send the fresh key despite environment, runner and local shadows', () => {
  const sandbox = setup({ environment: { idempotency_key: stale }, data: { idempotency_key: stale }, local: { idempotency_key: stale } })
  sandbox.prepare('Prepare next order key')
  const prepared = sandbox.values.get('idempotency_key')
  assert.notEqual(prepared, key)
  assert.notEqual(prepared, stale)
  assert.equal(sandbox.prepare('Create order').request.headers['Idempotency-Key'], prepared)
})

test('first creation generates its own key when only a shadow key exists', () => {
  const sandbox = setup({ environment: { idempotency_key: stale } })
  sandbox.values.set('idempotency_key', '')
  const sent = sandbox.prepare('Create order').request.headers['Idempotency-Key']
  assert.notEqual(sent, stale)
  assert.match(sent, /^[0-9a-f-]{36}$/)
  assert.equal(sandbox.values.get('idempotency_key'), sent)
})

test('unchanged retries and replay retain the same key', () => {
  const sandbox = setup({ environment: { idempotency_key: stale } })
  const first = sandbox.prepare('Create order').request
  assert.equal(sandbox.prepare('Create order').request.headers['Idempotency-Key'], first.headers['Idempotency-Key'])
  assert.equal(sandbox.prepare('Replay same order').request.headers['Idempotency-Key'], first.headers['Idempotency-Key'])
  assert.equal(sandbox.prepare('Replay same order').request.body, first.body)
})

test('captured customer token and order ID win over stale environment values', () => {
  const sandbox = setup({ environment: { customer_token: 'stale-test-token', order_id: 123 } })
  sandbox.values.set('order_id', 456)
  const sent = sandbox.prepare('Customer order detail').request
  assert.equal(sent.headers.Authorization, 'Bearer fresh-test-token')
  assert.ok(sent.url.endsWith('/orders/456'))
})

test('new purchase clears the old order ID and preserves configured product/quantity inputs', () => {
  const sandbox = setup({ environment: { order_id: 123, product_id: 33, quantity: 2 } })
  sandbox.prepare('Prepare next order key')
  assert.equal(sandbox.values.get('order_id'), '')
  assert.equal(sandbox.prepare('Customer order detail').pm.variables.get('order_id'), '')
  assert.deepEqual(JSON.parse(sandbox.prepare('Create order').request.body), { items: [{ product_id: 33, quantity: 2 }] })
})

test('replay requires an existing prepared key', () => {
  const sandbox = setup()
  sandbox.values.set('idempotency_key', '')
  assert.throws(() => sandbox.prepare('Replay same order'), /Prepare next order key/)
})

test('all exported scripts compile and prepare precedes create in the collection', () => {
  for (const folder of collection.item) for (const item of folder.item) for (const event of item.event) new vm.Script(event.script.exec.join('\n'))
  const orders = collection.item.find(folder => folder.name.startsWith('03')).item
  assert.ok(orders[0].name.startsWith('Prepare next order key'))
  assert.ok(orders[1].name.startsWith('Create order'))
})
