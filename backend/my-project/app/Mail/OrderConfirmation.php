<?php

namespace App\Mail;

use App\Models\Order;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Mail\Mailables\Headers;
use Illuminate\Support\ConfigurationUrlParser;

class OrderConfirmation extends Mailable
{
    public function __construct(public readonly Order $order, private readonly string $eventId) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Order #'.$this->order->id.' confirmation');
    }

    public function headers(): Headers
    {
        $domain = parse_url((string) config('app.url'), PHP_URL_HOST) ?: 'localhost';

        return new Headers(
            messageId: $this->eventId.'@'.$domain,
            text: $this->usesResendSmtp() ? ['Resend-Idempotency-Key' => 'order-confirmation/'.$this->eventId] : [],
        );
    }

    private function usesResendSmtp(): bool
    {
        $mailer = config('mail.mailers.'.($this->mailer ?? config('mail.default')), []);
        if (! is_array($mailer)) {
            return false;
        }
        if (isset($mailer['url'])) {
            try {
                // Laravel allows MAIL_URL to override both the host and transport.
                $mailer = (new ConfigurationUrlParser)->parseConfiguration($mailer);
                $mailer['transport'] = $mailer['driver'] ?? null;
            } catch (\Throwable) {
                return false;
            }
        }

        return ($mailer['transport'] ?? null) === 'smtp'
            && is_string($mailer['host'] ?? null)
            && strtolower(rtrim($mailer['host'], '.')) === 'smtp.resend.com';
    }

    public function content(): Content
    {
        return new Content(view: 'mail.order-confirmation');
    }
}
