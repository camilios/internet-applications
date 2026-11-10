import http from 'k6/http';
import { check, sleep } from 'k6';
import { randomSeed } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

export const options = {
  scenarios: {
    fixed: {
      executor: 'ramping-vus', startVUs: 0,
      stages: [{ duration: '5s', target: 5 }, { duration: '20s', target: 5 }, { duration: '5s', target: 0 }],
      gracefulRampDown: '1s', gracefulStop: '2s',
    },
  },
  summaryTrendStats: ['p(50)', 'p(95)', 'p(99)'],
  // The runner passes --no-thresholds: these targets are informational, never deployment gates.
  thresholds: { endpoint_duration: ['p(95)<500'], endpoint_errors: ['rate<0.01'] },
};

const duration = new Trend('endpoint_duration', true);
const errors = new Rate('endpoint_errors');
const conditionalHits = new Counter('conditional_hits');
const etags = {};
const base = __ENV.BASE_URL || 'http://loadtest-proxy/api';
let initialized = false;

function headers(token) {
  const result = {
    Accept: 'application/json',
    // Simulate separate clients without disabling or changing the application's rate limits.
    // RUN_ID is deterministic and each VU stays below 60 requests/minute.
    'X-Forwarded-For': `198.18.${__ENV.RUN_ID || 0}.${__VU || 250}`,
  };
  if (token) result.Authorization = `Bearer ${token}`;
  return result;
}

export function setup() {
  const result = http.post(`${base}/login`, JSON.stringify({
    email: 'bulk-customer-1@example.test', password: 'password123',
  }), { headers: { ...headers(), 'Content-Type': 'application/json' } });
  if (result.status !== 200) throw new Error(`Setup login failed: HTTP ${result.status}`);
  return { token: result.json('access_token') };
}

export function request(scenario, auth) {
  if (!initialized) { randomSeed(12345 + __VU); initialized = true; }
  let path;
  if (scenario === 'products-list') {
    const page = 1 + Math.floor(Math.random() * 20);
    const category = 1 + Math.floor(Math.random() * 5);
    path = `/products?page=${page}&category_id=${category}`;
  } else if (scenario === 'product-detail') {
    path = `/products/${1 + Math.floor(Math.random() * 15)}`;
  } else if (scenario === 'customer-orders') {
    path = '/orders';
  } else {
    path = '/dashboard';
  }
  const requestHeaders = headers(auth?.token);
  if (etags[path]) requestHeaders['If-None-Match'] = etags[path];
  const response = http.get(base + path, { headers: requestHeaders, tags: { endpoint: scenario } });
  if (response.headers.Etag) etags[path] = response.headers.Etag;
  conditionalHits.add(response.status === 304 ? 1 : 0);
  duration.add(response.timings.duration);
  errors.add(response.status !== 200 && response.status !== 304);
  check(response, { 'HTTP 200 or valid revalidation': r => r.status === 200 || r.status === 304 });
  sleep(1);
}
