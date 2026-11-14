# Requirement 4 independent QA report

## Customer status toasts on list and detail — 14 November 2026

**QA independently ran `npm.cmd test -- --maxWorkers=1`: four files / 24 tests PASS, exit 0 (14.03 seconds).** This supersedes the earlier 21-test frontend count. QA inspected the shared notification helper, both hook integrations, auth-generation metadata, regression tests and preservation diffs. No production defect requiring correction was found. QA did not repeat the build, backend suite or live browser run for this frontend-only addition.

**Main executed the deployed-browser toast check; QA independently reviewed its saved evidence**, [customer-status-toast.json](req4-evidence/customer-status-toast.json), recorded at 13:39 UTC / 16:39 Damascus for order **300014**. The actual deployed React/Echo application and Docker Laravel/MySQL/real inventory gRPC/RabbitMQ 3.13/Reverb were used, with separate authenticated browser contexts, the existing admin approval control and explicit mock email.

| Main's actual deployed-browser check | Result |
| --- | --- |
| `/orders` row becomes confirmed and customer toast appears | **PASS** |
| Pending-filter order disappears and customer toast appears | **PASS** |
| `/orders/:id` becomes confirmed and customer toast appears | **PASS** |
| No full document reload / uncaught browser errors | **PASS / 0** |
| Observed status-check elapsed time | **614 ms** |

The Arabic toast uses the existing service and status labels: `تم تحديث حالة الطلب #<id>` with `الحالة الجديدة: <Arabic status>`. It is invoked by matching live status events on both pages, not by initial REST loading, subscription success or reconnection. Shared per-manager/per-auth-generation metadata remembers the latest 100 event UUIDs, suppressing duplicates across both hooks and route remounts without storing application data outside React Query. Auth changes reset that metadata.

Independent tests/inspection cover: duplicate delivery across both hooks, route remount and reconnect; new auth-generation reset including logout/relogin; malformed IDs/unknown statuses; another owner/admin session; and callbacks after logout. The helper checks current authenticated customer ownership, matching order ID, UUID-shaped event ID and an existing status label before showing a toast. Cache synchronization and timer cleanup remain in the existing real-time layer; generic CRUD hooks, order API/client, query keys and QueryProvider remain unchanged. Preservation diffs and `git diff --check` passed. QA edited only this report.

## Customer order-list status fix — 14 November 2026

**QA independently ran `npm.cmd test -- --maxWorkers=1`: four files / 21 tests PASS, exit 0.** This supersedes the earlier 16-test frontend count. QA reviewed the production fix, five added regression tests, preservation diffs and Main's actual deployed-browser before/after evidence. Main executed the live browser runs; QA did not rerun that browser or repeat backend/build checks for this frontend-only change.

| Main's deployed-browser evidence | Before fix | After fix |
| --- | --- | --- |
| Customer `/orders` row becomes confirmed | `false` | **`true`** |
| Changed order leaves the active pending filter | `false` | **`true`** |
| Customer detail becomes confirmed | `true` | **`true`** |
| No full page reload | `true` | **`true`** |
| Uncaught browser errors | 0 | **0** |
| Observed status-check elapsed time | 10,312 ms, stale list reproduced | **449 ms, PASS** |

Evidence: [before, order 300011](req4-evidence/customer-status-before.json) at 13:23 UTC / 16:23 Damascus; [after, order 300012](req4-evidence/customer-status-after.json) at 13:27 UTC / 16:27 Damascus. These use the actual deployed React/Echo application, separate authenticated browser contexts, the existing admin status control, and Docker Laravel/MySQL/real inventory gRPC/RabbitMQ 3.13/Reverb. Email remains explicitly mocked. The before evidence validates the user's report: the earlier successful detail-page proof did **not** establish live synchronization of the customer's order list.

The fix adds dedicated subscriptions for the current customer's **owned visible order IDs** on `/orders`, and makes detail status notifications invalidate the existing order-list prefix as well as the exact detail key. REST refetching preserves pagination, sorting and active status filters; it does not patch incomplete event data into cached lists.

Independent inspection and the five new regression tests verify: matching list/detail refresh with unrelated details untouched; removal from a pending filter using server pagination; stable subscriptions when REST objects reorder or repeat; previous-page listener and pending-timer cleanup; missed-event resynchronization on subscription success; ignored mismatched events; and no customer-list subscription under an admin session. Session/ownership checks remain enforced, and private-channel server authorization is unchanged. Cleanup cancels pending batches and rejects stale callbacks after page/account changes or unmount.

