# E-Commerce API and Inventory Backend

The current implementation phase provides Laravel REST APIs and a separate
Node.js/TypeScript inventory service. A frontend has not been added yet.

## Services

- `backend/my-project`: Laravel 12 REST API, JWT authentication, catalog,
  orders, notifications, and durable inventory compensation.
- `inventory-service`: Node.js/TypeScript gRPC server backed by its own MySQL database.
- `proto/inventory.proto`: the shared `GetStock`, `ReserveStock`, and
  `ReleaseStock` contract.
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

Until a frontend exists, start only the available backend services:

```powershell
docker compose up --build mysql inventory-mysql backend inventory-service scheduler
```

The scheduler runs `php artisan schedule:work`. It records abandoned
reservations and retries failed `ReleaseStock` compensations. To run a retry
once manually:

```powershell
docker compose exec backend php artisan inventory:retry-compensations
```

The full Compose stack still references a `frontend/` build context that is
not present, so `docker compose up --build` without service selection is not
ready until the frontend is implemented.

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
