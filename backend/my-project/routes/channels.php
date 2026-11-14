<?php

use App\Models\Order;
use App\Models\User;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('admin.orders', fn (User $user): bool => $user->role === 'admin', ['guards' => ['api']]);

Broadcast::channel('orders.{orderId}', function (User $user, string $orderId): bool {
    return ctype_digit($orderId) && Order::query()->useWritePdo()
        ->whereKey($orderId)->where('user_id', $user->getKey())->exists();
}, ['guards' => ['api']]);
