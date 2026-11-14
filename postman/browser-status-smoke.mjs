// Real browser regression against the already-running local Docker stack.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

assert.equal(process.env.RUN_POSTMAN_BROWSER_SMOKE, 'true', 'Explicitly enable this local test; it creates one real demo order.')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const origin = 'http://localhost:5173', api = 'http://localhost:8000/api'
const checkToasts = process.env.EXPECT_CUSTOMER_TOAST === 'true'
const environment = JSON.parse(fs.readFileSync(path.join(root, 'postman/E-Commerce.local.postman_environment.json'), 'utf8'))
const credentials = Object.fromEntries(environment.values.map(item => [item.key, item.value]))
assert.equal(credentials.base_url, api)
const toolsRoot = path.join(root, 'frontend/tests/.tools')
const directory = path.join(toolsRoot, `req4-browser-live-${randomUUID()}`)
const profile = path.join(directory, 'profile')
fs.mkdirSync(profile, { recursive: true })
const browser = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(file => fs.existsSync(file))
assert.ok(browser)
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(predicate, label, timeout = 20000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) { if (await predicate()) return; await pause(100) }
  throw new Error(`Timed out: ${label}`)
}
async function request(method, route, token, body, headers = {}) {
  return fetch(api + route, { method, headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) })
}
async function login(role) {
  const response = await request('POST', '/login', null, { email: credentials[`${role}_email`], password: credentials[`${role}_password`] })
  assert.equal(response.status, 200)
  return response.json()
}
class DevTools {
  nextId = 0; pending = new Map(); listeners = new Set()
  constructor(url) {
    this.socket = new WebSocket(url)
    this.ready = new Promise((resolve, reject) => { this.socket.addEventListener('open', resolve, { once: true }); this.socket.addEventListener('error', reject, { once: true }) })
    this.socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data)
      if (message.id) {
        const pending = this.pending.get(message.id)
        if (!pending) return
        clearTimeout(pending.timer); this.pending.delete(message.id)
        if (message.error) pending.reject(new Error(message.error.message)); else pending.resolve(message.result)
      } else for (const listener of this.listeners) listener(message)
    })
  }
  async send(method, params = {}, sessionId) {
    await this.ready
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 15000)
      this.pending.set(id, { resolve, reject, timer })
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    })
  }
}
const tabs = []
let child, cdp
async function evaluate(tab, expression) {
  const response = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, tab.sessionId)
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text)
  return response.result.value
}
async function page(session, route) {
  const { browserContextId } = await cdp.send('Target.createBrowserContext')
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  const tab = { route, sessionId, frames: [], requests: [], errors: [] }; tabs.push(tab)
  cdp.listeners.add(message => {
    if (message.sessionId !== sessionId) return
    if (message.method === 'Network.webSocketFrameReceived') {
      try { const frame = JSON.parse(message.params.response.payloadData); const data = typeof frame.data === 'string' ? JSON.parse(frame.data) : frame.data; tab.frames.push({ event: frame.event, channel: frame.channel, order_id: data?.order_id, status: data?.status }) } catch {}
    }
    if (message.method === 'Network.responseReceived' && message.params.response.url.startsWith(api)) tab.requests.push({ route: message.params.response.url.slice(api.length), status: message.params.response.status })
    if (message.method === 'Runtime.exceptionThrown') tab.errors.push(message.params.exceptionDetails.text)
  })
  for (const domain of ['Page', 'Runtime', 'Network']) await cdp.send(domain + '.enable', {}, sessionId)
  const storage = JSON.stringify({ state: { user: session.user, token: session.access_token, isAuthenticated: true }, version: 0 })
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('auth-storage',${JSON.stringify(storage)})` }, sessionId)
  await cdp.send('Page.navigate', { url: origin + route }, sessionId)
  await until(() => evaluate(tab, "document.readyState === 'complete' && !!document.querySelector('main')"), `page ${route}`)
  tab.timeOrigin = await evaluate(tab, 'performance.timeOrigin')
  return tab
}
try {
  const [customer, admin] = await Promise.all([login('customer'), login('admin')])
  const created = await request('POST', '/orders', customer.access_token, { items: [{ product_id: 23, quantity: 1 }] }, { 'Idempotency-Key': randomUUID() })
  assert.equal(created.status, 201)
  const order = (await created.json()).data
  console.log(`Created local browser-test order ${order.id}`)
  child = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--disable-sync', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
  const portFile = path.join(profile, 'DevToolsActivePort')
  await until(() => fs.existsSync(portFile), 'isolated browser starts')
  const address = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/)
  cdp = new DevTools(`ws://127.0.0.1:${address[0]}${address[1]}`)
  const list = await page(customer, '/orders')
  const filtered = await page(customer, '/orders?status=pending')
  const detail = await page(customer, `/orders/${order.id}`)
  const approval = await page(admin, `/orders/${order.id}`)
  const row = `[...document.querySelectorAll('tbody tr')].find(row=>row.innerText.includes('#${order.id}'))`
  for (const tab of [list, filtered]) await until(() => evaluate(tab, `!!(${row}) && (${row}).innerText.includes('قيد الانتظار')`), 'initial pending customer row')
  for (const tab of [list, filtered, detail]) {
    if (process.env.EXPECT_STALE_LIST === 'true' && tab !== detail) continue
    await until(() => tab.frames.some(frame => frame.event === 'pusher_internal:subscription_succeeded' && frame.channel === `private-orders.${order.id}`), `private subscription ${tab.route}`)
  }
  await until(() => evaluate(approval, "!!document.querySelector('#next-order-status')"), 'admin status control')
  const started = Date.now()
  await evaluate(approval, "(()=>{const select=document.querySelector('#next-order-status');select.value='confirmed';select.dispatchEvent(new Event('change',{bubbles:true}));})()")
  await until(() => approval.requests.some(request => request.route === `/admin/orders/${order.id}/status` && request.status === 200), 'admin PATCH')
  let state
  const toastObserved = { list_toast: false, pending_filter_toast: false, detail_toast: false }
  const toastText = `تم تحديث حالة الطلب #${order.id}`
  const toastExpression = `[...document.querySelectorAll('[data-sonner-toast]')].some(toast=>toast.innerText.includes(${JSON.stringify(toastText)}) && toast.innerText.includes('الحالة الجديدة: مؤكد') && toast.getClientRects().length > 0)`
  const deadline = Date.now() + 10000
  do {
    if (checkToasts) {
      toastObserved.list_toast ||= await evaluate(list, toastExpression)
      toastObserved.pending_filter_toast ||= await evaluate(filtered, toastExpression)
      toastObserved.detail_toast ||= await evaluate(detail, toastExpression)
    }
    state = {
      list_confirmed: await evaluate(list, `!!(${row}) && (${row}).innerText.includes('مؤكد')`),
      pending_filter_removed: await evaluate(filtered, `!(${row})`),
      detail_confirmed: await evaluate(detail, "document.body.innerText.includes('مؤكد')"),
      ...(checkToasts ? toastObserved : {}),
    }
    if (Object.values(state).every(Boolean)) break
    await pause(100)
  } while (Date.now() < deadline)
  for (const tab of tabs) { assert.equal(await evaluate(tab, 'performance.timeOrigin'), tab.timeOrigin); assert.deepEqual(tab.errors, []) }
  const passed = Object.values(state).every(Boolean)
  const report = { status: passed ? 'PASS' : 'REPRODUCED_STALE_LIST', executed_at: new Date().toISOString(), order_id: order.id, elapsed_ms: Date.now() - started, ...state, no_full_reload: true, uncaught_errors: 0, pages: tabs.map(({ route, frames, requests }) => ({ route, frames, requests })), scope: 'Actual deployed React/Echo + Docker Laravel/MySQL/gRPC/RabbitMQ/Reverb, separate authenticated browser contexts, existing admin status control. Email is mocked.' }
  const filename = process.env.EXPECT_STALE_LIST === 'true' ? 'customer-status-before.json' : checkToasts ? 'customer-status-toast.json' : 'customer-status-after.json'
  fs.writeFileSync(path.join(root, 'docs/req4-evidence', filename), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ status: report.status, ...state, no_full_reload: true }))
  if (process.env.EXPECT_STALE_LIST === 'true') { assert.equal(state.list_confirmed, false, 'reproduce stale list'); assert.equal(state.detail_confirmed, true, 'detail baseline remains live') }
  else assert.equal(passed, true, 'customer list/detail/filter update with requested toasts, no reload')
} finally {
  if (cdp) { try { await cdp.send('Browser.close') } catch {} cdp.socket.close() }
  if (child) child.kill()
  await pause(500)
  const relative = path.relative(path.resolve(toolsRoot), path.resolve(profile))
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative) && path.basename(profile) === 'profile' && path.basename(path.dirname(profile)).startsWith('req4-browser-live-'))
  for (let attempt = 0; attempt < 12 && fs.existsSync(profile); attempt++) {
    try { fs.rmSync(profile, { recursive: true, force: true }) } catch { await pause(250) }
  }
  if (fs.existsSync(profile)) console.log(`Generated test profile retained for cleanup: ${profile}`)
}
