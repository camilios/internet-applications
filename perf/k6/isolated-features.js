import http from 'k6/http';
import { check, sleep } from 'k6';
import { sha256 } from 'k6/crypto';
import { Trend, Rate, Counter } from 'k6/metrics';

const mode = __ENV.MODE || 'overall';
const side = __ENV.SIDE || 'after';
const base = __ENV.BASE_URL;
if (!base || !['overall', 'compression', 'etag', 'queries'].includes(mode)) throw new Error('Provide BASE_URL and a valid MODE');
export const options = {
  scenarios: { fixed: { executor: 'ramping-vus', startVUs: 0,
    stages: [{ duration: '5s', target: 5 }, { duration: '20s', target: 5 }, { duration: '5s', target: 0 }],
    gracefulRampDown: '1s', gracefulStop: '2s' } },
  summaryTrendStats: ['p(50)', 'p(95)', 'p(99)'],
  thresholds: { endpoint_errors: ['rate==0'], http_429: ['count==0'] },
};
const duration = new Trend('endpoint_duration', true);
const errors = new Rate('endpoint_errors');
const rateLimited = new Counter('http_429');
const status200 = new Counter('http_200');
const status304 = new Counter('http_304');
const gzip = new Counter('gzip_responses');
const schemaErrors = new Counter('schema_errors');
const trends = {
  products: new Trend('products_duration', true),
  detail: new Trend('detail_duration', true),
  orders: new Trend('orders_duration', true),
  dashboard: new Trend('dashboard_duration', true),
};
const routes = { products: '/products?per_page=15', detail: '/products/1', orders: '/orders?per_page=15', dashboard: '/dashboard' };
const etags = {};
const headers = (token, encoding = 'identity') => ({ Accept: 'application/json', 'Accept-Encoding': encoding,
  'X-Forwarded-For': `198.18.${__ENV.RUN_ID}.${__VU || 250}`, ...(token ? { Authorization: `Bearer ${token}` } : {}) });
function validBody(name, response) {
  try {
    const payload = response.json();
    if (name === 'products') return Array.isArray(payload.data) && payload.data.length === 15 && payload.data.every(p => typeof p.price === 'string');
    if (name === 'detail') return payload.data?.id === 1 && typeof payload.data.price === 'string' && typeof payload.data.stock === 'number';
    if (name === 'orders') return Array.isArray(payload.data) && payload.data.length > 0 && payload.data.every(o => typeof o.total === 'string');
    return typeof payload.data?.total_orders === 'number' && typeof payload.data.total_sales === 'string';
  } catch (_) { return false; }
}
export function setup() {
  let token;
  if (mode === 'overall' || mode === 'queries') {
    const response = http.post(base + '/login', JSON.stringify({ email: 'bulk-customer-1@example.test', password: 'password123' }),
      { headers: { ...headers(), 'Content-Type': 'application/json' } });
    if (response.status !== 200) throw new Error(`Setup login: HTTP ${response.status}`);
    token = response.json('access_token');
  }
  const names = mode === 'overall' ? Object.keys(routes) : mode === 'queries' ? ['products', 'orders', 'dashboard'] : ['products'];
  const proofs = {};
  for (const name of names) {
    const response = http.get(base + routes[name], { headers: headers(token) });
    if (response.status !== 200 || !validBody(name, response)) throw new Error(`Warmup ${name}: HTTP ${response.status}, invalid schema`);
    proofs[name] = { hash: sha256(response.body, 'hex'), etag: response.headers.Etag || response.headers.ETag };
  }
  if (mode === 'etag' && !proofs.products.etag) throw new Error('ETag missing in warmup');
  return { token, names, proofs };
}
export default function (auth) {
  for (const name of auth.names) {
    const encoding = (mode === 'compression' && side === 'after') || mode === 'overall' ? 'gzip' : 'identity';
    const requestHeaders = headers(auth.token, encoding);
    if (mode === 'etag' && side === 'after') requestHeaders['If-None-Match'] = auth.proofs.products.etag;
    if (mode === 'overall' && etags[name]) requestHeaders['If-None-Match'] = etags[name];
    const response = http.get(base + routes[name], { headers: requestHeaders, tags: { endpoint: name, mode, side } });
    const etag = response.headers.Etag || response.headers.ETag;
    let valid = response.status === 200 && validBody(name, response);
    if (mode === 'etag' && side === 'after') valid = response.status === 304 && etag === auth.proofs.products.etag && !response.body;
    else if (mode === 'overall' && response.status === 304) valid = Boolean(etags[name]) && etag === etags[name] && !response.body;
    if (mode === 'compression') {
      valid = valid && sha256(response.body, 'hex') === auth.proofs.products.hash;
      valid = valid && (side === 'after' ? response.headers['Content-Encoding'] === 'gzip' : !response.headers['Content-Encoding']);
    }
    if (mode === 'etag' && side === 'before') valid = valid && response.status === 200 && sha256(response.body, 'hex') === auth.proofs.products.hash;
    if (mode === 'queries') valid = valid && sha256(response.body, 'hex') === auth.proofs[name].hash;
    if (etag) etags[name] = etag;
    duration.add(response.timings.duration);
    trends[name].add(response.timings.duration);
    errors.add(!valid);
    rateLimited.add(response.status === 429 ? 1 : 0);
    status200.add(response.status === 200 ? 1 : 0);
    status304.add(response.status === 304 ? 1 : 0);
    gzip.add(response.headers['Content-Encoding'] === 'gzip' ? 1 : 0);
    schemaErrors.add(!valid && response.status === 200 ? 1 : 0);
    check(response, { 'expected status and valid representation': () => valid });
  }
  sleep(1);
}
