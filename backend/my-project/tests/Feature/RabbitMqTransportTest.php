<?php

namespace Tests\Feature;

use App\Services\Messaging\EmailMessageProcessor;
use App\Services\Messaging\IncomingMessage;
use App\Services\Messaging\OrderConfirmationSender;
use App\Services\Messaging\RabbitMqBroker;
use Illuminate\Support\Str;
use Mockery;
use PhpAmqpLib\Connection\AMQPStreamConnection;
use RuntimeException;
use Tests\TestCase;

class RabbitMqTransportTest extends TestCase
{
    private RabbitMqBroker $broker;

    private AMQPStreamConnection $inspection;

    protected function setUp(): void
    {
        parent::setUp();
        if (! filter_var(env('RUN_RABBITMQ_INTEGRATION_TESTS', false), FILTER_VALIDATE_BOOL)) {
            $this->markTestSkipped('Set RUN_RABBITMQ_INTEGRATION_TESTS=true against an isolated RabbitMQ vhost.');
        }
        if (! str_contains((string) config('rabbitmq.vhost'), 'test')) {
            throw new RuntimeException('Refusing broker integration tests outside an explicitly named test vhost.');
        }
        $prefix = 'req4.'.Str::uuid();
        config([
            'rabbitmq.exchange' => $prefix.'.events',
            'rabbitmq.queue' => $prefix.'.email',
            'rabbitmq.retry_exchange' => $prefix.'.retry',
            'rabbitmq.dead_letter_exchange' => $prefix.'.dlx',
            'rabbitmq.dead_letter_queue' => $prefix.'.dlq',
            'rabbitmq.retry_delays' => [1],
            'rabbitmq.max_attempts' => 3,
        ]);
        $this->broker = new RabbitMqBroker;
        $this->broker->health();
        $this->inspection = new AMQPStreamConnection(config('rabbitmq.host'), config('rabbitmq.port'), config('rabbitmq.user'), config('rabbitmq.password'), config('rabbitmq.vhost'));
    }

    protected function tearDown(): void
    {
        if (isset($this->broker)) {
            $this->broker->close();
        }
        if (isset($this->inspection)) {
            $channel = $this->inspection->channel();
            foreach ([config('rabbitmq.queue').'.retry.1', config('rabbitmq.queue'), config('rabbitmq.dead_letter_queue')] as $queue) {
                $channel->queue_delete($queue);
            }
            foreach (['exchange', 'retry_exchange', 'dead_letter_exchange'] as $key) {
                $channel->exchange_delete(config('rabbitmq.'.$key));
            }
            $this->inspection->close();
        }
        parent::tearDown();
    }

    public function test_confirmed_persistent_delivery_is_redelivered_until_manual_ack(): void
    {
        $id = (string) Str::uuid();
        $body = json_encode(['event_id' => $id, 'type' => 'OrderCreated', 'order_id' => 1]);
        $this->broker->publish($body, $id, config('rabbitmq.exchange'), config('rabbitmq.routing_key'));
        $first = $this->awaitMessage();
        $this->assertSame($body, $first->body);
        $this->broker->close();
        $second = $this->awaitMessage();
        $this->assertSame($first->body, $second->body);
        $second->acknowledge();
        $this->assertNull($this->broker->receive());
    }

    public function test_mandatory_unroutable_publication_is_not_reported_as_success(): void
    {
        $this->expectException(RuntimeException::class);
        $this->broker->publish('{}', (string) Str::uuid(), config('rabbitmq.exchange'), 'unbound.route');
    }

    public function test_retry_queue_holds_then_routes_message_back_with_attempt_metadata(): void
    {
        $body = '{"retry":true}';
        $this->broker->publish($body, (string) Str::uuid(), config('rabbitmq.retry_exchange'), 'retry.1', 2);
        $this->assertNull($this->broker->receive());
        $message = $this->awaitMessage();
        $this->assertSame($body, $message->body);
        $this->assertSame(2, $message->attempt);
        $message->acknowledge();
    }

    public function test_permanent_failure_reaches_dlq_and_original_is_acknowledged(): void
    {
        $sender = Mockery::mock(OrderConfirmationSender::class);
        $sender->shouldNotReceive('send');
        $this->broker->publish('invalid-json', (string) Str::uuid(), config('rabbitmq.exchange'), config('rabbitmq.routing_key'));
        (new EmailMessageProcessor($this->broker, $sender))->handle($this->awaitMessage());
        $dead = $this->inspection->channel()->basic_get(config('rabbitmq.dead_letter_queue'), true);
        $this->assertNotNull($dead);
        $this->assertSame('invalid-json', $dead->getBody());
        $this->assertNull($this->broker->receive());
    }

    private function awaitMessage(): IncomingMessage
    {
        $deadline = microtime(true) + 8;
        do {
            $message = $this->broker->receive();
            if ($message !== null) {
                return $message;
            }
            usleep(100000);
        } while (microtime(true) < $deadline);

        throw new RuntimeException('Timed out waiting for isolated RabbitMQ test delivery.');
    }
}
