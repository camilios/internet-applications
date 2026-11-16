# Setup after pulling the latest changes

This guide is for the colleague whose checkout is at `C:\Users\NEW MSI\Desktop\see`, with Docker and the project's databases already configured. It uses the repository's Docker setup. Docker must be running, and Node.js 22+ must be available for the demo-product seed.

## 1. Pull the code

Open PowerShell and run the following. Change the path if the checkout has moved.

```powershell
Set-Location 'C:\Users\NEW MSI\Desktop\see'
git pull
```

If Git reports a conflict or refuses to pull because of local edits, preserve those edits and resolve the reported conflict before continuing. This guide does not discard local work.

## 2. Keep the existing local configuration

Keep the existing root `.env` and `secrets/` files. Git does not transfer these ignored files between laptops.

Preserve the existing `APP_KEY`, `JWT_SECRET`, `RABBITMQ_PASSWORD`, `REVERB_APP_SECRET`, and database password files. In particular, changing RabbitMQ's bootstrap password does not update an existing broker user's password.

The root `.env` must contain the RabbitMQ and Reverb secrets required by Compose. Its public Reverb identifiers should match:

```dotenv
REVERB_APP_ID=ecommerce
REVERB_APP_KEY=ecommerce-local
REVERB_PORT=8080
VITE_REVERB_HOST=localhost
VITE_REVERB_SCHEME=http
VITE_API_URL=http://localhost:8000/api
```

Docker already supplies `BROADCAST_CONNECTION=reverb`, the internal hosts `reverb` and `rabbitmq`, and the frontend's build-time Reverb settings. The separate `backend/my-project/.env` and `frontend/.env` files can remain for native development; they are excluded from these Docker builds.

If manually started Laravel or Vite processes occupy ports 8000 or 5173, stop those processes before starting the Docker versions.

### Configure real email

The summary's `MAIL_MAILER=log` and `ORDER_EMAIL_ALLOW_MOCK=true` settings select mock delivery. To demonstrate actual external email, set the following in the **root `.env`**, using a valid Resend API key as `MAIL_PASSWORD`:

```dotenv
MAIL_MAILER=smtp
ORDER_EMAIL_ALLOW_MOCK=false
MAIL_SCHEME=smtps
MAIL_HOST=smtp.resend.com
MAIL_PORT=465
MAIL_USERNAME=resend
MAIL_PASSWORD=YOUR_RESEND_API_KEY
MAIL_FROM_ADDRESS=onboarding@resend.dev
MAIL_FROM_NAME="E-Commerce"
MAIL_TIMEOUT=20
```

Replace `YOUR_RESEND_API_KEY` locally; do not commit the key. Keep an existing valid SMTP configuration if it is already set.

With Resend's test sender, the customer email must be the Resend account owner's address. For the account used in this project's recorded test, that address is `meladnofal146@gmail.com`. Using a different Resend account means using that account's permitted recipient. Sending to arbitrary customers requires a verified domain and an appropriate sender address.

## 3. Build, start, migrate and load the shared products

Run these commands from the project root, in order. Continue only after the preceding command succeeds.

```powershell
docker compose -f docker-compose.yml config --quiet

docker compose -f docker-compose.yml up -d --build

docker compose -f docker-compose.yml exec -T backend php artisan migrate --force

node scripts/seed-demo-products.mjs

docker compose -f docker-compose.yml exec -T outbox-publisher php artisan messaging:health

docker compose -f docker-compose.yml ps
```

- `config --quiet` checks the Compose configuration without printing its resolved secrets.
- The build installs the PHP and frontend dependencies, including Pusher, and compiles the frontend's Reverb settings. Separate host-side `composer require`, `composer dump-autoload`, or `npm install` commands are unnecessary for this Docker workflow.
- Backend startup already runs migrations; the explicit migration command verifies the schema is current.
- The seed adds missing shared demo products and missing inventory rows with 100 initial units each. Existing stock, reservations, product metadata and deleted products are preserved. Product IDs can differ between laptops.
- The health command checks the messaging connection/topology. It does not prove inbox delivery or browser updates.

