"""Assemble the final report from captured evidence; does not change the application."""
import json
import statistics
from requirement3 import ROOT, OUT

path = ROOT / 'REPORT.md'
old = path.read_text(encoding='utf-8')
measurements = old.split('## Measurements\n', 1)[1].split('## EXPLAIN evidence', 1)[0].strip()
problems = old.split('## Problems and deviations\n', 1)[1].split('## Decisions', 1)[0].strip()
problems = problems.replace('Retried', 'Retried').replace('Retrying with RAYON_NUM_THREADS=1, UV_THREADPOOL_SIZE=1 and a 768 MiB Node heap;', 'The successful retry used RAYON_NUM_THREADS=1, UV_THREADPOOL_SIZE=1 and a 768 MiB Node heap;')
problems = problems.replace('Source optimizations have not been applied.', 'All final source changes are now persisted in rebuilt backend and scheduler images.')
problems = problems.replace('All baseline scenarios are rerun after repair.', 'All valid baseline scenarios were rerun after repair.')
problems += '\n- Isolated component harness first failed with `ERR_UNSUPPORTED_ESM_URL_SCHEME` on a Windows dynamic import; converting the path to a file URL fixed configuration. The next run had 3 failures and `Cannot read properties of null (reading isServer)` because the router mock resolved differently from frontend imports. Explicit frontend module aliases fixed the harness; all 3 final tests pass. Failed reports/logs are retained under `results/frontend-component-*`.'
problems = '\n'.join(dict.fromkeys(problems.splitlines()))
problems += '\n- Final cleanup exposed WSL idle shutdown: after both temporary Linux sessions closed, the next HTTP probe failed with `WinError 10061` (connection refused). Restored one hidden `wsl.exe -d Ubuntu -- sleep infinity` process and rechecked startup/health. This lightweight session keeps native Docker available; no WSL settings or startup automation were added. See `results/wsl-session-lifecycle.txt`. Keep an Ubuntu terminal open for future manual runs.'
problems = '\n'.join(dict.fromkeys(problems.splitlines()))
plans = json.loads((OUT/'results/explain-summary.json').read_text())
explain = ['Query numbers correspond to Step 3 in the instructions; customer query uses real bulk customer 3498. `rows` below is actual rows produced by the leaf scan (one loop each), not the optimizer estimate or a server-wide rows-examined counter. Time is root completion time in milliseconds from a single EXPLAIN ANALYZE execution.', '',
           '| Query | Before access / key | Before rows / ms | After access / key | After rows / ms |',
           '|---|---|---|---|---|']
for i, (before, after) in enumerate(zip(plans['before'], plans['after']), 1):
    explain.append(f"| {i} | {before['type']} / {before['key'] or 'NULL'} | {before['leaf_actual_rows']} / {before['root_completion_ms']} | {after['type']} / {after['key'] or 'NULL'} | {after['leaf_actual_rows']} / {after['root_completion_ms']} |")
explain += ['', 'All requested indexes exist. MySQL still scans the tiny unfiltered product table and uses the existing category FK index for category filtering. No FORCE INDEX was added. Indexing reduces scanned order rows for limited lists, but this single execution makes the customer query and count slower; the count still scans all orders. Do not infer a universal speedup. Full SQL, estimates, plans and SHOW INDEX are in `baseline/explain-before.txt` and `results/after-indexes/explain-after.txt`.']

