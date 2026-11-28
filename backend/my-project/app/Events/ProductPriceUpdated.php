<?php

namespace App\Events;

use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;

class ProductPriceUpdated implements ShouldBroadcast, ShouldDispatchAfterCommit
{
    public string $connection = 'database';

    public function __construct(public readonly int $productId) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel('catalog.products')];
    }

    public function broadcastAs(): string
    {
        return 'ProductPriceUpdated';
    }

    public function broadcastQueue(): string
    {
        return 'broadcasts';
    }

    public function broadcastWith(): array
    {
        return ['product_id' => $this->productId];
    }
}
