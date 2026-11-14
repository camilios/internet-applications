<?php

namespace Tests\Unit;

use App\Mail\OrderConfirmation;
use App\Models\Order;
use Illuminate\Mail\Transport\ArrayTransport;
use Illuminate\Support\Facades\Mail;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class OrderConfirmationHeadersTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config([
            'app.url' => 'https://store.example.test',
            'mail.default' => 'smtp',
            'mail.mailers.smtp.transport' => 'smtp',
            'mail.mailers.smtp.host' => 'smtp.resend.com',
            'mail.mailers.smtp.url' => null,
        ]);
    }

    public function test_resend_key_is_stable_per_event_and_preserves_existing_message_id(): void
    {
        $eventId = 'c0853012-73a2-4e95-8dc3-179c73c7f602';
        $first = $this->confirmation($eventId)->headers();
        $retry = $this->confirmation($eventId)->headers();
        $other = $this->confirmation('9ebd02a2-1062-4074-9fdd-7f1fa31d7020')->headers();

        $this->assertSame('order-confirmation/'.$eventId, $first->text['Resend-Idempotency-Key']);
        $this->assertSame($first->text, $retry->text);
        $this->assertNotSame($first->text, $other->text);
        $this->assertSame($eventId.'@store.example.test', $first->messageId);
        $this->assertSame($first->messageId, $retry->messageId);
        $this->assertLessThanOrEqual(256, strlen($first->text['Resend-Idempotency-Key']));
    }

    public static function otherTransports(): array
    {
        return [
            'other SMTP provider' => ['smtp', 'smtp.other-provider.test'],
            'lookalike SMTP hostname' => ['smtp', 'smtp.resend.com.other-provider.test'],
            'array mock even with matching host' => ['array', 'smtp.resend.com'],
            'log mock even with matching host' => ['log', 'smtp.resend.com'],
            'Resend API transport remains unchanged' => ['resend', 'smtp.resend.com'],
        ];
    }

    #[DataProvider('otherTransports')]
    public function test_non_resend_smtp_configuration_has_no_provider_specific_header(string $transport, string $host): void
    {
        config(['mail.mailers.smtp.transport' => $transport, 'mail.mailers.smtp.host' => $host]);
        $headers = $this->confirmation('c0853012-73a2-4e95-8dc3-179c73c7f602')->headers();

        $this->assertSame([], $headers->text);
        $this->assertSame('c0853012-73a2-4e95-8dc3-179c73c7f602@store.example.test', $headers->messageId);
    }

    public function test_effective_mail_url_host_overrides_the_configured_base_host(): void
    {
        config(['mail.mailers.smtp.host' => 'smtp.other-provider.test', 'mail.mailers.smtp.url' => 'smtp://smtp.resend.com:587']);
        $this->assertArrayHasKey('Resend-Idempotency-Key', $this->confirmation('c0853012-73a2-4e95-8dc3-179c73c7f602')->headers()->text);

        config(['mail.mailers.smtp.host' => 'smtp.resend.com', 'mail.mailers.smtp.url' => 'smtp://smtp.other-provider.test:587']);
        $this->assertSame([], $this->confirmation('c0853012-73a2-4e95-8dc3-179c73c7f602')->headers()->text);
    }

    public function test_named_mailer_uses_its_own_configuration_instead_of_the_default(): void
    {
        config([
            'mail.default' => 'array',
            'mail.mailers.resend_smtp' => ['transport' => 'smtp', 'host' => 'SMTP.RESEND.COM.'],
        ]);
        $confirmation = $this->confirmation('c0853012-73a2-4e95-8dc3-179c73c7f602')->mailer('resend_smtp');
        $this->assertArrayHasKey('Resend-Idempotency-Key', $confirmation->headers()->text);
        $this->assertSame([], $this->confirmation('c0853012-73a2-4e95-8dc3-179c73c7f602')->headers()->text);
    }

    public function test_laravel_emits_both_headers_in_the_built_message_without_network_delivery(): void
    {
        // Capture the configured SMTP mailable using Laravel's in-memory transport.
        $transport = new ArrayTransport;
        Mail::extend('smtp', fn () => $transport);
        $eventId = 'c0853012-73a2-4e95-8dc3-179c73c7f602';

        Mail::to('recipient@example.test')->send($this->confirmation($eventId));
        $headers = $transport->messages()->first()->getOriginalMessage()->getHeaders();

        $this->assertSame('order-confirmation/'.$eventId, $headers->get('Resend-Idempotency-Key')->getBodyAsString());
        $this->assertSame($eventId.'@store.example.test', $headers->get('Message-ID')->getId());
    }

    private function confirmation(string $eventId): OrderConfirmation
    {
        $order = (new Order)->forceFill(['id' => 7, 'total' => '15.00', 'status' => 'pending']);
        $order->setRelation('items', collect());

        return new OrderConfirmation($order, $eventId);
    }
}
