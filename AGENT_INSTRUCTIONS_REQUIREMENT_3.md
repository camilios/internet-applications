# Agent Instructions: Requirement 3 — Performance & Caching

Project root: `internet-applications/`
Backend: `backend/my-project` (Laravel 11, PHP 8.2, MySQL 8.0)
Inventory service: `inventory-service` (Node, gRPC) — do not modify it for this requirement.
Frontend: `frontend` (React) — read-only review only (task T15). Do not modify it without approval.

## 0. Rules for the agent (read first)

1. **Do not change any JSON response shape** of existing endpoints. Frontend code depends on them.
2. **Never edit a migration that has already been created.** Add new migrations only.
3. **Never cache inventory stock.** Stock is owned by the inventory service and must always come from it (live gRPC call). Caching stock would show wrong quantities and reintroduce the race condition solved in Requirement 2.
4. **Measure before and after every optimization.** Follow the measurement ladder in section 1 exactly, one change per step, so each improvement can be attributed.
5. **Keep existing tests green.** Run `php artisan test` (and the MySQL suite via `phpunit.mysql.xml`) after each task.
6. **Record results** in `docs/performance/` (see section 1, step 0). Do not invent numbers. Only write numbers that were measured.
7. **Ask before doing any task marked DECISION REQUIRED.**
8. Write code comments and documentation in English.
9. Keep `REPORT.md` (project root) updated as you go, following section 4. It is the deliverable the user reads, so it must be complete, honest, and based only on what you actually ran.

Every new or replaced file is included in full in the appendices at the end of this document. Do not depend on any external folder:
- Appendix A: `backend/my-project/database/migrations/2026_11_05_000001_add_performance_indexes.php` (new)
- Appendix B: `backend/my-project/app/Http/Controllers/DashboardController.php` (replace the whole file)
- Appendix C: `backend/my-project/database/seeders/BulkOrderSeeder.php` (new)

---

## 1. Measurement ladder (run in this order)

Each step changes one thing. Steps 1–3 must happen on the **original** code, before any index or cache exists.

### Step 0 — Create the results folder
Create `docs/performance/` with:
- `baseline/` — EXPLAIN output and k6 summaries before any change
- `results/` — k6 summaries after each step
- `REPORT.md` is NOT in this folder. It goes at the project root (see section 4).

### Step 1 — Start the stack on the original code
```
docker compose up -d --build
```
Make sure the migrations ran (`docker compose logs backend`). **Do not add the index migration yet.**

### Step 2 — Generate the large dataset
Create `backend/my-project/database/seeders/BulkOrderSeeder.php` with the content in Appendix C.

Run it inside the backend container (PowerShell or bash both work):
```
docker compose exec -e BULK_ORDER_COUNT=300000 backend php artisan db:seed --class="Database\Seeders\BulkOrderSeeder"
```
- Record the total time and the final row counts:
  ```
  SELECT COUNT(*) FROM orders;      -- expect ~300,000 (+4 from OrderSeeder)
  SELECT COUNT(*) FROM order_items; -- expect ~750,000
  SELECT COUNT(*) FROM users;       -- expect ~5,000 bulk customers
  ```
- Save the output to `docs/performance/baseline/dataset.txt`.
- If the seeder fails midway, run `php artisan migrate:fresh --seed` (this drops everything and reseeds) and run this step again. Do not try to resume.

### Step 3 — Baseline EXPLAIN (before indexes)
Run each query with `EXPLAIN ANALYZE` and save the full output to `docs/performance/baseline/explain-before.txt`:
```sql
EXPLAIN ANALYZE SELECT * FROM products WHERE is_active = 1 ORDER BY created_at DESC LIMIT 15;
EXPLAIN ANALYZE SELECT * FROM products WHERE is_active = 1 AND category_id = 1 ORDER BY created_at DESC LIMIT 15;
EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 1 ORDER BY created_at DESC LIMIT 15;
EXPLAIN ANALYZE SELECT * FROM orders WHERE status = 'shipped' ORDER BY created_at DESC LIMIT 15;
EXPLAIN ANALYZE SELECT * FROM orders ORDER BY created_at DESC LIMIT 15;
EXPLAIN ANALYZE SELECT COUNT(*) FROM orders WHERE status <> 'cancelled';
```
Pick a `user_id` that really has orders in the bulk data.