Preservation checks passed with an empty diff over generic CRUD hooks, `use-orders.ts`, the existing order API/shared API client, QueryProvider, inventory service and protobufs. `git diff --check` passed. QA made no production changes. Earlier RabbitMQ 4.2 transport/concurrency limitations and the external-mail deferral below are unaffected.

## Live runtime follow-up — 14 November 2026

**The Main agent executed the live checks below; QA independently reviewed the saved runtime evidence and exported collection, and did not execute this live run.** The runner exercised selected exported requests and their scripts through **Node/Chai**, not Postman or Newman. Evidence: [postman-runtime.json](req4-evidence/postman-runtime.json), recorded at 13:11 UTC / 16:11 Damascus.

| Live evidence recorded by Main | Actual result |
| --- | --- |
| Runtime | Docker MySQL, real inventory gRPC, RabbitMQ **3.13**, Reverb and independent workers; email explicitly mocked |
| Selected collection requests/scripts | **28 HTTP requests / 32 script assertions passed**; this is a selected subset of the 43-request collection |
| Email worker stopped, order 300007 / product 23 | One outbox event published, **zero deliveries**, **one broker message ready**; order HTTP response returned 201 |
| Email worker restarted | **One completed mock delivery**, one delivery record, **zero broker messages ready** |
| Live private-channel behavior | Actual `OrderCreated` and confirmed `OrderStatusUpdated` events; expected 401/403 authorization rejections; same-key order replay returns 201 |
| Frontend availability | HTTP 200 |

This **supersedes the earlier broker-blocked snapshot for the worker stop/restart demonstration and the real MySQL/gRPC functional happy path on the prepared RabbitMQ 3.13 stack**. QA's read-only collection review also verified 43 requests covering all 28 documented operations, script/body syntax, token capture, idempotency retention/reset, corrected variable scopes and JSON/YAML contract parity.

Limits remain: the **four original isolated RabbitMQ transport tests are still skipped** and have not been executed on the tracked RabbitMQ 4.2 configuration; explicit transport redelivery/unroutable/TTL/DLQ experiments and concurrent MySQL consumers remain unverified by this follow-up. External-provider delivery remains **deferred by the user's “mock for now” choice**. A mock completion is not external inbox evidence, and this follow-up is not an exactly-once guarantee or a claim that every collection request ran in Postman.

## Historical independent QA snapshot

The results below describe the earlier isolated verification environment. Its broker-unavailable statements are historical and are superseded only to the extent stated in the live follow-up above. The original test counts and execution attribution remain unchanged.

Date: 14 November 2026. Agent: independent QA engineer, after frontend/backend implementation and Main integration. Updated after the explicit local mock-email safeguards and dashboard announcement were integrated.

**Historical snapshot result: 93 backend tests / 565 assertions / 4 broker skips; 16 frontend tests; lint, build, formatting and actual browser acceptance PASS. The isolated RabbitMQ worker stop/restart proof was BLOCKED at that time. External-provider email is DEFERRED by the user's explicit “mock for now” instruction. This is not a claim of complete distributed acceptance or of external email delivery.**

## Literal Arabic requirement proof matrix

The user supplied the literal requirement after the initial implementation. This matrix uses that text and its later explicit mock-email exception.

