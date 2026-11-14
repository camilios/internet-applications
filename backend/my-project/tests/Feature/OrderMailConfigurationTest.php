<?php

namespace Tests\Feature;

use App\Models\NotificationDelivery;
use App\Models\Order;
use App\Models\OutboxEvent;
use App\Models\User;
use App\Services\Messaging\EmailMessageProcessor;
use App\Services\Messaging\IncomingMessage;
use App\Services\Messaging\MailDeliveryConfiguration;
use App\Services\Messaging\MailDeliveryConfigurationException;
use App\Services\Messaging\MessageBroker;
use App\Services\Messaging\OrderConfirmationSender;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Mail\SentMessage;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Tests\TestCase;

class OrderMailConfigurationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['mail.order_email_allow_mock' => false]);
    }

    public static function blockedMailers(): array
    {
        return [
            'log without explicit mock opt-in' => ['log', 'local', false],
            'array outside tests without opt-in' => ['array', 'local', false],
            'production log even with opt-in' => ['log', 'production', true],
            'production array even with opt-in' => ['array', 'production', true],
            'null never delivers' => ['null', 'local', true],
            'staging mock is not a local demonstration' => ['log', 'staging', true],
        ];
    }

    #[DataProvider('blockedMailers')]
    public function test_worker_rejects_non_delivery_configuration_before_consuming(string $mailer, string $environment, bool $allowMock): void
    {
        $this->app->instance('env', $environment);
        config(['mail.default' => $mailer, 'mail.order_email_allow_mock' => $allowMock]);
        $broker = Mockery::mock(MessageBroker::class);
        $broker->shouldNotReceive('receive');
        $broker->shouldNotReceive('publish');
        $this->app->instance(MessageBroker::class, $broker);

        $this->artisan('orders:email-worker', ['--once' => true])->assertExitCode(1);
        $this->assertDatabaseCount('notification_deliveries', 0);
    }

    public function test_explicit_local_mock_worker_warns_and_can_poll(): void
    {
        $this->app->instance('env', 'local');
        config(['mail.default' => 'log', 'mail.order_email_allow_mock' => true]);
        $broker = Mockery::mock(MessageBroker::class);
        $broker->shouldReceive('receive')->once()->andReturnNull();
        $broker->shouldReceive('close')->once();
        $this->app->instance(MessageBroker::class, $broker);

        $this->artisan('orders:email-worker', ['--once' => true])
            ->expectsOutputToContain('MOCK DELIVERY enabled')
            ->assertExitCode(0);
    }

    public function test_array_transport_is_an_explicitly_identified_mock_under_testing(): void
    {
        config(['mail.default' => 'array']);
        $this->assertSame('mock', app(MailDeliveryConfiguration::class)->assertDeliverable());
    }

    public function test_composites_reject_non_delivery_fallback_even_in_explicit_local_mock_mode(): void
    {
        $this->app->instance('env', 'local');
        config([
            'mail.default' => 'failover', 'mail.order_email_allow_mock' => true,
            'mail.mailers.smtp.host' => 'smtp.provider.example',
        ]);

        $this->expectException(MailDeliveryConfigurationException::class);
        app(MailDeliveryConfiguration::class)->assertDeliverable();
    }

    public function test_nested_roundrobin_cannot_hide_array_fallback(): void
    {
        config([
            'mail.default' => 'roundrobin',
            'mail.mailers.roundrobin.mailers' => ['smtp', 'failover'],
            'mail.mailers.smtp.host' => 'smtp.provider.example',
            'mail.mailers.failover.mailers' => ['smtp', 'array'],
        ]);
        $this->expectException(MailDeliveryConfigurationException::class);
        app(MailDeliveryConfiguration::class)->assertDeliverable();
    }

    public function test_smtp_configuration_is_validated_without_consuming_or_sending(): void
    {
        config(['mail.default' => 'smtp', 'mail.mailers.smtp.host' => '']);
        $broker = Mockery::mock(MessageBroker::class);
        $broker->shouldNotReceive('receive');
        $this->app->instance(MessageBroker::class, $broker);
        Mail::shouldReceive('to')->never();

        $this->artisan('orders:email-worker', ['--once' => true])
            ->expectsOutputToContain('Configure the external SMTP provider host and port')
            ->assertExitCode(1);
        config(['mail.mailers.smtp.host' => 'smtp.provider.example']);
        $this->assertSame('external', app(MailDeliveryConfiguration::class)->assertDeliverable());
    }

    public function test_mail_url_cannot_override_smtp_to_a_non_delivery_transport(): void
    {
        config(['mail.default' => 'smtp', 'mail.mailers.smtp.url' => 'null://localhost']);
        $this->expectException(MailDeliveryConfigurationException::class);
        app(MailDeliveryConfiguration::class)->assertDeliverable();
    }

    public function test_direct_sender_guard_keeps_existing_pending_delivery_pending(): void
    {
        $event = $this->makeEvent();
        NotificationDelivery::create(['event_id' => $event->event_id, 'order_id' => $event->order_id]);
        $this->app->instance('env', 'production');
        config(['mail.default' => 'log', 'mail.order_email_allow_mock' => true]);
        Mail::shouldReceive('to')->never();

        try {
            app(OrderConfirmationSender::class)->send($event->payload);
            $this->fail('Expected non-delivery mailer rejection.');
        } catch (MailDeliveryConfigurationException) {
            $delivery = NotificationDelivery::findOrFail($event->event_id);
            $this->assertNull($delivery->delivered_at);
            $this->assertNull($delivery->delivery_mode);
        }
    }

    public function test_configuration_failure_does_not_ack_retry_or_dead_letter_the_original(): void
    {
        $event = $this->makeEvent();
        config(['mail.default' => 'log']);
        $broker = Mockery::mock(MessageBroker::class);
        $broker->shouldNotReceive('publish');
        $acked = false;

        try {
            (new EmailMessageProcessor($broker, app(OrderConfirmationSender::class)))->handle(new IncomingMessage(json_encode($event->payload), 1, function () use (&$acked): void {
                $acked = true;
            }));
            $this->fail('Expected configuration failure without message handling.');
        } catch (MailDeliveryConfigurationException) {
            $this->assertFalse($acked);
            $this->assertDatabaseCount('notification_deliveries', 0);
        }
    }

    public function test_explicit_mock_delivery_is_recorded_as_mock_and_remains_idempotent(): void
    {
        $event = $this->makeEvent();
        $this->app->instance('env', 'local');
        config(['mail.default' => 'log', 'mail.order_email_allow_mock' => true]);
        app(OrderConfirmationSender::class)->send($event->payload);
        app(OrderConfirmationSender::class)->send($event->payload);

        $this->assertDatabaseHas('notification_deliveries', ['event_id' => $event->event_id, 'delivery_mode' => 'mock']);
        $this->assertNotNull(NotificationDelivery::findOrFail($event->event_id)->delivered_at);
        $this->assertDatabaseCount('notification_deliveries', 1);
    }

    public function test_provider_change_does_not_automatically_resend_mock_or_unknown_legacy_delivery(): void
    {
        $event = $this->makeEvent();
        $delivery = NotificationDelivery::create(['event_id' => $event->event_id, 'order_id' => $event->order_id, 'delivered_at' => now(), 'delivery_mode' => 'mock']);
        config(['mail.default' => 'smtp', 'mail.mailers.smtp.host' => 'smtp.provider.example']);
        Mail::shouldReceive('to')->never();
        app(OrderConfirmationSender::class)->send($event->payload);
        $this->assertSame('mock', $delivery->fresh()->delivery_mode);

        $delivery->update(['delivery_mode' => null]);
        app(OrderConfirmationSender::class)->send($event->payload);
        $this->assertNull($delivery->fresh()->delivery_mode);
    }

    public function test_external_mode_is_recorded_only_after_delivery_transport_accepts_the_message(): void
    {
        Log::spy();
        $event = $this->makeEvent();
        config(['mail.default' => 'smtp', 'mail.mailers.smtp.host' => 'smtp.provider.example']);
        Mail::shouldReceive('to')->once()->andReturnSelf();
        Mail::shouldReceive('send')->once()->andReturnUsing(function () use ($event): SentMessage {
            $delivery = NotificationDelivery::findOrFail($event->event_id);
            $this->assertNull($delivery->delivered_at);
            $this->assertNull($delivery->delivery_mode);

            $sent = Mockery::mock(SentMessage::class);
            $sent->shouldReceive('getMessageId')->once()->andReturn("provider-message-id\r\n");

            return $sent;
        });

        app(OrderConfirmationSender::class)->send($event->payload);
        $this->assertSame('external', NotificationDelivery::findOrFail($event->event_id)->delivery_mode);
        Log::shouldHaveReceived('info')->with('Order confirmation accepted by delivery transport', [
            'event_id' => $event->event_id,
            'delivery_mode' => 'external',
            'transport_message_id' => 'provider-message-id',
        ])->once();
    }

    public function test_cancelled_external_send_is_not_recorded_as_delivered_in_any_mode(): void
    {
        $event = $this->makeEvent();
        config(['mail.default' => 'smtp', 'mail.mailers.smtp.host' => 'smtp.provider.example']);
        Mail::shouldReceive('to')->once()->andReturnSelf();
        Mail::shouldReceive('send')->once()->andReturnNull();

        try {
            app(OrderConfirmationSender::class)->send($event->payload);
            $this->fail('A cancelled send must remain pending.');
        } catch (RuntimeException) {
            $delivery = NotificationDelivery::findOrFail($event->event_id);
            $this->assertNull($delivery->delivered_at);
            $this->assertNull($delivery->delivery_mode);
        }
    }

    private function makeEvent(): OutboxEvent
    {
        $order = Order::create(['user_id' => User::factory()->create()->id, 'total' => '15', 'status' => 'pending']);
        $id = (string) Str::uuid();

        return OutboxEvent::create([
            'event_id' => $id, 'order_id' => $order->id, 'event_type' => 'OrderCreated',
            'payload' => ['event_id' => $id, 'type' => 'OrderCreated', 'order_id' => $order->id], 'available_at' => now(),
        ]);
    }
}
