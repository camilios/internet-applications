const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'K6_COMPARISON_AR.html'), 'utf8');
assert.match(html, /<html lang="ar" dir="rtl">/);
assert.match(html, /<meta charset="utf-8">/);
assert.ok(!html.includes('\uFFFD'), 'Unexpected replacement characters');
assert.ok(!/eyJ[A-Za-z0-9_-]{20,}\./.test(html), 'An authentication token was embedded');
assert.ok(!/<(?:script|link)[^>]+(?:src|href)="https?:/.test(html), 'External runtime dependency');
const data = JSON.parse(/<script id="report-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)[1]);
for (const source of data.inventory) {
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, source.source))).digest('hex'), source.sha256);
}
const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
for (const [, href] of markup.matchAll(/href="([^"]+)"/g)) {
  if (href.startsWith('#')) { assert.ok(html.includes('id="' + href.slice(1) + '"')); continue; }
  assert.ok(fs.existsSync(path.join(root, decodeURI(href).split('#')[0])), 'Missing link: ' + href);
}
// Execute the actual inline program with a minimal DOM, then exercise every pair and filtering.
class Element {
  constructor() { this.options = []; this.handlers = {}; this.innerHTML = ''; this.textContent = ''; this.selected = ''; }
  add(option) { this.options.push(option); if (!this.selected) this.selected = option.value; }
  replaceChildren() { this.options = []; this.selected = ''; }
  get value() { return this.selected; }
  set value(v) { this.selected = v; }
  addEventListener(event, callback) { this.handlers[event] = callback; }
}
const elements = new Map();
for (const id of ['scenario', 'pair', 'metric-search', 'pair-note', 'explorer-sources', 'metric-count', 'metric-body', 'report-data']) elements.set(id, new Element());
elements.get('report-data').textContent = JSON.stringify(data);
const runtime = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].at(-1)[1];
const context = vm.createContext({ document: { getElementById: id => elements.get(id) }, Option: class { constructor(text, value) { this.text = text; this.value = value; } }, console });
new vm.Script(runtime).runInContext(context);
for (const pair of data.pairs) {
  elements.get('scenario').value = pair.scenario;
  elements.get('scenario').handlers.change();
  elements.get('pair').value = pair.after;
  elements.get('pair').handlers.change();
  assert.match(elements.get('metric-body').innerHTML, /endpoint_duration/);
  elements.get('metric-search').value = 'http_req_failed.value';
  elements.get('metric-search').handlers.input();
  assert.equal((elements.get('metric-body').innerHTML.match(/<tr>/g) || []).length, 1);
  elements.get('metric-search').value = '';
}
console.log(JSON.stringify({ verifiedFiles: data.inventory.length, verifiedPairs: data.pairs.length, localLinks: 'valid', inlineJavaScript: 'executed', search: 'passed', tokens: 'not embedded', visualPreview: 'not performed: browser access host unavailable' }, null, 2));
