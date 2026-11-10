# E-Commerce API and Inventory Backend

Database API benchmarks: [k6 before-and-after results](./docs/performance/BEFORE_AFTER.md),
including the historical baseline and the current run measured on 2026-11-10.

Latest performance review: [Arabic RTL explanation with actual code](./PERFORMANCE_GUIDE_AR.html)
and [verification/results report](./docs/performance/focused-review/REVIEW.md).

The project provides Laravel REST APIs, a React frontend, and a separate
Node.js/TypeScript inventory service.

## Services

- `backend/my-project`: Laravel 12 REST API, JWT authentication, catalog,
  orders, notifications, and durable inventory compensation.
- `inventory-service`: Node.js/TypeScript gRPC server backed by its own MySQL database.
- `proto/inventory.proto`: the shared `GetStock`, `ReserveStock`, and
  `ReleaseStock` contract.
- `frontend`: React/TypeScript storefront and administration screens, built
  with Vite and served by Nginx in Docker.
- `docker-compose.yml`: separate MySQL databases for Laravel and Inventory,
  the two services, a compensation scheduler, and an opt-in isolated MySQL
  integration-test profile.

Laravel owns users, catalog records, prices, orders, and notifications.
Inventory quantities and reservations are owned only by the inventory service.
Laravel does not connect to the inventory database.

## Local API setup

Use PHP 8.2+, Composer, MySQL, Node.js 22+, and the PHP `grpc`, `protobuf`,
`pdo_mysql`, and `bcmath` extensions. The current Dockerfile installs the
required PHP extensions.

1. Configure `backend/my-project/.env` from `.env.example`. Set a unique
   `APP_KEY` and `JWT_SECRET`; set the Laravel `DB_*` values and
   `INVENTORY_GRPC_HOST`/`INVENTORY_GRPC_TIMEOUT` for the environment.
2. Install PHP dependencies with `composer install`.
3. Run `php artisan migrate`.
4. Start Laravel with `php artisan serve`.
5. Configure `inventory-service/.env` from its `.env.example`, then start its
   MySQL database and the inventory service.
6. API base URL: `http://localhost:8000/api`.

Do not use the example or test-only keys outside local development.
Laravel uses its own `ecommerce` database; Inventory uses `inventory_db`.
For the Compose setup, their host-side ports are 3307 and 3308, respectively.
They run on separate MySQL servers and use separate persistent volumes.

## Docker

Set `APP_KEY` and `JWT_SECRET` in the workspace-level `.env`, and create
distinct local password files under `secrets/` for the Laravel and Inventory
MySQL servers. For the integration profile, also create separate password
files named `mysql_integration_root_password.txt`,
`mysql_integration_password.txt`,
`inventory_mysql_integration_root_password.txt`, and
`inventory_mysql_integration_password.txt`. The Docker build contexts exclude
`.env` files, secrets, local SQLite data, and installed dependencies.

With Docker running, start the backend services:

```powershell
docker compose up -d --build mysql mysql-replica inventory-mysql redis backend inventory-service scheduler
```

The scheduler runs `php artisan schedule:work`. It records abandoned
reservations and retries failed `ReleaseStock` compensations. To run a retry
once manually:

```powershell
docker compose exec backend php artisan inventory:retry-compensations
```

The frontend is at `http://localhost:5173`; the API is at
`http://localhost:8000/api`. Set `FRONTEND_PORT` if port 5173 is occupied.
On this Windows machine Docker runs in Ubuntu WSL, so use
`wsl.exe -d Ubuntu -- docker compose --project-directory /mnt/e/projects/internet-applications`
in place of `docker compose`, and keep an Ubuntu session open while using it.

The existing read replica has been provisioned from a consistent primary
snapshot. On a fresh deployment, Compose creates the replica server but GTID
replication and its replication account must also be provisioned before it can
serve reads. `perf/mysql_replication.py` safely inspects replication status.
Until a replica has applied the primary's GTID position, reads fall back to the
primary. Never reset application databases to run tests or benchmarks.

## Trying the API

Import `for frontend.json` (OpenAPI 3.0.3) into Swagger Editor or Postman.
`for frontend.yaml` provides the same contract. Both describe authentication,
multipart image uploads, pagination, order status changes and the required
`Idempotency-Key` header. Use `/register` or `/login` to obtain a JWT, then
authorize with the token using the tool's bearer authentication control.
Administrator credentials must be configured locally as described below.
`API_DOCUMENTATION.md` contains request and response examples.

