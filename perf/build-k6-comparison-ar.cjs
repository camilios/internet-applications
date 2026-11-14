const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'K6_COMPARISON_AR.html');
const text = file => {
  const b = fs.readFileSync(path.join(root, file));
  return b.toString(b[0] === 255 && b[1] === 254 ? 'utf16le' : 'utf8').replace(/^\uFEFF/, '');
};
const json = file => JSON.parse(text(file));
const h = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const n = v => v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const med = a => { const s = a.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const pct = (a, b) => a === 0 ? (b === 0 ? 0 : null) : (b - a) / a * 100;
const link = (p, label = p) => `<a href="${h(encodeURI(p))}" dir="auto">${h(label)}</a>`;
const scenarios = { 'products-list': 'قائمة المنتجات', 'product-detail': 'تفاصيل المنتج', 'customer-orders': 'طلبات العميل', dashboard: 'لوحة التحكم', compression: 'صفحة منتجات كاملة / الضغط' };
const stages = [];
function add(id, folder, label, family = 'history') {
  if (fs.existsSync(path.join(root, folder))) stages.push({ id, folder, label, family });
}
add('baseline', 'docs/performance/baseline', 'خط الأساس قبل التحسينات');
const stageNames = { 'after-indexes': 'بعد الفهارس', 'after-dashboard': 'بعد تحسين لوحة التحكم', 'after-redis': 'بعد Redis', 'after-pagination': 'بعد تحسين الترقيم', 'after-product-cache': 'بعد كاش بيانات المنتج', 'after-etag': 'بعد ETag', 'after-refactor': 'بعد إعادة التنظيم' };
for (const [id, label] of Object.entries(stageNames)) add(id, 'docs/performance/results/' + id, label);
add('current', 'docs/performance/current-20261110-094614', 'القياس الحالي المحفوظ: 10 نوفمبر', 'current');
add('checklist', 'docs/checklist/requirement-3', 'قياس تدقيق المتطلبات الأولي', 'context');
add('warm', 'docs/checklist/requirement-3/warm-dashboard', 'إعادة لوحة التحكم بعد الإحماء', 'context');
add('replica-before', 'docs/performance/professor-fixes/before-replica', 'قياس محفوظ قبل إضافة Replica', 'context');
add('interview', 'docs/performance/interview/20261107-092535-61565/dashboard', 'قياس المقابلة المحفوظ: 7 نوفمبر', 'context');
add('gzip-before', 'docs/performance/focused-review/before-gzip', 'قبل gzip في تجربة الضغط المزدوجة', 'gzip');
add('gzip-after', 'docs/performance/focused-review/after-gzip', 'بعد gzip في تجربة الضغط المزدوجة', 'gzip');
add('rate-direct', 'docs/performance/rate-limit-20261111', 'طلب مباشر: rate limiter', 'diagnostic');
add('rate-proxy', 'docs/performance/rate-limit-20261111', 'عبر الوكيل الموثوق', 'diagnostic');
const groups = [];
const inventory = [];
for (const stage of stages) {
  const files = fs.readdirSync(path.join(root, stage.folder)).filter(f => stage.family === 'diagnostic' ? f === (stage.id === 'rate-direct' ? 'direct.json' : 'via-proxy.json') : /^k6-.*\.json$/.test(f));
  const buckets = new Map();
  for (const file of files) {
    const source = stage.folder + '/' + file;
    const raw = json(source);
    if (!raw.metrics) throw new Error('Missing metrics: ' + source);
    const scenario = /^k6-(.+)-\d+\.json$/.exec(file)?.[1] || 'compression';
    const flat = {};
    for (const [key, fields] of Object.entries(raw.metrics)) for (const [field, value] of Object.entries(fields)) if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error('Invalid metric: ' + source + '/' + key + '/' + field);
      flat[key + '.' + field] = value;
    }
    const run = { source, run: Number(/-(\d+)\.json$/.exec(file)?.[1] || 1), metrics: flat };
    if (!buckets.has(scenario)) buckets.set(scenario, []);
    buckets.get(scenario).push(run);
    inventory.push({ source, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, source))).digest('hex') });
  }
  for (const [scenario, runs] of buckets) {
    runs.sort((a, b) => a.run - b.run);
    const keys = [...new Set(runs.flatMap(r => Object.keys(r.metrics)))].sort();
    const metrics = Object.fromEntries(keys.map(k => [k, med(runs.map(r => r.metrics[k]))]));
    const sum = key => runs.reduce((s, r) => s + (r.metrics[key] || 0), 0);
    const observations = sum('endpoint_errors.passes') + sum('endpoint_errors.fails');
    groups.push({ ...stage, scenario, runs, metrics, httpTotal: sum('http_reqs.count'), checksPass: sum('checks.passes'), checksFail: sum('checks.fails'), httpFailures: sum('http_req_failed.passes'), endpointFailures: sum('endpoint_errors.passes'), errorPct: observations ? sum('endpoint_errors.passes') / observations * 100 : null });
  }
}
const find = (id, scenario) => groups.find(g => g.id === id && g.scenario === scenario);
const value = (g, key) => g?.metrics[key] ?? null;
const delta = (a, b, lower = true) => {
  if (a == null || b == null) return '<span class="neutral">غير متاح</span>';
  const p = pct(a, b);
  if (p == null) return '<span class="neutral">من صفر؛ لا نسبة صالحة</span>';
  const cls = Math.abs(p) < .001 ? 'neutral' : (lower ? p < 0 : p > 0) ? 'good' : 'bad';
  return `<span class="${cls}" dir="ltr">${p > 0 ? '+' : ''}${n(p)}%</span>`;
};
const sourceLinks = g => g.runs.map(r => link(r.source, 'JSON ' + r.run)).join(' · ');
const metricHead = '<tr><th>المرحلة</th><th>p50 ms</th><th>p95 ms</th><th>p99 ms</th><th>طلب/ث</th><th>بايت/طلب HTTP</th><th>أخطاء الطلبات</th><th>تغيّر p95 عن المرجع</th><th>الدليل</th></tr>';
function metricRow(g, reference) {
  const k = 'endpoint_duration.';
  return `<tr><th>${h(g.label)}</th><td>${n(value(g, k + 'p(50)'))}</td><td>${n(value(g, k + 'p(95)'))}</td><td>${n(value(g, k + 'p(99)'))}</td><td>${n(value(g, 'http_reqs.rate'))}</td><td>${n(med(g.runs.map(r => r.metrics['data_received.count'] / r.metrics['http_reqs.count'])))}</td><td class="${g.errorPct ? 'bad' : 'good'}">${n(g.errorPct)}%</td><td>${delta(value(reference, k + 'p(95)'), value(g, k + 'p(95)'))}</td><td class="sources">${sourceLinks(g)}</td></tr>`;
}
const table = body => `<div class="table-wrap"><table>${body}</table></div>`;
const baselineGroups = groups.filter(g => g.id === 'baseline');
if (baselineGroups.length !== 4 || baselineGroups.some(g => g.runs.length !== 3)) throw new Error('Incomplete historical baseline');
// Recompute from raw files, and independently check the existing historical summary.
const archived = json('docs/performance/results/summary.json');
let verifiedMetrics = 0;
for (const g of groups.filter(g => g.family === 'history')) {
  const saved = archived[g.scenario]?.[g.id];
  if (!saved) continue;
  for (const percentile of ['p(50)', 'p(95)', 'p(99)']) {
    if (Math.abs(saved[percentile] - value(g, 'endpoint_duration.' + percentile)) > 1e-8) throw new Error('Historical summary mismatch: ' + g.id + '/' + g.scenario);
    verifiedMetrics++;
  }
}
const currentTable = table('<thead><tr><th>العملية</th><th>قبل p50</th><th>بعد p50</th><th>قبل p95</th><th>بعد p95</th><th>تغيّر p95</th><th>قبل p99</th><th>بعد p99</th><th>تغيّر p99</th></tr></thead><tbody>' + Object.keys(scenarios).filter(s => s !== 'compression').map(s => {
  const a = find('baseline', s), b = find('current', s), k = 'endpoint_duration.';
  return `<tr><th>${scenarios[s]}</th><td>${n(value(a, k+'p(50)'))}</td><td>${n(value(b, k+'p(50)'))}</td><td>${n(value(a, k+'p(95)'))}</td><td>${n(value(b, k+'p(95)'))}</td><td>${delta(value(a,k+'p(95)'),value(b,k+'p(95)'))}</td><td>${n(value(a,k+'p(99)'))}</td><td>${n(value(b,k+'p(99)'))}</td><td>${delta(value(a,k+'p(99)'),value(b,k+'p(99)'))}</td></tr>`;
}).join('') + '</tbody>');
const history = Object.keys(scenarios).filter(s => s !== 'compression').map(s => {
  const a = find('baseline', s), measured = groups.filter(g => g.scenario === s && g.family === 'history');
  const missing = Object.entries(stageNames).filter(([id]) => !find(id, s)).map(([, name]) => name);
  return `<article class="panel"><h3>${scenarios[s]} <code>${s}</code></h3>${table('<thead>'+metricHead+'</thead><tbody>'+measured.map(g => metricRow(g,a)).join('')+'</tbody>')}<p class="muted">مراحل لم تُعَد فيها هذه العملية: ${h(missing.join('، ') || 'لا يوجد')}. لم أنقل نتيجة مرحلة سابقة لملء الفراغ.</p></article>`;
}).join('');
const contexts = Object.keys(scenarios).filter(s => s !== 'compression').map(s => {
  const extras = groups.filter(g => g.scenario === s && ['current', 'context'].includes(g.family));
  if (!extras.length) return '';
  return `<h3>${scenarios[s]}</h3>${table('<thead>'+metricHead+'</thead><tbody>'+[find('baseline',s),...extras].map(g=>metricRow(g,find('baseline',s))).join('')+'</tbody>')}`;
}).join('');
const gzipBefore = find('gzip-before', 'compression'), gzipAfter = find('gzip-after', 'compression');
const direct = find('rate-direct', 'compression'), proxy = find('rate-proxy', 'compression');
const availablePairs = groups.filter(g => g.id !== 'baseline').map(g => ({ after: g.id, scenario: g.scenario, before: g.family === 'gzip' ? 'gzip-before' : g.family === 'diagnostic' ? 'rate-direct' : 'baseline', label: g.label })).filter(p => find(p.before,p.scenario) && p.before !== p.after);
const data = { groups, pairs: availablePairs, scenarios, inventory, generatedAt: new Date().toISOString() };
const embedded = JSON.stringify(data).replace(/</g, '\\u003c');
const badCurrentP99 = pct(value(find('baseline','customer-orders'),'endpoint_duration.p(99)'), value(find('current','customer-orders'),'endpoint_duration.p(99)'));
const cold = value(find('checklist','dashboard'),'endpoint_duration.p(95)');
const audit = table('<thead><tr><th>مجموعة القياس</th><th>العملية</th><th>التجارب</th><th>HTTP</th><th>فشل HTTP</th><th>فشل endpoint</th><th>فشل checks</th><th>هدف p95 &lt; 500 ms</th></tr></thead><tbody>'+groups.map(g=>`<tr><th>${h(g.label)}</th><td>${h(scenarios[g.scenario]||g.scenario)}</td><td>${g.runs.length}</td><td>${g.httpTotal}</td><td class="${g.httpFailures?'bad':'good'}">${g.httpFailures}</td><td class="${g.endpointFailures?'bad':'good'}">${g.endpointFailures}</td><td class="${g.checksFail?'bad':'good'}">${g.checksFail}</td><td>${g.family==='diagnostic'?'تشخيص؛ ليست مقارنة سرعة':g.runs.every(r=>r.metrics['endpoint_duration.p(95)']<500)?'متحقق بكل تجربة':'لم يتحقق في كل التجارب'}</td></tr>`).join('')+'</tbody>');
const html = `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>مقارنة k6 قبل وبعد — قراءة النتائج ومناقشتها</title>
<style>
:root{--ink:#162b36;--muted:#536773;--paper:#f4f6f3;--line:#d8e1df;--navy:#102d38;--teal:#087a69;--red:#b93836;--amber:#956314}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.95 "Segoe UI",Tahoma,Arial,sans-serif}a{color:#086d92;text-underline-offset:4px}a:hover{color:#054b67}button,input,select{font:inherit}header{background:var(--navy);color:#fff;padding:64px max(24px,calc((100vw - 1320px)/2));border-bottom:6px solid #3fb79b}.eyebrow{color:#9fdbc9;font-size:14px;letter-spacing:.04em}h1{font-size:clamp(29px,4vw,50px);line-height:1.45;margin:12px 0 18px;max-width:1000px}header p{color:#d2e1e3;max-width:1000px;margin:0}main{max-width:1368px;margin:auto;padding:24px}nav{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:26px}nav a{background:white;border:1px solid var(--line);padding:7px 15px;border-radius:30px;text-decoration:none;font-size:14px}h2{font-size:29px;margin:52px 0 16px;line-height:1.5}h3{font-size:21px;margin:16px 0}p{margin:12px 0}.panel,.note,details,.card{background:white;border:1px solid var(--line);border-radius:14px;padding:24px;margin:18px 0}.note{border-right:5px solid var(--amber);background:#fffaf0}.note.success{border-color:var(--teal);background:#eff8f3}.note.danger{border-color:var(--red);background:#fff4f1}.muted{color:var(--muted);font-size:14px}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.card{margin:0}.card strong{display:block;font-size:32px;line-height:1.7;color:var(--teal)}.table-wrap{overflow:auto;max-width:100%;border:1px solid var(--line);border-radius:9px;background:white;margin:16px 0}table{border-collapse:collapse;width:100%;font-size:14px;white-space:nowrap}th,td{padding:12px 13px;text-align:right;border-bottom:1px solid var(--line);vertical-align:top}thead th{background:#eaf1ee;color:#243e46;font-weight:650}tbody th{font-weight:550;white-space:normal;min-width:150px}tbody tr:last-child>*{border-bottom:0}tbody tr:hover{background:#f5f9f7}td{font-variant-numeric:tabular-nums}td.sources{font-size:12px;white-space:nowrap}.good{color:var(--teal);font-weight:650}.bad{color:var(--red);font-weight:650}.neutral{color:var(--muted)}code,.ltr{direction:ltr;unicode-bidi:isolate;font-family:Consolas,"Courier New",monospace;font-size:.87em}code{background:#edf2f1;border-radius:4px;padding:2px 5px}pre{white-space:pre-wrap;overflow-wrap:anywhere;direction:ltr;text-align:left;padding:18px;border-radius:10px;background:#112e38;color:#dbefec;font:14px/1.8 Consolas,monospace}blockquote{border-right:4px solid var(--teal);margin:18px 0;padding:14px 22px;background:#edf6f1}ul,ol{padding-right:25px}li{margin:9px 0}.controls{display:grid;grid-template-columns:1fr 2fr 1fr;gap:14px;margin:20px 0}label{display:block;font-size:14px;color:var(--muted)}input,select{display:block;width:100%;padding:10px;background:white;color:var(--ink);border:1px solid #b7c8c5;border-radius:7px;margin-top:6px;font-size:14px}button{border:1px solid #a9beba;border-radius:7px;background:white;color:var(--navy);padding:7px 15px;cursor:pointer}button:hover{background:#e9f3ef}summary{font-weight:650;cursor:pointer}footer{color:var(--muted);border-top:1px solid var(--line);padding:24px 0;margin-top:40px;font-size:13px}.formula{direction:ltr;unicode-bidi:isolate;display:inline-block}.metric-name{min-width:270px;direction:ltr;text-align:left;white-space:normal;overflow-wrap:anywhere}.mini{font-size:12px}.skip{position:absolute;right:16px;top:-80px;background:white;padding:8px}.skip:focus{top:8px}.badge{display:inline-block;border-radius:5px;background:#e9f2ee;padding:0 7px;font-size:12px}#metric-count{display:block;margin:10px 0}.raw-table th{white-space:nowrap}.raw-table td{direction:ltr;text-align:right}#explorer-sources a{font-size:13px}section{scroll-margin-top:18px}@media(max-width:800px){header{padding:35px 20px}main{padding:18px}.cards,.controls{grid-template-columns:1fr}.panel,.note,details{padding:16px}h2{font-size:25px}body{font-size:16px}table{font-size:13px}}@media print{body{background:white;font-size:11pt}header{padding:18px;background:white;color:#102d38;border-bottom:2px solid #087a69}header p,.eyebrow{color:#334d56}h1{font-size:25pt}main{padding:0;max-width:none}nav,.controls,button,.skip{display:none}.table-wrap{overflow:visible}table{font-size:8pt;white-space:normal}th,td{padding:6px}h2,h3{break-after:avoid}.panel,.note{break-inside:avoid}.cards{grid-template-columns:repeat(3,1fr)}a{color:inherit}.raw-table{font-size:7pt}}
</style></head><body><a class="skip" href="#main">انتقل إلى التقرير</a>
<header><div class="eyebrow">تقرير عربي من ملفات القياس الفعلية · 11 نوفمبر 2026</div><h1>ماذا تحسّن فعلًا؟<br>قراءة نتائج k6 قبل التحسينات وبعدها</h1><p>جداول كاملة للمراحل والتجارب، مع تفسير المقاييس التي ارتفعت، وحدود المقارنة، وإجابات يمكنك استخدامها في مناقشة المشروع دون إخفاء التراجعات أو المبالغة في النتائج.</p></header>
<main id="main"><nav aria-label="أقسام التقرير"><a href="#current">قبل والحالي</a><a href="#history">كل مراحل التحسين</a><a href="#other">بقية النتائج المحفوظة</a><a href="#meaning">هل الزيادة سيئة؟</a><a href="#explorer">كل مقياس وكل تجربة</a><a href="#professor">مناقشة الدكتور</a><a href="#audit">تدقيق الأخطاء</a></nav>
<div class="cards"><div class="card"><strong>${inventory.length}</strong>ملف نتائج خام تمت قراءته</div><div class="card"><strong>${verifiedMetrics}</strong>قيمة percentile طابقت الملخص التاريخي</div><div class="card"><strong>5 VUs</strong>حمل صغير مع انتظار ثانية بين الدورات</div></div>
<div class="note success"><b>خلاصة التحقق:</b> ملفات خط الأساس الاثنا عشر لا تحتوي على فشل HTTP أو endpoint أو checks. لذلك لا توجد إشارة إلى أن rate limiter أفسد هذه الملفات. هذا يختلف عن تجربة الطلب المباشر في 11 نوفمبر التي سجلت HTTP 429؛ عُرضت تلك التجربة منفصلة أدناه.</div>
<p class="muted">جميع الأرقام هنا أُعيد حسابها من JSON الخام. زمن endpoint يستثني تسجيل الدخول، أما عدد HTTP ومعدله فيشملانه عند وجوده. لم تُشغَّل اختبارات جديدة أثناء توليد هذه النسخة من التقرير.</p>
<section id="current"><h2>١. خط الأساس مقابل القياس الحالي المحفوظ</h2><p>«الحالي» في هذا الجدول يعني قياس <b>10 نوفمبر 2026، من 09:46:15 إلى 09:53:21 UTC</b>، وليس ادعاء أن الاختبار أُعيد الآن. القيم بالمللي ثانية، وكل خلية هي وسيط قيم التجارب الثلاث للمقياس نفسه.</p>${currentTable}
<div class="note"><b>ما الذي تلاحظه؟</b> تحسّن p95 في العمليات الأربع. لكن p99 لطلبات العميل ارتفع من ${n(value(find('baseline','customer-orders'),'endpoint_duration.p(99)'))} إلى ${n(value(find('current','customer-orders'),'endpoint_duration.p(99)'))} ms، أي <b>${n(badCurrentP99)}%</b>. هذا تراجع في ذلك المقياس في هذه العينة؛ لا يُلغيه تحسّن p95 ولا يجوز وصف كل المقاييس بأنها تحسنت.</div>
<p>${link('docs/performance/current-20261110-094614/RESULTS.md','تفاصيل القياس الحالي')} · ${link('docs/performance/baseline/dataset-counts.txt','بيانات خط الأساس')} · ${link('docs/performance/current-20261110-094614/dataset-before.json','البيانات قبل القياس الحالي')} · ${link('docs/performance/current-20261110-094614/dataset-after.json','البيانات بعده')}</p></section>
<section id="history"><h2>٢. كل مراحل التحسين التاريخية</h2><p>كل صف مرحلة مقاسة فعلًا. المقارنة في العمود الملوّن مع خط الأساس؛ وهي مقارنة تراكمية. لقياس أثر مرحلة بعينها، قارنها أيضًا بآخر مرحلة قِيسَت فيها العملية، ولا تنسب كل التحسن إلى آخر تعديل وحده.</p>${history}
<div class="note"><b>مثال نتيجة مختلطة:</b> بعد إضافة الفهارس لقائمة المنتجات، تغيّر p50 من ${n(value(find('baseline','products-list'),'endpoint_duration.p(50)'))} إلى ${n(value(find('after-indexes','products-list'),'endpoint_duration.p(50)'))} ms، وp95 من ${n(value(find('baseline','products-list'),'endpoint_duration.p(95)'))} إلى ${n(value(find('after-indexes','products-list'),'endpoint_duration.p(95)'))} ms؛ كلاهما أبطأ. في المقابل انخفض p99 من ${n(value(find('baseline','products-list'),'endpoint_duration.p(99)'))} إلى ${n(value(find('after-indexes','products-list'),'endpoint_duration.p(99)'))} ms. النتيجة ليست «الفهارس أسرع دائمًا». جدول المنتجات فيه 15 صفًا فقط، ولا تكفي هذه التجربة لتعميم كلفة الفهرس أو فائدته.</div></section>
<section id="other"><h2>٣. بقية القياسات المحفوظة: السياق مهم</h2><p>هذه جلسات قياس إضافية. لا أجمعها في مجموعة واحدة مع التاريخ السابق؛ اختلاف الجلسة وحالة الكاش والحمل على الجهاز قد يغيّر النتيجة. القياس المسمى «قبل Replica» لا يثبت وحده أثر Replica من دون زوج بعد مطابق.</p>${contexts}
<div class="note danger"><b>احتفظ بالقياس الأبطأ أيضًا:</b> سجل تدقيق لوحة التحكم الأولي وسيط p95 مقداره ${n(cold)} ms؛ وهو أعلى من الهدف الاسترشادي 500 ms رغم أن الأخطاء كانت صفرًا. قياس الإحماء اللاحق نتيجة منفصلة، وليس بديلًا يمحو القياس الأولي. لا توجد في الملخصات وحدها أدلة زمنية كافية للجزم بأن سبب البطء كان الكاش فقط.</div>
<h3>تجربة gzip المقترنة</h3><p>تجربتان على التطبيق المحسّن نفسه قبل/بعد إضافة gzip وتهيئة ETag الضعيف، مع طلب صفحة منتجات كاملة بلا <code>If-None-Match</code>. لا تُخلط هذه المقارنة مع خط الأساس القديم.</p>${gzipBefore&&gzipAfter?table('<thead>'+metricHead+'</thead><tbody>'+metricRow(gzipBefore,gzipBefore)+metricRow(gzipAfter,gzipBefore)+'</tbody>'):''}
<p>قياس جسم الاستجابة المباشر في التقرير المحفوظ تغيّر من <b>18,176</b> إلى <b>2,465 بايت</b>؛ انخفاض <b>86.44%</b>، مع تطابق JSON بعد فك الضغط. هذا دليل على تقليل النقل؛ ليس دليلًا بمفرده على زيادة أقصى سعة للنظام. ${link('docs/performance/focused-review/REVIEW.md','مصدر القياس المزدوج وحدوده')}.</p>
<h3>تشخيص rate limiter: طلب مباشر مقابل الوكيل</h3>${table('<thead><tr><th>المسار</th><th>HTTP</th><th>HTTP 200</th><th>HTTP 429</th><th>فشل endpoint</th><th>فشل checks</th><th>الدليل</th></tr></thead><tbody>'+[direct,proxy].filter(Boolean).map(g=>`<tr><th>${h(g.label)}</th><td>${g.httpTotal}</td><td>${value(g,'status_200.count')??'غير مسجل'}</td><td>${value(g,'status_429.count')??0}</td><td>${n(g.errorPct)}%</td><td>${g.checksFail}</td><td>${sourceLinks(g)}</td></tr>`).join('')+'</tbody>')}
<p>الطلب المباشر جمع VUs في هوية IP واحدة. الوكيل الموثوق أعطى كل VU هويته المخصصة. لا تستخدم زمن الرفض السريع 429 لإثبات تسريع قاعدة البيانات. هذه تجربة تشخيص إعداد الاختبار، وليست مقارنة قبل/بعد تحسين الاستعلامات. ${link('docs/performance/rate-limit-20261111/RESULTS.md','التشخيص التفصيلي')}.</p></section>
<section id="meaning"><h2>٤. هل ارتفاع المقياس بعد التحسين سيئ؟</h2>
${table(`<thead><tr><th>المقياس</th><th>الاتجاه المعتاد</th><th>كيف تفسّره؟</th></tr></thead><tbody>
<tr><th>p50 / p95 / p99 ومدة HTTP</th><td>الأقل أفضل</td><td>ارتفاعها يعني استجابة أبطأ في المقياس، إذا كانت ظروف المقارنة متكافئة. قد يتحسّن الوسط ويتراجع الذيل.</td></tr>
<tr><th>معدل الأخطاء وchecks الفاشلة</th><td>الأقل أفضل</td><td>الأخطاء صفر شرط صحة، وليست برهانًا على أن الأداء تحسّن.</td></tr>
<tr><th>HTTP requests/second</th><td>الأعلى أفضل بشروط</td><td>قارن حملًا ومدة وانتظارًا ونسبة نجاح متماثلة. هذه تجربة VUs مع انتظار، فلا تقيس أقصى throughput.</td></tr>
<tr><th>data_received.count</th><td>يعتمد على السياق</td><td>قد يزيد لأن عدد الطلبات زاد. للمقارنة انظر إلى بايت/طلب، مع تثبيت محتوى الصفحة وحالة 200 أو 304.</td></tr>
<tr><th>data_sent</th><td>يعتمد على السياق</td><td>إضافة If-None-Match تطيل الطلب قليلًا، وقد تقلل الرد كثيرًا. زيادة إرسال headers وحدها ليست عيبًا.</td></tr>
<tr><th>conditional_hits / HTTP 304</th><td>أكثر ليس حكمًا كافيًا</td><td>يعني نجاح إعادة التحقق. يجب أيضًا التحقق من أن تعديل المنتج يغيّر البيانات والـ ETag فعلًا.</td></tr>
<tr><th>عدد الطلبات والدورات</th><td>يعتمد على المدة والحمل</td><td>عدد أكبر ليس فشلًا. قد تختلف الدورات المكتملة عن الطلبات عند إيقاف دورة أثناء sleep.</td></tr>
<tr><th>VUs / vus_max</th><td>إعداد حمل، وليس نتيجة سرعة</td><td>زيادة VUs تغيّر شروط الاختبار؛ لا تقارنها كأنها التحسين نفسه.</td></tr>
<tr><th>iteration_duration</th><td>يشمل أكثر من الاستجابة</td><td>يتضمن sleep(1) وعمل الدورة. قيمة تقارب ثانية لا تعني أن طلب API استغرق ثانية.</td></tr>
</tbody>`)}
<p>p95 يعني أن نحو 95% من أزمنة الطلبات المقاسة أقل من القيمة أو مساوية لها؛ ليس المتوسط ولا أقصى زمن. p99 أكثر حساسية لعدد صغير من الطلبات البطيئة، خصوصًا مع نحو 120 طلبًا في التجربة الواحدة.</p>
<div class="note"><b>ترتيب التحليل الصحيح:</b> افحص صحة الطلبات أولًا، ثم تكافؤ البيانات والحمل، ثم حجم التغيّر واتساقه عبر التجارب. تغيّر صغير في جلسة قصيرة قد يكون تذبذبًا، لكنه لا يصبح «ضوضاء مؤكدة» بلا دليل. إذا تكرر التراجع، راجع EXPLAIN ANALYZE وعدد SQL queries والكاش ووقت CPU والشبكة، ثم أعد تجربة أطول.</div>
<p>نسبة التغيّر المعروضة: <span class="formula">(after − before) / before × 100</span>. في الزمن، الإشارة السالبة تحسّن. وفي معدل الطلبات الناجحة، الإشارة الموجبة قد تكون تحسّنًا عند تكافؤ الحمل. إذا كان قبل = صفر وبعد أكبر من صفر، لا توجد نسبة مئوية منتهية صالحة.</p>
<h3>انتبه إلى أسماء passes وfails في k6</h3><p>في <code>http_req_failed</code> و<code>endpoint_errors</code>، قيمة true تمثل خطأ؛ لذلك قد يكون <code>passes = 0</code> و<code>fails = 121</code> مع <code>value = 0</code>: معناها صفر أخطاء و121 عينة غير خاطئة. أما <code>checks</code> فـ <code>fails</code> هو فعلًا عدد التحققات الفاشلة. لا تفسّر كلمة fails بمعزل عن نوع المقياس.</p>
<p><code>--no-thresholds</code> يعطّل تطبيق عتبات النجاح والفشل؛ لا يعطّل rate limiter ولا يحذف أخطاء HTTP. تحقق من المقاييس حتى لو انتهى الأمر برمز خروج صفر.</p></section>
<section id="explorer"><h2>٥. كل مقياس وكل تجربة: مقارنة قابلة للفحص</h2><p>اختر العملية ومرحلة «بعد». ستظهر جميع الحقول الرقمية الموجودة في ملخصات k6: أزمنة الشبكة والانتظار والطلب، عدد الطلبات والدورات، bytes، الأخطاء و304. لا تُنسخ الرموز أو بيانات تسجيل الدخول إلى هذا الملف.</p>
<div class="controls"><label>العملية<select id="scenario" aria-label="العملية"></select></label><label>مرحلة بعد / مرجع المقارنة<select id="pair" aria-label="مرحلة المقارنة"></select></label><label>ابحث عن مقياس<input id="metric-search" type="search" placeholder="p(95) أو http_req_failed" dir="ltr"></label></div>
<p id="pair-note" class="note"></p><p id="explorer-sources"></p><span id="metric-count" class="muted" aria-live="polite"></span>
<div class="table-wrap"><table class="raw-table"><thead><tr><th>المقياس / الحقل</th><th>قبل 1</th><th>بعد 1</th><th>قبل 2</th><th>بعد 2</th><th>قبل 3</th><th>بعد 3</th><th>وسيط قبل</th><th>وسيط بعد</th><th>التغيّر</th><th>قراءة الاتجاه</th></tr></thead><tbody id="metric-body"></tbody></table></div>
<p class="muted">الأرقام 1 و2 و3 ترتّب الملفات فقط؛ ليست أزواجًا متزامنة أو تصميمًا إحصائيًا مقترنًا. «—» تعني أن الحقل غير مسجّل. وسيط rates أو counts لا يحل محل تدقيق مجموع الأخطاء في القسم الأخير. زمن الشبكة وHTTP بالمللي ثانية، counts أعداد، rates بحسب المقياس، وvalue لمقياس Rate نسبة من 0 إلى 1.</p></section>
<section id="professor"><h2>٦. كيف تعرض النتائج للدكتور؟</h2><blockquote>«استخدمت نفس حجم البيانات ونفس حمل الاختبار، وعرضت ثلاث تجارب لكل نقطة قياس. المقارنة تُظهر تحسنًا في مقاييس محددة، لكنني احتفظت أيضًا بالقيم التي ارتفعت. صفر أخطاء يؤكد صحة الطلبات في العينة، ولا يكفي للحكم على السرعة. لا أدّعي أن هذه التجربة القصيرة تقيس أقصى سعة للنظام أو تثبت سببية كل تغيير وحده.»</blockquote>
<details open><summary>إذا قال: لماذا ارتفع المقياس بعد التحسين؟</summary><p>ابدأ بالرقم: «صحيح، ارتفع هذا المقياس بنسبة كذا». ثم حدّد ما إذا كان زمنًا أم throughput أم bytes. لقائمة المنتجات بعد الفهارس، قل إن الوسط وp95 تراجعا بينما p99 تحسن؛ راجع الخطة على جدول صغير بدل الادعاء أن كل فهرس يحسن كل قراءة. اذكر التذبذب والكاش كفرضيات تحتاج قياسًا، لا كأسباب مثبتة.</p></details>
<details><summary>إذا قال: هل انتقيت أسرع تجربة؟</summary><p>اعرض الملفات الثلاثة والوسيط، ثم القياس الأولي البطيء وقياس الإحماء كلًا على حدة. وضّح أن وسيط percentiles لثلاث تجارب ليس percentile محسوبًا من تجميع جميع الطلبات، وأن ملفات الملخص لا تعطي فواصل ثقة جاهزة.</p></details>
<details><summary>إذا قال: هل أرقام 4 طلبات/ثانية تعني أن النظام ضعيف؟</summary><p>قل إن الاختبار يضع خمسة VUs مع ثانية انتظار بين الدورات. حتى الخدمة الفورية لن تجعل هذا السكربت يقيس معدلًا مفتوحًا غير محدود. أرقام هذه التجربة تصف ذلك الحمل، وتقدير السعة يحتاج اختبار حمل تدريجي أو arrival-rate بحدود موارد ومعدل أخطاء مقبولين.</p></details>
<details><summary>إذا قال: هل ETag أو gzip سرّع قاعدة البيانات؟</summary><p>ETag يقلل نقل المحتوى عند 304، وقد يبقى بعض عمل SQL أو فحص المخزون قبل حساب الـ validator. وgzip يقلل حجم النقل ويضيف كلفة ضغط. إثبات تقليل SQL يحتاج عدّ الاستعلامات والخطط؛ إثبات تقليل الشبكة يحتاج bytes/طلب مع نفس المحتوى.</p></details>
<details><summary>إذا قال: هل rate limiter أفسد قبل؟</summary><p>اعرض قيمة <code>http_req_failed.value = 0</code> و<code>endpoint_errors.value = 0</code> و<code>checks.fails = 0</code> في ملفات baseline الاثني عشر. ثم اعرض تشخيص 11 نوفمبر منفصلًا: الطلب المباشر فشل جزئيًا، والوكيل صحح هوية العملاء. لا تعمم فشل تلك الجلسة على جلسة baseline مختلفة.</p></details>
<details><summary>إذا قال: هل baseline هو الالتزام القديم حرفيًا؟</summary><p>الدليل التاريخي بدأ من الالتزام <code>b9514cbe00b7d310cc2972aff728a9d690bc2a3b</code>، لكن التشغيل الصحيح احتاج إضافة اعتماد gRPC وإصلاح عقد فك الاستجابة قبل قياس الأداء. توجد نسخة المصدر المصححة والسجل. عرّفه بأنه «قبل تحسينات الأداء بعد إصلاح التشغيل»، ولا تدّعِ أنه تشغيل حرفي بلا أي إصلاح.</p><p>${link('docs/performance/baseline/dependency-repair.txt','سجل إصلاح الاعتماد')} · ${link('docs/performance/baseline/baseline-source.zip','نسخة المصدر المصححة')} · ${link('REPORT.md','سجل المنهجية التاريخية')}</p></details>
<details><summary>ما الخطوة التالية إذا طلب إثباتًا أقوى؟</summary><p>اعرض مقارنة واحدة لكل ميزة مع تثبيت غيرها، ومجموعات بيانات متطابقة، وحالة كاش محددة، وعدة تكرارات أطول. سجّل توزيع الزمن وأخطاء كل status وكلفة CPU/SQL والنقل. بياناتنا الحالية لا تكفي وحدها لاستخراج فواصل ثقة أو ضمانات أداء إنتاجية.</p></details></section>
<section id="audit"><h2>٧. تدقيق الأخطاء وصحة النتائج</h2><p>هذا الجدول يحسب المجاميع عبر كل ملفات المجموعة، حتى لا يختبئ فشل تجربة واحدة خلف وسيط جيد. العتبة 500 ms استرشادية من السكربت؛ العمود يفحص تحققها في كل تجربة، ولا يدّعي أن k6 فرضها عند استخدام <code>--no-thresholds</code>.</p>${audit}</section>
<section><h2>٨. حدود المقارنة ومصادرها</h2><ul><li>البيانات المسجلة: 5,004 مستخدمين، 15 منتجًا، 300,004 طلبات و749,372 عنصر طلب. تطابق الأعداد لا يثبت بمفرده تطابق كل صف أو حالة الكاش.</li><li>معظم القياسات 30 ثانية وثلاث تجارب. لا توجد من هذه الملخصات وحدها سلسلة كل طلب، أو اختبار دلالة إحصائية، أو فاصل ثقة.</li><li>السيناريو التاريخي لقائمة المنتجات يختار صفحات 1–20 وفئات 1–5 من 15 منتجًا؛ قد تكون استجابات كثيرة فارغة. تجربة الضغط تستخدم صفحة كاملة ومخطط JSON متحققًا منه.</li><li>HTTP 304 نجاح لإعادة التحقق، لكنه ليس استجابة كاملة بالحجم نفسه؛ احتفظ بنسبة 304 عند تفسير bytes أو الزمن.</li><li>الكاش والـ Replica وتحسين الاستعلامات قد تتداخل. المقارنة التاريخية تراكمية، والقياسات الإضافية من جلسات مختلفة.</li></ul>
<p>${link('perf/k6/common.js','إعداد الحمل التاريخي')} · ${link('perf/k6/compression.js','سيناريو الضغط')} · ${link('docs/performance/BEFORE_AFTER.md','فهرس قبل وبعد')} · ${link('docs/performance/focused-review/REVIEW.md','مراجعة الضغط وخطط SQL')} · ${link('docs/checklist/requirement-3/benchmark-summary.json','ملخص التدقيق والإحماء')}</p>
<details><summary>فهرس جميع ملفات JSON المقروءة وبصماتها</summary><p class="muted">SHA-256 للتحقق من الدليل الأصلي. لا يتضمن HTML بيانات setup أو JWT.</p>${table('<thead><tr><th>الملف</th><th>SHA-256</th></tr></thead><tbody>'+inventory.map(i=>`<tr><td>${link(i.source)}</td><td class="ltr mini">${i.sha256}</td></tr>`).join('')+'</tbody>')}</details></section>
<footer>تقرير مولّد محليًا من ملفات المشروع، بلا خطوط أو مكتبات خارجية. الألوان تساعد القراءة، والحكم النهائي يعتمد على معنى المقياس وتكافؤ الاختبار. <button onclick="window.print()">طباعة / حفظ PDF</button></footer></main>
<script id="report-data" type="application/json">${embedded}</script>
<script>
const report=JSON.parse(document.getElementById('report-data').textContent);
const $=id=>document.getElementById(id);
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>v==null?'—':Number(v).toLocaleString('en-US',{maximumFractionDigits:4});
const scenario=$('scenario'), pair=$('pair'), search=$('metric-search');
for(const s of [...new Set(report.pairs.map(p=>p.scenario))])scenario.add(new Option(report.scenarios[s]||s,s));
scenario.value='dashboard';
function options(){pair.replaceChildren();for(const p of report.pairs.filter(p=>p.scenario===scenario.value))pair.add(new Option(p.label+' ← '+(report.groups.find(g=>g.id===p.before&&g.scenario===p.scenario)?.label||p.before),p.after));if(scenario.value==='dashboard')pair.value='after-dashboard';render();}
function render(){const p=report.pairs.find(p=>p.scenario===scenario.value&&p.after===pair.value);if(!p)return;const a=report.groups.find(g=>g.id===p.before&&g.scenario===p.scenario),b=report.groups.find(g=>g.id===p.after&&g.scenario===p.scenario);$('pair-note').textContent=b.family==='diagnostic'?'تشخيص rate limiter. طلبات 429 لا تقيس نجاح عمليات قاعدة البيانات.':b.family==='gzip'?'تجربة gzip منفصلة ومقترنة؛ مرجعها قبل gzip على التطبيق المحسّن نفسه.':'المقارنة مع خط الأساس التاريخي. المراحل تراكمية والجلسات قد تختلف؛ الأرقام الفردية ليست أزواجًا متزامنة.';$('explorer-sources').innerHTML='قبل: '+a.runs.map(r=>'<a href="'+esc(r.source)+'">JSON '+r.run+'</a>').join(' · ')+' | بعد: '+b.runs.map(r=>'<a href="'+esc(r.source)+'">JSON '+r.run+'</a>').join(' · ');const keys=[...new Set([...Object.keys(a.metrics),...Object.keys(b.metrics)])].sort().filter(k=>k.toLowerCase().includes(search.value.trim().toLowerCase()));$('metric-count').textContent='عدد الحقول المعروضة: '+keys.length;$('metric-body').innerHTML=keys.map(k=>{const av=a.metrics[k],bv=b.metrics[k],change=av==null||bv==null?'—':av===0?(bv===0?'0%':'من صفر؛ لا نسبة صالحة'):((bv-av)/av*100).toFixed(2)+'%';const lower=/duration|http_req_(waiting|blocked|connecting|receiving|sending|tls_handshaking)|((endpoint_errors|http_req_failed|status_errors|json_errors)\\.(value|passes))|checks\\.fails|status_(429|500|502|503)\\.count/.test(k);const higher=k==='http_reqs.rate'||k==='checks.value';const cls=av!=null&&bv!=null&&av!==bv?(lower?(bv<av?'good':'bad'):higher?(bv>av?'good':'bad'):'neutral'):'neutral';const interpretation=lower?'الأقل أفضل؛ راجع تكافؤ القياس':higher?'الأعلى أفضل بشروط':'يعتمد على السياق / حجم الحمل';let cells='';for(let i=0;i<3;i++)cells+='<td>'+fmt(a.runs[i]?.metrics[k])+'</td><td>'+fmt(b.runs[i]?.metrics[k])+'</td>';return '<tr><th class="metric-name"><code>'+esc(k)+'</code></th>'+cells+'<td>'+fmt(av)+'</td><td>'+fmt(bv)+'</td><td class="'+cls+'">'+esc(change)+'</td><td>'+interpretation+'</td></tr>';}).join('');}
scenario.addEventListener('change',options);pair.addEventListener('change',render);search.addEventListener('input',render);options();
</script></body></html>`;
fs.writeFileSync(out, html, 'utf8');
console.log(JSON.stringify({ output: out, inputFiles: inventory.length, groups: groups.length, checkedHistoricalPercentiles: verifiedMetrics, htmlBytes: Buffer.byteLength(html), baselineHttpFailures: baselineGroups.reduce((s,g)=>s+g.httpFailures,0), baselineEndpointFailures: baselineGroups.reduce((s,g)=>s+g.endpointFailures,0), baselineFailedChecks: baselineGroups.reduce((s,g)=>s+g.checksFail,0) }, null, 2));