status = (OUT/'results/git-status-end.txt').read_text().rstrip()
diff = (OUT/'results/git-diff-end.txt').read_text().split('warning:')[0].strip()
taskrows = [
('Step 0','Done','REPORT.md; docs/performance; perf/','Environment and git snapshots','Evidence retained'),
('Step 1','Done','Prerequisite SDK repair only','Existing images, migration logs, both health endpoints','Both 200; no frontend container'),
('Step 2','Done','BulkOrderSeeder.php','Exact Appendix C; time and row counts','300,004 orders; 749,372 items'),
('Step 3','Done','baseline/explain-before.txt','Six original query plans and indexes','Recorded before new indexes'),
('Step 4','Done','perf/k6/; baseline/k6-*','Three runs per scenario after SDK repair','All valid baseline endpoint errors 0%'),
('Step 5','Done','New index migration; results/after-indexes/','Plans, both suites, all scenarios x3','Measured; optimizer caveats below'),
('Step 6','Done','DashboardController; OrderService','Body comparison, real writes, both suites, dashboard x3','Private scopes and shapes preserved'),
('Step 7','Done','Redis, ProductCache, ConditionalGet','One change at a time; both suites and relevant runs x3','Measured Redis, metadata, ETags'),
('T1','Done','None','GET /up and frontend','Both 200 initially and finally'),
('T2','Done','New index migration','migrate, SHOW INDEX, EXPLAIN, both suites','Existing migrations untouched'),
('T3','Done','BulkOrderSeeder.php','Appendix C copied; successful seed','109.983502 s'),
('T4','Done','DashboardController; OrderService; tests','Exact body comparison, scopes, invalidation, both suites','60-second cache; money strings retained'),
('T5','Done','Dockerfile; compose; .env.example; perf images','phpredis, cache probe, DB-1 keys, both suites','Redis shared by backend and scheduler'),
('T6','Done','OrderService; ProductController; NotificationService; tests','Timestamp ties, real page traversal, both suites','51/51 rows, no duplicates'),
('T7','Done','ProductCache; ProductController; ProductService; tests','Price visibility, cache content, warm live stock, both suites','Category reuse only; no stock caching'),
('T8','Done','ConditionalGet; bootstrap; routes; tests','200/304 empty body, fresh stock, both suites','Live gRPC retained even on 304'),
('T9','Done','OrderService; compensation tests; NotificationAfterCommitTest','Three synthetic timing runs each; both suites','Notification level 0; order retained on failure'),
('T10','Deferred','None','Measured results reviewed; user chose deferral','Read replica deferred by user'),
('T11','Done','None','Frontend contract reviewed; user chose existing totals','Pagination totals retained by user decision'),
('T12','Done','perf/k6/*.js','Four scenarios, fixed workload and seeded input','Raw JSON/log per run; median tables below'),
('T13','Done','None for web server','Current runtime measured; user chose existing server','Development server retained; CLI opcache 0'),
('T14','Done','DashboardCache; controllers/services; tests','Removed controller dependency and duplicate unused list; both suites','Admin product counts invalidate on product writes'),
('T15','Done','REPORT.md only for review','Actual API, types, query hooks, encoding and CORS','Findings below; no inventory source change'),
('T16','Done','Four approved frontend files; isolated perf/ui-tests/','Build, lint, 3 component/hook tests, live API checks','A–D implemented; full Brave check blocked'),
]
tasktable = '\n'.join('| '+' | '.join(row)+' |' for row in taskrows)
before = json.loads((OUT/'results/notification-before.json').read_text())
after = json.loads((OUT/'results/notification-after.json').read_text())
timing = []
for field in ['order_persistence_transaction_body_ms','order_call_ms']:
    timing.append(f"| {field} | {statistics.median(r[field] for r in before['runs']):.6f} | {statistics.median(r[field] for r in after['runs']):.6f} |")

