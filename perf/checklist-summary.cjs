const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function readJson(file) {
  const bytes = fs.readFileSync(file);
  return JSON.parse(bytes.toString(bytes[0] === 255 && bytes[1] === 254 ? 'utf16le' : 'utf8').replace(/^\uFEFF/, ''));
}
const median = values => [...values].sort((a, b) => a - b)[1];
const last = { dashboard: 'after-refactor', 'products-list': 'after-refactor',
  'product-detail': 'after-etag', 'customer-orders': 'after-pagination' };
const result = {};
for (const scenario of Object.keys(last)) {
  result[scenario] = {};
  for (const [stage, folder] of Object.entries({
    archived_before: 'docs/performance/baseline',
    archived_after: 'docs/performance/results/' + last[scenario],
    current_backend: 'docs/checklist/requirement-3',
    ...(scenario === 'dashboard' ? { warm_repeat: 'docs/checklist/requirement-3/warm-dashboard' } : {}),
  })) {
    const sources = [1, 2, 3].map(run => `${folder}/k6-${scenario}-${run}.json`);
    const runs = sources.map(file => readJson(path.join(root, file)).metrics);
    if (runs.some(metrics => metrics.endpoint_errors.value !== 0)) {
      throw new Error(`Endpoint errors invalidate ${stage}/${scenario}`);
    }
    result[scenario][stage] = {
      p50: median(runs.map(metrics => metrics.endpoint_duration['p(50)'])),
      p95: median(runs.map(metrics => metrics.endpoint_duration['p(95)'])),
      p99: median(runs.map(metrics => metrics.endpoint_duration['p(99)'])),
      requests_per_second: median(runs.map(metrics => metrics.http_reqs.rate)),
      endpoint_error_percent: 0, sources,
    };
  }
}
const counts = readJson(path.join(root, 'docs/checklist/requirement-3/database-current.json')).counts;
const output = { aggregation: 'Median of three run-level percentiles, milliseconds',
  counts, scenarios: result, note: 'Archived before/after are retained historical measurements. Current backend is a fresh run with the read replica and correctness fixes; it is not a new controlled historical baseline.' };
fs.writeFileSync(path.join(root, 'docs/checklist/requirement-3/benchmark-summary.json'), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(output, null, 2));
