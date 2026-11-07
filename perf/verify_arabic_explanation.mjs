// Verify the standalone explanation without a browser or external requests.
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const requireTests = createRequire(new URL('./ui-tests/package.json', import.meta.url))
const { JSDOM, VirtualConsole } = requireTests('jsdom')
const file = path.join(root, 'CHANGES_EXPLAINED_AR.html')
const errors = []
const virtualConsole = new VirtualConsole()
virtualConsole.on('jsdomError', error => errors.push(error.message))
const dom = new JSDOM(readFileSync(file, 'utf8'), {
  url: 'file:///' + file.replaceAll('\\', '/'), runScripts: 'dangerously', virtualConsole,
})
const { window } = dom
const { document } = window
assert.equal(document.documentElement.lang, 'ar')
assert.equal(document.documentElement.dir, 'rtl')
assert.equal(document.querySelectorAll('script').length, 1)
assert.equal(document.querySelectorAll('[src], link[rel="stylesheet"]').length, 0)
assert(!document.body.textContent.includes('\ufffd'), 'Unexpected replacement character')
const ids = [...document.querySelectorAll('[id]')].map(element => element.id)
assert.equal(new Set(ids).size, ids.length, 'Duplicate anchor ids')
for (const link of document.querySelectorAll('a[href]')) {
  const href = link.getAttribute('href')
  if (href.startsWith('#')) assert(document.getElementById(href.slice(1)), href)
  else assert(existsSync(path.join(root, href)), href)
}

let sourceCount = 0
for (const article of document.querySelectorAll('.change[data-path]')) {
  const blocks = article.querySelectorAll('pre code')
  assert(blocks.length, article.dataset.path)
  const embedded = blocks[blocks.length - 1].textContent.trimEnd()
  const source = readFileSync(path.join(root, article.dataset.path), 'utf8')
    .replace(/^\ufeff/, '').replaceAll('\r\n', '\n').trimEnd()
  assert.equal(embedded, source, 'Source mismatch: ' + article.dataset.path)
  sourceCount++
}

const cards = [...document.querySelectorAll('.change')]
const search = document.getElementById('search')
async function searchFor(value) {
  search.value = value
  search.dispatchEvent(new window.Event('input', { bubbles: true }))
  await new Promise(resolve => setTimeout(resolve, 160))
  return cards.filter(card => !card.hidden).length
}
assert.equal(await searchFor('UNMATCHED_' + Math.random().toString(36).slice(2)), 0)
assert(!document.getElementById('empty').hidden)
const matching = await searchFor('afterCommit')
assert(matching > 0 && matching < cards.length)
assert.equal(await searchFor(''), cards.length)
document.getElementById('expand').click()
assert([...document.querySelectorAll('details.source')].every(details => details.open))
document.getElementById('collapse').click()
assert([...document.querySelectorAll('details.source')].every(details => !details.open))

let copied = ''
document.execCommand = command => {
  assert.equal(command, 'copy')
  copied = document.querySelector('textarea').value
  return true
}
const copyButton = document.querySelector('.copy')
copyButton.click()
await new Promise(resolve => setTimeout(resolve, 0))
assert.equal(copied, copyButton.closest('.codebox').querySelector('code').textContent)
assert.equal(copyButton.textContent, 'تم النسخ')
assert.equal(document.querySelectorAll('textarea').length, 0)
let printed = false
window.print = () => { printed = true }
document.getElementById('print').click()
assert(printed)
window.dispatchEvent(new window.Event('beforeprint'))
assert([...document.querySelectorAll('details.source')].every(details => details.open))
window.dispatchEvent(new window.Event('afterprint'))
assert([...document.querySelectorAll('details.source')].every(details => !details.open))
assert.deepEqual(errors, [])

const result = { passed: true, scope: 'jsdom DOM and script verification; no visual browser check',
  language: 'ar', direction: 'rtl', matchingSourceFiles: sourceCount,
  checks: ['local links', 'unique anchors', 'exact embedded source', 'search and empty state',
    'expand and collapse', 'copy fallback', 'print state restore', 'no external resources', 'no script errors'] }
writeFileSync(path.join(root, 'docs/performance/results/arabic-explanation-verification.json'), JSON.stringify(result, null, 2))
process.stdout.write(JSON.stringify(result) + '\n')
window.close()
