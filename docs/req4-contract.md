# Requirement 4 integration contract

The completed repository audit found Laravel 12, JWT `api` authentication, an idempotent gRPC inventory workflow, and React Query 5 with reusable CRUD hooks. No existing RabbitMQ or WebSocket implementation exists. Preserve inventory/protobuf, REST contracts, query keys and generic CRUD hooks.

| Concern | Approved contract |
| --- | --- |
| Provider | Laravel Reverb, Laravel Echo and Pusher protocol |
| Authorization | `POST /api/broadcasting/auth` using existing Axios/JWT; backend `auth:api` |
| Admin channel | `admin.orders`, current database role `admin` only |
| Order channel | `orders.{orderId}`, authenticated owner only (no admin override) |
| Created alias/listener | `OrderCreated` / `.OrderCreated` |
| Created payload | `{event_id: UUID, order_id: number, occurred_at: ISO8601}` |
| Status alias/listener | `OrderStatusUpdated` / `.OrderStatusUpdated` |
| Status payload | `{event_id: UUID, order_id: number, status: existing enum, occurred_at: ISO8601}` |
| Timing | Dispatch after commit; clear affected dashboard cache before dispatch |
| Broadcast queue | Independent Laravel database queue `broadcasts`, never RabbitMQ email queue |
| Admin cache | Invalidate `orderKeys.lists()` and `dashboardKeys.summary` |
| Order cache | Invalidate `orderKeys.detail(orderId)` exactly and the existing order-list prefix; no unrelated detail changes |
| Customer orders list | Subscribe to `orders.{id}` only for owned rows on the current visible page, with stable ID-based subscriptions and cleanup on page/filter/account changes; status events refetch lists and the matching detail |
| Customer status toast | On a valid matching live `OrderStatusUpdated`, announce the order ID and existing Arabic status label on list/detail pages; deduplicate by event ID across hooks within the auth session; initial subscription/reconnect/refetch does not announce an update |
| Recovery | Resync on successful initial subscription and resubscription/reconnection |
| Lifecycle | One shared connection per auth session; deduplicated subscriptions; cleanup on unmount, order change, logout and token change |

Payloads exclude contact/payment/item/total data. REST remains authoritative. Targeted invalidation avoids partial cache overwrites and stale event ordering without altering API schemas. Preserve pagination, filters, response types, fetching/mutation callbacks, the single QueryClient, and generic CRUD hooks.

## Reliable processing

Persist a stable OrderCreated email outbox event alongside the order in its existing persistence transaction, once per idempotent order. A separate publisher uses durable RabbitMQ topology, persistent mandatory messages and publisher confirms; mark published only after broker confirmation. Recover failures with bounded retry backoff. Read from the database primary in workers.

The independent Laravel email consumer uses manual ACK, bounded retry/backoff, confirmed retry/DLQ routing, and an event-ID-unique delivery record. Record delivered only after Laravel Mail succeeds. Document the residual SMTP send-success/record-failure duplicate window; do not claim exactly once.

The user's later Resend request activates external SMTP in the current local stack; see [Resend setup](resend-setup.md). Examples retain an explicit local mock option (`ORDER_EMAIL_ALLOW_MOCK=true`) recorded as `delivery_mode=mock`; it is not evidence of external delivery. Production rejects mock/non-delivering mailers. The worker validates mail configuration before consuming messages. Provider changes do not automatically replay previously handled messages. Resend SMTP gets a stable per-event idempotency header with a provider retention window of 24 hours. Admin creation events also show a deduplicated Arabic new-order toast on the existing dashboard.

Process names: `outbox:publish` (loop, `--once`); `orders:email-worker` (loop, `--once`); `messaging:health`; `queue:work database --queue=broadcasts --tries=5 --backoff=5 --timeout=30`; `reverb:start --host=0.0.0.0 --port=8080`.

## Ownership and plan

1. Project reviewer: completed read-only audit first.
2. Frontend engineer: `frontend/**`, including Dockerfile, environment example, dependencies and tests.
3. Backend engineer: `backend/my-project/**`, including Dockerfile, environment example, dependencies and tests.
4. Main: root Compose/environment and shared operational/delivery documentation; inspect and integrate actual changes.
5. QA engineer: independent verification only after integration; return production defects to the responsible engineer.

Implement backend messaging and frontend synchronization in parallel. Integrate infrastructure using existing network, add health checks and persistent RabbitMQ storage, document startup and acceptance scenarios, then run actual migrations/tests/lint/build/integration/manual verification where available. Distinguish passed checks from blocked checks. Preserve all preexisting unrelated working-tree changes.