### Step 4 — Baseline load test (before indexes and caches)
Create the k6 scripts described in section 3, task T12, then run them against the original stack. Save summaries to `docs/performance/baseline/k6-*.json`. Run each scenario three times and record the median p50, p95 and p99.

### Step 5 — Apply the index migration (task T2)
Only now. Then repeat Step 3 and Step 4 and save to `docs/performance/results/after-indexes/`.

### Step 6 — Dashboard change (task T4)
Repeat Step 4 for the dashboard scenario only. Save to `docs/performance/results/after-dashboard/`.

### Step 7 — Redis (task T5), then product caching (T7), then ETag (T8)
After each one: repeat the relevant k6 scenarios, save to `docs/performance/results/after-<name>/`.

Each k6 comparison in the final report must show the same dataset, the same VUs, the same duration and the same machine.

---

## 2. Tasks in execution order

### T1 — Confirm baseline stack health (no code change)
Verify the health endpoints `http://localhost:8000/up` and `http://localhost:5173`. If anything fails, stop and report. Do not continue on a broken stack.

### T2 — Add the index migration
- Create `backend/my-project/database/migrations/2026_11_05_000001_add_performance_indexes.php` with the content in Appendix A.
- It adds these indexes:
  - `products(is_active, created_at)` — default product list
  - `products(is_active, category_id, created_at)` — category list
  - `orders(user_id, created_at)` — customer order history
  - `orders(status, created_at)` — admin status filter
  - `orders(created_at)` — admin unfiltered list
- Run `php artisan migrate` inside the container.
- Verify with `SHOW INDEX FROM orders;` and `SHOW INDEX FROM products;`.
- Verify that `EXPLAIN` now uses these indexes (`key` column should not be NULL). Save output.

### T3 — Verify the seeder is in the repo
Covered in Step 2. Do not change the seeder unless it fails. If it must change, document why in `PERFORMANCE_REPORT.md`.

### T4 — Replace the dashboard controller and invalidate its cache
1. Replace the whole file `backend/my-project/app/Http/Controllers/DashboardController.php` with the content in Appendix B.
2. Edit `backend/my-project/app/Services/OrderService.php`:

   a. Add the import at the top of the file:
   ```php
   use App\Http\Controllers\DashboardController;
   ```

   b. In `createOrder()`, right before the final line `return $order->load('items.product');`, add:
   ```php
   DashboardController::forgetCache($user->id);
   ```

   c. In `updateStatus()`, right after `$order->update(['status' => $status]);`, add:
   ```php
   DashboardController::forgetCache($order->user_id);
   ```

   Note: `forgetCache()` is a temporary solution. Services should not depend on controllers. Task T14 moves this into a dedicated class.

3. Verify:
   - `GET /api/dashboard` as a customer and as an admin returns exactly these keys: `total_products`, `orders_today`, `total_orders`, `total_users` (null for customers), `total_sales` (string with 2 decimals).
   - Create an order as a customer, then call `/api/dashboard` again. The `total_orders` value must go up immediately (this proves the invalidation works).
   - Customer A must never see customer B's numbers.
   - Save a before/after comparison of response bodies to `docs/performance/results/dashboard-response-check.txt`.

### T5 — Add Redis
1. **Dockerfile** (`backend/my-project/Dockerfile`): add after the grpc/protobuf install line:
   ```dockerfile
   RUN pecl install redis \
       && docker-php-ext-enable redis
   ```

2. **docker-compose.yml**: add this service (before the `# ─── Networks` section):
   ```yaml
     # ─── Redis (cache) ────────────────────────────────────────
     redis:
       image: redis:7-alpine
       container_name: ecommerce-redis
       restart: unless-stopped
       command: ["redis-server", "--maxmemory", "512mb", "--maxmemory-policy", "allkeys-lru"]
       networks:
         - ecommerce-network
       healthcheck:
         test: ["CMD", "redis-cli", "ping"]
         interval: 10s
         timeout: 5s
         retries: 5
   ```
   Then in the `backend` service:
   - under `environment`, add:
     ```yaml
           CACHE_STORE: redis
           REDIS_CLIENT: phpredis
           REDIS_HOST: redis
           REDIS_PORT: 6379
     ```
   - under `depends_on`, add:
     ```yaml
           redis:
             condition: service_healthy
     ```

