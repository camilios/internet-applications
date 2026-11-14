# Requirement 4: operation and acceptance checks

See [integration contract](req4-contract.md) for the event/auth/cache contract. The database owns order state. gRPC still owns inventory reservations. RabbitMQ transports email events. Reverb and its database broadcast queue operate independently of email.

## Configure and deploy

Keep existing database secret files and application/JWT keys. Merge the added values from root `.env.example` into your local `.env`; do not replace existing secrets. Generate separate random values for `RABBITMQ_PASSWORD` and `REVERB_APP_SECRET`. For example, run `php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"` twice and save each result locally.

The root example documents Compose settings. Backend `.env.example` documents additional transport timeouts, topology and retry settings. Frontend `.env.example` documents browser connection settings.

- RabbitMQ credentials and vhost must match the publisher/consumer configuration. Changing the bootstrap credentials on an existing RabbitMQ volume does not change its existing users; update broker users explicitly.
- RabbitMQ queue arguments (including retry TTLs) are immutable after declaration. Changing retry delays on existing queues needs a controlled topology migration: drain/replay pending messages and recreate only the affected empty retry queues, or deploy a separately versioned exchange/queue topology. Do not delete queued messages to apply configuration changes.
- `REVERB_APP_ID`, `REVERB_APP_KEY`, `REVERB_APP_SECRET` must match across Laravel and Reverb. Only the public key belongs in the frontend.
- `REVERB_HOST=reverb`, port `8080`, scheme `http` address the server inside Docker. `VITE_REVERB_HOST=localhost`, exposed `REVERB_PORT`, and `VITE_REVERB_SCHEME=http` address the browser. Use a public hostname/TLS proxy for remote deployment and configure allowed origin hostnames accordingly.
- Add the actual frontend origin to `CORS_ALLOWED_ORIGINS` if using another port, such as `http://localhost:5174`. `REVERB_ALLOWED_ORIGINS` contains hostnames.
- The browser settings are compiled at image build time. Rebuild frontend after changing them.
- The examples default to explicit local mock mode. The **running local stack now uses Resend SMTP** with `ORDER_EMAIL_ALLOW_MOCK=false`; see [active settings, real-recipient Postman environment and external-email evidence](resend-setup.md). The unverified Resend test sender permits only the account's own recipient address. Non-delivering mailers are rejected unless explicitly enabled for local/testing use; production cannot enable mock delivery.

```sh
docker compose config --quiet
docker compose build backend outbox-publisher email-worker reverb broadcast-worker frontend
docker compose up -d mysql mysql-replica inventory-mysql redis inventory-service rabbitmq
docker compose up -d backend
docker compose exec backend php artisan migrate --force
docker compose up -d scheduler outbox-publisher email-worker reverb broadcast-worker frontend
docker compose exec outbox-publisher php artisan messaging:health
```

Backend startup already runs migrations; the explicit command verifies deployment state. Preserve the project's existing replica-provisioning procedure. Worker connections disable replica reads.

On the project's Windows setup, prefix Docker commands with `wsl.exe -d Ubuntu --` and use `docker compose --project-directory /mnt/e/projects/internet-applications`. Keep an Ubuntu session open while running the stack, as described in the root README.

RabbitMQ has persistent storage and no host-published broker or management port. Reverb binds to host loopback by default. Do not remove the RabbitMQ volume during recovery.

## Independent processes

Compose runs each process separately:

| Service | Command |
| --- | --- |
| HTTP Laravel | `php artisan serve --host=0.0.0.0 --port=8000` |
| Outbox publisher | `php artisan outbox:publish` |
| Email consumer | `php artisan orders:email-worker` |
| WebSocket server | `php artisan reverb:start --host=0.0.0.0 --port=8080` |
| Broadcast queue | `php artisan queue:work database --queue=broadcasts --tries=5 --backoff=5 --timeout=30 --sleep=1` |
| Existing scheduler | `php artisan schedule:work` |
| Existing inventory | `npm start` in `inventory-service` (Compose provides its database/configuration) |
| Local frontend | `npm run dev` in `frontend` |

