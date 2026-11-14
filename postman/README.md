# Testing locally with Postman

Import `E-Commerce.postman_collection.json`. Import `E-Commerce.local.postman_environment.json` if it has been prepared on this machine; it is ignored by Git and contains local credentials. Otherwise import the blank `E-Commerce.postman_environment.json` and fill in the three accounts' passwords. Select that environment in Postman.

The API is `http://localhost:8000/api`, the frontend is `http://localhost:5173`, and Reverb is `ws://localhost:8080`. The running local worker now sends **real Resend SMTP email**, with mock delivery disabled. For real-email tests, import/select `E-Commerce.Resend.local.postman_environment.json`; it uses the authorized Resend account email as the customer. The ordinary demo customer addresses cannot receive email from the unverified test sender. See [Resend setup and evidence](../docs/resend-setup.md).

The prepared local stack includes dedicated demo product **23** with available real inventory. The live smoke check created and confirmed demo order **300007**, reserving one unit. The original application data was preserved. [Recorded live check](../docs/req4-evidence/postman-runtime.json): 28 HTTP requests and 32 exported-script assertions passed, including real gRPC, queue retention/restart and both private WebSocket events.

1. Run the three login requests under **01 Authentication**. They save separate customer, admin and other-customer tokens automatically. Registration cannot assign admin access.
2. Choose an existing product under **02 Catalog**, then check its real stock using the detail request. Set collection variable `product_id` to an available product. `quantity` defaults to 1.
3. Under **03 Req 4**, create an order. The response saves `order_id`; the `Idempotency-Key` remains available for retries. Replay the same request to check deduplication. Run **Prepare next order key** only when intentionally starting another purchase; retry an uncertain inventory reservation using its original key and payload.
4. Run the admin list and approval requests, followed by the customer's detail request. Authorization rejection requests check the admin role and exact order ownership.
5. Use the dashboard/notification and catalog management folders as needed. Catalog management requests mutate only the IDs captured by their corresponding create requests. Logout requests belong last.

## Real WebSocket events in Postman

An HTTP channel-authorization request only returns a signature. To receive actual events, create a **WebSocket** request in Postman, add the header `Origin: http://localhost:5173` before connecting, and connect to:

```text
ws://localhost:8080/app/ecommerce-local?protocol=7&client=postman&version=1.0&flash=false
```

Read `socket_id` from the `pusher:connection_established` event's JSON-encoded `data` field and put it in the collection variable `socket_id`. Use a separate socket for each session/channel when testing isolation.

For the admin socket, run **Admin channel authorization**. Copy the returned `auth` value into this WebSocket message and send it:

```json
{"event":"pusher:subscribe","data":{"channel":"private-admin.orders","auth":"COPY_AUTH_HERE"}}
```

Keep the socket open and create a new order with a new idempotency key. Expect `OrderCreated` containing `event_id`, `order_id`, and `occurred_at`.

For the customer socket, copy that socket's actual ID, run **Owner channel authorization**, then send (replace `ORDER_ID` with the saved numeric ID):

```json
{"event":"pusher:subscribe","data":{"channel":"private-orders.ORDER_ID","auth":"COPY_AUTH_HERE"}}
```

Approve that order as admin. Expect `OrderStatusUpdated` with the matching order ID and `status: confirmed`. Reply to a `pusher:ping` with `{"event":"pusher:pong","data":{}}` if required to keep a manual socket alive. JWTs expire after the configured lifetime; log in and authorize again as needed.

## Worker stop/restart demonstration

Run these from the repository root in PowerShell. Docker is hosted by Ubuntu WSL on this machine:

```powershell
wsl.exe -d Ubuntu -- docker compose --project-directory /mnt/e/projects/internet-applications stop email-worker
```

Create a new order in Postman and observe the admin WebSocket event. With the outbox publisher running, inspect the retained broker message:

```powershell
wsl.exe -d Ubuntu -- docker compose --project-directory /mnt/e/projects/internet-applications exec rabbitmq rabbitmqctl list_queues -p ecommerce name messages_ready messages_unacknowledged
wsl.exe -d Ubuntu -- docker compose --project-directory /mnt/e/projects/internet-applications start email-worker
wsl.exe -d Ubuntu -- docker compose --project-directory /mnt/e/projects/internet-applications logs --tail=50 email-worker
```

The email queue should drain after the worker restarts. Current SMTP processing records `delivery_mode=external`; match the actual inbox confirmation to the order number. Detailed message logs are in the worker's `storage/logs/laravel.log`; Compose logs show process output. Older `MOCK DELIVERY` / `delivery_mode=mock` records are historical, and are not resent automatically. Do not delete database or RabbitMQ volumes for testing.

On this machine the ignored `docker-compose.override.yml` uses cached RabbitMQ 3.13 and the updated `internet-applications-resend:latest` PHP snapshot plus the built frontend. The tracked Compose file retains its normal RabbitMQ 4.2 configuration. Restart this prepared stack with:

```powershell
wsl.exe -d Ubuntu -- docker compose --project-directory /mnt/e/projects/internet-applications up -d --no-build --pull never
```

A hidden WSL keep-alive process keeps Docker available while testing. Existing application database contents are preserved. After source changes, rebuild the appropriate images before relying on this snapshot.

## Regenerate import files

`node postman/build-collection.mjs` regenerates the collection and blank environment and updates the Req 4 OpenAPI authorization contract in `for frontend.json` and `for frontend.yaml`. It does not alter the ignored local environment containing credentials. API descriptions, setup and independent acceptance evidence are linked from the root README.

`postman/smoke.mjs` is a gated Node/Chai harness that executes selected exported requests and their scripts against this actual local stack; it is not Newman or the Postman app. With Node 24+, frontend development dependencies installed and the prepared local environment, run `$env:RUN_POSTMAN_SMOKE='true'; node postman/smoke.mjs`. It creates one real demo order, temporarily stops/restarts only the mock email worker, verifies real private WebSocket events, and writes `docs/req4-evidence/postman-runtime.json`. Do not run it against non-local services.

`$env:RUN_POSTMAN_BROWSER_SMOKE='true'; node postman/browser-status-smoke.mjs` checks the deployed frontend in isolated headless Edge/Chrome sessions: customer orders list, pending-filter membership, order details, and the existing admin status control. It creates one demo order and asserts that the customer pages update without a full reload. It retains `docs/req4-evidence/customer-status-after.json` and removes only its generated browser profile.

Also set `$env:EXPECT_CUSTOMER_TOAST='true'` to require the Arabic status toast on the customer list, pending-filter list and detail page. That run writes `docs/req4-evidence/customer-status-toast.json` and retains the earlier status-only evidence.
