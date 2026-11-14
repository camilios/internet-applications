# Resend order confirmations — 14 November 2026

The running local stack now uses **real Resend SMTP**, with mock delivery disabled. The saved API key stays in the ignored root `.env` as `MAIL_PASSWORD`. No key was copied into source, frontend settings, Postman exports or this report.

The existing Laravel Mail flow is retained: HTTP order creation → transactional outbox → RabbitMQ → independent `email-worker` → SMTP. This follows Resend's [existing SMTP application setup](https://resend.com/setup.md) and [SMTP settings](https://resend.com/docs/send-with-smtp). The existing Blade receipt remains the template; no SDK or template migration is needed for this SMTP setup.

## Active local settings

```dotenv
MAIL_MAILER=smtp
ORDER_EMAIL_ALLOW_MOCK=false
MAIL_SCHEME=smtps
MAIL_HOST=smtp.resend.com
MAIL_PORT=465
MAIL_USERNAME=resend
MAIL_FROM_ADDRESS=onboarding@resend.dev
MAIL_FROM_NAME="E-Commerce"
MAIL_TIMEOUT=20
# MAIL_PASSWORD is already saved locally. Never paste it into documentation.
```

No custom domain was supplied or verified. Resend's test sender can send to the account owner's email. Use the prepared **`postman/E-Commerce.Resend.local.postman_environment.json`** for Postman: it contains the authorized real-email customer's credentials and the existing admin/other-customer credentials. Import it alongside the existing collection, select it, then run the customer/admin login requests. The ordinary demo addresses are not real-email recipients permitted by this test sender. Sending to arbitrary customers requires a domain you own, verified in Resend, and an allowed sender on that domain. [Resend restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

## Actual test result

Main executed the real application test for **order 300016**, product 23, using the authorized account email:

| Observation | Result |
| --- | --- |
| SMTP authentication over implicit TLS | Accepted; preflight sent no email |
| HTTP order creation with worker stopped | 201, 2,584 ms |
| While stopped | One published outbox event, one ready RabbitMQ message, zero deliveries |
| After restart | One successful `external` delivery record; queue ready count zero |
| Same HTTP idempotency key and same queue event replayed | Same order, one outbox event, one delivery record |
| Inbox receipt | Recipient explicitly confirmed “Received” in this session |
| Read-only Resend API status check | HTTP 401; provider read access unavailable with the saved key |

[Sanitized machine-readable evidence](req4-evidence/resend-external-email.json). SMTP acceptance and a recorded `external` delivery mean the transport accepted the message; the user's separate **“Received”** confirmation establishes inbox receipt for **“Order #300016 confirmation”**. Provider-side `last_event` was not retrieved; it can be inspected in Resend's [Emails dashboard](https://resend.com/emails). No broader API permission was requested just to read delivery status.

`transport_message_id` is Symfony's transport/message identifier; in this run it is the application's Message-ID, **not a confirmed Resend email UUID**. Find the email by subject in the dashboard rather than treating that value as a dashboard ID.

## Files changed for Resend

| File | Purpose |
| --- | --- |
| `backend/my-project/app/Mail/OrderConfirmation.php` | Preserve Message-ID; add `Resend-Idempotency-Key: order-confirmation/<event UUID>` only for effective Resend SMTP configuration |
| `backend/my-project/app/Services/Messaging/OrderConfirmationSender.php` | Log a sanitized transport/message identifier after successful transport acceptance |
| `backend/my-project/tests/Unit/OrderConfirmationHeadersTest.php` | Stable per-event keys, other providers/transports, named mailers, URL overrides and actual MIME header emission |
| `backend/my-project/tests/Feature/OrderMessagingTest.php`, `OrderMailConfigurationTest.php` | Delivery logging and existing worker/configuration regression checks |
| `backend/my-project/.dockerignore` | Exclude ignored local `.tools` files from normal image builds |
| `postman/configure-resend.mjs` | Preview/apply SMTP settings without exposing or replacing the saved key |
| `postman/resend-worker-smoke.mjs` | Authorized real-recipient application flow, worker stop/restart and replay evidence |
| `postman/resend-provider-check.mjs` | Read-only provider lookup; report missing read access without exposing messages or credentials |
| Ignored root `.env`, `docker-compose.override.yml` | Active credentials/settings and local cached runtime image |
| Ignored Resend Postman environment and `.tools` state | Local customer credentials and stable test identifiers |

The updated backend suite passed **102 tests / 591 assertions**, with four isolated broker tests skipped. Scoped Pint and Node syntax checks passed. Frontend behavior was unchanged by this setup; its prior live-status/toast evidence still applies.

## Demonstrate worker retention again

From the project root in PowerShell:

```powershell
wsl.exe -d Ubuntu -- docker compose --project-directory /mnt/e/projects/internet-applications stop --timeout 5 email-worker
```

Create a **new order** as the real-email customer in Postman, with a fresh UUID idempotency key. Leave the outbox publisher and RabbitMQ running. Verify the HTTP response, then inspect the retained message:

```powershell
wsl.exe -d Ubuntu -- docker compose --project-directory /mnt/e/projects/internet-applications exec rabbitmq rabbitmqctl list_queues -p ecommerce name messages_ready messages_unacknowledged
wsl.exe -d Ubuntu -- docker compose --project-directory /mnt/e/projects/internet-applications start email-worker
```

After restart, match the order number in the email, the event ID in the outbox/delivery row, and `delivery_mode=external`. The Arabic [teach.html](../teach.html) includes the read-only database inspection and full professor demonstration. Do not remove volumes or purge messages.

The automated smoke test is deliberately tied to its saved order/idempotency key and is not a create-another-email button. Its `--send` mode performs a real send and requires both `RESEND_TEST_RECIPIENT` and `RUN_RESEND_WORKER_TEST=true`; inspect saved state/evidence before retrying an uncertain send. `node postman/resend-provider-check.mjs` is read-only and can be rerun if key read permissions change.

## Delivery limits

The database delivery row prevents replay of already recorded deliveries. Resend additionally retains SMTP idempotency keys for **24 hours**; this reduces the accepted-send/before-database-commit duplicate window during that period. It is not a permanent exactly-once guarantee. Provider deduplication during a forced crash was not fault-injected in this run. [Resend idempotency documentation](https://resend.com/docs/dashboard/emails/idempotency-keys.md).

Historical mock records are retained and not resent automatically. Four isolated RabbitMQ 4.2 transport tests, broker-restart persistence and concurrent MySQL consumer fault tests remain outside this email setup's proof.
