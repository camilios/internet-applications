// Real production React/Echo browser acceptance, using only Node >=22 + installed Edge/Chrome.
// Seeds an isolated SQLite DB through the guarded backend QA fixture. Inventory alone is stubbed.
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { spawn, execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { checkResponsiveLayouts } from "../responsive/layout-checks.mjs"

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const backend = path.resolve(frontend, "../backend/my-project")
const toolsRoot = path.join(frontend, "tests/.tools")
const runDirectory = path.join(toolsRoot, `req4-browser-${randomUUID()}`)
const profile = path.join(runDirectory, "profile")
const database = path.join(backend, ".tools", `req4-qa-${randomUUID()}.sqlite`)
const apiPort = Number(process.env.REQ4_BROWSER_API_PORT || 18100)
const reverbPort = Number(process.env.REQ4_BROWSER_REVERB_PORT || 18180)
const uiPort = Number(process.env.REQ4_BROWSER_UI_PORT || 18173)
const origin = `http://127.0.0.1:${uiPort}`
const api = `http://127.0.0.1:${apiPort}/api`
const checkLayouts = process.env.REQ4_BROWSER_LAYOUT === "true"
const viewport = { width: checkLayouts ? 720 : 1280, height: 900, deviceScaleFactor: 1, mobile: false }
const php = process.env.REQ4_QA_PHP || "php"
const phpFlags = process.platform === "win32" ? ["-d", "extension=sockets", "-d", "extension=sodium", "-d", "extension=pdo_sqlite", "-d", "extension=gd"] : []
const browser = process.env.REQ4_BROWSER_EXECUTABLE || [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/chromium", "/usr/bin/google-chrome",
].find((candidate) => fs.existsSync(candidate))
assert.ok(browser, "Set REQ4_BROWSER_EXECUTABLE to an installed Edge/Chrome executable")
for (const port of [apiPort, reverbPort, uiPort]) assert.ok(Number.isInteger(port) && port > 1024 && port < 65536)

fs.mkdirSync(profile, { recursive: true })
fs.mkdirSync(path.dirname(database), { recursive: true })
fs.writeFileSync(database, "", { flag: "wx" })
const env = {
  ...process.env, APP_ENV: "testing", APP_DEBUG: "false", APP_URL: `http://127.0.0.1:${apiPort}`,
  APP_KEY: "base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", JWT_SECRET: "req4-browser-test-only-at-least-256-bit-secret",
  BCRYPT_ROUNDS: "4", DB_CONNECTION: "sqlite", DB_DATABASE: database, DB_URL: "", DB_REPLICA_ENABLED: "false", REQ4_QA_DATABASE: database,
  CACHE_STORE: "array", SESSION_DRIVER: "array", LOG_CHANNEL: "stderr", MAIL_MAILER: "array",
  BROADCAST_CONNECTION: "reverb", QUEUE_CONNECTION: "database",
  REVERB_APP_ID: "req4-browser-app", REVERB_APP_KEY: "req4-browser-key", REVERB_APP_SECRET: "req4-browser-test-only-secret",
  REVERB_HOST: "127.0.0.1", REVERB_PORT: String(reverbPort), REVERB_SCHEME: "http", REVERB_ALLOWED_ORIGINS: "127.0.0.1,localhost",
  CORS_ALLOWED_ORIGINS: origin,
  APP_CONFIG_CACHE: path.join(runDirectory, "no-config.php"), APP_ROUTES_CACHE: path.join(runDirectory, "no-routes.php"),
  VITE_API_URL: checkLayouts ? "/api" : api, VITE_REVERB_APP_KEY: "req4-browser-key", VITE_REVERB_HOST: "127.0.0.1", VITE_REVERB_PORT: String(reverbPort), VITE_REVERB_SCHEME: "http",
}
const children = [], tabs = [], checks = []
let processLogs = "", cdp
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const runPhp = (...args) => execFileSync(php, [...phpFlags, ...args], { cwd: backend, env, encoding: "utf8", windowsHide: true, timeout: 90000 })
function start(executable, args, cwd) {
  const child = spawn(executable, args, { cwd, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] })
  children.push(child)
  child.stdout.on("data", (chunk) => { processLogs += chunk })
  child.stderr.on("data", (chunk) => { processLogs += chunk })
  child.on("error", (error) => { processLogs += `${error.message}\n` })
  return child
}
async function until(check, message, timeout = 45000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try { const result = await check(); if (result) return result } catch {}
    await pause(100)
  }
  throw new Error(`Timed out: ${message}`)
}
async function request(method, route, token, body, headers = {}) {
  return fetch(api + route, {
    method, headers: { Accept: "application/json", "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000),
  })
}

class DevTools {
  nextId = 0
  pending = new Map()
  listeners = new Set()
  constructor(url) {
    this.socket = new WebSocket(url)
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true })
      this.socket.addEventListener("error", reject, { once: true })
    })
    this.socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data)
      if (message.id) {
        const pending = this.pending.get(message.id)
        if (!pending) return
        clearTimeout(pending.timer)
        this.pending.delete(message.id)
        if (message.error) pending.reject(new Error(message.error.message))
        else pending.resolve(message.result)
      } else for (const listener of this.listeners) listener(message)
    })
  }
  async send(method, params = {}, sessionId) {
    await this.ready
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`DevTools timeout: ${method}`)) }, 15000)
      this.pending.set(id, { resolve, reject, timer })
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    })
  }
}

