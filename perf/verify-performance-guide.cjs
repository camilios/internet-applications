const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const requireTests = createRequire(path.join(__dirname, 'ui-tests/package.json'));
const { JSDOM, VirtualConsole } = requireTests('jsdom');
const file = path.join(root, 'PERFORMANCE_GUIDE_AR.html');
const html = fs.readFileSync(file, 'utf8');
const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => errors.push(error.message));
const dom = new JSDOM(html, { url: 'file:///' + file.replaceAll('\\', '/'), runScripts: 'dangerously', virtualConsole });
async function main() {
  const { window } = dom;
  const { document } = window;
  assert.equal(document.documentElement.lang, 'ar');
  assert.equal(document.documentElement.dir, 'rtl');
  assert.equal(document.querySelectorAll('main section').length, 6);
  assert(document.querySelectorAll('h3').length >= 24);
  assert.equal(document.querySelectorAll('[src], link[rel=stylesheet]').length, 0);
  assert(!document.body.textContent.includes('\ufffd'));
  const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const anchor of document.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href');
    if (/^https?:/.test(href)) continue;
    if (href.startsWith('#')) assert(document.getElementById(href.slice(1)), href);
    else assert(fs.existsSync(path.resolve(root, decodeURI(href))), href);
  }
  const blocks = [...document.querySelectorAll('code[data-source]')];
  assert.equal(blocks.length, 25);
  for (const block of blocks) {
    const lines = fs.readFileSync(path.resolve(root, block.dataset.source), 'utf8')
      .replace(/^\ufeff/, '').replaceAll('\r\n', '\n').split('\n');
    assert.equal(block.textContent, lines.slice(Number(block.dataset.first), Number(block.dataset.last)).join('\n').trimEnd(), block.dataset.source);
    assert.equal(block.dir, 'ltr');
  }
  const search = document.getElementById('search');
  search.value = 'UNMATCHED_GUIDE_TEST_1234';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert([...document.querySelectorAll('main section')].every(section => section.hidden));
  assert.equal(document.getElementById('empty').hidden, false);
  search.value = 'gzip';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  const visible = [...document.querySelectorAll('main section')].filter(section => !section.hidden).length;
  assert(visible > 0 && visible < 6);
  search.value = '';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert([...document.querySelectorAll('main section')].every(section => !section.hidden));
  document.getElementById('expand').click();
  assert([...document.querySelectorAll('details.source')].every(detail => detail.open));
  document.getElementById('collapse').click();
  assert([...document.querySelectorAll('details.source')].every(detail => !detail.open));
  let copied;
  document.execCommand = command => {
    assert.equal(command, 'copy');
    copied = document.querySelector('textarea').value;
    return true;
  };
  const button = document.querySelector('.copy');
  button.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(copied, document.getElementById(button.dataset.code).textContent);
  assert.equal(document.getElementById('action-status').textContent, 'تم نسخ الكود.');
  assert.equal(document.querySelectorAll('textarea').length, 0);
  let printed = false;
  window.print = () => { printed = true; };
  document.getElementById('print').click();
  assert(printed);
  window.dispatchEvent(new window.Event('beforeprint'));
  assert([...document.querySelectorAll('details.source')].every(detail => detail.open));
  window.dispatchEvent(new window.Event('afterprint'));
  assert([...document.querySelectorAll('details.source')].every(detail => !detail.open));
  assert.deepEqual(errors, []);
  const result = { passed: true, language: 'ar', direction: 'rtl', chapters: 6,
    exact_source_blocks: blocks.length, checks: ['local links', 'unique anchors', 'source matches',
      'no external assets', 'search', 'expand/collapse', 'copy fallback', 'print state', 'no script errors'],
    scope: 'DOM/script verification; browser layout checks are separate' };
  fs.writeFileSync(path.join(root, 'docs/performance/focused-review/html-verification.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
  window.close();
}
main().catch(error => { dom.window.close(); console.error(error); process.exitCode = 1; });