API errors return JSON with a `message`, optional validation `errors`, and
optional domain `code`. The API adds `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, and
`Referrer-Policy: strict-origin-when-cross-origin` to successful and rejected
requests. Five failed login attempts in one minute lock that IP out for five
minutes; the rejection includes `Retry-After`.

API JSON GET responses negotiate gzip for useful payloads of at least 1,024
bytes. Small payloads normally remain identity encoded; SSE and other streams
are excluded. Conditional product reads use a weak ETag shared by equivalent
identity/gzip representations and `Vary: Accept-Encoding`. Matching reads return
a bodyless 304; compressed replies carry their actual compressed Content-Length.

The previous PostgreSQL volume is not automatically deleted by this
configuration, but its contents are not imported into MySQL. If it contains
inventory data that must be retained, export and validate that data before
switching the inventory service to the new MySQL database. Do not remove old
database volumes as part of this conversion.

## API routes

| Method | Path | Access |
|---|---|---|
| POST | `/register`, `/login` | Public; rate limited |
| POST | `/logout`, GET `/me` | Authenticated JWT |
| GET | `/products`, `/products/{product}` | Public; detail includes confirmed stock |
| POST/PUT/PATCH/DELETE | `/products/{product}` and product collection | Admin JWT |
| GET | `/categories`, `/categories/{category}` | Public |
| POST/PUT/PATCH/DELETE | Category collection and `/categories/{category}` | Admin JWT |
| POST | `/orders` | Authenticated JWT |
| GET | `/orders`, `/orders/{order}` | Own orders; admins may view any |
| GET | `/admin/orders` | Admin JWT |
| PATCH | `/admin/orders/{order}/status` | Admin JWT |
| GET | `/notifications` | Authenticated JWT; own notifications only |
| GET | `/notifications/events` | Authenticated JWT; private SSE snapshots |
| PATCH | `/notifications/read-all`, `/notifications/{notification}/read` | Authenticated JWT; own notifications only |

Product lists accept `search`, `category_id`, `per_page`, and `page`.
Order creation requires a UUID `Idempotency-Key` HTTP header. Prices and totals
are calculated from the Laravel database; client-supplied prices are ignored.

If reservation times out, the API returns `503` with
`RESERVATION_OUTCOME_UNKNOWN`. Retry only with the same idempotency key and
payload. A confirmed stock reservation is saved durably before the order
transaction. If order persistence fails, Laravel attempts `ReleaseStock` and
stores a retry record if release cannot be confirmed.

JWT validity defaults to 60 minutes (`JWT_TTL`). Registration always assigns
the `customer` role; the role is not accepted from request data.

The notification event feed emits the user's current notification page as an
SSE `notifications` event with a content-based event ID and `retry: 2000`.
Each request ends after the snapshot. An authenticated SSE client reconnects
after two seconds to receive new notifications and read-state changes; it
must send its bearer header again. This keeps workers free between snapshots.
Responses use `private, no-store`; use the paginated notifications API for
older history. No frontend integration is required to consume the backend feed.

## Cache policy

Redis caches dashboard aggregates for 60 seconds and product metadata for 300
seconds. Customer dashboard keys include the user ID; the admin aggregate has
a separate shared key. Order creation/status changes invalidate the affected
customer and admin aggregates. Product writes invalidate product metadata and
the admin product count; category edits invalidate affected product snapshots.
Other dashboard counts can remain cached until their 60-second expiry.

Inventory quantities and reservation results must not be cached. Product
details always obtain stock over gRPC, and authoritative product fields are
read from the verified database connection. Only the category relation is
reused from the product metadata snapshot. Product GET responses use private
ETag revalidation, including a live inventory lookup before a possible `304`.
Private orders and authenticated event feeds are not shared response caches.

## Creating a local administrator

Set `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` in the backend
environment, then run `php artisan db:seed`. The seeder creates an admin only
when all three values are supplied, never stores a repository password, and
does not overwrite an existing account.

## Tests and verification

The normal Laravel test suite forces SQLite `:memory:` even if a development
database is configured in `.env`:

```powershell
Set-Location backend\my-project
php artisan test
```

MySQL inventory integration tests require the opt-in Compose profile. It
starts separate, isolated `ecommerce_test` and `inventory_test` MySQL
databases, runs the Inventory Service against the latter, and verifies the
selected database and account before modifying fixtures. Test passwords are
read from the configured secret files; do not put credentials in the
repository or command output.

```powershell
docker compose --profile mysql-integration up --build --abort-on-container-exit --exit-code-from inventory-test-runner inventory-mysql-integration inventory-service-integration inventory-test-runner
```

The inventory integration suite tests real MySQL transactions and gRPC
transport, including concurrent reservations for the last unit, repeated
idempotency keys, double releases, and a committed reservation whose first
gRPC response is intentionally dropped. It verifies the database name and
test account before deleting only its fixed test fixtures.

The Laravel-to-Inventory integration suite uses the same isolated test
databases and real gRPC calls. Run it separately:

```powershell
docker compose --profile mysql-integration run --build --rm backend-test
```

It verifies an actual order reservation and stock compensation after a
simulated Laravel persistence failure. Neither integration command has been
run unless reported separately with its actual result. The ordinary Laravel
SQLite test suite remains independent of these MySQL tests.

The gRPC service is started with `inventory-service` and listens on port
`50051` within the Docker network. Laravel's per-call timeout is configured in
seconds by `INVENTORY_GRPC_TIMEOUT`.