| Literal requirement | Actual proof | Current status |
| --- | --- | --- |
| نشر الحدث عند إنشاء الطلب في RabbitMQ والتطبيق يرد دون انتظار | Transactional outbox creation/rollback/idempotency tests pass; actual browser HTTP creation succeeds with no email worker or broker and leaves one durable unpublished event. Publisher confirmation logic passes at the mocked transport boundary. | PASS for non-blocking creation/outbox; actual RabbitMQ publication BLOCKED |
| عامل مستقل يرسل بريد تأكيد حقيقياً عبر خدمة خارجية | Separate Artisan worker exists. User subsequently said **“mock for now”**. Explicit local/test mock is labelled `mock`; log/array is rejected in production and non-delivery fallbacks are rejected. No external provider was contacted for QA. | Mock implementation/tests PASS; external delivery DEFERRED by user |
| الرسالة لا تضيع بتعطل العامل، مع retry وDLQ للفشل الدائم | Failure/ACK/retry/DLQ/duplicate tests pass at service boundaries. Actual stop/restart harness exists and its isolated broker probe returns `BLOCKED`, exit 2. Broker image is still unavailable. | Full broker/restart proof BLOCKED; no loss-free live claim |
| صاحب الطلب فقط يتابع حالته لحظياً دون refresh | Private owner-only auth tests and real WebSocket authorization checks pass. Independent production-browser test observes customer status change to «مؤكد» after admin approval; document `timeOrigin` remains unchanged. | PASS for real browser/HTTP/Reverb/SQLite; inventory stubbed |
| الطلب الجديد يظهر فوراً بلوحة المسؤول، الدخول للمسؤول فقط | Independent production-browser test observes Arabic new-order toast, dashboard count and order row through real Echo events; no reload. Actual JWT admin-channel checks reject ordinary customers. | PASS |
| التحقق من الهوية والصلاحية قبل الاشتراك بالقناتين | Production authorization endpoint requires JWT; actual socket-ID/bearer tests produce 401 without auth, 403 for wrong owner/customer admin channel/non-owner admin, and allow correct owner/admin. REST ownership is independently checked. | PASS |
| إثبات توقف العامل وتشغيله لا يضيع بريد، ظهور طلب جديد للمسؤول، ظهور موافقته للزبون | Admin appearance and customer approval are now demonstrated in a real browser. The actual RabbitMQ worker-restart script is implemented but cannot execute beyond its broker probe. | Browser proofs PASS; worker-restart proof BLOCKED |

## Independently executed checks

| Command/check | Actual result | Status |
| --- | --- | --- |
| Backend: `php -d extension=sockets -d extension=sodium -d extension=pdo_sqlite -d extension=gd vendor/bin/phpunit` | **93 tests, 565 assertions, 4 skipped; exit 0.** Runtime PHP 8.2.10, PHPUnit 11.5.57. The four skips are gated RabbitMQ transport tests. Includes 18 added mail-configuration cases. | PASS; live broker coverage BLOCKED |
| Frontend: `npm.cmd test -- --maxWorkers=1` | Four test files, **16 tests passed**, exit 0. Includes generic CRUD regression and announcement deduplication assertions. | PASS |
| Frontend: `npm.cmd run lint` | Exit 0; existing-file React warnings (Fast Refresh exports, existing effect/library/form patterns). No new real-time-layer warning. | PASS with warnings |
| Frontend: `npm.cmd run build` | TypeScript and Vite production build exit 0; 8509 modules, JS **898.71 kB / 276.61 kB gzip**. Vite reports a large-chunk warning. | PASS with warning |
| Scoped backend `vendor/bin/pint --test` with sockets/sodium enabled | Passed across changed/new production PHP, new feature tests and QA harness PHP. | PASS |
| `php -d extension=sockets -d extension=sodium .tools/composer.phar validate --no-check-publish` | Valid; exit 0. Existing exact JWT package constraint warning; Git subprocess ownership warnings do not affect validity. | PASS with warnings |
| `php -d extension=sockets -d extension=sodium -d extension=pdo_sqlite artisan list --raw` | `outbox:publish`, `orders:email-worker`, `messaging:health`, `reverb:start` registered. | PASS |
| Root Compose `config --quiet` through WSL with test-only placeholder RabbitMQ/Reverb secrets | Exit 0; no services started. | PASS |
| Isolated `docker-compose.req4-test.yml` `config --quiet` through WSL | Exit 0; no application services started. | PASS |
| `git ... diff --check` | Exit 0. | PASS |
| Preservation diff over generic CRUD hooks, `use-orders.ts`, order API, shared API client, QueryProvider, inventory service and protobuf directory | Empty diff; exit 0. | PASS |
| `node tests/qa/reverb-wire-smoke.mjs` from `backend/my-project` | Passed with real HTTP/SQLite/database queue/Reverb WebSockets. Repeated after formatting the harness; passed again. | PASS within stated scope |
| Frontend: `npm.cmd run test:browser` | Independently rerun after the latest changes; exit 0. Real headless Edge, production React/Echo/Pusher, production Laravel HTTP/JWT, isolated SQLite, actual database queue and Reverb. All three browser evidence checks pass. | PASS within stated scope |
| `node --check tests/qa/email-worker-restart-smoke.mjs` and PHP `-l` on its fixture | Both exit 0. | PASS syntax |
| `node tests/qa/email-worker-restart-smoke.mjs` safety probes | Disabled integration gate, non-test vhost, and configured isolated localhost:5679 each return actual `BLOCKED`, exit 2. No full restart steps executed. | PASS guards; scenario BLOCKED |
| WSL `docker image inspect rabbitmq:4.2-alpine --format '{{.Id}}'` | Exit 1: `No such image`. No additional image pull attempted by QA. | Broker image unavailable |

