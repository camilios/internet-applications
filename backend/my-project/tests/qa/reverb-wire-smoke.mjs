// Native live-wire smoke test; Node >= 22 and PHP dependencies/extensions required.
// Uses only a generated SQLite database and test credentials. No email worker runs.
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { spawn, execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const php = process.env.REQ4_QA_PHP || "php"
const phpFlags = process.platform === "win32" ? ["-d", "extension=sockets", "-d", "extension=sodium", "-d", "extension=pdo_sqlite", "-d", "extension=gd"] : []
const database = path.join(base, ".tools", `req4-qa-${randomUUID()}.sqlite`)
fs.mkdirSync(path.dirname(database), { recursive: true })
fs.writeFileSync(database, "", { flag: "wx" })
const env = {
  ...process.env, APP_ENV: "testing", APP_DEBUG: "false", APP_URL: "http://127.0.0.1:18000",
  APP_KEY: "base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  JWT_SECRET: "req4-wire-test-only-at-least-256-bit-secret", BCRYPT_ROUNDS: "4",
  DB_CONNECTION: "sqlite", DB_DATABASE: database, DB_URL: "", DB_REPLICA_ENABLED: "false", REQ4_QA_DATABASE: database,
  CACHE_STORE: "array", SESSION_DRIVER: "array", LOG_CHANNEL: "stderr", MAIL_MAILER: "array",
  BROADCAST_CONNECTION: "reverb", QUEUE_CONNECTION: "database",
  REVERB_APP_ID: "req4-qa-app", REVERB_APP_KEY: "req4-qa-key", REVERB_APP_SECRET: "req4-qa-only-secret",
  REVERB_HOST: "127.0.0.1", REVERB_PORT: "18080", REVERB_SCHEME: "http", REVERB_ALLOWED_ORIGINS: "*",
  APP_CONFIG_CACHE: path.join(base, ".tools", "req4-qa-no-config.php"),
  APP_ROUTES_CACHE: path.join(base, ".tools", "req4-qa-no-routes.php"),
}
const children = [], sockets = []
let logs = ""
const runPhp = (...args) => execFileSync(php, [...phpFlags, ...args], { cwd: base, env, encoding: "utf8", windowsHide: true, timeout: 30000 })
const start = (...args) => {
  const child = spawn(php, [...phpFlags, ...args], { cwd: base, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] })
  children.push(child)
  child.stdout.on("data", (chunk) => { logs += chunk })
  child.stderr.on("data", (chunk) => { logs += chunk })
  return child
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function request(method, route, token, body, headers = {}) {
  return fetch(`http://127.0.0.1:18000/api${route}`, {
    method, headers: { Accept: "application/json", "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000),
  })
}
async function connect() {
  const messages = []
  const socket = new WebSocket("ws://127.0.0.1:18080/app/req4-qa-key?protocol=7&client=js&version=8.6.0&flash=false")
  sockets.push(socket)
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data)
    if (typeof message.data === "string") message.data = JSON.parse(message.data)
    messages.push(message)
  })
  async function awaitEvent(event, channel) {
    const deadline = Date.now() + 10000
    while (Date.now() < deadline) {
      const message = messages.find((m) => m.event === event && (!channel || m.channel === channel))
      if (message) return message
      await pause(25)
    }
    throw new Error(`Timed out: ${event} ${channel || ""}`)
  }
  const established = await awaitEvent("pusher:connection_established")
  return { socket, socketId: established.data.socket_id, awaitEvent }
}
async function authorize(connection, token, channel, expected = 200) {
  const response = await request("POST", "/broadcasting/auth", token, { socket_id: connection.socketId, channel_name: channel })
  assert.equal(response.status, expected, `authorization ${channel}`)
  return response.json()
}
async function subscribe(connection, token, channel) {
  const { auth } = await authorize(connection, token, channel)
  connection.socket.send(JSON.stringify({ event: "pusher:subscribe", data: { channel, auth } }))
  await connection.awaitEvent("pusher_internal:subscription_succeeded", channel)
}