3. **`.env.example`**: change `CACHE_STORE=database` to `CACHE_STORE=redis`. Keep `REDIS_HOST=127.0.0.1` (local development outside Docker). Docker overrides it.

4. **Rate limiting and lockouts** use the cache store too (`throttle:*` and `CheckIpLockout`). Under memory pressure, `allkeys-lru` can evict these counters. Mention this in the report. Do not change the policy without asking.

5. Verify:
   - `docker compose exec backend php artisan tinker --execute="Cache::put('x', 1, 60); echo Cache::get('x');"` prints `1`.
   - `docker compose exec redis redis-cli KEYS "*dashboard*"` shows dashboard keys after one dashboard call.
   - Full test suite passes.

### T6 — Stable pagination ordering
Bulk-generated rows share timestamps down to the second. Without a tie-breaker, pagination can skip or repeat rows. Change every `->latest()` used for paginated lists to a two-column order:
```php
->orderByDesc('created_at')->orderByDesc('id')
```
Places:
- `OrderService::getUserOrders()`
- `OrderService::getAllOrders()`
- `ProductService::list()`
- `ProductController::index()` (currently `$query->latest()->paginate($perPage)`)
- `NotificationService::getUserNotifications()`

Verify: paginating through all pages of `/api/orders` (as a customer with many orders) returns every order exactly once.

### T7 — Cache product details (NOT stock)
Current behavior: `ProductController::show()` calls gRPC `getStock()` on every request, and the product row is read from MySQL every time. Only the product details will be cached. Stock stays live.

1. Create `App\Services\ProductCache` (new file) with:
   - `get(int $id): ?array` — returns cached product attributes plus category, or null.
   - `put(Product $product): void` — stores `$product->toArray()` (with `category` loaded) under key `product:{id}:details`, TTL 300 seconds.
   - `forget(int $id): void` — deletes that key.

2. Change `ProductController::show()`:
   - Load the product (route binding still does one query; that is acceptable).
   - Keep the existing inactive check (404 for non-admins). The check must use the real `is_active` value, not the cached one.
   - Keep the gRPC stock call exactly as it is, including the 503 response on failure.
   - Keep the response unchanged.

   Note: caching the full detail array is optional for this step. If the route binding already returns the model, the simplest valid change is caching only the category relation. Document whichever option you choose and why. Measure both if time allows.

3. Invalidation: call `ProductCache::forget($id)` in `ProductService::update()` and `ProductService::delete()`. Do this after the database write succeeds.

4. Verify:
   - Update a product price as admin, then GET `/api/products/{id}` as a customer. The new price must show immediately.
   - Stock still changes immediately after an order is created (proves stock is not cached).

### T8 — ETag support (HTTP caching)
Create `backend/my-project/app/Http/Middleware/ConditionalGet.php`:
- For GET requests only, with a 200 JSON response:
  1. Compute `$etag = '"' . sha1($response->getContent()) . '"';`
  2. Call `$response->setEtag($etag);`
  3. Set `Cache-Control: private, no-cache` so clients revalidate every time.
  4. Call `$response->isNotModified($request);`. Symfony sets the 304 status and removes the body when `If-None-Match` matches.
- Register the middleware as an alias (for example `conditional.get`) in `bootstrap/app.php`.
- Apply it to `GET /api/products/{product}` first. Add it to the product list route after that works.

Note: because the body includes live stock, the ETag changes when stock changes. This is correct. Saving the gRPC call on a 304 would need an ETag built from `updated_at` plus a stock version. That is a DECISION REQUIRED item (see section 3).

Verify with curl:
```
curl -i http://localhost:8000/api/products/1
curl -i -H 'If-None-Match: "<etag from previous response>"' http://localhost:8000/api/products/1
```
The second call must return `304 Not Modified` with an empty body.

### T9 — Notification write timing (DECISION REQUIRED)
`NotificationService::createOrderNotification()` is called inside the order transaction, which extends the time the `inventory_operations` row is locked. The proposed fix is to run it after commit with `DB::afterCommit(fn () => ...)`.
Behavior change: if the notification insert fails, the order is no longer rolled back. Ask the user to approve this before changing it. Do not apply it without approval.