The full PHPUnit suite runs migrations against forced SQLite `:memory:`. Real-commit broadcasting tests also guard the isolated in-memory configuration before `migrate:fresh`. The live wire harness creates and migrates its own uniquely named `.tools/req4-qa-<uuid>.sqlite` file. No production database was migrated or reset.

## Backend requirement evidence

| Requirement | Test/evidence | Result |
| --- | --- | --- |
| Order and stable outbox event persist together; creation never sends email or publishes inline | `OrderMessagingTest::test_order_and_stable_outbox_event_are_created_once_without_email_or_broker`; live HTTP creation succeeds with no broker/email process | PASS |
| Transaction rollback leaves no order/items/outbox/broadcast | Outbox insertion-failure test; real-commit outer rollback test | PASS |
| Failed publication does not mark published; bounded backoff | `test_failed_publication_keeps_event_unpublished_and_retries_with_backoff`, mocked transport failure | PASS at service boundary |
| Published marker follows broker confirmation | `test_published_marker_is_written_only_after_confirmed_transport_returns`; transport source checks mandatory return/NACK/ACK handlers | PASS at service boundary; actual broker confirmation BLOCKED |
| Email success precedes ACK | Array-mailer send records delivery before acknowledgement; duplicate message sent only once | PASS at service boundary |
| Temporary failure uses delayed retry and confirms before original ACK | Retry processor test asserts confirmation/ACK order | PASS at service boundary; actual TTL transfer BLOCKED |
| Exhausted/permanent failures reach DLQ | Exhausted and malformed-message tests assert confirmed DLQ publication; retry publication failure leaves original unacknowledged | PASS at service boundary; actual broker DLQ BLOCKED |
| Failed mail is not marked delivered | Mail exception leaves nullable delivered timestamp; later processing remains eligible | PASS |
| Duplicate event creates one record and avoids already-recorded resend | Actual Laravel array transport processes same event twice, one message and one delivery record | PASS sequentially; concurrent MySQL consumers unverified |
| Mock versus external delivery cannot be confused | `OrderMailConfigurationTest`: explicit local opt-in, production/staging rejection, nested fallback/URL rejection, success-only delivery-mode recording, legacy unknown preservation and no automatic resend after provider change | PASS; mock is never external inbox evidence |
| Invalid mail setup preserves messages | Worker preflight rejects configuration before any receive; sender has the same guard; configuration exception causes no ACK, retry publication or DLQ publication | PASS at tested boundaries |
| OrderCreated dispatches after commit on independent database queue | Real-commit event/queue tests; live queue worker delivers `OrderCreated` over Reverb while email worker/broker are absent | PASS |
| Admin channel rejects ordinary users | Unit HTTP auth tests plus live bearer-token HTTP auth using actual WebSocket socket ID | PASS |
| Order channel rejects another owner and non-owner admin; no token rejected | Unit tests and live auth: 403 for wrong owner/admin, 401 without token; owner subscription succeeds | PASS |
| Status broadcast targets correct private order channel after commit | Real-commit test; live authenticated admin PATCH, database worker and owner WebSocket receive matching ID/status | PASS |
| REST protection remains independent | Existing security suite and live other-customer order GET returns 403 | PASS |
| Durable topology, persistence, manual ACK, mandatory routing, reconnect and bounded retry configuration | Code/infrastructure inspection; four actual transport tests exist but skipped | Implemented; live broker validation BLOCKED |

## Frontend requirement evidence

The 16 passing Vitest tests verify the hook/adapter behavior below. The separate actual browser test now also proves admin visibility and customer approval through production Echo/Reverb; it does not replace the narrower lifecycle and cache tests.

