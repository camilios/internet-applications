import dgram from 'node:dgram'
import http from 'node:http'
import { isIPv4 } from 'node:net'

const buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 15, 60]
const replicas = new Map()
const notifications = new Map()
const alertNames = new Set(['OrderEmailQueueHigh', 'HttpErrorsHigh'])

function observe({ upstream, status, seconds }) {
  if (!Number.isInteger(status) || status < 100 || status > 599 ||
      !Number.isFinite(seconds) || seconds < 0 || typeof upstream !== 'string') return
  // Nginx may have retried. Charge one client response to the final contacted upstream.
  const address = upstream.match(/(\d+\.\d+\.\d+\.\d+):8000$/)?.[1]
  const replica = address && isIPv4(address) ? address : 'gateway'
  if (!replicas.has(replica)) {
    replicas.set(replica, { codes: new Map(), count: 0, sum: 0, buckets: buckets.map(() => 0) })
  }
  const stats = replicas.get(replica)
  stats.codes.set(status, (stats.codes.get(status) ?? 0) + 1)
  stats.count++
  stats.sum += seconds
  buckets.forEach((bound, i) => { if (seconds <= bound) stats.buckets[i]++ })
}

function metrics() {
  const lines = ['# TYPE order_http_requests_total counter', '# TYPE order_http_duration_seconds histogram',
    '# TYPE order_alert_notifications_total counter']
  for (const [replica, stats] of replicas) {
    const labels = 'replica="' + replica + '"'
    for (const [status, count] of stats.codes) {
      lines.push('order_http_requests_total{' + labels + ',status="' + status + '"} ' + count)
    }
    buckets.forEach((bound, i) => lines.push('order_http_duration_seconds_bucket{' + labels + ',le="' + bound + '"} ' + stats.buckets[i]))
    lines.push('order_http_duration_seconds_bucket{' + labels + ',le="+Inf"} ' + stats.count,
      'order_http_duration_seconds_count{' + labels + '} ' + stats.count,
      'order_http_duration_seconds_sum{' + labels + '} ' + stats.sum)
  }
  for (const [labels, count] of notifications) lines.push('order_alert_notifications_total{' + labels + '} ' + count)
  return lines.join('\n') + '\n'
}

const udp = dgram.createSocket('udp4')
udp.on('message', packet => {
  const line = packet.toString()
  const marker = line.indexOf('req6: ')
  if (marker < 0) return
  try { observe(JSON.parse(line.slice(marker + 6))) } catch { /* Never log untrusted datagrams. */ }
})
udp.bind(5514)

http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/metrics') {
    res.writeHead(200, {'Content-Type': 'text/plain; version=0.0.4; charset=utf-8'}).end(metrics())
    return
  }
  if (req.method !== 'POST' || req.url !== '/notifications') { res.writeHead(404).end(); return }
  try {
    const parts = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > 65536) { res.writeHead(413).end(); return }
      parts.push(chunk)
    }
    const payload = JSON.parse(Buffer.concat(parts))
    for (const alert of payload.alerts) {
      const name = alert.labels?.alertname
      if (!alertNames.has(name) || !['firing', 'resolved'].includes(alert.status)) continue
      const labels = 'alert="' + name + '",status="' + alert.status + '"'
      notifications.set(labels, (notifications.get(labels) ?? 0) + 1)
      console.log(JSON.stringify({time: new Date().toISOString(), message: 'Alert notification', alert: name, status: alert.status}))
    }
    res.writeHead(200).end()
  } catch { res.writeHead(400).end() }
}).listen(9108)