### T10 — Read replica (DECISION REQUIRED, after T1–T8 are measured)
Only start after the caching results are saved. Outline:
- Add a `mysql-replica` service to `docker-compose.yml` using MySQL 8.0 with GTID replication from `mysql`.
- In `config/database.php`, under the `mysql` connection, use Laravel's `read` and `write` host arrays with `DB_READ_HOST` and `DB_HOST`, and set `'sticky' => true`.
- For read-after-write across requests: after any write for a user, set `Cache::put("recent-write:user:{$id}", true, 5)`. In that user's requests, if the flag exists, call `DB::connection('mysql')->useWriteConnectionWhenReading()`.
- Measure replica lag (`SHOW REPLICA STATUS`) during the k6 run and record it.
- Verify: create a product or order, then immediately read it back through the API. It must be visible every time.

### T11 — Admin list counting cost (DECISION REQUIRED)
`paginate()` runs `COUNT(*)` on every request. On `/api/admin/orders` with 300k rows, this is expensive. Options: `simplePaginate()` (no total count, changes the response: `total`, `last_page` are removed), or cursor pagination. Ask the user which to use. Do not change the response shape without approval.

### T12 — k6 load test scripts
Create `perf/k6/` with one script per scenario:
- `products-list.js` — GET `/api/products` with random page 1–20 and random category
- `product-detail.js` — GET `/api/products/{id}` with random IDs 1–15
- `customer-orders.js` — login as a bulk customer, GET `/api/orders`
- `dashboard.js` — login as a customer, GET `/api/dashboard`

Requirements for each script:
- Use `thresholds` only for reporting, not as pass/fail gates.
- Use `summaryTrend: ['p(50)', 'p(95)', 'p(99)']`.
- Use a fixed scenario (for example 50 VUs for 2 minutes after a 30-second ramp).
- Write the summary with `--summary-export docs/performance/...json`.
- Use the same test users and product IDs in every run.

Run with k6 installed locally, or with the Docker image `grafana/k6`.

### T13 — Web server and opcache (DECISION REQUIRED, measure first)
The backend runs `php artisan serve`, which is not designed for production. Also, opcache is not enabled in the Dockerfile. Measure the effect of the earlier steps before changing this. If the bottleneck is still the PHP runtime, propose nginx + php-fpm with opcache enabled. Ask the user before changing the Dockerfile CMD.

### T14 — Refactor the cache invalidation (low priority, tech debt)
Create `App\Services\DashboardCache` and move `forgetCache()` and `cacheKey()` there. Update `DashboardController` and `OrderService` to use it. Remove the `App\Http\Controllers` import from `OrderService`. Behavior must stay identical.

Also remove the duplicated filtering logic in `ProductService::list()`. It is unused, because `ProductController::index()` builds its own query. Make the controller call the service, or delete the method. Choose one and document it.

### T15 — Frontend read-only review (no code changes)
Goal: decide whether the React app must change because of the backend work. Only read files and report.

Read these files (paths are under `frontend/src/`):
- `lib/api/client.ts` and `lib/api/endpoints.ts`
- `features/dashboard/hooks/use-dashboard.ts`
- `features/orders/hooks/use-orders.ts`
- `features/products/hooks/use-products.ts`
- `features/products/components/product-details.tsx`
- `features/products/components/product-form.tsx`
- Any file that calls `POST /orders` or `PATCH /admin/orders/{id}/status`

Check and record each item in REPORT.md under "Frontend review":
1. **API contract:** the endpoints and response fields the frontend uses match the backend. No changes to response shapes were made, so none are expected.
2. **Freshness after writes:** after creating an order or changing an order status, the frontend invalidates the dashboard and orders queries (for example with `queryClient.invalidateQueries`). After a product create, update, or delete, it invalidates the product queries. List any missing invalidation with the exact file and line. Do not fix it without approval.
3. **Conditional requests:** the HTTP client does not add headers that prevent browser ETag revalidation (for example a custom `Cache-Control: no-store`). Browsers handle `If-None-Match` automatically, so no code change is expected.
4. **Stock unavailable:** the product details page still handles the `503` response from `GET /products/{id}` as before.
5. **Base URL and CORS:** the API base URL is unchanged, and the backend CORS setting still includes `http://localhost:5173`.

**Result of the review (read from `frontend-src.utf8.txt`, the uploaded bundle):**

