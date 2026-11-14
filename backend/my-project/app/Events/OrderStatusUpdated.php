<?php

namespace App\Events;

use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;

class OrderStatusUpdated implements ShouldBroadcast, ShouldDispatchAfterCommit
{
    public string $connection = 'database';

    public function __construct(public readonly string $eventId, public readonly int $orderId, public readonly string $status, public readonly string $occurredAt) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel('orders.'.$this->orderId)];
    }

    public function broadcastAs(): string
    {
        return 'OrderStatusUpdated';
    }

    public function broadcastQueue(): string
    {
        return 'broadcasts';
    }

    public function broadcastWith(): array
    {
        return ['event_id' => $this->eventId, 'order_id' => $this->orderId, 'status' => $this->status, 'occurred_at' => $this->occurredAt];
    }
}
