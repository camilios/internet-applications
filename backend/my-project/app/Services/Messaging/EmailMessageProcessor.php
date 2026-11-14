<?php

namespace App\Services\Messaging;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use JsonException;

class EmailMessageProcessor
{
    public function __construct(private readonly MessageBroker $broker, private readonly OrderConfirmationSender $sender) {}

    public function handle(IncomingMessage $message): void
    {
        $event = null;
        try {
            $event = $this->decode($message->body);
            Log::info('Order email processing', ['event_id' => $event['event_id'], 'attempt' => $message->attempt]);
            $this->sender->send($event);
        } catch (MailDeliveryConfigurationException $exception) {
            // Misconfiguration is operational, not a failed delivery attempt. Preserve the original message.
            throw $exception;
        } catch (\Throwable $exception) {
            $permanent = $exception instanceof PermanentMessageException || $exception instanceof JsonException;
            $exhausted = $message->attempt >= config('rabbitmq.max_attempts');
            $eventId = $event['event_id'] ?? (string) Str::uuid();
            if ($permanent || $exhausted) {
                // Confirm the DLQ publication before acknowledging the original delivery.
                $this->broker->publish($message->body, $eventId, config('rabbitmq.dead_letter_exchange'), config('rabbitmq.dead_letter_routing_key'), $message->attempt);
            } else {
                $retryIndex = min($message->attempt, count(config('rabbitmq.retry_delays')));
                $this->broker->publish($message->body, $eventId, config('rabbitmq.retry_exchange'), 'retry.'.$retryIndex, $message->attempt + 1);
            }
            Log::warning('Order email deferred', [
                'event_id' => $eventId, 'attempt' => $message->attempt,
                'destination' => $permanent || $exhausted ? 'dead_letter' : 'retry', 'error_type' => $exception::class,
            ]);
            $message->acknowledge();

            return;
        }

        Log::info('Order email processed', ['event_id' => $event['event_id'], 'attempt' => $message->attempt]);
        $message->acknowledge();
    }

    private function decode(string $body): array
    {
        $event = json_decode($body, true, 16, JSON_THROW_ON_ERROR);
        if (! is_array($event) || ($event['type'] ?? null) !== 'OrderCreated'
            || ! is_string($event['event_id'] ?? null) || ! Str::isUuid($event['event_id'])
            || ! is_int($event['order_id'] ?? null) || $event['order_id'] < 1) {
            throw new PermanentMessageException('Unsupported order event envelope.');
        }

        return $event;
    }
}