1. **API contract: OK.** Endpoints, response fields, and types match the backend. `DashboardSummary.total_sales` is a string and `total_users` is `number | null`, as the backend returns. No change needed.
2. **Freshness after writes: GAPS.** See task T16, items A to C.
3. **Conditional requests: OK.** `client.ts` sets only `Content-Type` and `Accept`. It does not block browser ETag revalidation. No change needed. Note: the ETag middleware must keep `Cache-Control: private` on user-specific responses (dashboard, orders). Do not remove it.
4. **Stock unavailable: OK.** `product-details.tsx` handles `503` from `GET /products/{id}` (`isStockDown`) with an empty-state message. No change needed.
5. **Base URL and CORS: OK.** `client.ts` defaults to `http://localhost:8000/api` (override with `VITE_API_URL`). The compose file allows `http://localhost:5173`. The backend CORS config file was not in the uploaded files, so it is unverified.

**Issue found, not performance related: idempotency key (T16, item D).** Frontend changes are needed for correctness, not for the performance work itself.

### T16 — Frontend fixes from the T15 review (DECISION REQUIRED — do not apply without approval)

Source: `frontend/src/...` files from the uploaded bundle. Line numbers refer to that bundle, so search for the code instead of trusting the number.

**A. Dashboard is not refreshed after an order is created.**
File: `features/orders/hooks/use-orders.ts`, `useCreateOrder` (around line 2803).
Current: `invalidateKeys: [orderKeys.lists()]`.
Change to:
```ts
import { dashboardKeys } from "@/features/dashboard/hooks/use-dashboard"
import { productKeys } from "@/features/products/hooks/use-products"

invalidateKeys: [orderKeys.lists(), dashboardKeys.summary, productKeys.details()],
```
Reason: the backend cache is cleared by `forgetCache()`, but React Query still serves its own copy for up to 2 minutes (`staleTime` in `app/providers/query-provider.tsx`). Stock also changes after an order, so product detail must be refreshed too.

**B. Dashboard and product stock are not refreshed after an order status change.**
File: `features/orders/hooks/use-orders.ts`, `useUpdateOrderStatus` (around line 2792).
Change to:
```ts
invalidateKeys: [
  orderKeys.lists(),
  orderKeys.detail(id),
  dashboardKeys.summary,
  productKeys.details(),
],
```
Reason: cancelling releases stock and changes `total_sales`.

**C. Product create and delete do not refresh the dashboard, and delete does not refresh the detail page.**
File: `features/products/hooks/use-products.ts`.
- `useCreateProduct` (around line 3515): `invalidateKeys: [productKeys.lists(), dashboardKeys.summary]`
- `useDeleteProduct` (around line 3533): `invalidateKeys: [productKeys.lists(), productKeys.details(), dashboardKeys.summary]`
- `useUpdateProduct` (around line 3524): no change needed.

**D. Idempotency key is regenerated on every attempt (correctness bug, related to Requirements 1 and 2).**
Files: `features/orders/api/orders.api.ts` (`create`, around line 2731), `features/orders/hooks/use-orders.ts` (`useCreateOrder`, around line 2801), `features/products/components/product-details.tsx` (submit handler, around line 3054).
Problem: `ordersApi.create` uses `crypto.randomUUID()` as its default key, so every call gets a new key. The backend returns `503 RESERVATION_OUTCOME_UNKNOWN` with the message "Retry with the same Idempotency-Key." The frontend cannot do that, so a retry after an unknown outcome can create a second reservation and a second order.
Fix:
1. `useCreateOrder` accepts `{ items, idempotencyKey }` as its variables and passes `idempotencyKey` to `ordersApi.create(items, idempotencyKey)`.
2. `ProductDetails` keeps the key in state, for example `useState(() => crypto.randomUUID())`. The same key is sent on retries of the same order.
3. Generate a new key only after a successful order, or when the items change (for example when the quantity changes). The backend rejects a reused key with different items (422), so the key must match the exact item list.
Verify: force a 503 (stop `inventory-service`), click submit, restart the service, and confirm that only one order is created.

**E. Arabic text in the uploaded bundle looks garbled.** This comes from the PowerShell command that created the bundle, not from the source files. Windows PowerShell 5 reads UTF-8 without a BOM as ANSI by default. Use `Get-Content $_.FullName -Raw -Encoding UTF8` if you regenerate the bundle. No code change needed.

