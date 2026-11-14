<?php

namespace App\Events;

use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;

class OrderCreated implements ShouldBroadcast, ShouldDispatchAfterCommit
{
    public string $connection = 'database';

    public function __construct(public readonly string $eventId, public readonly int $orderId, public readonly string $occurredAt) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel('admin.orders')];
    }

    public function broadcastAs(): string
    {
        return 'OrderCreated';
    }

    public function broadcastQueue(): string
    {
        return 'broadcasts';
    }

    public function broadcastWith(): array
    {
        return ['event_id' => $this->eventId, 'order_id' => $this->orderId, 'occurred_at' => $this->occurredAt];
    }
}