If Docker is available only inside WSL, run the Docker commands inside that laptop's WSL terminal from its checkout directory. The Node seed also supports Docker in Ubuntu WSL on Windows. The commands here explicitly use `docker-compose.yml`; they do not load a machine-specific `docker-compose.override.yml`.

## 4. Check the application

Open `http://localhost:5173` and refresh existing tabs once to load the new frontend. The API is at `http://localhost:8000/api`.

Use separate authenticated browser sessions for an administrator and a customer:

1. Create an order as the customer. Confirm it appears in the admin view with a toast, without refreshing.
2. Update the status as the administrator. Confirm the customer's `/orders` list updates with a toast, without refreshing.
3. Repeat the status check with the customer's order details page open. Confirm its status and toast update without refreshing.
4. For real-email testing, use the permitted real customer email and check the inbox and spam folder for the order confirmation.

To demonstrate that stopping the email worker preserves orders and queued emails:

```powershell
docker compose -f docker-compose.yml stop --timeout 5 email-worker
```

Create a new order with a fresh idempotency key. Confirm the API and real-time updates still work. Then inspect retained messages and restart the worker:

```powershell
docker compose -f docker-compose.yml exec -T rabbitmq rabbitmqctl list_queues -p ecommerce name messages_ready messages_unacknowledged

docker compose -f docker-compose.yml start email-worker
```

The queue command assumes the existing vhost is `ecommerce`; use the configured vhost if different. Allow the outbox publisher time to publish before inspecting the queues. After restarting, verify the email for that order arrives and the pending email is consumed.

For startup or delivery problems, inspect:

```powershell
docker compose -f docker-compose.yml logs --tail=100 outbox-publisher email-worker broadcast-worker reverb

docker compose -f docker-compose.yml exec -T email-worker tail -n 100 storage/logs/laravel.log
```

Treat logs as private; they can contain customer information.

## 5. What data does pulling update?

Git transfers code and seed definitions. Migrations update the database structure. The demo seed provisions the 10 shared products; it does not synchronize customers, orders or all database contents.

To copy the same complete state from the original laptop, export and restore **both** the Laravel `ecommerce` database and the inventory service's `inventory_db` database as a coordinated backup. Preserve the existing volumes. Do not use `migrate:fresh`, `docker compose down -v`, or a general reseed to update an existing installation.

## 6. Does the original project need code changes based on the summary?

**The supplied summary does not establish an application-code defect that requires a change.** The review was read-only against checkout `b605902`; the colleague's actual patch and raw test results were not supplied.

| Concern from the summary | Assessment and action |
| --- | --- |
| Missing Pusher SDK | Reverb already requires Pusher, and Pusher 7.3.0 was already in the committed lockfile in `392917e`. Rebuilding from the lockfile installs it. The reported class-not-found error could indicate incomplete dependencies or autoloading on that laptop; adding a direct wildcard dependency is not required to address a missing repository dependency. |
| Missing RabbitMQ/Reverb secrets | Each laptop must supply its ignored local configuration. The existing Compose file already requires those secrets. Preserve working values. |
| Backend broadcasting defaults to log | Native Laravel needs the correct local environment. Docker already explicitly selects Reverb. |
| Missing frontend Reverb settings | Native Vite needs its local settings. The Docker build already supplies them. |
| Mock email configuration | To meet the real-email requirement, configure SMTP locally with mock mode disabled. The original laptop was already configured for real Resend SMTP. |
| Updated HTML report and 13-page PDF | Those report files were absent from the reviewed checkout, so their contents and regeneration could not be verified. |
| All tests and real-time checks passed | The reported output includes four skipped tests and 53 risky tests, and no raw output was provided. Resolve or explain those results before claiming a clean run. `OrderBroadcastingTest` uses a fake queue and alone does not prove visible browser updates. |

The useful follow-up is to review the colleague's actual diff and test evidence if supplied. The review did not run tests or change application code, credentials, databases, or services. Only this handoff document was added afterward at the user's request.

Further reference: [shared data guide](data-on-another-laptop.md), [messaging operations](req4-operations.md), and [Resend setup and recorded evidence](resend-setup.md).
