<?php

namespace Tests\Feature;

use App\Mail\OrderConfirmation;
use App\Models\Category;
use App\Models\NotificationDelivery;
use App\Models\Order;
use App\Models\OutboxEvent;
use App\Models\Product;
use App\Models\User;
use App\Services\InventoryGrpcClient;
use App\Services\Messaging\EmailMessageProcessor;
use App\Services\Messaging\IncomingMessage;
use App\Services\Messaging\MessageBroker;
use App\Services\Messaging\OrderConfirmationSender;
use App\Services\Messaging\OutboxPublisher;
use App\Services\OrderService;
use App\Services\ReservationResult;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Mockery;
use RuntimeException;
use Tests\TestCase;

class OrderMessagingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Queue::fake();
    }

    public function test_order_and_stable_outbox_event_are_created_once_without_email_or_broker(): void
    {
        $user = User::factory()->create();
        $category = Category::create(['name' => 'Messaging']);
        $product = Product::create(['name' => 'Item', 'price' => '7.50', 'is_active' => true, 'category_id' => $category->id]);
        $inventory = Mockery::mock(InventoryGrpcClient::class);
        $inventory->shouldReceive('reserveStock')->once()->andReturn(new ReservationResult(true, 'outbox-reservation'));
        $this->app->instance(InventoryGrpcClient::class, $inventory);
        $broker = Mockery::mock(MessageBroker::class);
        $broker->shouldNotReceive('publish');
        $this->app->instance(MessageBroker::class, $broker);
        Mail::fake();
        $key = (string) Str::uuid();
        $items = [['product_id' => $product->id, 'quantity' => 2]];

        $order = app(OrderService::class)->createOrder($user, $items, $key);
        $replay = app(OrderService::class)->createOrder($user, $items, $key);

        $this->assertSame($order->id, $replay->id);
        $this->assertSame(1, Order::count());
        $this->assertSame(1, OutboxEvent::count());
        $event = OutboxEvent::firstOrFail();
        $this->assertSame($order->id, $event->order_id);
        $this->assertSame($event->event_id, $event->payload['event_id']);
        $this->assertNull($event->published_at);
        Mail::assertNothingSent();
    }

    public function test_outbox_failure_rolls_back_the_order_and_its_items(): void
    {
        $user = User::factory()->create();
        $category = Category::create(['name' => 'Rollback']);
        $product = Product::create(['name' => 'Item', 'price' => '1', 'is_active' => true, 'category_id' => $category->id]);
        $inventory = Mockery::mock(InventoryGrpcClient::class);
        $inventory->shouldReceive('reserveStock')->once()->andReturn(new ReservationResult(true, 'rollback-reservation'));
        $inventory->shouldReceive('releaseStock')->once()->with('rollback-reservation')->andReturn(true);
        $this->app->instance(InventoryGrpcClient::class, $inventory);
        OutboxEvent::created(fn () => throw new RuntimeException('Outbox persistence failed'));

        try {
            app(OrderService::class)->createOrder($user, [['product_id' => $product->id, 'quantity' => 1]], (string) Str::uuid());
            $this->fail('Expected the order transaction to roll back.');
        } catch (RuntimeException $exception) {
            $this->assertSame('Outbox persistence failed', $exception->getMessage());
        }
        $this->assertDatabaseCount('orders', 0);
        $this->assertDatabaseCount('order_items', 0);
        $this->assertDatabaseCount('outbox_events', 0);
    }

    public function test_failed_publication_keeps_event_unpublished_and_retries_with_backoff(): void
    {
        $event = $this->makeEvent();
        $broker = Mockery::mock(MessageBroker::class);
        $broker->shouldReceive('publish')->once()->andThrow(new RuntimeException('Unavailable'));
        $broker->shouldReceive('close')->once();

        $this->assertTrue((new OutboxPublisher($broker))->publishNext());
        $event->refresh();
        $this->assertNull($event->published_at);
        $this->assertSame(1, $event->attempts);
        $this->assertTrue($event->available_at->isFuture());
        $this->assertFalse((new OutboxPublisher($broker))->publishNext());
    }

    public function test_published_marker_is_written_only_after_confirmed_transport_returns(): void
    {
        $event = $this->makeEvent();
        $broker = Mockery::mock(MessageBroker::class);
        $broker->shouldReceive('publish')->once()->withArgs(function ($body, $id) use ($event): bool {
            $this->assertNull($event->fresh()->published_at);
            $this->assertSame($event->payload, json_decode($body, true));

            return $id === $event->event_id;
        });

        $this->assertTrue((new OutboxPublisher($broker))->publishNext());
        $this->assertNotNull($event->fresh()->published_at);
        $this->assertFalse((new OutboxPublisher($broker))->publishNext());
    }

    public function test_laravel_mail_processing_succeeds_before_ack_and_duplicate_delivery_sends_once(): void
    {
        Log::spy();
        $event = $this->makeEvent();
        $broker = Mockery::mock(MessageBroker::class);
        $broker->shouldNotReceive('publish');
        $processor = new EmailMessageProcessor($broker, app(OrderConfirmationSender::class));
        $acks = 0;
        $incoming = new IncomingMessage(json_encode($event->payload), 1, function () use (&$acks, $event): void {
            $this->assertNotNull(NotificationDelivery::findOrFail($event->event_id)->delivered_at);
            $acks++;
        });

        $processor->handle($incoming);
        $processor->handle($incoming);

        $this->assertSame(2, $acks);
        $this->assertDatabaseCount('notification_deliveries', 1);
        $this->assertSame('mock', NotificationDelivery::findOrFail($event->event_id)->delivery_mode);
        $messages = Mail::mailer()->getSymfonyTransport()->messages();
        $this->assertCount(1, $messages);
        $this->assertStringContainsString($event->event_id, $messages->first()->getOriginalMessage()->getHeaders()->get('Message-ID')->getBodyAsString());
        $this->assertStringContainsString('Order #'.$event->order_id, $messages->first()->getOriginalMessage()->getSubject());
        Log::shouldHaveReceived('info')->with('MOCK DELIVERY: order confirmation processed without an external email', [
            'event_id' => $event->event_id,
            'delivery_mode' => 'mock',
            'transport_message_id' => $messages->first()->getMessageId(),
        ])->once();
    }

    public function test_temporary_mail_failure_routes_confirmed_delayed_retry_before_ack(): void
    {
        $event = $this->makeEvent();
        $sender = Mockery::mock(OrderConfirmationSender::class);
        $sender->shouldReceive('send')->once()->andThrow(new RuntimeException('Temporary'));
        $sequence = [];
        $broker = Mockery::mock(MessageBroker::class);
        $broker->shouldReceive('publish')->once()->with(json_encode($event->payload), $event->event_id, config('rabbitmq.retry_exchange'), 'retry.1', 2)
            ->andReturnUsing(function () use (&$sequence): void {
                $sequence[] = 'confirmed';
            });
        (new EmailMessageProcessor($broker, $sender))->handle(new IncomingMessage(json_encode($event->payload), 1, function () use (&$sequence): void {
            $sequence[] = 'ack';
        }));

        $this->assertSame(['confirmed', 'ack'], $sequence);
        $this->assertDatabaseCount('notification_deliveries', 0);
    }

    public function test_exhausted_failure_is_confirmed_to_dlq_before_ack(): void
    {
        $event = $this->makeEvent();
        $sender = Mockery::mock(OrderConfirmationSender::class);
        $sender->shouldReceive('send')->once()->andThrow(new RuntimeException('Still unavailable'));
        $broker = Mockery::mock(MessageBroker::class);
        $broker->shouldReceive('publish')->once()->with(json_encode($event->payload), $event->event_id, config('rabbitmq.dead_letter_exchange'), config('rabbitmq.dead_letter_routing_key'), 5);
        $acked = false;
        (new EmailMessageProcessor($broker, $sender))->handle(new IncomingMessage(json_encode($event->payload), 5, function () use (&$acked): void {
            $acked = true;
        }));
        $this->assertTrue($acked);
    }

    public function test_malformed_messages_are_dead_lettered_without_sending(): void
    {
        $sender = Mockery::mock(OrderConfirmationSender::class);
        $sender->shouldNotReceive('send');
        $broker = Mockery::mock(MessageBroker::class);
        $broker->shouldReceive('publish')->once()->with('not-json', Mockery::type('string'), config('rabbitmq.dead_letter_exchange'), config('rabbitmq.dead_letter_routing_key'), 1);
        $acked = false;
        (new EmailMessageProcessor($broker, $sender))->handle(new IncomingMessage('not-json', 1, function () use (&$acked): void {
            $acked = true;
        }));
        $this->assertTrue($acked);
    }

    public function test_retry_publication_failure_never_acknowledges_original(): void
    {
        $event = $this->makeEvent();
        $sender = Mockery::mock(OrderConfirmationSender::class);
        $sender->shouldReceive('send')->andThrow(new RuntimeException('Temporary'));
        $broker = Mockery::mock(MessageBroker::class);
        $broker->shouldReceive('publish')->andThrow(new RuntimeException('Broker disconnected'));
        $acked = false;
        try {
            (new EmailMessageProcessor($broker, $sender))->handle(new IncomingMessage(json_encode($event->payload), 1, function () use (&$acked): void {
                $acked = true;
            }));
            $this->fail('Expected retry publication failure.');
        } catch (RuntimeException $exception) {
            $this->assertSame('Broker disconnected', $exception->getMessage());
        }
        $this->assertFalse($acked);
    }

    public function test_failed_mail_is_not_recorded_delivered_and_can_be_retried(): void
    {
        $event = $this->makeEvent();
        Mail::shouldReceive('to')->once()->andReturnSelf();
        Mail::shouldReceive('send')->once()->with(Mockery::type(OrderConfirmation::class))->andThrow(new RuntimeException('SMTP unavailable'));
        try {
            app(OrderConfirmationSender::class)->send($event->payload);
            $this->fail('Expected mail failure.');
        } catch (RuntimeException $exception) {
            $this->assertSame('SMTP unavailable', $exception->getMessage());
        }
        $this->assertNull(NotificationDelivery::findOrFail($event->event_id)->delivered_at);
    }

    private function makeEvent(): OutboxEvent
    {
        $user = User::factory()->create();
        $order = Order::create(['user_id' => $user->id, 'total' => '15.00', 'status' => 'pending']);
        $id = (string) Str::uuid();

        return OutboxEvent::create([
            'event_id' => $id, 'order_id' => $order->id, 'event_type' => 'OrderCreated',
            'payload' => ['event_id' => $id, 'type' => 'OrderCreated', 'order_id' => $order->id, 'occurred_at' => now()->toISOString()],
            'available_at' => now(),
        ]);
    }
}
