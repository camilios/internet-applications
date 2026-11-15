// Runs selected exported Postman requests/scripts against the actual local stack.
// This is a Node smoke harness, not the Postman app or Newman.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

if (process.env.RUN_POSTMAN_SMOKE !== 'true') throw new Error('Set RUN_POSTMAN_SMOKE=true; this creates a real local demo order and stops/restarts only email-worker.')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { expect } = await import(pathToFileURL(path.join(root, 'frontend/node_modules/chai/index.js')))
const collection = JSON.parse(fs.readFileSync(path.join(root, 'postman/E-Commerce.postman_collection.json'), 'utf8'))
const environment = JSON.parse(fs.readFileSync(path.join(root, 'postman/E-Commerce.local.postman_environment.json'), 'utf8'))
const variables = new Map(collection.variable.map(item => [item.key, item.value]))
const env = new Map(environment.values.filter(item => item.enabled).map(item => [item.key, item.value]))
assert.equal(env.get('base_url'), 'http://localhost:8000/api', 'refuse non-local API')
variables.set('idempotency_key', randomUUID())
const requests = collection.item.flatMap(folder => folder.item)
const results = [], sockets = []
let assertions = 0, restoreWorker = false
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(predicate, label, timeout = 20000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await predicate()) return
    await wait(150)
  }
  throw new Error(`Timed out: ${label}`)
}
async function run(prefix) {
  const item = requests.find(item => item.name.startsWith(prefix))
  assert.ok(item, `collection request exists: ${prefix}`)
  const local = new Map()
  const substitute = value => value.replace(/\{\{([^}]+)\}\}/g, (_, key) => key === '$guid' ? randomUUID() : String(local.has(key) ? local.get(key) : env.has(key) ? env.get(key) : variables.get(key) ?? `{{${key}}}`))
  const requestHeaders = item.request.header.map(header => ({ ...header }))
  const pm = { collectionVariables: { get: key => variables.get(key), set: (key, value) => variables.set(key, value), unset: key => variables.delete(key) }, variables: { replaceIn: substitute, set: (key, value) => local.set(key, value) }, request: { headers: { upsert: header => { const index = requestHeaders.findIndex(item => item.key.toLowerCase() === header.key.toLowerCase()); if (index < 0) requestHeaders.push(header); else requestHeaders[index] = header } } }, expect, test: (_name, callback) => { callback(); assertions++ } }
  for (const event of item.event ?? []) if (event.listen === 'prerequest') vm.runInNewContext(event.script.exec.join('\n'), { pm }, { timeout: 1000 })
  const headers = Object.fromEntries(requestHeaders.map(({ key, value }) => [key, substitute(value)]))
  if (item.request.auth.type === 'bearer') headers.Authorization = 'Bearer ' + substitute(item.request.auth.bearer[0].value)
  const body = item.request.body ? substitute(item.request.body.raw) : undefined
  const url = substitute(item.request.url)
  assert.ok(!url.includes('{{') && !body?.includes('{{'), `variables resolved: ${item.name}`)
  const start = Date.now()
  const response = await fetch(url, { method: item.request.method, headers, ...(body ? { body } : {}), signal: AbortSignal.timeout(15000) })
  const text = await response.text()
  pm.response = { code: response.status, json: () => JSON.parse(text), text: () => text }
  for (const event of item.event ?? []) if (event.listen === 'test') vm.runInNewContext(event.script.exec.join('\n'), { pm }, { timeout: 1000 })
  results.push({ request: item.name, status: response.status, elapsed_ms: Date.now() - start })
  console.log(`PASS ${response.status}: ${item.name}`)
  return { response, data: text.startsWith('{') ? JSON.parse(text) : null }
}
const windows = process.platform === 'win32'
const projectDirectory = windows ? '/mnt/' + root[0].toLowerCase() + root.slice(2).replaceAll('\\', '/') : root
function docker(args, input) {
  const command = windows ? 'C:\\Windows\\System32\\wsl.exe' : 'docker'
  const leading = windows ? ['-d', 'Ubuntu', '--', 'docker'] : []
  return execFileSync(command, [...leading, 'compose', '--project-directory', projectDirectory, ...args], { cwd: root, input, encoding: 'utf8', windowsHide: true, timeout: 45000, stdio: ['pipe', 'pipe', 'pipe'] })
}
function inspect() {
  const orderId = Number(variables.get('order_id') || 0)
  assert.ok(Number.isSafeInteger(orderId))
  const php = `<?php
require '/var/www/html/vendor/autoload.php';
$app = require '/var/www/html/bootstrap/app.php';
$app->make(Illuminate\\Contracts\\Console\\Kernel::class)->bootstrap();
if (!app()->environment('local') || config('mail.default') !== 'log' || !config('mail.order_email_allow_mock')) { throw new RuntimeException('Refusing smoke outside explicit local mock mode.'); }
Illuminate\\Support\\Facades\\DB::connection()->useWriteConnectionWhenReading();
$events = App\\Models\\OutboxEvent::query()->where('order_id', ${orderId})->get();
$ids = $events->pluck('event_id');
$deliveries = App\\Models\\NotificationDelivery::query()->whereIn('event_id', $ids)->get();
$connection = new PhpAmqpLib\\Connection\\AMQPStreamConnection(config('rabbitmq.host'), config('rabbitmq.port'), config('rabbitmq.user'), config('rabbitmq.password'), config('rabbitmq.vhost'));
$channel = $connection->channel();
$queue = $channel->queue_declare(config('rabbitmq.queue'), true);
$connection->close();
echo json_encode(['outbox' => $events->count(), 'published' => $events->whereNotNull('published_at')->count(), 'deliveries' => $deliveries->count(), 'mock_completed' => $deliveries->where('delivery_mode','mock')->whereNotNull('delivered_at')->count(), 'queue_ready' => $queue[1]]);
`
  return JSON.parse(docker(['exec', '-T', 'backend', 'php'], php))
}
async function socket() {
  const ws = new WebSocket(variables.get('reverb_url'), { headers: { Origin: 'http://localhost:5173' } })
  const events = []
  let socketId
  ws.addEventListener('message', message => {
    const event = JSON.parse(message.data)
    if (typeof event.data === 'string') { try { event.data = JSON.parse(event.data) } catch {} }
    events.push(event)
    if (event.event === 'pusher:connection_established') socketId = event.data.socket_id
    if (event.event === 'pusher:ping') ws.send(JSON.stringify({ event: 'pusher:pong', data: {} }))
  })
  ws.addEventListener('error', () => {})
  sockets.push(ws)
  await until(() => socketId, 'actual Reverb socket connection')
  return { ws, events, socketId }
}
async function subscribe(client, prefix, channel) {
  variables.set('socket_id', client.socketId)
  await run(prefix)
  client.ws.send(JSON.stringify({ event: 'pusher:subscribe', data: { channel, auth: variables.get('channel_auth') } }))
  await until(() => client.events.some(event => event.event === 'pusher_internal:subscription_succeeded' && event.channel === channel), 'private channel subscription')
}
try {
  await run('Login customer')
  await run('Login admin')
  await run('Login other_customer')
  await run('Current customer')
  await run('Categories')
  await run('Category detail')
  await run('Products (')
  const product = await run('Product detail')
  assert.ok(product.data.data.stock > 0, 'real gRPC confirms available stock')
  const admin = await socket()
  await subscribe(admin, 'Admin channel authorization', 'private-admin.orders')
  inspect() // Guard explicit local mock mode before stopping any service.
  restoreWorker = true
  docker(['stop', '--timeout', '5', 'email-worker'])
  await run('Create order')
  await run('Replay same order')
  const orderId = Number(variables.get('order_id'))
  await until(() => admin.events.some(event => event.event === 'OrderCreated' && event.data.order_id === orderId), 'admin live event while email worker is stopped')
  await until(() => inspect().published === 1, 'outbox publisher confirmation')
  const stopped = inspect()
  assert.equal(stopped.outbox, 1)
  assert.equal(stopped.deliveries, 0)
  assert.ok(stopped.queue_ready >= 1, 'RabbitMQ retained message with email worker stopped')
  docker(['start', 'email-worker'])
  await until(() => inspect().mock_completed === 1, 'mock delivery after worker restart', 30000)
  restoreWorker = false
  const restarted = inspect()
  assert.equal(restarted.deliveries, 1)
  assert.equal(restarted.queue_ready, 0)
  const owner = await socket()
  await subscribe(owner, 'Owner channel authorization', `private-orders.${orderId}`)
  for (const prefix of ['Reject customer on admin', 'Reject another customer on owner', 'Reject non-owner admin', 'Reject unauthenticated', 'Reject another customer reading', 'Reject customer opening', 'Customer orders', 'Customer order detail', 'Admin sees new order', 'Admin dashboard', 'Admin users']) await run(prefix)
  await run('Approve order as admin')
  await until(() => owner.events.some(event => event.event === 'OrderStatusUpdated' && event.data.order_id === orderId && event.data.status === 'confirmed'), 'actual owner status event')
  await run('Customer sees confirmed')
  for (const prefix of ['Customer dashboard', 'Notifications', 'Notification SSE snapshot']) await run(prefix)
  const frontend = await fetch('http://localhost:5173', { signal: AbortSignal.timeout(10000) })
  assert.equal(frontend.status, 200)
  const report = { status: 'PASS', executed_at: new Date().toISOString(), scope: 'Actual Docker MySQL/real inventory gRPC/RabbitMQ 3.13/Reverb/private auth/independent workers; explicit mock email; selected exported Postman scripts executed by Node/Chai, not Postman or Newman.', requests: results, script_assertions: assertions, order_id: orderId, product_id: Number(variables.get('product_id')), worker_stopped: stopped, worker_restarted: restarted, websocket_events: ['OrderCreated', 'OrderStatusUpdated'], frontend_http: frontend.status }
  fs.writeFileSync(path.join(root, 'docs/req4-evidence/postman-runtime.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(`PASS: ${results.length} live collection requests; ${assertions} script assertions; actual worker restart + admin/owner WebSocket events; frontend HTTP 200.`)
} finally {
  if (restoreWorker) docker(['start', 'email-worker'])
  for (const ws of sockets) ws.close()
}