Verification for T16 (after approval): run `npm run build` and `npm run lint` in `frontend/`, then check that the dashboard, the product page stock, and the order list update immediately after an order is created, after a cancellation, and after a product is deleted.

---

## 3. Decisions the user must make

| Item | Question |
|---|---|
| T8 | Should a 304 response skip the gRPC stock call too? That needs an ETag built from `updated_at` plus a stock version, which is more complex. |
| T9 | Approve moving the notification insert after commit? It changes the rollback behavior. |
| T10 | Build the read replica now, or first measure whether the database is a bottleneck? |
| T11 | Keep `paginate()` with total count, or switch to `simplePaginate()` or cursor pagination? |
| T13 | Replace `php artisan serve` with nginx + php-fpm and enable opcache? |
| T16 | Approve the frontend fixes A to E (freshness after writes and idempotency key). |

---

## 4. Final deliverable: `REPORT.md` (project root)

The user reads this file and sends it back for checking, so it must stand on its own. Create it at Step 0 with the Environment section, and update it after every task. Write it in English. Keep it under about 400 lines. Use tables for numbers.

Required sections, in this order:

1. **Header:** date, requirement, agent tool, overall status (`COMPLETE`, `PARTIAL`, or `BLOCKED`).
2. **Summary:** at most 5 bullets. What was done, the main measured change with numbers, and what is still pending.
3. **Environment:** Windows version, Docker Desktop version, CPU and RAM given to Docker, output of `docker compose version`, output of `docker compose images`, and k6 version.
4. **Code state:** output of `git status --short` and `git diff --stat` at the start and at the end. List every new and changed file.
5. **Task log:** one row per task T1 to T15 and per ladder step 0 to 7, with columns: Task | Status (Done / Skipped / Blocked / Deferred / Decision pending) | Files changed | Verification performed | Result.
6. **Dataset:** row counts from `docs/performance/baseline/dataset.txt` and how long the seeder took.
7. **Measurements:** for each k6 scenario, a table with p50, p95, p99, requests per second, and error rate, one column per ladder step (baseline, after-indexes, after-dashboard, after-redis, after-product-cache, after-etag). Use the median of three runs and say so.
8. **EXPLAIN evidence:** for each query in step 3, the access type, the index used (`key`), the rows examined, and the time, before and after the indexes.
9. **Verification results:** test suite pass and fail counts, dashboard response check, cache invalidation checks, 304 check, order visibility check, and pagination completeness check. Include the commands and results.
10. **Problems and deviations:** anything that did not go as planned, with the exact error text and how it was resolved. Do not hide failures.
11. **Decisions:** the status of T8, T9, T10, T11, and T13. Say which the user decided and which are still open.
12. **Frontend review:** the result of T15, item by item.
13. **Trade-offs and limitations:** dashboard data up to 60 seconds old, rate-limiter eviction risk with `allkeys-lru`, live stock calls, and anything else observed.
14. **How to reproduce:** the exact commands, in order, that a person can copy to repeat the run.
15. **Raw outputs:** relative paths to the raw files in `docs/performance/` that back every number.

Rules for numbers: report only values produced by a command you ran. If a measurement was not taken, write `not measured` and say why. Never estimate or copy a number from these instructions.

---

## Appendix A — Migration (new file)

