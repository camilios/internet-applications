# Isolated email-worker restart proof

Run from `backend/my-project` with Node 22+ and the installed Laravel dependencies. PHP needs SQLite, sockets and sodium (plus GD for the reused HTTP fixture); the Windows runner enables the installed extensions with command flags.

Start an isolated RabbitMQ instance first. The root `docker-compose.req4-test.yml` defines test-only credentials and port 5679. The harness refuses the production/default vhost and only creates/deletes its own generated queue and exchange names.

PowerShell example:

```powershell
$env:RUN_RABBITMQ_INTEGRATION_TESTS = 'true'
$env:RABBITMQ_HOST = '127.0.0.1'
$env:RABBITMQ_PORT = '5679'
$env:RABBITMQ_USER = 'req4_test'
$env:RABBITMQ_PASSWORD = 'req4-test-only'
$env:RABBITMQ_VHOST = 'req4_test'
node tests/qa/email-worker-restart-smoke.mjs
```

These credentials belong only to the isolated test configuration; do not use application credentials. Set `REQ4_QA_PHP` to a PHP executable path if `php` is not on PATH.

The script forces `APP_ENV=testing`, a new guarded SQLite file under `.tools`, unique RabbitMQ topology, and `MAIL_MAILER=array`. It performs these actual operations:

1. Starts the actual `orders:email-worker` process against an empty queue, then stops only that process.
2. Creates an order through the production HTTP controller and order service. The existing test inventory stub replaces gRPC; no application database is used.
3. Runs `outbox:publish --once`; confirms the outbox is published, the broker retains one message and no delivery has occurred while the worker is stopped.
4. Restarts the actual worker with `--once`; verifies one completed `delivery_mode=mock` record and an empty acknowledged queue.
5. Replays the same stable event ID and verifies no second delivery record.
6. Stops its own processes and removes its own SQLite file and generated broker topology.

Output is JSON evidence for each step. Final `PASS` means the complete restart scenario executed. Exit 2 with `BLOCKED` means the gate is disabled or the isolated broker could not be reached; it is never counted as a pass. Exit 1 is a failed assertion or execution/cleanup error.

This proves RabbitMQ buffering, independent worker restart, real publisher/consumer handling and mock-delivery deduplication. It sends no external email and does not prove external-provider delivery, a browser UI or real warehouse behavior.
