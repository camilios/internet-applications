// Node >= 22. Runs real Artisan workers against unique test-only queues and a generated SQLite database.
// Email is explicitly mocked; external delivery and real inventory are outside this proof.
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { spawn, execFileSync } from "node:child_process"
import { once } from "node:events"
import fs from "node:fs"
import net from "node:net"
import path from "node:path"
import { fileURLToPath } from "node:url"

const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const blocked = (reason) => { console.log(JSON.stringify({ status: "BLOCKED", scenario: "email_worker_restart", reason })); process.exitCode = 2 }

if (process.env.RUN_RABBITMQ_INTEGRATION_TESTS !== "true") {
  blocked("Set RUN_RABBITMQ_INTEGRATION_TESTS=true to enable the isolated RabbitMQ restart proof.")
} else if (!process.env.RABBITMQ_VHOST?.includes("test")) {
  blocked("RABBITMQ_VHOST must explicitly name an isolated test vhost.")
} else {
  const id = randomUUID()
  const prefix = `req4-worker-restart-${id}`
  const php = process.env.REQ4_QA_PHP || "php"
  const phpFlags = process.platform === "win32" ? ["-d", "extension=sockets", "-d", "extension=sodium", "-d", "extension=pdo_sqlite", "-d", "extension=gd"] : []
  const database = path.join(base, ".tools", `req4-qa-${id}.sqlite`)
  const portReservation = net.createServer()
  portReservation.listen(0, "127.0.0.1")
  await once(portReservation, "listening")
  const port = portReservation.address().port
  await new Promise((resolve) => portReservation.close(resolve))
  const env = {
    ...process.env, APP_ENV: "testing", APP_DEBUG: "false", APP_URL: `http://127.0.0.1:${port}`,
    APP_KEY: "base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    JWT_SECRET: "req4-worker-test-only-at-least-256-bit-secret", BCRYPT_ROUNDS: "4",
    DB_CONNECTION: "sqlite", DB_DATABASE: database, DB_URL: "", DB_REPLICA_ENABLED: "false", REQ4_QA_DATABASE: database,
    CACHE_STORE: "array", SESSION_DRIVER: "array", LOG_CHANNEL: "stderr",
    MAIL_MAILER: "array", ORDER_EMAIL_ALLOW_MOCK: "true", BROADCAST_CONNECTION: "log", QUEUE_CONNECTION: "database",
    RABBITMQ_CONNECTION_TIMEOUT: "2", RABBITMQ_CONFIRM_TIMEOUT: "3", RABBITMQ_READ_WRITE_TIMEOUT: "10", RABBITMQ_HEARTBEAT: "0",
    RABBITMQ_EXCHANGE: `${prefix}.events`, RABBITMQ_EMAIL_QUEUE: `${prefix}.email`,
    RABBITMQ_RETRY_EXCHANGE: `${prefix}.retry`, RABBITMQ_DLX: `${prefix}.dlx`, RABBITMQ_DLQ: `${prefix}.dlq`,
    RABBITMQ_RETRY_DELAYS: "1", REQ4_QA_MESSAGING_PREFIX: prefix,
    APP_CONFIG_CACHE: path.join(base, ".tools", `req4-worker-${id}-no-config.php`),
    APP_ROUTES_CACHE: path.join(base, ".tools", `req4-worker-${id}-no-routes.php`),
  }
  const children = []
  let logs = "", topologyReady = false
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const runPhp = (...args) => execFileSync(php, [...phpFlags, ...args], { cwd: base, env, encoding: "utf8", windowsHide: true, timeout: 30000, stdio: ["ignore", "pipe", "pipe"] })
  const inspect = () => JSON.parse(runPhp("tests/qa/email-worker-restart-fixture.php", "inspect"))
  const start = (...args) => {
    const child = spawn(php, [...phpFlags, ...args], { cwd: base, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] })
    children.push(child)
    child.on("error", (error) => { logs += `Child process error: ${error.message}\n` })
    child.stdout.on("data", (chunk) => { logs += chunk })
    child.stderr.on("data", (chunk) => { logs += chunk })
    return child
  }
  async function stop(child) {
    if (child.exitCode !== null || child.signalCode !== null) return
    const exited = once(child, "exit")
    child.kill()
    await Promise.race([exited, pause(5000)])
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL")
      await Promise.race([exited, pause(1000)])
    }
    assert.ok(child.exitCode !== null || child.signalCode !== null, "only the harness-owned process stops")
  }
  async function waitFor(predicate, label, timeout = 10000) {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      if (await predicate()) return
      await pause(100)
    }
    throw new Error(`Timed out: ${label}`)
  }
  try {
    fs.mkdirSync(path.dirname(database), { recursive: true })
    fs.writeFileSync(database, "", { flag: "wx" })
    const probe = JSON.parse(runPhp("tests/qa/email-worker-restart-fixture.php", "probe"))
    assert.equal(probe.status, "READY")
    topologyReady = true
    const fixture = JSON.parse(runPhp("tests/qa/reverb-fixture.php", "init"))
    start("-S", `127.0.0.1:${port}`, "tests/qa/reverb-router.php")
    const request = (method, route, body, headers = {}) => fetch(`http://127.0.0.1:${port}/api${route}`, {
      method, headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${fixture.owner}`, ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5000),
    })
    await waitFor(async () => { try { return (await request("GET", "/me")).ok } catch { return false } }, "isolated HTTP API startup")

    const worker = start("artisan", "orders:email-worker")
    await waitFor(() => logs.includes("MOCK DELIVERY enabled"), "mock worker startup")
    await pause(1000)
    assert.equal(worker.exitCode, null, "worker is alive while the unique queue is empty")
    assert.equal(inspect().queue_ready, 0)
    await stop(worker)

    const started = Date.now()
    const response = await request("POST", "/orders", { items: [{ product_id: fixture.product_id, quantity: 1 }] }, { "Idempotency-Key": randomUUID() })
    assert.equal(response.status, 201, "HTTP order creation succeeds while its email worker is stopped")
    const order = (await response.json()).data
    const orderHttpMs = Date.now() - started
    const stoppedState = inspect()
    assert.equal(stoppedState.orders, 1)
    assert.equal(stoppedState.outbox, 1)
    assert.equal(stoppedState.unpublished, 1)
    assert.equal(stoppedState.delivery_records, 0)

    runPhp("artisan", "outbox:publish", "--once")
    await waitFor(() => inspect().queue_ready === 1, "confirmed message remains queued while the worker is stopped")
    const queuedState = inspect()
    assert.equal(queuedState.unpublished, 0)
    assert.equal(queuedState.delivery_records, 0)
    console.log(JSON.stringify({ status: "PASS", step: "worker_stopped", order_id: order.id, order_http_completed: true, order_http_ms: orderHttpMs, ...queuedState }))

    runPhp("artisan", "orders:email-worker", "--once")
    await waitFor(() => inspect().queue_ready === 0, "worker ACK drains the queue")
    const restartedState = inspect()
    assert.equal(restartedState.delivery_records, 1)
    assert.equal(restartedState.completed_mock, 1)
    assert.equal(restartedState.completed_external, 0)
    console.log(JSON.stringify({ status: "PASS", step: "worker_restarted", ...restartedState }))

    runPhp("tests/qa/email-worker-restart-fixture.php", "replay")
    await waitFor(() => inspect().queue_ready === 1, "replayed event becomes available")
    runPhp("artisan", "orders:email-worker", "--once")
    const replayedState = inspect()
    assert.equal(replayedState.queue_ready, 0)
    assert.equal(replayedState.delivery_records, 1)
    assert.equal(replayedState.completed_mock, 1)
    assert.equal(replayedState.completed_external, 0)
    console.log(JSON.stringify({ status: "PASS", scenario: "email_worker_restart", duplicate_event_deduplicated: true, delivery_mode: "mock", external_email_sent: false }))
    console.log("Scope: real HTTP/SQLite/outbox/RabbitMQ/publisher/worker/ACK; inventory stub and deliberate array-mail mock. No external email delivery claim.")
  } catch (error) {
    if (!topologyReady && error.status === 2) {
      let reason = "Isolated RabbitMQ is unavailable."
      try { reason = JSON.parse(String(error.stdout)).reason } catch {}
      blocked(reason)
    } else {
      console.error(JSON.stringify({ status: "FAIL", scenario: "email_worker_restart", reason: error.message }))
      console.error(logs.slice(-4000))
      process.exitCode = 1
    }
  } finally {
    for (const child of children) await stop(child)
    if (topologyReady) {
      try { runPhp("tests/qa/email-worker-restart-fixture.php", "cleanup") }
      catch { console.error("Cleanup could not reach the isolated broker; only the unique QA topology may remain."); process.exitCode ||= 1 }
    }
    for (const suffix of ["", "-shm", "-wal"]) {
      try { fs.unlinkSync(database + suffix) } catch (error) { if (error.code !== "ENOENT") { console.error("Could not remove generated QA SQLite file."); process.exitCode ||= 1 } }
    }
  }
}