Path: `backend/my-project/database/migrations/2026_11_05_000001_add_performance_indexes.php`

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            // Default product listing: WHERE is_active = 1 ORDER BY created_at DESC
            $table->index(['is_active', 'created_at'], 'products_active_created_idx');

            // Category listing: WHERE is_active = 1 AND category_id = ? ORDER BY created_at DESC
            $table->index(['is_active', 'category_id', 'created_at'], 'products_active_category_created_idx');
        });

        Schema::table('orders', function (Blueprint $table) {
            // Customer order history: WHERE user_id = ? ORDER BY created_at DESC
            $table->index(['user_id', 'created_at'], 'orders_user_created_idx');

            // Admin status filter: WHERE status = ? ORDER BY created_at DESC
            $table->index(['status', 'created_at'], 'orders_status_created_idx');

            // Admin unfiltered list: ORDER BY created_at DESC
            $table->index('created_at', 'orders_created_idx');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropIndex('orders_created_idx');
            $table->dropIndex('orders_status_created_idx');
            $table->dropIndex('orders_user_created_idx');
        });

        Schema::table('products', function (Blueprint $table) {
            $table->dropIndex('products_active_category_created_idx');
            $table->dropIndex('products_active_created_idx');
        });
    }
};
```

## Appendix B — DashboardController (replace the whole file)

Path: `backend/my-project/app/Http/Controllers/DashboardController.php`

```php
<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    /**
     * Dashboard numbers may be up to this many seconds old.
     * Services that change orders should call forgetCache() so the
     * affected user sees fresh numbers immediately.
     */
    private const CACHE_TTL_SECONDS = 60;

    public function __invoke(): JsonResponse
    {
        $user = Auth::guard('api')->user();
        $isAdmin = $user->role === 'admin';

        $data = Cache::remember(
            self::cacheKey($user->id, $isAdmin),
            self::CACHE_TTL_SECONDS,
            fn () => $this->buildStats($user->id, $isAdmin)
        );

        return response()->json(['data' => $data]);
    }

    /**
     * Drop cached dashboard numbers for a user and for the admin view.
     * Call this after an order is created or its status changes.
     */
    public static function forgetCache(int $userId): void
    {
        Cache::forget(self::cacheKey($userId, false));
        Cache::forget(self::cacheKey($userId, true));
    }

    private static function cacheKey(int $userId, bool $isAdmin): string
    {
        // Admins share one entry. Customers get one entry each, so no data leaks between users.
        return $isAdmin ? 'dashboard:admin' : "dashboard:user:{$userId}";
    }

    private function buildStats(int $userId, bool $isAdmin): array
    {
        // One pass over the orders table instead of three separate queries.
        // created_at is compared as a range, not with whereDate(), so an index can still be used.
        $orders = DB::table('orders');
        if (! $isAdmin) {
            $orders->where('user_id', $userId);
        }

        $orderStats = $orders->selectRaw(
            'COUNT(*) AS total_orders,
             COALESCE(SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END), 0) AS orders_today,
             COALESCE(SUM(CASE WHEN status <> ? THEN total ELSE 0 END), 0) AS total_sales',
            [now()->startOfDay(), 'cancelled']
        )->first();

        return [
            'total_products' => Product::query()->where('is_active', true)->count(),
            'orders_today' => (int) $orderStats->orders_today,
            'total_orders' => (int) $orderStats->total_orders,
            'total_users' => $isAdmin ? User::query()->count() : null,
            // bcmath keeps money as a decimal string, consistent with OrderService.
            'total_sales' => bcadd((string) $orderStats->total_sales, '0', 2),
        ];
    }
}
```

## Appendix C — BulkOrderSeeder (new file)

Path: `backend/my-project/database/seeders/BulkOrderSeeder.php`

```php
<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Generates a large dataset for performance testing (Requirement 3).
 *
 * Run AFTER UserSeeder and ProductSeeder:
 *   BULK_ORDER_COUNT=300000 php artisan db:seed --class=Database\\Seeders\\BulkOrderSeeder
 *
 * Inserts are chunked and use the query builder (no Eloquent events, no model hydration)
 * so that hundreds of thousands of rows can be created in a reasonable time.
 * The seeder refuses to run twice; run `php artisan migrate:fresh --seed` to regenerate.
 */
class BulkOrderSeeder extends Seeder
{
    private const DEFAULT_ORDER_COUNT = 300000;
    private const BULK_CUSTOMERS = 5000;
    private const ORDERS_PER_CHUNK = 1000;
    private const ITEM_INSERT_BATCH = 1000;
    private const HISTORY_SECONDS = 365 * 24 * 3600;

    // Weights are percentages and must add up to 100.
    private const STATUS_WEIGHTS = [
        'pending' => 5,
        'confirmed' => 10,
        'processing' => 10,
        'shipped' => 15,
        'delivered' => 55,
        'cancelled' => 5,
    ];