Outside Docker, install backend/frontend dependencies, configure backend `.env` for reachable MySQL/RabbitMQ/Reverb, run `php artisan migrate`, then launch the Laravel processes above in separate terminals. The Compose broker is internal only; use a separately reachable broker for native workers. `--once` on publisher/consumer is useful for diagnostics; it does not replace the continuous services.

Native PHP needs the extensions required by Composer, including sockets for php-amqplib and sodium for the existing JWT stack. On this Windows installation the DLLs are available; enable them for an individual command with `php -d extension=sockets -d extension=sodium ...`. For the isolated SQLite PHPUnit suite also add `-d extension=pdo_sqlite`. Docker installs sockets explicitly and already provides the other runtime extensions.

```sh
docker compose logs --tail=100 outbox-publisher email-worker broadcast-worker reverb
docker compose exec rabbitmq rabbitmqctl list_queues -p ecommerce name messages_ready messages_unacknowledged
docker compose exec backend php artisan queue:failed
```

Use `docker compose exec backend php artisan queue:retry <failed-job-id>` to retry a failed broadcast job after correcting its cause. Email retries and dead letters use RabbitMQ instead of Laravel's failed-jobs table. Inspect a dead letter's event ID and correct its cause before controlled replay; preserve the event ID so a previously delivered message is deduplicated. Never purge a queue as a recovery step.

## Manual acceptance

Use separate authenticated browser sessions for an administrator and two customers. Confirm stock is available and initial REST queries load successfully. Keep the browser Network/WebSocket panels visible.

### A. Stop only email

1. Start the full stack, open admin dashboard/orders, then `docker compose stop email-worker`.
2. Create an order as a customer with a new UUID `Idempotency-Key` through the normal UI.
3. Verify the HTTP response returns without email delivery, and the admin order list/summary updates without refresh.
4. Verify an outbox event persists and publication reaches `orders.email` using the queue command above. Allow the publisher's polling interval. If the broker is stopped, the event must remain unpublished instead.
5. Run `docker compose start email-worker`; verify a successful email/delivery record and that the queue drains. Verify actual inbox delivery only when SMTP is configured.
6. Repeat the same creation request/key: it must return the original order without another outbox event. Redeliver the same event ID: it must not send another already-recorded delivery.

### B. Customer status

1. Open that customer's order detail page and the administrator's order detail page in separate sessions.
2. Confirm the order through the existing admin status control (`pending` to `confirmed`).
3. Verify `.OrderStatusUpdated` on `private-orders.{id}` and a detail REST refetch; the customer status changes without reload.
4. Inspect React Query Devtools: the matching detail query and existing order-list queries are invalidated by the status event. Other order details retain their cached values.
5. Disconnect the customer's network, make another valid transition, then reconnect. Successful resubscription must refetch authoritative detail state despite the missed event.
6. Change the viewed order/unmount the page; confirm the old listener is released. Log out/change accounts; confirm the old connection is disconnected and protected cached data is cleared.

Also keep the customer's `/orders` page open while changing a visible order's status. The badge must update without reload. With the pending filter active, confirming a visible pending order must remove that row and refresh pagination through the existing REST query. List subscriptions cover the currently visible owned rows and are released when those rows change.

### C. Authorization

Using the existing bearer token and a real Reverb socket ID, POST `/api/broadcasting/auth` with `{ "socket_id": "<socket-id>", "channel_name": "private-orders.<other-customer-order-id>" }`. Expect 403. Repeat with a customer's token and `private-admin.orders`: expect 403. No token must receive 401. The owner and an administrator on their respective permitted channels should succeed. An admin who is not the owner must also fail the owner-only channel.

Verify order detail REST access separately: customers cannot access other customers' orders. Existing REST admin access remains controlled by existing policies/middleware.

### D. Architecture and recovery

1. Run existing create/update/delete/get/list hook regression tests and inspect Git changes: generic hooks, API clients, query keys, pagination and filters are preserved.
2. Stop RabbitMQ; create an order. Verify order and unpublished outbox row remain committed and admin WebSockets still work.
3. Restart RabbitMQ; verify publisher recovery and eventual email processing. Restart the broker without deleting its volume and verify queued messages survive.
4. With an isolated test SMTP endpoint, cause temporary send failures; confirm delayed bounded attempts and eventual DLQ on exhaustion. Restore SMTP and replay under operational control.
5. Run concurrent consumers on the same event ID; verify one delivery record and serialized sending. Do not perform destructive broker/database experiments on production data.

