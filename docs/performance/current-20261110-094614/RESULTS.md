# Current database API performance

Measured from 2026-11-10T09:46:15+00:00 to 2026-11-10T09:53:21+00:00.

All 12 k6 runs completed successfully: 1490 HTTP requests, 1484 successful endpoint checks, and 0 failed checks. Business row counts were unchanged.

| Operation | Median latency (ms) | p95 latency (ms) | p99 latency (ms) | HTTP req/s | HTTP requests | Errors |
|---|---:|---:|---:|---:|---:|---:|
| products-list | 27.75 | 53.35 | 117.87 | 4.04 | 374 | 0 |
| product-detail | 27.76 | 39.39 | 67.83 | 4.03 | 375 | 0 |
| customer-orders | 46.98 | 81.92 | 148.36 | 3.90 | 363 | 0 |
| dashboard | 24.43 | 45.18 | 53.46 | 4.04 | 378 | 0 |

Each latency column is the median of that percentile across three runs, rather than a pooled percentile. Latency excludes setup login; HTTP request counts and rates include login.

All runs met the informational targets of p95 below 500 ms and endpoint error rate below 1%: True. The existing runner uses --no-thresholds, so these were checked from the exported measurements.

Workload: five-second ramp to five virtual users, twenty-second hold, five-second ramp down, one-second think time. Scenarios ran sequentially. k6 used the existing trusted internal proxy and unchanged application rate limits. Successful endpoint responses were HTTP 200 or HTTP 304 revalidation.

Dataset: 5004 users, 15 products, 300004 orders, and 749372 order items in the ecommerce database. Redis caching and the read replica were enabled.

These are end-to-end API measurements that include caching, HTTP handling, and inventory gRPC calls where applicable. The existing scripts reuse ETags and may receive HTTP 304. The five-user workload measures light-load behavior; the one-second think time constrains throughput.

The product-list scenario samples pages 1-20 and categories 1-5 from a catalog of only 15 products, so many responses may be empty. Customer-orders and dashboard use the existing benchmark customer; the global order count does not imply every request reads all orders.

Evidence: [summary data](./summary.json), [dataset before](./dataset-before.json), [dataset after](./dataset-after.json), [k6 version](./k6-version.txt), [deployed backend image](./backend-image.txt), and the per-run JSON summaries and logs in this directory. The deployed backend image defines the measured implementation. Exact workload scripts are retained in [workload](./workload).

Routes: products-list uses GET /api/products?page=N&category_id=N; product-detail uses GET /api/products/{id}; customer-orders uses GET /api/orders; dashboard uses GET /api/dashboard. The workload performs reads and authentication; it does not benchmark order creation or inventory reservation writes.