    public function run(): void
    {
        DB::disableQueryLog();

        if (DB::table('users')->where('email', 'like', 'bulk-customer-%')->exists()) {
            $this->command?->warn('Bulk data already exists. Run migrate:fresh --seed to regenerate.');

            return;
        }

        $products = DB::table('products')
            ->where('is_active', true)
            ->whereNull('deleted_at')
            ->get(['id', 'price'])
            ->all();

        if (count($products) === 0) {
            $this->command?->error('No active products found. Run ProductSeeder first.');

            return;
        }

        $targetOrders = (int) (getenv('BULK_ORDER_COUNT') ?: self::DEFAULT_ORDER_COUNT);
        $customerIds = $this->createCustomers();

        $remaining = $targetOrders;
        $generated = 0;

        while ($remaining > 0) {
            $size = min(self::ORDERS_PER_CHUNK, $remaining);
            $this->insertOrderChunk($size, $customerIds, $products);

            $remaining -= $size;
            $generated += $size;

            if ($generated % 50000 === 0 || $remaining === 0) {
                $this->command?->info("Generated {$generated} / {$targetOrders} orders");
            }
        }

        $this->command?->info('Bulk seeding finished.');
    }

    /**
     * @return array<int, int> customer user IDs
     */
    private function createCustomers(): array
    {
        // Hash once and reuse. Bcrypt per user would make seeding very slow.
        $password = Hash::make('password123');
        $now = now()->format('Y-m-d H:i:s');

        $rows = [];
        for ($i = 1; $i <= self::BULK_CUSTOMERS; $i++) {
            $rows[] = [
                'name' => "Bulk Customer {$i}",
                'email' => "bulk-customer-{$i}@example.test",
                'password' => $password,
                'role' => 'customer',
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        foreach (array_chunk($rows, 1000) as $chunk) {
            DB::table('users')->insert($chunk);
        }

        return DB::table('users')
            ->where('email', 'like', 'bulk-customer-%')
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    private function insertOrderChunk(int $size, array $customerIds, array $products): void
    {
        DB::transaction(function () use ($size, $customerIds, $products) {
            $orderRows = [];
            $itemsByReservation = [];

            for ($i = 0; $i < $size; $i++) {
                $reservationId = (string) Str::uuid();
                $createdAt = now()->subSeconds(random_int(0, self::HISTORY_SECONDS))->format('Y-m-d H:i:s');

                $total = '0.00';
                $items = [];
                $itemCount = random_int(1, 4);

                for ($j = 0; $j < $itemCount; $j++) {
                    $product = $products[array_rand($products)];
                    $quantity = random_int(1, 3);
                    $subtotal = bcmul((string) $product->price, (string) $quantity, 2);
                    $total = bcadd($total, $subtotal, 2);

                    $items[] = [
                        'product_id' => $product->id,
                        'quantity' => $quantity,
                        'unit_price' => $product->price,
                        'subtotal' => $subtotal,
                        'created_at' => $createdAt,
                        'updated_at' => $createdAt,
                    ];
                }

                $orderRows[] = [
                    'user_id' => $customerIds[array_rand($customerIds)],
                    'total' => $total,
                    'status' => $this->pickStatus(),
                    'reservation_id' => $reservationId,
                    'created_at' => $createdAt,
                    'updated_at' => $createdAt,
                ];
                $itemsByReservation[$reservationId] = $items;
            }

            // Remember the highest ID before this chunk. The new orders are exactly the rows above it.
            // This avoids relying on auto-increment values being consecutive for multi-row inserts.
            $maxIdBefore = (int) DB::table('orders')->max('id');

            DB::table('orders')->insert($orderRows);

            $orderIdByReservation = DB::table('orders')
                ->where('id', '>', $maxIdBefore)
                ->pluck('id', 'reservation_id');

            $itemRows = [];
            foreach ($itemsByReservation as $reservationId => $items) {
                $orderId = $orderIdByReservation[$reservationId];
                foreach ($items as $item) {
                    $item['order_id'] = $orderId;
                    $itemRows[] = $item;
                }
            }

            foreach (array_chunk($itemRows, self::ITEM_INSERT_BATCH) as $batch) {
                DB::table('order_items')->insert($batch);
            }
        });
    }

    private function pickStatus(): string
    {
        $roll = random_int(1, 100);
        $cumulative = 0;

        foreach (self::STATUS_WEIGHTS as $status => $weight) {
            $cumulative += $weight;
            if ($roll <= $cumulative) {
                return $status;
            }
        }

        return 'pending';
    }
}
```
