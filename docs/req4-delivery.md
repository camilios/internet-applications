# Requirement 4 delivery record

## Current email setup — Resend

The user's later Resend setup request supersedes the historical mock-only scope below. The running worker uses real Resend SMTP with mock mode disabled. Main verified actual order **300016** through HTTP, MySQL, gRPC inventory, outbox, RabbitMQ and independent worker stop/restart: queue 1/deliveries 0 while stopped; queue 0/one `external` delivery after restart; one delivery after order/event replay. The recipient explicitly confirmed receipt. A read-only provider lookup returned HTTP 401, so provider-side status was not retrieved. [Current setup and exact evidence](resend-setup.md).

`OrderConfirmation.php` adds a stable Resend SMTP idempotency header per event, tested in `OrderConfirmationHeadersTest.php`; the sender logs a sanitized transport/message identifier. Provider retention is 24 hours, so this is not permanent exactly-once delivery. Current backend verification: **102 tests / 591 assertions / 4 isolated broker skips**, scoped Pint PASS. The older results and deferrals below describe their original test snapshots.

## Architecture

Laravel creates the order and its unique email event atomically in the existing order transaction. A standalone outbox publisher sends persistent mandatory messages with broker confirmation. A separate email consumer uses manual acknowledgement, confirmed delayed retry/dead-letter publication, and an event-ID-unique delivery row locked while sending. Delivery is marked only after Laravel Mail succeeds.

Post-commit `OrderCreated` and `OrderStatusUpdated` events use the independent Laravel database `broadcasts` queue and Reverb. JWT-protected private channels check the database role/ownership. The React layer shares an authenticated Echo connection, releases listeners when their owners unmount, and refetches targeted existing queries on notifications and successful subscriptions. This resynchronizes missed events without allowing older status payloads to overwrite newer REST state.

See the [canonical contract](req4-contract.md) and [deployment, process commands, environment variables and acceptance instructions](req4-operations.md).

## Team

- Project reviewer: completed the initial read-only architecture audit and an additional reliability/security review.
- Frontend engineer: owns the shared Echo lifecycle, order synchronization hooks, minimal wiring and frontend tests.
- Backend engineer: owns outbox, AMQP, email processing, broadcasts, private authorization, migrations and backend tests.
- Main agent: owns the shared contract, root infrastructure, documentation and integration review.
- QA engineer: completed independent regression, architecture, live Reverb wire verification and a real browser acceptance run; actual evidence and blocked scenarios are recorded in the QA report.

## Backend file responsibilities

Paths below are relative to `backend/my-project/`.

| Files | Responsibility |
| --- | --- |
| `app/Services/OrderService.php` | Atomic outbox insertion, post-commit broadcast/cache integration; preserve existing inventory lifecycle |
| `app/Services/Messaging/{MessageBroker,RabbitMqBroker,IncomingMessage}.php` | Transport boundary, durable topology, confirms, mandatory returns, manual ACK |
| `app/Services/Messaging/OutboxPublisher.php` | Locked publication, success marker, retry/backoff |
| `app/Services/Messaging/{EmailMessageProcessor,OrderConfirmationSender,PermanentMessageException}.php` | Validation, retry/DLQ, serialized idempotent sending |
| `app/Services/Messaging/{MailDeliveryConfiguration,MailDeliveryConfigurationException}.php` | Reject non-delivery mailers and invalid fallbacks; allow explicit local mock mode; validate before consuming or recording success |
| `app/Models/{OutboxEvent,NotificationDelivery}.php` | Persistent publication/delivery records |
| `database/migrations/2026_11_14_000001_create_outbox_events_table.php` | Stable event IDs, unique order event, publication/backoff state |
| `database/migrations/2026_11_14_000002_create_notification_deliveries_table.php` | Unique delivery record and success timestamp |
| `database/migrations/2026_11_14_000003_add_delivery_mode_to_notification_deliveries.php` | Distinguish deliberate mock handling from external transport acceptance; leave legacy records unclassified |
| `app/Console/Commands/{PublishOutbox,OrderEmailWorker,MessagingHealth}.php` | Independent publisher, consumer and transport health commands |
| `app/Mail/OrderConfirmation.php`, `resources/views/mail/order-confirmation.blade.php` | Existing Laravel Mail provider integration and email rendering |
| `app/Events/{OrderCreated,OrderStatusUpdated}.php` | Minimal post-commit private broadcast contracts |
| `routes/channels.php`, `routes/api.php`, `app/Providers/AppServiceProvider.php` | JWT channel authorization, route and transport registration |
| `config/{rabbitmq,broadcasting,reverb}.php`, `config/mail.php` | Environment-driven topology, transport, WebSocket and mail timeouts |
| `composer.json`, `composer.lock`, `Dockerfile`, `.env.example`, `.gitignore` | Dependencies, sockets support, configuration examples, local tooling exclusion |
| `tests/Feature/{OrderMessagingTest,OrderBroadcastingTest,RabbitMqTransportTest}.php` | Transactions, commits, delivery/ACK/retries, authorization and gated real broker verification |
| `tests/Feature/OrderMailConfigurationTest.php` | Mock opt-in, production rejection, invalid fallback/configuration handling, delivery provenance and no automatic replay |
| `phpunit.xml` | Lengthen the existing test-only JWT secret to satisfy the HMAC library's 256-bit minimum; no production secret change |
| `tests/qa/reverb-{bootstrap,fixture,router}.php`, `tests/qa/reverb-wire-smoke.mjs` | Guarded isolated HTTP/SQLite/database-queue/Reverb wire acceptance harness; test-only inventory stub |
| `tests/qa/email-worker-restart-{smoke.mjs,fixture.php}`, `tests/qa/email-worker-restart.md` | Gated real RabbitMQ/Artisan process stop-and-restart proof with explicit mock email; returns BLOCKED when no isolated broker is available |

