# k6 before-and-after results

The project contains both sets of raw k6 results for all four database API read operations. Each set contains three runs per operation: 12 JSON summaries and 12 console logs.

| Evidence | Before | After |
|---|---|---|
| Raw summaries and logs | [Historical baseline](./baseline/) | [Current run: 2026-11-10](./current-20261110-094614/) |
| Dataset | [Baseline row counts](./baseline/dataset-counts.txt) | [Before the current run](./current-20261110-094614/dataset-before.json), [after the current run](./current-20261110-094614/dataset-after.json) |
| Runtime provenance | [Baseline environment](./baseline/environment.txt) | [Deployed backend image](./current-20261110-094614/backend-image.txt) |
| k6 version | [Baseline version](./baseline/k6-version.txt) | [Current version](./current-20261110-094614/k6-version.txt) |
| Details | [Historical performance report](../../REPORT.md) | [Current results and limitations](./current-20261110-094614/RESULTS.md) |

The baseline is retained historical evidence from before the performance optimizations. The after measurements were captured on 2026-11-10 from 09:46:15 to 09:53:21 UTC against the deployed backend. No baseline rerun was performed for this comparison.

| Operation | Before p50 (ms) | After p50 (ms) | Before p95 (ms) | After p95 (ms) |
|---|---:|---:|---:|---:|
| Product list | 32.48 | 27.75 | 101.06 | 53.35 |
| Product detail | 44.68 | 27.76 | 173.61 | 39.39 |
| Customer orders | 53.10 | 46.98 | 105.16 | 81.92 |
| Dashboard | 43.60 | 24.43 | 152.89 | 45.18 |

Each cell is the median of the corresponding endpoint percentile across three runs. Endpoint latency excludes setup login. Both sets recorded zero endpoint errors, zero HTTP failures, and zero failed response checks. The baseline contains 1,438 HTTP requests and 1,432 successful endpoint checks; the current set contains 1,490 requests and 1,484 successful endpoint checks. Request totals include authentication.

The matching workload settings are a five-second ramp to five virtual users, twenty-second hold, five-second ramp down, and one-second think time. Both sets report k6 v2.3.0. Recorded dataset counts match: 5,004 users, 15 products, 300,004 orders, and 749,372 order items. Row counts also remained unchanged during the current run.

These are historical versus current end-to-end API observations. Cache state, host conditions, and application behavior can differ between measurement sessions, so the differences do not isolate an individual optimization. The current deployment uses Redis, a read replica, and conditional GETs; HTTP 304 responses count as successful revalidation. Product-list requests sample pages 1–20 and categories 1–5 from only 15 products, so many responses may be empty. The five-user workload measures light-load behavior and does not establish maximum throughput. Order creation and inventory reservation writes are outside these scenarios.

The [comparison data](./before-after.json) retains the calculated metrics and a SHA-256 inventory of all 24 summaries and 24 logs. The [current workload scripts](./current-20261110-094614/workload/) are retained with the after evidence. Intermediate optimization measurements remain available in [results](./results/).
