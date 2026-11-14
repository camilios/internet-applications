<?php

use App\Models\NotificationDelivery;
use App\Models\Order;
use App\Models\OutboxEvent;
use App\Services\Messaging\RabbitMqBroker;
use PhpAmqpLib\Connection\AMQPStreamConnection;

if (getenv('RUN_RABBITMQ_INTEGRATION_TESTS') !== 'true'
    || ! str_contains((string) getenv('RABBITMQ_VHOST'), 'test')
    || ! preg_match('/^req4-worker-restart-[a-f0-9-]+$/', (string) getenv('REQ4_QA_MESSAGING_PREFIX'))
    || getenv('MAIL_MAILER') !== 'array') {
    throw new RuntimeException('Worker restart QA requires an explicitly enabled isolated test vhost and array mail.');
}

[$app] = require __DIR__.'/reverb-bootstrap.php';

$prefix = getenv('REQ4_QA_MESSAGING_PREFIX');
$expected = [
    'exchange' => $prefix.'.events', 'queue' => $prefix.'.email',
    'retry_exchange' => $prefix.'.retry', 'dead_letter_exchange' => $prefix.'.dlx',
    'dead_letter_queue' => $prefix.'.dlq',
];
foreach ($expected as $key => $value) {
    if (config('rabbitmq.'.$key) !== $value) {
        throw new RuntimeException('Refusing unexpected messaging topology in worker restart QA.');
    }
}

$broker = new RabbitMqBroker;
$connection = null;
try {
    if (($argv[1] ?? '') === 'probe') {
        try {
            $broker->health();
        } catch (Throwable $exception) {
            echo json_encode(['status' => 'BLOCKED', 'reason' => 'Isolated RabbitMQ is unavailable.', 'error_type' => $exception::class], JSON_THROW_ON_ERROR);
            exit(2);
        }
        echo json_encode(['status' => 'READY'], JSON_THROW_ON_ERROR);

        exit;
    }

    $connection = new AMQPStreamConnection(
        host: config('rabbitmq.host'), port: config('rabbitmq.port'),
        user: config('rabbitmq.user'), password: config('rabbitmq.password'), vhost: config('rabbitmq.vhost'),
        connection_timeout: config('rabbitmq.connection_timeout'), read_write_timeout: config('rabbitmq.read_write_timeout'),
    );
    $channel = $connection->channel();
    if (($argv[1] ?? '') === 'inspect') {
        [, $ready] = $channel->queue_declare(config('rabbitmq.queue'), true);
        echo json_encode([
            'orders' => Order::count(), 'outbox' => OutboxEvent::count(),
            'unpublished' => OutboxEvent::whereNull('published_at')->count(),
            'delivery_records' => NotificationDelivery::count(),
            'completed_mock' => NotificationDelivery::whereNotNull('delivered_at')->where('delivery_mode', 'mock')->count(),
            'completed_external' => NotificationDelivery::whereNotNull('delivered_at')->where('delivery_mode', 'external')->count(),
            'queue_ready' => $ready,
        ], JSON_THROW_ON_ERROR);
    } elseif (($argv[1] ?? '') === 'replay') {
        $event = OutboxEvent::firstOrFail();
        $broker->publish(json_encode($event->payload, JSON_THROW_ON_ERROR), $event->event_id, config('rabbitmq.exchange'), config('rabbitmq.routing_key'));
        echo json_encode(['replayed_event_id' => $event->event_id], JSON_THROW_ON_ERROR);
    } elseif (($argv[1] ?? '') === 'cleanup') {
        foreach (config('rabbitmq.retry_delays') as $index => $delay) {
            $channel->queue_delete(config('rabbitmq.queue').'.retry.'.($index + 1));
        }
        $channel->queue_delete(config('rabbitmq.queue'));
        $channel->queue_delete(config('rabbitmq.dead_letter_queue'));
        foreach (['exchange', 'retry_exchange', 'dead_letter_exchange'] as $key) {
            $channel->exchange_delete(config('rabbitmq.'.$key));
        }
        echo json_encode(['status' => 'CLEANED'], JSON_THROW_ON_ERROR);
    } else {
        throw new RuntimeException('Unknown worker restart fixture command.');
    }
} finally {
    $broker->close();
    $connection?->close();
}
