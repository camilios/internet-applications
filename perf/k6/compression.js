import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

// Identical requests before/after gzip; no conditional GETs hiding body transfer.
export const options = {
  scenarios: { fixed: { executor: 'ramping-vus', startVUs: 0,
    stages: [{ duration: '5s', target: 5 }, { duration: '20s', target: 5 }, { duration: '5s', target: 0 }],
    gracefulRampDown: '1s', gracefulStop: '2s' } },
  summaryTrendStats: ['p(50)', 'p(95)', 'p(99)'],
  thresholds: { endpoint_errors: ['rate==0'] },
};
const duration = new Trend('endpoint_duration', true);
const errors = new Rate('endpoint_errors');
export default function () {
  const response = http.get((__ENV.BASE_URL || 'http://loadtest-proxy/api') + '/products?per_page=15', {
    headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip',
      'X-Forwarded-For': `198.18.${__ENV.RUN_ID || 210}.${__VU}` },
  });
  let valid = false;
  try {
    const payload = response.json();
    valid = response.status === 200 && Array.isArray(payload.data) && payload.data.length > 0 &&
      payload.data.length <= 15 && payload.data.every(product => typeof product.price === 'string');
  } catch (_) { valid = false; }
  duration.add(response.timings.duration);
  errors.add(!valid);
  check(response, { '200 with valid decoded product JSON': () => valid });
  sleep(1);
}