try {
  const fixture = JSON.parse(runPhp("tests/qa/reverb-fixture.php", "init"))
  start("-S", "127.0.0.1:18000", "tests/qa/reverb-router.php")
  start("artisan", "reverb:start", "--host=127.0.0.1", "--port=18080")
  let ready = false
  for (let i = 0; i < 100; i++) {
    try { if ((await request("GET", "/me", fixture.admin)).ok) { ready = true; break } } catch {}
    await pause(100)
  }
  assert.ok(ready, "isolated API startup")
  // Reverb startup can lag API startup on Windows.
  await pause(1000)
  const admin = await connect()
  await subscribe(admin, fixture.admin, "private-admin.orders")
  const key = randomUUID()
  const created = await request("POST", "/orders", fixture.owner, { items: [{ product_id: fixture.product_id, quantity: 1 }] }, { "Idempotency-Key": key })
  assert.equal(created.status, 201, "order creation without email worker")
  const order = (await created.json()).data
  assert.deepEqual(JSON.parse(runPhp("tests/qa/reverb-fixture.php", "inspect")), { orders: 1, outbox: 1, unpublished: 1, deliveries: 0, queued_broadcasts: 1 })
  runPhp("artisan", "queue:work", "database", "--queue=broadcasts", "--once", "--tries=1", "--timeout=15")
  const createdEvent = await admin.awaitEvent("OrderCreated", "private-admin.orders")
  assert.equal(createdEvent.data.order_id, order.id)
  assert.deepEqual(Object.keys(createdEvent.data).sort(), ["event_id", "occurred_at", "order_id"])
  const customer = await connect()
  const channel = `private-orders.${order.id}`
  await authorize(customer, fixture.other, channel, 403)
  await authorize(customer, fixture.owner, "private-admin.orders", 403)
  await authorize(customer, fixture.admin, channel, 403)
  await authorize(customer, null, channel, 401)
  assert.equal((await request("GET", `/orders/${order.id}`, fixture.other)).status, 403)
  await subscribe(customer, fixture.owner, channel)
  const updated = await request("PATCH", `/admin/orders/${order.id}/status`, fixture.admin, { status: "confirmed" })
  assert.equal(updated.status, 200)
  runPhp("artisan", "queue:work", "database", "--queue=broadcasts", "--once", "--tries=1", "--timeout=15")
  const statusEvent = await customer.awaitEvent("OrderStatusUpdated", channel)
  assert.equal(statusEvent.data.order_id, order.id)
  assert.equal(statusEvent.data.status, "confirmed")
  assert.deepEqual(Object.keys(statusEvent.data).sort(), ["event_id", "occurred_at", "order_id", "status"])
  const final = JSON.parse(runPhp("tests/qa/reverb-fixture.php", "inspect"))
  assert.equal(final.unpublished, 1)
  assert.equal(final.deliveries, 0)
  assert.equal(final.queued_broadcasts, 0)
  const replay = await request("POST", "/orders", fixture.owner, { items: [{ product_id: fixture.product_id, quantity: 1 }] }, { "Idempotency-Key": key })
  assert.equal(replay.status, 201)
  assert.equal((await replay.json()).data.id, order.id)
  assert.equal(JSON.parse(runPhp("tests/qa/reverb-fixture.php", "inspect")).outbox, 1)
  console.log("PASS live Reverb wire: order creation, post-commit database broadcast, minimal payloads, owner status update, JWT private authorization, REST ownership, email/broker independence, idempotent order replay")
  console.log("Scope: native WebSocket clients + real HTTP/SQLite/queue/Reverb; test inventory stub; no browser UI, RabbitMQ, SMTP or MySQL concurrency claim.")
} catch (error) {
  console.error(error.message)
  console.error(logs.slice(-12000))
  process.exitCode = 1
} finally {
  for (const socket of sockets) socket.close()
  for (const child of children) child.kill()
  await pause(300)
  for (const suffix of ["", "-shm", "-wal"]) {
    try { fs.unlinkSync(database + suffix) } catch {}
  }
}
