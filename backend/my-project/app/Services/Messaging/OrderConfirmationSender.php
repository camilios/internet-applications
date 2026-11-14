<?php

namespace App\Services\Messaging;

use App\Mail\OrderConfirmation;
use App\Models\NotificationDelivery;
use App\Models\Order;
use App\Models\OutboxEvent;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use RuntimeException;

class OrderConfirmationSender
{
    public function __construct(private readonly MailDeliveryConfiguration $mailConfiguration) {}

    public function send(array $event): void
    {
        $mode = $this->mailConfiguration->assertDeliverable();

        $outbox = OutboxEvent::query()->useWritePdo()->find($event['event_id']);
        if ($outbox === null || $outbox->event_type !== 'OrderCreated' || $outbox->order_id !== $event['order_id']) {
            throw new PermanentMessageException('Message does not identify a recorded order event.');
        }

        // Unique row + row lock serializes duplicate deliveries, even across worker processes.
        DB::table('notification_deliveries')->insertOrIgnore([
            'event_id' => $event['event_id'], 'order_id' => $event['order_id'],
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::transaction(function () use ($event, $mode): void {
            $delivery = NotificationDelivery::query()->whereKey($event['event_id'])->lockForUpdate()->firstOrFail();
            if ($delivery->delivered_at !== null) {
                // A provider change does not automatically replay earlier mock or unclassified deliveries.
                return;
            }

            $order = Order::query()->useWritePdo()->with(['user', 'items.product'])->find($event['order_id']);
            if ($order === null || $order->user === null || ! filter_var($order->user->email, FILTER_VALIDATE_EMAIL)) {
                throw new PermanentMessageException('Order recipient is unavailable.');
            }

            $sent = Mail::to($order->user->email)->send(new OrderConfirmation($order, $event['event_id']));
            if ($sent === null) {
                throw new RuntimeException('Mail delivery was cancelled before sending.');
            }
            // SMTP cannot participate in this transaction. A crash here can resend; stable Message-ID helps providers deduplicate.
            $delivery->update(['delivered_at' => now(), 'delivery_mode' => $mode]);
            Log::info($mode === 'mock' ? 'MOCK DELIVERY: order confirmation processed without an external email' : 'Order confirmation accepted by delivery transport', [
                'event_id' => $event['event_id'], 'delivery_mode' => $mode,
                'transport_message_id' => substr(preg_replace('/[^A-Za-z0-9@._:+\/-]/', '', $sent->getMessageId()), 0, 255),
            ]);
        }, 1);
    }
}