report = f'''# Requirement 3 — Performance and caching

Date: 2026-11-07 (America/Los_Angeles). Agent: Codex. Status: PARTIAL (approved work and all behavior decisions complete; full browser verification remains outstanding).

## Summary

- Added performance indexes, scoped dashboard caching, shared Redis, stable pagination, product metadata caching and conditional GETs. Inventory source and existing response shapes are preserved; stock remains live.
- Short laptop workload: dashboard median p95 changed from 152.890 ms at baseline to 28.011 ms after refactoring; all valid k6 runs had 0% endpoint errors. Index-only results were mixed.
- Seeded 300,000 bulk orders without resetting the main database; final totals remain 300,004 orders and 749,372 items after verification-fixture cleanup.
- Implemented approved frontend A–D and delegated T9 choice: notification failures log after commit and preserve successful orders. Final checks: 32 default tests passed, 1 skipped; 3 MySQL tests passed; 3 frontend component tests passed; frontend build/lint passed.
- User deferred T10 read replica, retained T11 pagination totals and retained T13 development server. No behavior decisions remain open. Automatic policy review blocked Brave remote-control launch; component and live API checks were performed instead.

## Environment

Windows 11 Pro 10.0.26300; native Docker Engine in Ubuntu 26.04.1 on WSL 2. Docker Desktop was removed per user request (version not applicable). Docker sees 6 CPUs and 6,214,504,448 bytes RAM initially, 6,214,508,544 finally; host visible RAM 10,358,576 KiB. Docker Compose v5.7.0. Laravel 12.70.1 (instructions say 11), PHP 8.2.35, MySQL 8.0. k6 v2.3.0, commit e088784614, Go 1.27.1.
Full command output: [initial environment](docs/performance/baseline/environment.txt), [final runtime](docs/performance/results/final-runtime.txt), [docker compose images](docs/performance/results/final-images.txt). Backend/scheduler final image ID 52f9dd077b26; both use the same final source. Tests used separate databases and accounts.

## Code state

Original HEAD: `b9514cbe00b7d310cc2972aff728a9d690bc2a3b`. No commit created. Initial status:
```text
 M frontend/src/routeTree.gen.ts
?? AGENT_INSTRUCTIONS_REQUIREMENT_3.md
```
Initial `git diff --stat` had no content changes, only an LF/CRLF warning. Existing routeTree change preserved. Final `git status --short`:
```text
{status}
```
Final `git diff --stat` (tracked files; new files listed separately):
```text
{diff}
```
Every changed file: [tracked manifest](docs/performance/results/changed-files.txt). Every new file, including individual raw artifacts: [new-file manifest](docs/performance/results/new-files.txt). New application files are the middleware, cache classes, SDK adapters, index migration, seeder and tests listed above; perf/ contains reproducible runners and the isolated UI harness. Inventory source diff is empty. `git diff --check` exits 0; line-ending warnings are retained in the raw outputs. [Initial snapshots](docs/performance/baseline/git-status-start.txt), [final snapshots](docs/performance/results/git-status-end.txt), [diff output](docs/performance/results/git-diff-end.txt).

## Task log

| Task | Status | Files changed | Verification performed | Result |
|---|---|---|---|---|
{tasktable}

## Dataset

| Stage | users | products | orders | order_items |
|---|---|---|---|---|
| Initial | 4 | 15 | 4 | 7 |
| After bulk seed / final | 5,004 | 15 | 300,004 | 749,372 |

Seeder elapsed time: 109.983502 seconds. Counts were captured at each load stage and after deleting only owned verification fixtures. Main schema was never reset. [Seed output](docs/performance/baseline/dataset.txt), [final counts](docs/performance/results/final-counts.txt).

## Measurements

{measurements}

Products and orders sometimes became slower after indexes; no improvement is claimed for those stages. ETags primarily saved response bytes: product detail median received bytes changed from 182,569 after metadata caching to 112,267 after ETags, with 64 conditional hits. Detail p95 was 30.677 ms versus 31.550 ms, so no latency benefit is claimed. Scenarios were rerun only when relevant to the change; omitted cells are not measured.

## EXPLAIN evidence

{chr(10).join(explain)}

## Verification results

| Check | Command / evidence | Result |
|---|---|---|
| Default suite | `python perf/requirement3.py tests after-notifications` runs `php artisan test --no-ansi` with SQLite/array cache | 32 passed, 1 skipped, 247 assertions; 0 failed |
| MySQL/gRPC suite | Same runner runs `php vendor/bin/phpunit --configuration phpunit.mysql.xml --colors=never` against guarded test DB | 3 passed, 22 assertions; 0 failed |
| Frontend build/lint | `python perf/requirement3.py frontend-checks` | Both exit 0; existing lint/chunk warnings |
| Components and real query hooks | `npm.cmd exec -- vitest run` in `perf/ui-tests` | 3 passed, 0 failed; mocked APIs, not a full browser |
| Health / CORS | `python perf/final_checks.py` | /up and frontend 200; preflight 204 allows Origin `*` and authorization/content-type/if-none-match |
| Dashboard shapes | `snapshot` and `stage-dashboard`; `results/dashboard-response-check.txt` | Actual admin and two customers unchanged; sales string, customer users null |
| Order visibility/invalidation | `python perf/api_write_verify.py`; real MySQL integration | Customer orders 2→3 immediately; sales 2107.97→2109.22, then cancellation restores sales |
| Live stock / outage | Same live API runner | Warm stock 10→9→10; inventory stopped: conditional detail and order both 503; same-key recovery/replay creates one order |
| Price / deletion | Same live API runner | Warm price changes immediately; delete returns 404 and refreshes admin count |
| Conditional GET | `python perf/requirement3.py verify-etag` | 200 then 304 with 0-byte body; stock change returns fresh 200/ETag |
| Pagination | `python perf/requirement3.py verify-pagination` and tied-timestamp feature test | 51/51 customer orders over 4 pages; exact DB order, no duplicates |

Both backend suites were run after each applied backend task; each stage retains its test output. The single skip exercises an absent gRPC extension, whereas this environment has it. After-commit integration uses actual commits and proves notification failure at level 0 keeps one completed order and replays without another reservation. Original compensation checks now fail the order write rather than notification creation, retaining rollback/stock-release coverage.

Notification timing uses a synthetic 50 ms notification delay, three runs per side, in guarded test schemas with fake reservation confirmation. These are median milliseconds, not production HTTP timings or complete lock-duration measurements:

| Metric | Before | After |
|---|---|---|
{chr(10).join(timing)}

Notification transaction levels were [1,1,1] before and [0,0,0] after. Time moved out of the persistence transaction body; overall synchronous order-call time is essentially unchanged. Final backend/scheduler images were rebuilt and deployed, followed by health and ETag checks. Key source-file SHA-256 hashes match the working source in both images (`results/final-source-verification.json`). Dedicated test containers were stopped; one hidden WSL session remains to keep native Docker available and main services are healthy (`results/test-resource-cleanup.txt`, `results/final-runtime.txt`).

## Problems and deviations

{problems}

## Decisions

T8: standard body-based ETag completed; live gRPC still runs before every product-detail response, including 304. The advanced stock-version/skip-gRPC alternative was not implemented.
T9: user reopened the earlier rollback answer, then delegated the accurate/reasonable choice. Selected after-commit creation with error logging; a notification failure preserves the committed order. Earlier rollback choice superseded. No automatic notification retry/queue was added.
T10: user explicitly chose to defer the read replica after reviewing the measured results; no replica was added.
T11: user explicitly chose to keep current pagination totals; existing API and frontend pagination contracts are retained.
T13: user explicitly chose to keep the current development server; artisan serve and current OPcache settings are retained. This is a development choice, not a production deployment recommendation. All behavior decisions are resolved.
T16: user approved A–D; implemented and checked. E was unnecessary because UTF-8 Arabic source was already correct.

## Frontend review

1. Contracts: existing endpoints, JSON envelopes, pagination totals and dashboard types preserved; total_sales remains string and total_users nullable. Backend response comparisons passed.
2. Freshness: T15 found missing dashboard/stock invalidation. Approved T16 now invalidates dashboard, order lists and product details after order create/status changes. Product create/delete refresh dashboard; delete refreshes details. The existing two-minute query staleTime remains.
3. Conditional requests: API client has no no-store setting. Browser revalidation is possible; React Query still controls when requests occur. Private/no-cache ETags do not bypass live stock.
4. Stock unavailable: existing product page recognizes 503 and shows the inventory-unavailable state. Live conditional GET correctly returns 503 while inventory is stopped.
5. Base URL stays `http://localhost:8000/api`. Project `config/cors.php` is absent; actual preflight allows Origin `*` and requested bearer-auth/conditional headers. The compose CORS setting is not asserted as an effective origin restriction.
6. Idempotency: API now requires an explicit key. ProductDetails retains one key for the same item attempt across failures, resets after success and changes it when quantity/product changes. Component tests cover these paths; live API confirms one order for same-key replay.
7. Encoding: Arabic is valid UTF-8 and unchanged. UI build/lint passed. Component tests use controlled API fixtures plus actual query/mutation hooks; real API/gRPC verification is separate. Brave UI flow was not performed due to policy rejection.

## Trade-offs and limitations

Dashboard TTL is 60 seconds. Order writes invalidate the affected customer and shared admin entry; product writes clear admin counts. Other customers' global counts can remain old until TTL. Product metadata TTL is 300 seconds: only category relation is reused; route binding controls current price/visibility, and stock is never cached. Category changes outside ProductService may wait for TTL.
Every product detail, including 304, calls inventory live. Redis uses the requested 512mb/allkeys-lru; memory pressure can evict rate-limiter/lockout counters. Notification failures are logged without automatic delivery retries. Existing response shapes and pagination totals are retained.
The test uses a paced 5-VU workload, not production capacity. WSL restarts and host-memory pressure occurred between stages, so small latency differences are not statistically established. Opcache CLI remains 0 and artisan serve remains a development server. Replica consistency, total-free pagination and nginx/FPM performance are not measured. Full browser validation remains outstanding.

## How to reproduce

Run from `E:\\projects\\internet-applications` in PowerShell with Ubuntu/native Docker running. The existing deployment already contains every approved change. Do not rerun seed/apply commands on this populated database. `perf/README.md` explains safe current-state checks and the historical ladder, including the isolated source/database requirement for a fresh baseline.
Current-state verification commands (previously run in this order of dependency; the test container must be running):
```powershell
python perf/requirement3.py tests after-notifications
python perf/requirement3.py frontend-checks
python perf/requirement3.py verify-pagination
python perf/requirement3.py verify-etag
python perf/api_write_verify.py
Set-Location perf/ui-tests
npm.cmd install --ignore-scripts --no-audit --no-fund
$env:RAYON_NUM_THREADS='1'
$env:UV_THREADPOOL_SIZE='1'
$env:NODE_OPTIONS='--max-old-space-size=768'
npm.cmd exec -- vitest run --reporter=json --outputFile=E:/projects/internet-applications/docs/performance/results/frontend-component-tests.json
Set-Location ../..
python perf/final_checks.py
```
The MySQL suite/timing harness reset only the dedicated `ecommerce_test` schema after checking database/account identity. Live API checks briefly stop inventory, restore it in finally, and delete only tagged fixtures; run when no other user is placing orders. Repeated load runs overwrite that stage's files; copy evidence first. No migration rollback was tested.

## Raw outputs

- `docs/performance/baseline/`: environment, initial git state, dataset/time, corrected source archive, original plans, four scenarios × three JSON/log pairs. `discarded-before-dependency-repair/` retains failed-runtime runs excluded from comparisons.
- `docs/performance/results/after-indexes/`, `after-dashboard/`, `after-redis/`, `after-pagination/`, `after-product-cache/`, `after-etag/`, `after-refactor/`: stage datasets, test outputs, relevant k6 runs. [Computed medians](docs/performance/results/summary.json); [plan extraction](docs/performance/results/explain-summary.json).
- [Final default suite](docs/performance/results/after-notifications/tests-artisan.txt), [MySQL suite](docs/performance/results/after-notifications/tests-mysql.txt); [before timing](docs/performance/results/notification-before.json), [after timing](docs/performance/results/notification-after.json).
- [Live write/outage checks](docs/performance/results/live-api-verification.json), [fixture cleanup counts](docs/performance/results/live-api-cleanup-counts.txt), [pagination](docs/performance/results/pagination-completeness.json), [ETag](docs/performance/results/etag-check.json), [CORS](docs/performance/results/cors-preflight.json), [dashboard bodies](docs/performance/results/dashboard-response-check.txt).
- `docs/performance/results/frontend/`: successful bounded build and lint (the first allocation failure was observed in tool output; its raw build log was not retained separately); [component results](docs/performance/results/frontend-component-tests.json), [observations](docs/performance/results/frontend-component-evidence.json), and failed harness attempts. Runtime build/start logs and final image/health/count/git snapshots are in `results/`.
'''
path.write_text(report, encoding='utf-8')
print(f'Wrote REPORT.md: {len(report.splitlines())} lines')
