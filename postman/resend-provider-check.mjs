// Read-only provider verification of the single authorized worker smoke test.
// Never print API credentials, message HTML, recipients or unrelated emails.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const reportPath = path.join(root, 'docs/req4-evidence/resend-external-email.json')
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
const state = JSON.parse(fs.readFileSync(path.join(root, 'backend/my-project/.tools/resend-test-state.json'), 'utf8'))
assert.equal(state.order_id, report.order_id)
const credential = fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/).find(line => /^MAIL_PASSWORD=/.test(line))?.slice('MAIL_PASSWORD='.length).trim().replace(/^(['"])(.*)\1$/, '$2')
assert.ok(/^re_[A-Za-z0-9_-]{12,}$/.test(credential || ''), 'A saved local Resend key is required')
const options = { headers: { Authorization: `Bearer ${credential}` }, signal: AbortSignal.timeout(20000) }
async function check() {
  const response = await fetch('https://api.resend.com/emails?limit=100', options)
  if (!response.ok) return { status: 'UNAVAILABLE', http_status: response.status, note: 'Provider read access unavailable; SMTP acceptance evidence is unchanged. Check Resend dashboard or recipient inbox.' }
  const list = await response.json()
  assert.ok(Array.isArray(list.data), 'Expected provider email references')
  const subject = `Order #${state.order_id} confirmation`
  const matching = list.data.filter(email => email.subject === subject && email.to?.includes(state.recipient))
  assert.equal(matching.length, 1, 'Expected exactly one provider email for the authorized order')
  const emailId = matching[0].id
  assert.match(emailId, /^[a-f0-9-]{36}$/i)
  const detail = await fetch(`https://api.resend.com/emails/${emailId}`, { ...options, signal: AbortSignal.timeout(20000) })
  assert.equal(detail.status, 200, 'Provider email detail is readable')
  const email = await detail.json()
  assert.equal(email.subject, subject)
  assert.ok(email.to?.includes(state.recipient))
  assert.ok(email.html?.includes(`order #${state.order_id}`), 'Rendered confirmation includes the correct order')
  assert.ok(!/\{\{[\s\S]*?\}\}/.test(email.html), 'No unfilled template variables')
  return { status: 'PASS', email_id: emailId, last_event: email.last_event, matching_provider_emails: matching.length, rendered_order_matches: true, unfilled_variables: false, dashboard: `https://resend.com/emails/${emailId}?tab=insights` }
}
let result
try { result = await check() }
catch (error) {
  if (error.code === 'ERR_ASSERTION') throw error
  result = { status: 'UNAVAILABLE', note: 'Provider network/read check unavailable; SMTP acceptance evidence is unchanged.' }
}
report.provider_check = { checked_at: new Date().toISOString(), ...result }
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(result))
