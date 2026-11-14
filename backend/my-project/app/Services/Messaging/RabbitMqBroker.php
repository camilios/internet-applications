<?php

namespace App\Services\Messaging;

use PhpAmqpLib\Channel\AMQPChannel;
use PhpAmqpLib\Connection\AMQPStreamConnection;
use PhpAmqpLib\Message\AMQPMessage;
use PhpAmqpLib\Wire\AMQPTable;
use RuntimeException;

class RabbitMqBroker implements MessageBroker
{
    private ?AMQPStreamConnection $connection = null;

    private ?AMQPChannel $channel = null;

    private function channel(): AMQPChannel
    {
        if ($this->channel !== null && $this->channel->is_open()) {
            return $this->channel;
        }

        $this->connection = new AMQPStreamConnection(
            host: config('rabbitmq.host'),
            port: config('rabbitmq.port'),
            user: config('rabbitmq.user'),
            password: config('rabbitmq.password'),
            vhost: config('rabbitmq.vhost'),
            connection_timeout: config('rabbitmq.connection_timeout'),
            read_write_timeout: config('rabbitmq.read_write_timeout'),
            keepalive: function_exists('socket_import_stream'),
            heartbeat: config('rabbitmq.heartbeat'),
            channel_rpc_timeout: config('rabbitmq.confirm_timeout'),
        );
        $this->channel = $this->connection->channel();
        $this->declareTopology($this->channel);
        $this->channel->confirm_select();
        $this->channel->basic_qos(0, 1, false);

        return $this->channel;
    }

    private function declareTopology(AMQPChannel $channel): void
    {
        foreach (['exchange', 'retry_exchange', 'dead_letter_exchange'] as $key) {
            $channel->exchange_declare(config('rabbitmq.'.$key), 'direct', false, true, false);
        }

        $quorum = ['x-queue-type' => 'quorum'];
        $channel->queue_declare(config('rabbitmq.dead_letter_queue'), false, true, false, false, false, new AMQPTable($quorum));
        $channel->queue_bind(config('rabbitmq.dead_letter_queue'), config('rabbitmq.dead_letter_exchange'), config('rabbitmq.dead_letter_routing_key'));

        $channel->queue_declare(config('rabbitmq.queue'), false, true, false, false, false, new AMQPTable($quorum + [
            'x-dead-letter-exchange' => config('rabbitmq.dead_letter_exchange'),
            'x-dead-letter-routing-key' => config('rabbitmq.dead_letter_routing_key'),
            'x-dead-letter-strategy' => 'at-least-once',
            'x-overflow' => 'reject-publish',
        ]));
        $channel->queue_bind(config('rabbitmq.queue'), config('rabbitmq.exchange'), config('rabbitmq.routing_key'));

        foreach (config('rabbitmq.retry_delays') as $index => $seconds) {
            $queue = config('rabbitmq.queue').'.retry.'.($index + 1);
            $channel->queue_declare($queue, false, true, false, false, false, new AMQPTable($quorum + [
                'x-message-ttl' => $seconds * 1000,
                'x-dead-letter-exchange' => config('rabbitmq.exchange'),
                'x-dead-letter-routing-key' => config('rabbitmq.routing_key'),
                'x-dead-letter-strategy' => 'at-least-once',
                'x-overflow' => 'reject-publish',
            ]));
            $channel->queue_bind($queue, config('rabbitmq.retry_exchange'), 'retry.'.($index + 1));
        }
    }

    public function publish(string $body, string $eventId, string $exchange, string $routingKey, int $attempt = 1): void
    {
        $channel = $this->channel();
        $confirmed = false;
        $failed = false;
        $channel->set_ack_handler(function () use (&$confirmed): void {
            $confirmed = true;
        });
        $channel->set_nack_handler(function () use (&$failed): void {
            $failed = true;
        });
        $channel->set_return_listener(function () use (&$failed): void {
            $failed = true;
        });
        $message = new AMQPMessage($body, [
            'content_type' => 'application/json',
            'delivery_mode' => AMQPMessage::DELIVERY_MODE_PERSISTENT,
            'message_id' => $eventId,
            'type' => 'OrderCreated',
            'timestamp' => time(),
            'application_headers' => new AMQPTable(['attempt' => $attempt]),
        ]);
        $channel->basic_publish($message, $exchange, $routingKey, true);
        $channel->wait_for_pending_acks_returns(config('rabbitmq.confirm_timeout'));
        if (! $confirmed || $failed) {
            throw new RuntimeException('RabbitMQ did not confirm a routed message.');
        }
    }

    public function receive(): ?IncomingMessage
    {
        // Polling keeps heartbeat/socket handling bounded, including on an idle queue.
        $message = $this->channel()->basic_get(config('rabbitmq.queue'), false);
        if ($message === null) {
            return null;
        }
        $headers = $message->has('application_headers') ? $message->get('application_headers')->getNativeData() : [];
        $attempt = filter_var($headers['attempt'] ?? 1, FILTER_VALIDATE_INT);

        return new IncomingMessage(
            $message->getBody(),
            $attempt === false ? 1 : max(1, $attempt),
            fn () => $message->ack(),
        );
    }

    public function health(): void
    {
        $this->channel()->queue_declare(config('rabbitmq.queue'), true);
    }

    public function close(): void
    {
        try {
            $this->connection?->close();
        } catch (\Throwable) {
            // A broken socket is already closed; original deliveries remain unacknowledged.
        } finally {
            $this->channel = null;
            $this->connection = null;
        }
    }
}