async function evaluate(tab, expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, tab.sessionId)
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}
async function newTab(user, token, route) {
  const { browserContextId } = await cdp.send("Target.createBrowserContext")
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank", browserContextId })
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true })
  const tab = { sessionId, targetId, browserContextId, frames: [], requests: [], errors: [] }
  tabs.push(tab)
  cdp.listeners.add((message) => {
    if (message.sessionId !== sessionId) return
    if (message.method === "Network.webSocketFrameReceived") {
      try {
        const frame = JSON.parse(message.params.response.payloadData)
        const data = typeof frame.data === "string" ? JSON.parse(frame.data) : frame.data
        tab.frames.push({ event: frame.event, channel: frame.channel, order_id: data?.order_id, status: data?.status })
      } catch {}
    }
    if (message.method === "Network.responseReceived") {
      const { url, status } = message.params.response
      const prefix = url.startsWith(api) ? api : checkLayouts && url.startsWith(origin + "/api") ? origin + "/api" : null
      if (prefix) tab.requests.push({ route: url.slice(prefix.length), status })
    }
    if (message.method === "Runtime.exceptionThrown") tab.errors.push(message.params.exceptionDetails.text)
  })
  for (const domain of ["Page", "Runtime", "Network"]) await cdp.send(`${domain}.enable`, {}, sessionId)
  await cdp.send("Emulation.setDeviceMetricsOverride", viewport, sessionId)
  if (user && token) {
    const storage = JSON.stringify({ state: { user, token, isAuthenticated: true }, version: 0 })
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.setItem('auth-storage', ${JSON.stringify(storage)})` }, sessionId)
  }
  await cdp.send("Page.navigate", { url: origin + route }, sessionId)
  await until(() => evaluate(tab, "document.readyState === 'complete' && !!document.querySelector('main, form')"), `React page ${route}`)
  tab.timeOrigin = await evaluate(tab, "performance.timeOrigin")
  return tab
}
const bodyHas = (tab, text) => until(() => evaluate(tab, `document.body.innerText.includes(${JSON.stringify(text)})`), `visible text ${text}`)
const subscribed = (tab, channel) => until(() => tab.frames.some((frame) => frame.event === "pusher_internal:subscription_succeeded" && frame.channel === channel), `Echo subscription ${channel}`)
const visibleOrder = (id) => `[...document.querySelectorAll('tbody tr, article[aria-label]')].find(row => row.getClientRects().length && row.innerText.includes('#${id}'))`
async function screenshot(tab, name) {
  await cdp.send("Page.bringToFront", {}, tab.sessionId)
  await evaluate(tab, "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))")
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, tab.sessionId)
  const filename = path.join(runDirectory, name)
  fs.writeFileSync(filename, Buffer.from(data, "base64"))
  return filename
}

try {
  const prebuilt = process.env.REQ4_BROWSER_PREBUILT_DIST
  if (prebuilt) {
    const source = path.resolve(prebuilt)
    const relative = path.relative(toolsRoot, source)
    assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative) && path.basename(source) === "dist" && path.basename(path.dirname(source)).startsWith("req4-browser-"), "Only reuse a generated isolated test build with matching test ports/settings")
    fs.cpSync(source, path.join(runDirectory, "dist"), { recursive: true })
    console.log("Reusing the unchanged isolated production build for a test-harness-only rerun...")
  } else {
    console.log("Building production frontend for the isolated browser acceptance environment...")
    const npmCli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js")
    execFileSync(process.execPath, [npmCli, "run", "build", "--", "--outDir", path.join(runDirectory, "dist")], { cwd: frontend, env, encoding: "utf8", windowsHide: true, timeout: 180000 })
  }
  const fixture = JSON.parse(runPhp("tests/qa/reverb-fixture.php", "init"))
  start(php, [...phpFlags, "-S", `127.0.0.1:${apiPort}`, "tests/qa/reverb-router.php"], backend)
  start(php, [...phpFlags, "artisan", "reverb:start", "--host=127.0.0.1", `--port=${reverbPort}`], backend)
  start(process.execPath, [path.join(frontend, "node_modules/vite/bin/vite.js"), "preview", "--host=127.0.0.1", `--port=${uiPort}`, "--strictPort", "--outDir", path.join(runDirectory, "dist"), ...(checkLayouts ? ["--config", "tests/responsive/vite.config.mjs"] : [])], frontend)
  await until(async () => (await request("GET", "/me", fixture.admin)).ok, "isolated HTTP API")
  await until(async () => !!(await fetch(`http://127.0.0.1:${reverbPort}`)), "Reverb server")
  await until(async () => (await fetch(origin)).ok, "production Vite preview")
  const adminUser = (await (await request("GET", "/me", fixture.admin)).json()).data
  const ownerUser = (await (await request("GET", "/me", fixture.owner)).json()).data
  start(browser, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-background-networking", "--disable-sync", "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`, "about:blank"], frontend)
  const devToolsFile = path.join(profile, "DevToolsActivePort")
  const address = await until(() => fs.existsSync(devToolsFile) && fs.readFileSync(devToolsFile, "utf8").trim().split(/\r?\n/), "isolated headless browser startup")
  cdp = new DevTools(`ws://127.0.0.1:${address[0]}${address[1]}`)
  await cdp.ready
  const dashboard = await newTab(adminUser, fixture.admin, "/")
  const adminOrders = await newTab(adminUser, fixture.admin, "/orders")
  await subscribed(dashboard, "private-admin.orders")
  await subscribed(adminOrders, "private-admin.orders")
  await bodyHas(adminOrders, "لا توجد طلبات")
  const countExpression = `[...document.querySelectorAll('[data-slot="card"]')].find(card => card.querySelector('[data-slot="card-title"]')?.textContent === 'إجمالي الطلبات')?.querySelector('[data-slot="card-content"]')?.innerText.trim()`
  await until(async () => (await evaluate(dashboard, countExpression)) === "0", "initial dashboard order count")

  const response = await request("POST", "/orders", fixture.owner, { items: [{ product_id: fixture.product_id, quantity: 1 }] }, { "Idempotency-Key": randomUUID() })
  assert.equal(response.status, 201, "order creation succeeds with no email worker")
  const order = (await response.json()).data
  const beforeBroadcast = JSON.parse(runPhp("tests/qa/reverb-fixture.php", "inspect"))
  assert.equal(beforeBroadcast.unpublished, 1)
  assert.equal(beforeBroadcast.deliveries, 0)
  runPhp("artisan", "queue:work", "database", "--queue=broadcasts", "--once", "--tries=1", "--timeout=15")
  await bodyHas(dashboard, `طلب جديد #${order.id}`)
  await until(async () => (await evaluate(dashboard, countExpression)) === "1", "dashboard count changes through Echo")
  await until(() => evaluate(adminOrders, `!!(${visibleOrder(order.id)})`), "new order appears in the visible table/card")
  assert.ok(dashboard.frames.some((frame) => frame.event === "OrderCreated" && frame.order_id === order.id))
  assert.ok(adminOrders.frames.some((frame) => frame.event === "OrderCreated" && frame.order_id === order.id))
  checks.push("PASS: actual Echo event displays Arabic new-order announcement, updates dashboard count and admin order row without refresh")
  await screenshot(dashboard, "dashboard-new-order.png")
  await screenshot(adminOrders, "admin-new-order.png")

  const customer = await newTab(ownerUser, fixture.owner, `/orders/${order.id}`)
  const customerList = await newTab(ownerUser, fixture.owner, "/orders")
  const pendingList = await newTab(ownerUser, fixture.owner, "/orders?status=pending")
  const adminApproval = await newTab(adminUser, fixture.admin, `/orders/${order.id}`)
  await subscribed(customer, `private-orders.${order.id}`)
  await subscribed(customerList, `private-orders.${order.id}`)
  await subscribed(pendingList, `private-orders.${order.id}`)
  await bodyHas(customer, "قيد الانتظار")
  await bodyHas(customerList, "قيد الانتظار")
  await bodyHas(pendingList, "قيد الانتظار")
  await until(() => evaluate(adminApproval, "!!document.querySelector('#next-order-status')"), "existing admin approval control")
  await evaluate(adminApproval, "(() => { const select = document.querySelector('#next-order-status'); select.value = 'confirmed'; select.dispatchEvent(new Event('change', { bubbles: true })); })()")
  await until(() => adminApproval.requests.some((item) => item.route === `/admin/orders/${order.id}/status` && item.status === 200), "existing admin mutation succeeds")
  runPhp("artisan", "queue:work", "database", "--queue=broadcasts", "--once", "--tries=1", "--timeout=15")
  await bodyHas(customer, "مؤكد")
  await until(() => evaluate(customerList, `(${visibleOrder(order.id)})?.innerText.includes('مؤكد')`), "visible customer list/card status updates")
  await bodyHas(pendingList, "لا توجد طلبات")
  assert.ok(customer.frames.some((frame) => frame.event === "OrderStatusUpdated" && frame.order_id === order.id && frame.status === "confirmed"))
  assert.ok(customerList.frames.some((frame) => frame.event === "OrderStatusUpdated" && frame.order_id === order.id && frame.status === "confirmed"))
  assert.ok(pendingList.frames.some((frame) => frame.event === "OrderStatusUpdated" && frame.order_id === order.id && frame.status === "confirmed"))
  assert.ok(customer.requests.filter((item) => item.route === `/orders/${order.id}` && item.status === 200).length >= 2)
  for (const tab of [customer, customerList, pendingList]) {
    await until(() => evaluate(tab, `[...document.querySelectorAll('[data-sonner-toast]')].some(toast => toast.getClientRects().length && toast.innerText.includes('تم تحديث حالة الطلب #${order.id}'))`), "visible customer status toast")
  }
  checks.push("PASS: existing admin approval UI sends PATCH; actual Echo event updates customer detail and orders list and removes the row from the pending filter without refresh")
  await screenshot(customer, "customer-confirmed.png")
  await screenshot(adminApproval, "admin-approved.png")

  for (const [status, label] of [["processing", "قيد التجهيز"], ["shipped", "تم الشحن"], ["delivered", "تم التوصيل"]]) {
    await until(() => evaluate(adminApproval, `(() => { const s=document.querySelector('#next-order-status'); return s && !s.disabled && s.value === '' && [...s.options].some(o=>o.value === '${status}'); })()`), `reset selector before ${status}`)
    const previous = adminApproval.requests.filter(item => item.route === `/admin/orders/${order.id}/status` && item.status === 200).length
    await evaluate(adminApproval, `(() => { const s=document.querySelector('#next-order-status'); s.value='${status}'; s.dispatchEvent(new Event('change',{bubbles:true})); })()`)
    await until(() => adminApproval.requests.filter(item => item.route === `/admin/orders/${order.id}/status` && item.status === 200).length === previous + 1, `saved ${status}`)
    runPhp("artisan", "queue:work", "database", "--queue=broadcasts", "--once", "--tries=1", "--timeout=15")
    await bodyHas(adminApproval, label)
    await bodyHas(customer, label)
    await until(() => evaluate(customerList, `(${visibleOrder(order.id)})?.innerText.includes(${JSON.stringify(label)})`), `visible customer ${status}`)
  }
  await until(() => evaluate(adminApproval, "!document.querySelector('#next-order-status')"), "delivered removes the status selector")
  checks.push("PASS: confirmed -> processing -> shipped -> delivered through the admin control; each selection resets; delivered hides the selector; customer list/detail update live")
  await screenshot(adminApproval, "admin-delivered.png")
  await screenshot(customer, "customer-delivered.png")

  const layouts = checkLayouts ? await checkResponsiveLayouts({
    cdp, evaluate, until, pause, newTab, screenshot,
    adminUser, adminToken: fixture.admin, ownerUser, ownerToken: fixture.owner,
    productId: fixture.product_id, dashboard, customer, customerList, adminApproval,
    onLayout: entry => fs.appendFileSync(path.join(runDirectory, "layout-results.jsonl"), JSON.stringify(entry) + "\n"),
  }) : []
  if (checkLayouts) checks.push(`PASS: ${layouts.length} responsive page/viewport checks; drawer keyboard/focus/navigation and desktop-to-split-screen resize`)

  for (const tab of tabs) {
    assert.equal(await evaluate(tab, "performance.timeOrigin"), tab.timeOrigin, "no full page reload")
    assert.deepEqual(tab.errors, [], "no uncaught browser exceptions")
  }
  const final = JSON.parse(runPhp("tests/qa/reverb-fixture.php", "inspect"))
  assert.equal(final.unpublished, 1)
  assert.equal(final.deliveries, 0)
  assert.equal(final.queued_broadcasts, 0)
  checks.push(`PASS: all ${tabs.length} browser documents retain timeOrigin; no uncaught JS exceptions; realtime independent of absent email worker`)
  const result = {
    checks, layouts, realtimeViewport: viewport, evidenceDirectory: runDirectory,
    scope: "Production React/Echo/Pusher browser + real Laravel HTTP/JWT/SQLite/database queue/Reverb; inventory boundary stubbed; no RabbitMQ/SMTP/MySQL claim",
  }
  fs.writeFileSync(path.join(runDirectory, "result.json"), JSON.stringify(result, null, 2))
  for (const check of checks) console.log(check)
  console.log(`Evidence: ${runDirectory}`)
  console.log(result.scope)
} catch (error) {
  console.error(error.message)
  fs.writeFileSync(path.join(runDirectory, "failure.json"), JSON.stringify({ message: error.message, checks }, null, 2))
  if (tabs.length) {
    for (const [index, tab] of tabs.entries()) {
      try {
        console.error(`Browser ${index}:`, JSON.stringify({ text: await evaluate(tab, "document.body.innerText"), frames: tab.frames, requests: tab.requests, errors: tab.errors }))
        await screenshot(tab, `failure-${index}.png`)
      } catch {}
    }
  }
  console.error(processLogs.slice(-12000))
  process.exitCode = 1
} finally {
  if (cdp) { try { await cdp.send("Browser.close") } catch {} cdp.socket.close() }
  for (const child of children) { try { child.kill() } catch {} }
  await pause(500)
  for (const suffix of ["", "-shm", "-wal"]) { try { fs.unlinkSync(database + suffix) } catch {} }
  // Check the exact absolute generated target before a recursive Windows deletion.
  const relativeProfile = path.relative(path.resolve(toolsRoot), path.resolve(profile))
  assert.ok(relativeProfile && !relativeProfile.startsWith("..") && !path.isAbsolute(relativeProfile) && path.basename(profile) === "profile" && path.basename(path.dirname(profile)).startsWith("req4-browser-"))
  try { fs.rmSync(profile, { recursive: true, force: true }) } catch { console.log(`Generated browser profile retained for cleanup: ${profile}`) }
}