## Delivery guarantees

The outbox/publisher/consumer provide at-least-once processing. A crash after broker confirmation but before marking the outbox published can republish the stable event ID. Email records suppress already-completed deliveries. SMTP cannot atomically commit a database record: a crash after successful send but before recording success can still cause a duplicate. Stable email identifiers help correlation; provider-side idempotency is needed to eliminate that residual window.

WebSockets do not replay missed events. Subscription/reconnection invalidation recovers from authoritative REST state. Failed broadcasts use their independent database queue; email worker downtime does not block them.

The transactional outbox protects email events. A process crash between order commit and broadcast enqueue, or a database queue insertion failure, can still omit a live notification. Such enqueue errors are logged; the committed order remains authoritative and is recovered by a later REST load or resubscription. Reverb delivery after successful enqueue has the independent queue's bounded retries and failed-job recovery described above.

## Verification status

Actual automated results and environment limitations are recorded in the final QA/delivery report. The browser acceptance described below has passed with real React/Echo/Reverb and a test inventory boundary. A later [Postman runtime check](req4-evidence/postman-runtime.json) passed the worker-stop/restart scenario with real Docker MySQL/gRPC/RabbitMQ 3.13 and explicitly mocked email. The prepared local stack and imports are documented in [the Postman guide](../postman/README.md). External SMTP acceptance and the remaining transport fault-injection scenarios are recorded separately.

The isolated broker test setup uses its own Compose file, vhost and test-only credentials:

```sh
docker compose -p req4-verification -f docker-compose.req4-test.yml up -d --wait
```

Set `RUN_RABBITMQ_INTEGRATION_TESTS=true`, `RABBITMQ_HOST=127.0.0.1`, `RABBITMQ_PORT=5679`, `RABBITMQ_USER=req4_test`, `RABBITMQ_PASSWORD=req4-test-only`, and `RABBITMQ_VHOST=req4_test` in the test process, then run `php vendor/bin/phpunit --filter RabbitMqTransportTest` with the native extension flags above if needed. The test refuses vhosts without `test` in their name and creates unique per-test topology. Use `docker compose -p req4-verification -f docker-compose.req4-test.yml down` to clean up only this isolated test stack.

For the complete isolated SQLite regression suite, run from `backend/my-project`:

```powershell
php -d extension=sockets -d extension=sodium -d extension=pdo_sqlite -d extension=gd vendor/bin/phpunit
node tests/qa/reverb-wire-smoke.mjs
```

The Node smoke script creates a guarded generated SQLite fixture, starts its own test HTTP/Reverb processes, uses the real broadcast database queue and production authorization/order/event paths, and cleans up afterward. It stubs only inventory calls in its test router. Ports 18000 and 18080 must be free. It verifies native WebSocket wire behavior, not a full browser UI or real gRPC/RabbitMQ/SMTP deployment.

From `frontend`, run `npm test`, `npm run lint`, and `npm run build`. See [actual independent QA evidence](req4-qa-report.md) for the final results and blocked checks.

`npm run test:browser` in `frontend` runs actual production React/Echo pages in an isolated headless Edge/Chrome profile with the guarded HTTP/Reverb fixture. It checks dashboard announcements/counts, new order rows, admin approval, customer status and unchanged document navigation timestamps. It mocks inventory only and uses separate generated build output; it does not prove RabbitMQ or external SMTP.

For the specific worker-stop/restart proof, configure the isolated broker variables above and run `node tests/qa/email-worker-restart-smoke.mjs` from `backend/my-project`. See its [guarded restart procedure](../backend/my-project/tests/qa/email-worker-restart.md). A missing broker returns BLOCKED/exit 2; it is never counted as a passing restart scenario. This scenario uses real RabbitMQ/Artisan worker processes and explicitly mocked email.
