<?php

namespace App\Services;

use App\Models\Order;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Str;

class NotificationService
{
    /**
     * Get paginated notifications for a user.
     */
    public function getUserNotifications(User $user): LengthAwarePaginator
    {
        return $user->notifications()->latest()->paginate(15);
    }

    /**
     * Mark a specific notification as read.
     */
    public function markAsRead(string $id, User $user): void
    {
        $notification = $user->notifications()->findOrFail($id);
        $notification->markAsRead();
    }

    /**
     * Mark all notifications as read.
     */
    public function markAllAsRead(User $user): void
    {
        $user->unreadNotifications()->update(['read_at' => now()]);
    }

    /**
     * Create an order notification for a user.
     */
    public function createOrderNotification(User $user, Order $order, string $type): void
    {
        $data = [
            'order_id' => $order->id,
            'status' => $order->status,
            'total' => $order->total,
        ];

        $message = match ($type) {
            'order_created' => "Your order #{$order->id} has been placed successfully.",
            'order_status_updated' => "Your order #{$order->id} status changed to {$order->status}.",
            default => "Order #{$order->id} update.",
        };

        $data['message'] = $message;

        // Use database notification directly
        $user->notifications()->create([
            'id' => Str::uuid()->toString(),
            'type' => 'App\\Notifications\\OrderNotification',
            'data' => $data,
        ]);
    }
}