| Requirement | Evidence | Result |
| --- | --- | --- |
| Admin event updates active order query without page reload | `order-realtime.test.tsx` changes authoritative API result, emits OrderCreated and observes existing query result change | PASS |
| Dashboard announces a new order without duplicate toasts | Existing order hook emits Arabic `طلب جديد #<id>` once per bounded remembered event ID; duplicate event/resubscription assertions pass. Real browser sees the toast and count change. | PASS |
| Customer status updates existing detail query | Owner status event refetches `orderKeys.detail(id)` and exposes new status | PASS |
| Only intended queries change | Other details/products retain identity and invalidation state; wrong order event ignored | PASS |
| Existing CRUD behavior and query conventions | `crud-regression.test.tsx` covers get/get-all/create/update/delete, callbacks, loaders, toasts and targeted invalidation; original source files have empty diffs | PASS |
| Pagination/filter response shape remains intact | Existing page/status arguments and Laravel pagination metadata asserted | PASS |
| Cleanup and no duplicate listener | Shared manager/ref counting, unmount, ID change, StrictMode and repeated unsubscribe tests | PASS |
| Reconnect and missed-event synchronization | Every successful subscription triggers authoritative refetch, including missed status change | PASS |
| Duplicate/out-of-order payloads cannot overwrite current status | Invalidation-only test retains newest REST state after old and duplicate notifications | PASS |
| Initial in-flight stale fetch cannot win | Event cancels initial request, refetches and ignores old response | PASS |
| Auth changes/logout and stale authorization | Manager replaces session connections; protected cache removed; adapter aborts/rejects late authorization | PASS |

## Live Reverb smoke scope and evidence

Run from `backend/my-project`:

```powershell
node tests/qa/reverb-wire-smoke.mjs
```

Node 22+ and the installed PHP dependencies/extensions are required. On Windows the script enables sockets, sodium, pdo_sqlite and GD for its child PHP processes. Ports 18000/18080 must be available. The script creates test-only credentials/configuration, starts a guarded test HTTP kernel and native Reverb, and runs the actual Laravel database broadcast worker separately. Only inventory calls are stubbed in the test HTTP harness; production application code is unchanged.

Observed assertions:

1. Real JWT admin authorization and `private-admin.orders` WebSocket subscription succeed.
2. Real customer HTTP order creation returns 201 with no RabbitMQ/email worker; database inspection shows one order, one unpublished outbox event, zero deliveries and one queued broadcast.
3. Running the independent database worker delivers `OrderCreated` to the admin socket with exactly `event_id`, `order_id`, `occurred_at`.
4. Actual `/api/broadcasting/auth` rejects wrong-customer and non-owner admin order subscriptions (403), ordinary customer admin subscription (403), and unauthenticated subscription (401).
5. Other-customer REST order access returns 403; the owner subscribes successfully.
6. Authenticated admin HTTP status PATCH returns 200; the separate worker delivers `OrderStatusUpdated` to the owner's exact private order channel with the minimal agreed payload.
7. The broadcast queue drains while email delivery remains zero and the outbox remains unpublished.
8. Replaying creation with the same idempotency key returns the original order and retains one outbox event.

The test's first attempt exposed a missing request binding in the **new QA HTTP harness**, which was corrected in that test file. No application production fix was needed. Two subsequent complete wire runs passed.

## Actual browser acceptance

From `frontend`, `npm.cmd run test:browser` was independently executed after the latest mock guards and toast changes. It passed with a real headless Edge process and a production-built React application. The harness source is [browser-acceptance.mjs](../frontend/tests/realtime/browser-acceptance.mjs).

The independent run retained its raw result under `frontend/tests/.tools/req4-browser-d2a3a6d8-675b-4e89-b8fb-6a411e411f53/result.json`. Main also retained portable proof from the accepted integrated run in [browser-result.json](req4-evidence/browser-result.json). Both runs assert the same three outcomes:

1. A real Echo OrderCreated event displays the Arabic announcement, changes dashboard order count from 0 to 1, and adds the order to the existing admin list.
2. The existing admin approval control sends its real PATCH; an actual Echo OrderStatusUpdated event causes REST refetching and the customer page displays «مؤكد».
3. All four browser documents retain `performance.timeOrigin`; no full reload or uncaught JavaScript exception is observed. No email worker runs, and one unpublished outbox event persists with zero email deliveries.

