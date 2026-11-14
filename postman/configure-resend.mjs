import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const envFile = path.join(root, '.env')
const original = fs.readFileSync(envFile, 'utf8')
const values = new Map()
for (const line of original.split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
  if (!match) continue
  let value = match[2]
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
  values.set(match[1], value)
}
const key = values.get('MAIL_PASSWORD') || ''
if (!/^re_[A-Za-z0-9_-]{12,}$/.test(key)) throw new Error('Save the Resend API key as MAIL_PASSWORD in root .env. The key value is never printed.')
const settings = {
  MAIL_MAILER: 'smtp', ORDER_EMAIL_ALLOW_MOCK: 'false',
  MAIL_SCHEME: 'smtps', MAIL_HOST: 'smtp.resend.com', MAIL_PORT: '465',
  MAIL_USERNAME: 'resend', MAIL_FROM_ADDRESS: 'onboarding@resend.dev',
  MAIL_FROM_NAME: '"E-Commerce"', MAIL_TIMEOUT: '20',
}
if (process.argv.includes('--apply')) {
  let updated = original
  for (const [name, value] of Object.entries(settings)) {
    const pattern = new RegExp(`^${name}=.*$`, 'gm')
    if (pattern.test(updated)) updated = updated.replace(pattern, `${name}=${value}`)
    else updated += `${updated.endsWith('\n') ? '' : '\n'}${name}=${value}\n`
  }
  fs.writeFileSync(envFile, updated)
  console.log('Applied Resend SMTP settings to ignored root .env; saved API key preserved and never printed.')
} else {
  console.log('Saved Resend key detected. Configuration preview only; running worker unchanged.')
}
console.log(JSON.stringify({ ...settings, credential: 'configured locally, redacted' }, null, 2))
