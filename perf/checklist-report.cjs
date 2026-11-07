const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function read(file) {
  const bytes = fs.readFileSync(path.join(root, file));
  return bytes.toString(bytes[0] === 255 && bytes[1] === 254 ? 'utf16le' : 'utf8').replace(/^\uFEFF/, '');
}
const json = file => JSON.parse(read(file));
const spec = json('for frontend.json');
let referenceCount = 0;
const operationIds = new Set();
function validateReferences(value) {
  if (!value || typeof value !== 'object') return;
  if (typeof value.$ref === 'string' && value.$ref.startsWith('#/')) {
    const found = value.$ref.slice(2).split('/').reduce((node, key) => node?.[key.replace(/~1/g, '/').replace(/~0/g, '~')], spec);
    if (!found) throw new Error('Unresolved OpenAPI reference: ' + value.$ref);
    referenceCount++;
  }
  for (const child of Object.values(value)) validateReferences(child);
}
validateReferences(spec);
for (const item of Object.values(spec.paths)) {
  for (const operation of Object.values(item)) {
    if (operation?.operationId) {
      if (operationIds.has(operation.operationId)) throw new Error('Duplicate operationId: ' + operation.operationId);
      operationIds.add(operation.operationId);
    }
  }
}
if (!spec.paths['/notifications/events']?.get?.security) throw new Error('Event feed auth missing from contract.');
fs.writeFileSync(path.join(root, 'docs/checklist/final/openapi-validation.json'), JSON.stringify({
  parsed: true, openapi: spec.openapi, local_references_resolved: referenceCount,
  unique_operation_ids: operationIds.size, event_feed_security_documented: true,
}, null, 2) + '\n');
function ev(file, needle) {
  const number = needle ? read(file).split(/\r?\n/).findIndex(line => line.includes(needle)) + 1 : 1;
  if (!number) throw new Error('Missing evidence: ' + file + ' / ' + needle);
  return '[' + path.basename(file) + ' L' + number + '](./' + file + ')';
}
const app = 'backend/my-project/';
const feature = name => app + 'tests/Feature/' + name + '.php';
const code = name => app + 'app/' + name + '.php';
const finalTests = 'docs/checklist/final/tests.txt';
const mysqlTests = 'docs/checklist/final/mysql-tests.txt';
const httpRace = 'docs/checklist/requirement-2/professor-fixes/concurrency/result.json';
const replica = 'docs/checklist/requirement-3/professor-fixes/replica/verification.json';
const cache = 'docs/checklist/requirement-3/cache-http-verification.json';
const plans = 'docs/checklist/requirement-3/database-current.json';
const benchmarks = 'docs/checklist/requirement-3/benchmark-summary.json';
const source = (name, needle) => ev(code(name), needle);
const test = (name, needle) => ev(feature(name), needle);
const proof = [ev(finalTests, 'Tests:'), ev(mysqlTests, 'OK (')];
const rows = new Map();
function add(ids, evidence, finding, status = 'PASS', action = 'None.') {
  for (const id of ids.split(' ')) {
    if (rows.has(id)) throw new Error('Duplicate ' + id);
    rows.set(id, { status, evidence: evidence.join('; '), finding, action });
  }
}
add('P01 F01', [test('ApiWorkflowTest', 'test_registration_login'), ...proof], 'Registration, catalog and order workflows execute successfully.');
add('P02 P06', [ev('proto/inventory.proto'), ev(mysqlTests, 'OK (')], 'Laravel and Node cooperate over actual gRPC; inventory has its own MySQL server.');
add('P03 P11', [ev(httpRace), ev(mysqlTests, 'GRPC_CONCURRENCY_EVIDENCE')], 'Thirty simultaneous HTTP orders and thirty independently started RPCs each accepted only the last available unit. Failure cases are exercised.');
add('P04', [source('Http/Controllers/NotificationController', 'function events'), test('NotificationEventsTest', 'test_reconnecting'), ev(finalTests, 'NOTIFICATION_EVENTS_EVIDENCE')], 'Authenticated SSE notification snapshots advertise two-second reconnects; new notifications and read-state changes are visible without a long-held worker. Stock is also queried live.');
add('P05', [source('Http/Middleware/SecurityHeaders', 'X-Content-Type-Options'), test('ApiWorkflowTest', 'test_order_policy_access_control'), ...proof], 'JWT, server-side roles/ownership, login lockout, JSON errors and security headers are implemented and tested.');
add('P07', [ev(benchmarks), ev(plans)], 'Measured query/index/cache improvements and fresh load tests are retained; the dashboard tail-latency limitation is disclosed below.');
add('P08', [ev(app + 'routes/console.php', 'Schedule::command'), source('Console/Commands/RetryInventoryCompensations', 'function handle'), test('ApiWorkflowTest', 'test_retry_command')], 'A separate scheduler asynchronously retries durable failed releases and recovers abandoned confirmed reservations.');
add('P09', [ev('docker-compose.yml', 'mysql-replica:'), ev(replica)], 'Independent services, shared Redis and a working read replica address scaling. No unstated autoscaling or capacity target is imposed.');
add('P10', [ev('docker-compose.yml', 'healthcheck:'), source('Services/OrderService', 'Log::critical'), ev('docs/checklist/final/backend-services.txt')], 'Docker health checks and application/error logs are active; service health is recorded.');
add('F02 F03 F04', [test('ApiWorkflowTest', 'test_product_images'), test('ChecklistAcceptanceTest', 'test_category_filter'), ...proof], 'Admin product creation, raster upload/storage, display and filtered pagination pass.');
add('F05 F06', [ev(mysqlTests, 'MULTI_PRODUCT_EVIDENCE'), ev(httpRace)], 'Order creation reserves stock atomically, rejects shortages and returns stock on cancellation or failed persistence.');
add('F07', [source('Http/Resources/OrderResource', "'status'"), test('ApiWorkflowTest', 'test_admin_status_changes'), ...proof], 'Order details expose current status, authorized transitions work, and notifications record changes.');
add('A01', [ev(app + 'composer.json', 'laravel/framework'), ev('inventory-service/package.json', '@grpc/grpc-js')], 'Main API: PHP 8.2/Laravel 12. Inventory: Node.js/TypeScript with grpc-js.');
add('A02 A03 A04 A05 A06', [ev(app + 'routes/api.php'), source('Http/Controllers/UserController', 'class UserController'), source('Services/ProductService', 'class ProductService'), source('Services/OrderService', 'class OrderService'), source('Services/NotificationService', 'class NotificationService')], 'Separate controllers, requests, policies, services and models cover users, products, orders and notifications.');
add('A07', [ev('docker-compose.yml'), ev('docs/checklist/final/backend-services.txt')], 'All required backend services run in Docker. Entire-project/frontend Docker verification is excluded by the user’s explicit backend-only scope.', 'UNVERIFIED', 'Verify the frontend/full stack only if the user later requests that scope.');
add('A08 A09 A10 A11 A12 A13', [source('Http/Controllers/ProductController', 'function index'), test('ApiWorkflowTest', 'test_product_images'), test('ChecklistAcceptanceTest', 'test_category_filter'), ...proof], 'REST product creation/upload/listing/category filtering/pagination pass. Following next links now preserves category, page size and search query parameters.');
add('A14 A15 A16', [source('Http/Controllers/OrderController', 'function store'), ev(mysqlTests, 'DASHBOARD_RESPONSE_CHECK'), test('ChecklistAcceptanceTest', 'test_order_pagination_links')], 'JWT order REST endpoints create and display orders; filtered pagination remains scoped when links are followed.');
add('A17 A18', [source('Services/OrderService', 'function updateStatus'), test('ChecklistAcceptanceTest', 'test_stale_order_instances'), test('ApiWorkflowTest', 'test_admin_status_changes'), ...proof], 'Status changes reload and lock the current row. Cancellation releases stock; stale models cannot revive cancelled orders.');
add('A19 A20', [ev(app + 'bootstrap/app.php', 'shouldRenderJsonWhen'), ev('docs/checklist/requirement-1/live-errors-final.json'), test('ChecklistSecurityTest', 'test_api_errors'), ev(mysqlTests, 'INVENTORY_FAILURE_EVIDENCE')], 'Appropriate 201/401/403/404/409/422/429/503 statuses are tested. Errors have a message and optional validation errors/domain code; missing Accept headers no longer cause 500 redirects. Docker debug traces are disabled.');
add('A21 A22', [ev('for frontend.json'), ev('for frontend.yaml'), ev('README.md', 'Trying the API')], 'OpenAPI 3.0.3 contracts describe bearer auth, multipart uploads, required idempotency UUIDs and operations; README explains import/use. Local references are validated.');
add('A23', [ev(app + 'config/auth.php', "'driver' => 'jwt'"), test('ApiWorkflowTest', 'test_registration_login'), ...proof], 'Real JWT login, protected identity, missing/invalid tokens and logout invalidation pass.');
add('A24 A25 A26', [source('Http/Middleware/EnsureAdmin', "role !== 'admin'"), source('Services/AuthService', "role = 'customer'"), test('ApiWorkflowTest', 'test_customers_cannot_manage_products')], 'Registration assigns customer on the server; admin-only writes and customer permissions are enforced in middleware/policies.');
add('A27 A28 A29', [source('Policies/OrderPolicy', 'function view'), source('Services/OrderService', 'function getUserOrders'), test('ChecklistAcceptanceTest', 'test_capture_owner'), ev(finalTests, 'AUTHORIZATION_EVIDENCE')], 'The owner gets 200, another customer gets 403, and an admin gets 200. Customer lists query the authenticated user relation; admin lists are protected.');
add('A30', [ev(app + 'routes/api.php', '/admin/orders/{order}/status'), test('ApiWorkflowTest', 'test_admin_status_changes'), ...proof], 'Only authenticated admins can change status, subject to valid state transitions.');
add('A31', [source('Http/Controllers/AuthController', '$attempts >= 5'), test('ApiWorkflowTest', 'test_login_failed_attempts'), ...proof], 'Five failed attempts within the minute activate a five-minute IP lockout with Retry-After; expiry and independent clients are tested.');
add('A32', [source('Http/Middleware/SecurityHeaders', 'X-Content-Type-Options'), ev('docs/checklist/requirement-1/live-errors-final.json')], 'Actual successful and rejected responses carry nosniff, DENY and strict-origin-when-cross-origin headers.');
add('A33 A34', [test('ChecklistAcceptanceTest', 'test_capture_owner'), ev(finalTests, 'AUTHORIZATION_EVIDENCE')], 'Retained HTTP-kernel requests/responses show 403 for another customer’s order and a customer’s admin status-change attempt, with owner/admin positive controls.');
add('G01 G02 G03 G04 G05', [ev('inventory-service/src/server.ts', 'addService'), ev('inventory-service/src/database/pool.ts'), source('Services/InventoryGrpcClient', "call('ReserveStock'"), ev('docker-compose.yml', 'inventory-mysql:'), ev(mysqlTests, 'OK (')], 'Independent TypeScript/grpc-js server and separate inventory MySQL cooperate directly with PHP/Laravel. No direct inventory-DB fallback exists in the main app.');
add('G06 G07 G08 G09', [ev('proto/inventory.proto')], 'Shared protobuf defines GetStock, ReserveStock with repeated items and ReleaseStock. Real transport tests use this contract.');
add('G10 G11', [source('Http/Controllers/ProductController', 'getStock($product->id)'), ev(mysqlTests, 'DASHBOARD_RESPONSE_CHECK'), test('ApiWorkflowTest', 'test_product_detail_uses_confirmed')], 'Each detail request calls inventory and includes confirmed available stock. An outage produces 503 rather than invented stock.');
add('G12 G13 G14', [source('Services/InventoryGrpcClient', 'function reserveStock'), ev('inventory-service/src/services/inventory-service.ts', 'FOR UPDATE'), ev(mysqlTests, 'MULTI_PRODUCT_EVIDENCE')], 'One repeated-items RPC checks all rows under transaction locks and commits all reservations together. A short item rolls the entire reservation back.');
add('G15 G16 G17 G18', [ev(mysqlTests, 'MULTI_PRODUCT_EVIDENCE'), ev(httpRace)], 'Sufficient requests create orders; shortages return 409/INSUFFICIENT_STOCK with a clear message and no partial order.');
add('G19 G20 G21 G22', [source('Services/InventoryGrpcClient', "['timeout' => $this->timeoutMicros]"), ev(app + 'tests/Integration/InventoryFailureIntegrationTest.php', 'test_unresponsive_inventory'), ev(mysqlTests, 'INVENTORY_FAILURE_EVIDENCE')], 'Default deadline is five seconds. A real unresponsive TCP endpoint is tested with a one-second deadline; bounded 503 responses explain unavailability or uncertain reservation outcome. No order is saved.');
add('G23', [ev(app + 'tests/Integration/InventoryOrderIntegrationTest.php', 'test_failed_order_persistence'), test('ApiWorkflowTest', 'test_failed_order_save'), ev(mysqlTests, 'OK (')], 'An actual post-reservation persistence exception rolls back the order and returns real MySQL reserved quantity to zero. Unconfirmed releases are recorded for retry.');
add('G24 G25 G26', [ev(httpRace), ev(mysqlTests, 'GRPC_CONCURRENCY_EVIDENCE')], 'Both 30-request proofs start with stock 1, accept exactly 1, reject 29 and leave stock 0; the HTTP proof persists one item and replays the same key without duplication.');
add('C01 C02 C03', [ev(app + 'database/seeders/BulkOrderSeeder.php', 'DEFAULT_ORDER_COUNT'), ev('docs/performance/baseline/dataset.txt'), ev(plans, 'counts')], 'Retained successful seed output generated 300,000 synthetic orders. Verified totals: 5,004 users, 15 products, 300,004 orders, 749,372 items. No application database reset was run in this audit.');
add('C04 C05 C06 C07', [ev('docs/performance/baseline/explain-before.txt'), ev('docs/performance/results/after-indexes/explain-after.txt'), ev(plans), ev(app + 'database/migrations/2026_11_05_000001_add_performance_indexes.php')], 'Slow sorts/scans were analyzed and indexed. Saved plans show shipped-order lookup 303 to 5.04 ms and unfiltered order lookup 333 to 10.4 ms. Mixed/regressed plans are explicitly retained.');
add('C08', [test('QueryScalingTest', 'test_product_and_order_lists'), ev(finalTests, 'QUERY_SCALING')], 'Eager category/items/product loading prevents N+1 growth: product list query counts 3 to 3 and order list counts 4 to 4 as the fixture grows.');
add('C09 C10 C11', [source('Services/ReadReplicaRouter', 'GTID_SUBSET'), ev(replica), ev('docs/checklist/requirement-3/replica-verification.txt')], 'Caught-up reads execute on server 2. Paused replication routes writers and anonymous readers to primary/server 1; immediate create/update stays visible, even after the five-second writer marker expires. Catch-up restores server 2.');
add('C12 C13 C14', [source('Services/ProductCache', '300'), source('Http/Controllers/DashboardController', 'CACHE_TTL_SECONDS = 60'), ev(cache), test('PerformanceCachingTest', 'test_product_and_dashboard_cache_expiry')], 'Actual Redis stores frequently read metadata/aggregates with measured TTLs 300/60 seconds. A real one-second probe expires; declared application TTL expiry is also tested with time travel.');
add('C15 C16', [source('Services/ProductCache', 'function forgetCategory'), source('Services/ProductService', '$this->cache->forget'), source('Services/DashboardCache', 'function forgetCache'), ev(cache)], 'Product/category edits and deletion invalidate affected snapshots; order writes invalidate owner/admin aggregates. The stale-category/incorrect-304 regression is fixed.');
add('C17 C18', [ev('README.md', 'Cache policy'), source('Services/ProductCache', "unset($attributes['stock'])"), source('Http/Controllers/ProductController', 'getStock($product->id)')], 'Cache product metadata/category relations and explicitly scoped aggregates. Never cache stock, reservation decisions, shared private order responses or event feeds. Authoritative price/visibility still come from the verified DB connection.');
add('C19', [ev(cache), test('PerformanceCachingTest', 'test_category_edits'), ...proof], 'Real Redis/HTTP checks warm a product, edit its category/price, verify new 200/ETag/body, revalidate unchanged 304 and verify deletion 404.');
add('C20 C21 C22 C23', [source('Http/Middleware/ConditionalGet', 'setEtag'), ev(cache, 'unchanged'), test('PerformanceCachingTest', 'test_etag_revalidates')], 'If-None-Match returns 304 with exactly zero body bytes for unchanged data. Changes return fresh 200; stock is queried before the ETag decision.');
add('C24 C25 C26 C27 C28 C29 C30', [ev('perf/k6/common.js', 'summaryTrendStats'), ev(benchmarks), ev('docs/performance/baseline/environment.txt')], 'k6 baseline and staged after runs retain all three percentiles. This audit adds 12 current runs and three dashboard repeats, all with zero endpoint errors. Historical improvements and current tail-latency variation are distinguished below.');
add('C31 C32 C33', [ev(benchmarks), ev(cache), ev('REPORT.md', 'Measurements')], 'The behavior/user-impact discussion below explains query plans, cache warmth, replica fences, bodyless 304s, product/category edits and the unresolved wording of the original product-display scenario.');
const cross = {
  E01: 'A33', E02: 'A34', E03: 'G24', E04: 'G26', E05: 'G17', E06: 'G19', E07: 'G20',
  E08: 'G23', E09: 'C05', E10: 'C08', E11: 'C11', E12: 'C19', E13: 'C23', E14: 'C29', E15: 'C33',
};
for (const [id, target] of Object.entries(cross)) {
  const row = rows.get(target);
  rows.set(id, { ...row, finding: 'Evidence inventory cross-reference ' + target + ': ' + row.finding });
}
const criteria = [];
for (const line of read('check.md').split(/\r?\n/)) {
  const match = line.match(/\b([PFAGCE]\d{2})\.\s*(.+)/);
  if (match && !criteria.some(item => item.id === match[1])) {
    criteria.push({ id: match[1], text: match[2].replace(/\\([&.#\[\]-])/g, '$1') });
  }
}
if (criteria.length !== 126 || rows.size !== 126) throw new Error('Expected 126 individually mapped criteria.');
const counts = { PASS: 0, PARTIAL: 0, FAIL: 0, UNVERIFIED: 0 };
for (const item of criteria) {
  if (!rows.has(item.id)) throw new Error('Missing ' + item.id);
  counts[rows.get(item.id).status]++;
}
const summary = json(benchmarks);
const lines = [
  '# Backend checklist audit', '',
  ...(fs.existsSync(path.join(root, 'PERFORMANCE_GUIDE_AR.html')) ? [
    'Later focused performance follow-up: [Arabic RTL guide](./PERFORMANCE_GUIDE_AR.html) and [new six-topic results](./docs/performance/focused-review/REVIEW.md). That follow-up adds backend gzip and records 54 default tests plus seven integration tests; the original 126-item audit and its evidence below are retained.', '',
  ] : []),
  'Date: 2026-11-07 (America/Los_Angeles). Verdict: backend requirements verified after fixes; whole-project Docker/frontend certification is outside the user-approved scope.', '',
  'Counts across all 126 original criteria: **' + counts.PASS + ' PASS, ' + counts.PARTIAL + ' PARTIAL, ' + counts.FAIL + ' FAIL, ' + counts.UNVERIFIED + ' UNVERIFIED**. A07 is the sole scoped exclusion: backend Docker services are verified, while the user explicitly excluded frontend work/builds. No backend acceptance blocker remains.', '',
  'The main requirements were checked in order: API/security, then gRPC/transactions/failures/concurrency, then performance/caching. Final cross-cutting checks added the private notification event feed and corrected pagination links. Implementation is distinguished from live HTTP, real transport/database tests and retained historical measurements in the evidence below.', '',
  '## Changes and final verification', '',
  '- Added API security headers, JSON errors without Accept, and disabled Docker debug traces.',
  '- Fixed startup to discard stale configuration, read runtime secrets, use an authenticated PDO readiness probe and run migrations against the primary.',
  '- Locked current order rows during status transitions so stale models cannot revive cancelled orders.',
  '- Fixed category edits leaving stale product cache entries/ETags and pagination links losing filters/page size.',
  '- Added JWT-protected, private SSE notification snapshots with a two-second reconnect interval; no frontend source was changed.',
  '- Final suite: ' + read(finalTests).split(/\r?\n/).find(line => line.includes('Tests:')).trim() + '. Real MySQL/gRPC: ' + read(mysqlTests).split(/\r?\n/).find(line => line.includes('OK (')).trim() + '.', '',
  'Incoming uncommitted replica-router code/tests and replication helpers were preserved. The original checklist was not rewritten or marked complete by assertion. All live catalog/order fixtures were uniquely owned and cleaned; original dataset counts were restored. No commits or deployments outside the local project were made.', '',
  '## Individual criteria', '',
  '| ID | Status | Evidence | Finding / missing detail | Required next action |',
  '| --- | --- | --- | --- | --- |',
];
for (const item of criteria) {
  const row = rows.get(item.id);
  lines.push('| ' + item.id + ' | ' + row.status + ' | ' + row.evidence + ' | ' + item.text.replace(/\|/g, '\\|') + ' ' + row.finding + ' | ' + row.action + ' |');
}
lines.push('', '## Measurements and their limits', '',
  'Medians of three run-level percentile values, milliseconds. The archived before/after table is reconstructed from retained raw k6 JSON, not claimed as a fresh execution of the old source. Dataset: ' + JSON.stringify(summary.counts) + '. Historical source snapshot, environment, staged plans and commands remain in [REPORT.md](./REPORT.md) and [the baseline archive](./docs/performance/baseline/baseline-source.zip).', '',
  '| Scenario | Before p50 | After p50 | Before p95 | After p95 | Before p99 | After p99 |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
const f = number => number.toFixed(3);
for (const [scenario, stages] of Object.entries(summary.scenarios)) {
  const before = stages.archived_before, after = stages.archived_after;
  lines.push('| ' + scenario + ' | ' + [before.p50, after.p50, before.p95, after.p95, before.p99, after.p99].map(f).join(' | ') + ' |');
}
lines.push('', 'Fresh runs in this audit use the same data, five VUs, 5/20/5-second ramp/hold/down, one-second think time, existing rate limits, and the internal proxy. Login is excluded from the endpoint-duration trend. Three runs per scenario completed with no endpoint errors. The fresh configuration includes a replica and GTID fences, unlike the old staged after runs. These runs precede only the final pagination-link and notification-route additions; those final changes are covered by the final regression suites and live smoke check.', '',
  '| Fresh scenario | p50 | p95 | p99 | requests/s | endpoint errors |',
  '| --- | ---: | ---: | ---: | ---: | ---: |');
for (const [scenario, stages] of Object.entries(summary.scenarios)) {
  const current = stages.current_backend;
  lines.push('| ' + scenario + ' | ' + [current.p50, current.p95, current.p99, current.requests_per_second].map(f).join(' | ') + ' | 0% |');
}
const warm = summary.scenarios.dashboard.warm_repeat;
lines.push('| dashboard unchanged warm repeat | ' + [warm.p50, warm.p95, warm.p99, warm.requests_per_second].map(f).join(' | ') + ' | 0% |', '',
  'The first fresh dashboard batch had high tails: p95 767.839 ms and p99 901.289 ms across run medians. Its third run alone had p95 39.456 ms. Repeating the unchanged workload after warm-up produced the separate repeat row above. No code optimization was applied between these batches. Startup/cache warmth or host contention are possible explanations, not established causes; the initial slow runs are retained. These paced laptop tests do not establish maximum capacity or a latency guarantee.', '',
  'All benchmark source paths, request rates and zero-error validation are in [benchmark-summary.json](./docs/checklist/requirement-3/benchmark-summary.json). Resource observations are in [resources-after.txt](./docs/checklist/requirement-3/resources-after.txt). No CPU or memory measurements are invented for the individual historical runs.', '',
  '## Query, cache and consistency behavior', '',
  'Saved EXPLAIN ANALYZE shows the shipped-order query changing from a full scan of 300,004 rows (303 ms) to an indexed 15-row lookup (5.04 ms), and the unfiltered order list from 333 to 10.4 ms. Not every plan became faster: the recorded global non-cancelled count changed from 159 to 718 ms, and the user-history timing from 2.21 to 10.5 ms despite examining fewer rows. The 15-product table can reasonably retain a scan. The original plans, mixed results and fresh current plans are retained; there is no claim that every index improved every query.', '',
  'Eager loading keeps list query counts constant as rows grow (products 3/3, orders 4/4). Dashboard aggregates use one order-table pass and a 60-second private/scoped cache. Product metadata lives for 300 seconds, but only the category relation is reused; authoritative price/visibility come from the verified database connection, and inventory always comes from gRPC. Product and category writes now invalidate their relevant entries. Aggregate counts unaffected by a specific invalidation may remain cached until their declared TTL.', '',
  'Read routing checks the primary GTID position against the replica. The actual paused-replica test demonstrated fallback to primary for anonymous readers and writers, including after the five-second writer marker expired, followed by return to the replica after catch-up. A topology alone was not accepted as consistency proof.', '',
  'ETag validation happens after obtaining the full current representation, including a live stock call. Unchanged data returns 304 with zero body bytes; it saves transfer, not all server work. A displayed product price/category edit changes the representation and ETag on the next request; deletion becomes 404, and order reservation changes current stock. A browser page already on screen still needs a client refresh/refetch to display changed product metadata; frontend behavior was explicitly excluded. The separate notification event feed offers reconnectable backend updates.', '',
  'The original image-3 sentence about modifying a displayed product is ambiguous, and the source images were not supplied in this workspace. C33 is addressed by the measured fresh price/category/ETag behavior above; no unobserved browser refresh behavior or exact intended instructor wording is claimed.', '',
  '## Reproduction and remaining scope', '',
  'On this machine Docker runs in Ubuntu WSL. Keep the WSL runtime active and use the existing isolated test containers. Direct PHPUnit now reads its mounted test password after verifying test database identity. Do not point these tests at the application schema.', '',
  '```powershell',
  'wsl.exe -d Ubuntu -- docker start ecommerce-laravel-test-mysql ecommerce-inventory-test-mysql ecommerce-inventory-test requirement3-tests',
  'wsl.exe -d Ubuntu -- docker exec -e DB_CONNECTION=sqlite -e DB_DATABASE=:memory: -e CACHE_STORE=array -e RUN_MYSQL_INTEGRATION_TESTS=false requirement3-tests php artisan test --no-ansi',
  'wsl.exe -d Ubuntu -- docker exec requirement3-tests php vendor/bin/phpunit --configuration phpunit.mysql.xml --colors=never',
  'wsl.exe -d Ubuntu -- docker cp /mnt/e/projects/internet-applications/perf/checklist-cache.php ecommerce-backend:/tmp/checklist-cache.php',
  'wsl.exe -d Ubuntu -- docker exec ecommerce-backend php /tmp/checklist-cache.php',
  'wsl.exe -d Ubuntu -- docker cp /mnt/e/projects/internet-applications/perf/checklist-database.php ecommerce-backend:/tmp/checklist-database.php',
  'wsl.exe -d Ubuntu -- docker exec ecommerce-backend php /tmp/checklist-database.php',
  'node perf/checklist-summary.cjs',
  'node perf/checklist-report.cjs',
  '```', '',
  'The current [live simultaneous-order helper](./perf/verify_concurrent_orders.py) and [replica lag helper](./perf/verify_replica.py) were run with their shared output root redirected to docs/checklist/requirement-2 and requirement-3, preserving historical artifacts. The replica helper always restarts replication and removes owned fixtures in finally. The [performance runner instructions](./perf/README.md) retain workload/reproduction details; avoid historical apply/seed commands on the completed deployment.', '',
  'Required next actions, in priority order: no backend implementation blocker remains. A07 can be certified for the entire application only in a later user-approved frontend/full-stack task. Keep the retained dashboard tail-latency variation visible when presenting C27–C32; investigate it under a controlled profiling workload if a stricter latency target is later requested.', '',
  'Failed attempts were retained: stale-model cancellation reproduction, stale-category 304 reproduction, filter-dropping pagination reproduction, and initial test/startup environment failures. They were resolved before the final passing runs. Frontend dependency/build attempts before the scope clarification are not counted as backend acceptance evidence.', '',
);
fs.writeFileSync(path.join(root, 'CHECKLIST_REPORT.md'), lines.join('\n'));
console.log(JSON.stringify({ criteria: criteria.length, counts, report: 'CHECKLIST_REPORT.md' }));
