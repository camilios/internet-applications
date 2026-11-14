<?php

return [
    'host' => env('RABBITMQ_HOST', '127.0.0.1'),
    'port' => (int) env('RABBITMQ_PORT', 5672),
    'user' => env('RABBITMQ_USER', 'orders'),
    'password' => env('RABBITMQ_PASSWORD', ''),
    'vhost' => env('RABBITMQ_VHOST', 'ecommerce'),
    'connection_timeout' => (float) env('RABBITMQ_CONNECTION_TIMEOUT', 3),
    'read_write_timeout' => (float) env('RABBITMQ_READ_WRITE_TIMEOUT', 60),
    'heartbeat' => (int) env('RABBITMQ_HEARTBEAT', 20),
    'confirm_timeout' => (float) env('RABBITMQ_CONFIRM_TIMEOUT', 5),
    'exchange' => env('RABBITMQ_EXCHANGE', 'orders.events'),
    'routing_key' => 'orders.created',
    'queue' => env('RABBITMQ_EMAIL_QUEUE', 'orders.email'),
    'retry_exchange' => env('RABBITMQ_RETRY_EXCHANGE', 'orders.retry'),
    'dead_letter_exchange' => env('RABBITMQ_DLX', 'orders.dlx'),
    'dead_letter_queue' => env('RABBITMQ_DLQ', 'orders.email.dlq'),
    'dead_letter_routing_key' => 'orders.failed',
    // Attempts include the initial delivery; retry delay is capped at the final entry.
    'max_attempts' => max(1, min(20, (int) env('RABBITMQ_MAX_ATTEMPTS', 5))),
    'retry_delays' => array_map(fn ($delay) => max(1, min(3600, (int) $delay)), explode(',', (string) env('RABBITMQ_RETRY_DELAYS', '5,30,120,300'))),
    'reconnect_delay' => max(1, min(60, (int) env('RABBITMQ_RECONNECT_DELAY', 5))),
    'poll_interval' => max(1, min(30, (int) env('OUTBOX_POLL_INTERVAL', 1))),
    'publisher_max_backoff' => max(1, min(3600, (int) env('OUTBOX_MAX_BACKOFF', 300))),
];
