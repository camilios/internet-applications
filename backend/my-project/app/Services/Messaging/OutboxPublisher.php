<?php

namespace App\Services\Messaging;

use App\Models\OutboxEvent;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class OutboxPublisher
{
    public function __construct(private readonly MessageBroker $broker) {}

    /** Locks one pending row across its bounded publish/confirm operation. */
    public function publishNext(): bool
    {
        return DB::transaction(function (): bool {
            $event = OutboxEvent::query()->useWritePdo()
                ->whereNull('published_at')->where('available_at', '<=', now())
                ->orderBy('available_at')->orderBy('event_id')->lockForUpdate()->first();
            if ($event === null) {
                return false;
            }

            $context = ['event_id' => $event->event_id, 'order_id' => $event->order_id,
                'correlation_id' => $event->payload['correlation_id'] ?? $event->event_id];
            try {
                $this->broker->publish(
                    json_encode($event->payload, JSON_THROW_ON_ERROR),
                    $event->event_id,
                    config('rabbitmq.exchange'),
                    config('rabbitmq.routing_key'),
                );
            } catch (\Throwable $exception) {
                $attempts = $event->attempts + 1;
                $event->update([
                    'attempts' => $attempts,
                    'available_at' => now()->addSeconds(min(config('rabbitmq.publisher_max_backoff'), 2 ** min($attempts, 12))),
                    'last_error' => $exception::class,
                ]);
                $this->broker->close();
                Log::warning('Outbox publication deferred', $context + ['attempt' => $attempts, 'error_type' => $exception::class]);

                return true;
            }

            // A crash after the confirm but before this commit republishes the same event ID.
            $event->update(['published_at' => now(), 'attempts' => $event->attempts + 1, 'last_error' => null]);
            Log::info('Outbox publication confirmed', $context);

            return true;
        }, 1);
    }
}