The accepted retained images were independently viewed and show [dashboard announcement/count](req4-evidence/dashboard-new-order.png), [customer confirmed status](req4-evidence/customer-confirmed.png), and [admin approval success](req4-evidence/admin-approved.png). The admin-list assertion is based on the actual DOM and received event, not on a screenshot. No black compositor screenshot is used as proof.

Scope: actual browser, production React/Echo/Pusher, actual HTTP/JWT/database queue/Reverb, generated SQLite database, **only inventory stubbed**. This proves the visible UI behavior through the real WebSocket stack; it does not prove RabbitMQ, external SMTP, real gRPC inventory or MySQL concurrency. Live browser reconnect after deliberate network loss remains covered only by hook/manager tests in this run.

## Actual worker-restart harness

The reusable [restart harness](../backend/my-project/tests/qa/email-worker-restart-smoke.mjs) and [instructions](../backend/my-project/tests/qa/email-worker-restart.md) use a unique guarded SQLite database, generated queue/exchange prefix, explicitly named test vhost, real publisher and real Artisan email worker. Mock delivery is explicit and recorded as `mock`. It starts/stops the actual worker, creates an order while stopped, checks broker retention, restarts/ACKs, then replays the event to check deduplication **only if its broker probe succeeds**.

QA independently ran its syntax checks and all three refusal/unavailable probes. The actual isolated-broker attempt used `RUN_RABBITMQ_INTEGRATION_TESTS=true`, `RABBITMQ_HOST=127.0.0.1`, port `5679`, test-only user/password and vhost `req4_test`. It returned:

```json
{"status":"BLOCKED","scenario":"email_worker_restart","reason":"Isolated RabbitMQ is unavailable."}
```

Exit 2 is the honest blocked outcome. It is not a successful worker-restart experiment. No email was sent and no broker restart was performed.

## Distributed/manual acceptance status

| Scenario | Actual coverage | Status |
| --- | --- | --- |
| A: email worker absent, create order, admin live update | Actual production-browser toast/count/list update succeeds with no email process/broker and one persisted unpublished outbox; real RabbitMQ worker-restart harness probe is blocked | Browser/independence PASS; actual RabbitMQ retention/restart/mock processing BLOCKED |
| B: approve order and see customer update without refresh | Existing approval control, real admin PATCH, Echo event, REST refetch and customer visible confirmed state pass in a real browser; unchanged document time origins | PASS within isolated SQLite/stubbed-inventory scope |
| C: unauthorized subscriptions | Real socket IDs, bearer tokens and production HTTP authorization checked, plus REST ownership | PASS |
| D: existing architecture preserved | Empty protected-path diffs and CRUD regression tests | PASS |
| Broker restart persistence, ACK redelivery, mandatory unroutable failure, TTL retry, DLQ | Main reported two registry/CDN connection-reset failures and a public ECR mirror timeout. QA independently confirmed no cached RabbitMQ image and an unavailable test broker. Four gated transport tests remain skipped. | BLOCKED by image-download/network availability |
| Concurrent MySQL consumers and actual gRPC inventory integration | No production database touched; current verification uses SQLite and stubbed inventory for live wire | Unverified / BLOCKED in this run |
| External SMTP inbox delivery and SMTP failure/restart experiment | User explicitly selected “mock for now”; mock safeguards and mode-recording tests pass. No external provider contacted | DEFERRED by user; no external delivery claim |
| Actual browser Echo reconnect after deliberate network interruption | Hook/adapter missed-event tests pass; actual browser toast/status/no-refresh checks now pass, but browser network-drop experiment was not run | Browser reconnect unverified; visible-page acceptance PASS |

## Cleanup and remaining work

The native wire, browser and restart-probe harnesses stop only their own processes and remove their generated SQLite/journal files. Browser screenshots, build output and result JSON remain under the ignored generated evidence directory; its generated browser profile is removed. No application container/database was started or reset by QA. Test source artifacts remain reusable. Preexisting unrelated root document deletions and perf changes were preserved.

Run the four gated RabbitMQ tests and actual worker-restart harness once the isolated broker is available. Complete browser network-drop recovery and real gRPC/MySQL concurrency checks as appropriate before production acceptance. External mail remains deferred until the user requests it and provides an authorized test recipient/provider configuration. Re-run only checks affected by subsequent fixes. The documented SMTP crash-after-send-before-record duplication window remains a delivery-guarantee limitation, not an exactly-once claim.