## Frontend file responsibilities

Paths below are relative to `frontend/`.

| Files | Responsibility |
| --- | --- |
| `src/lib/realtime/connection-manager.ts` | Shared session transport, ref-counted listeners and cleanup |
| `src/lib/realtime/echo-client.ts` | Echo/Pusher adapter, existing Axios authorization and stale-session cancellation |
| `src/lib/realtime/realtime-context.ts`, `src/app/providers/realtime-provider.tsx` | Shared manager lifecycle, auth changes and protected cache cleanup |
| `src/features/orders/hooks/use-order-realtime.ts` | Admin and owner-detail targeted query synchronization |
| `src/features/orders/realtime/order-status-notifications.ts` | Customer list/detail status toasts using existing Arabic labels and bounded event-ID deduplication per authentication session |
| `src/app/providers/index.tsx`, `src/components/layout/app-shell.tsx`, `src/routes/_authenticated/orders/$orderId.tsx` | Minimal provider/admin/detail subscription wiring |
| `tests/realtime/*.test.ts`, `tests/realtime/*.test.tsx`, `tests/realtime/fakes.ts`, `vitest.config.ts` | Lifecycle, adapter, cache and existing CRUD regression verification |
| `tests/realtime/browser-acceptance.mjs`, `.gitignore` | Real headless browser DOM/Echo/no-reload acceptance with isolated generated build/profile and retained screenshots |
| `package.json`, `package-lock.json`, `Dockerfile`, `.env.example` | Echo/Pusher, test tools and browser build configuration |

The existing `useCreate`, `useUpdate`, `useDelete`, `useGet`, `useGetAll`, feature hooks `useOrders`, `useOrder`, `useCreateOrder`, `useUpdateOrderStatus`, their keys and API client are preserved. No generic hook change is required. Inventory service and protobuf files remain unchanged.

After reviewing the literal Arabic requirement, the admin realtime hook also announces each unique new order in Arabic on the dashboard. The user explicitly requested mock email for now; see [text compliance and mock scope](req4-text-compliance.md). Local mock handling is explicitly configured and recorded as `mock`, never represented as external inbox delivery.

The subsequent customer `/orders` report exposed a missing list subscription: details updated but the customer's list remained stale. `useOrderListStatusRealtime` now subscribes to currently visible owned order channels, coalesces event bursts into the existing list/detail REST invalidation, and releases subscriptions on page/filter/session changes. Detail events also invalidate existing lists for navigation back. Generic CRUD hooks, API methods and query keys remain unchanged. The [actual deployed-browser baseline](req4-evidence/customer-status-before.json) reproduces the defect; the [after-fix run](req4-evidence/customer-status-after.json) passes for the list badge, removal from the pending filter and detail status, with all four documents retaining their original navigation times. The current frontend suite contains 24 tests including the customer toast coverage.

Actual customer status events also show an Arabic info toast with the order number and existing status label on list/detail pages. The shared notifier deduplicates event IDs across hooks and route remounts within an authentication session; session changes reset its bounded history. Initial subscriptions, reconnections and REST refetches do not announce a new status. Admin and other-owner notifications are excluded from this customer notifier. The [deployed-browser toast check](req4-evidence/customer-status-toast.json) passed on the customer list, pending-filter list and details alongside the live status changes, with no page reload.

## Dependencies and infrastructure

Backend adds `laravel/reverb` and `php-amqplib/php-amqplib` with their required dependencies. Existing locked package versions are unchanged. Frontend adds `laravel-echo` and `pusher-js`; Vitest, Testing Library and jsdom provide the focused test harness because no frontend runner previously existed.

Root `docker-compose.yml` adds persistent internal RabbitMQ, outbox/email/Reverb/broadcast processes, health checks and frontend build arguments. `.env.example` documents configuration without real credentials. `docker-compose.req4-test.yml` provides an isolated broker for live transport checks. README links the contract and operations guide.

## Verification and limitations

The [independent QA report](req4-qa-report.md) records commands, counts and actual PASS/FAIL/BLOCKED results. Following the literal-text review, the backend suite ran 93 tests with 565 assertions, four gated broker tests skipped, and no failures/errors. Frontend: 16 tests passed; lint and production build passed. The isolated live HTTP/database-queue/Reverb wire smoke test also passed with email worker and broker absent, including channel authorization and unpublished outbox persistence. Actual production React/Echo browser acceptance passed: dashboard announcement/count, admin list row, existing approval UI, customer status refetch, and unchanged navigation timestamps across four documents.

During the subsequent Postman startup task, a cached RabbitMQ 3.13 image became available. Main ran the [actual local runtime smoke check](req4-evidence/postman-runtime.json): 28 exported collection requests and 32 script assertions passed against real Docker MySQL, real inventory gRPC, RabbitMQ and Reverb. With the email worker stopped, one confirmed message remained queued and no delivery existed; after restart, one mock delivery existed and the queue drained. Actual private admin/order events and authorization rejections passed. This supersedes the earlier worker-restart and functional gRPC availability blockers. The harness runs selected exported requests/scripts with Node/Chai, not the Postman app or Newman.

The four original isolated transport tests on RabbitMQ 4.2, broker-restart persistence, live retry/DLQ fault injection and concurrent MySQL consumers remain unverified by this runtime smoke. External email is deliberately deferred by the user's mock-for-now instruction. SMTP retains a residual crash-after-send-before-record duplicate window when enabled. WebSockets do not replay missed events; REST resynchronization is required. All three migrations were applied to the running local stack. Full distributed-system acceptance is not claimed. See [Postman imports and local testing](../postman/README.md).
