<?php

namespace App\Services;

use App\Models\FailedCompensation;
use App\Models\InventoryOperation;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class OrderService
{
    public function __construct(
        protected InventoryGrpcClient $inventoryClient,
        protected NotificationService $notificationService,
    ) {}

    /**
     * Create a new order.
     *
     * 1. Validate products exist and are active
     * 2. Get prices from DB (not client)
     * 3. Call gRPC ReserveStock
     * 4. If reservation fails, return error with reason
     * 5. If reservation succeeds, save order + items in DB transaction
     * 6. If DB save fails, call gRPC ReleaseStock, log failure, create FailedCompensation if release fails
     * 7. Create notification for user
     * 8. Return order
     */
    public function createOrder(User $user, array $items, string $idempotencyKey): Order
    {
        $normalizedItems = collect($items)
            ->map(fn (array $item) => [
                'product_id' => (int) $item['product_id'],
                'quantity' => (int) $item['quantity'],
            ])
            ->sortBy(['product_id', 'quantity'])
            ->values()
            ->all();
        $requestHash = hash('sha256', json_encode($normalizedItems, JSON_THROW_ON_ERROR));

        DB::table('inventory_operations')->insertOrIgnore([
            'idempotency_key' => $idempotencyKey,
            'user_id' => $user->id,
            'request_hash' => $requestHash,
            'status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $operation = InventoryOperation::where('idempotency_key', $idempotencyKey)->firstOrFail();

        if ($operation->user_id !== $user->id || ! hash_equals($operation->request_hash, $requestHash)) {
            throw new \InvalidArgumentException('This Idempotency-Key was already used for a different order.');
        }
        if ($operation->status === 'completed') {
            return Order::with('items.product')->findOrFail($operation->order_id);
        }
        if ($operation->status === 'compensation_pending') {
            throw new InventoryOutcomeUnknownException('A prior compensation is still pending.');
        }
        if ($operation->status === 'compensated') {
            throw new \InvalidArgumentException('The previous attempt was compensated. Use a new Idempotency-Key.');
        }

        $productIds = array_column($items, 'product_id');
        $products = Product::whereIn('id', $productIds)
            ->where('is_active', true)
            ->get()
            ->keyBy('id');

        // Check all products exist and are active
        foreach ($items as $item) {
            if (! $products->has($item['product_id'])) {
                throw new \InvalidArgumentException(
                    "Product ID {$item['product_id']} not found or is inactive."
                );
            }
        }

        $orderItems = [];
        $total = '0.00';
        foreach ($items as $item) {
            $product = $products[$item['product_id']];
            $unitPrice = $product->price;
            $subtotal = bcmul($unitPrice, (string) $item['quantity'], 2);
            $total = bcadd($total, $subtotal, 2);

            $orderItems[] = [
                'product_id' => $product->id,
                'quantity' => $item['quantity'],
                'unit_price' => $unitPrice,
                'subtotal' => $subtotal,
            ];
        }

        $reservationId = null;
        try {
            $reservedOperation = DB::transaction(function () use (
                $operation,
                $items,
                $idempotencyKey
            ) {
                $lockedOperation = InventoryOperation::query()
                    ->whereKey($operation->id)
                    ->lockForUpdate()
                    ->firstOrFail();

                if ($lockedOperation->status === 'completed') {
                    return $lockedOperation;
                }
                if ($lockedOperation->status === 'compensation_pending') {
                    throw new InventoryOutcomeUnknownException('A prior compensation is still pending.');
                }
                if ($lockedOperation->status === 'compensated') {
                    throw new \InvalidArgumentException('The previous attempt was compensated. Use a new Idempotency-Key.');
                }

                if ($lockedOperation->status === 'pending') {
                    $reservation = $this->inventoryClient->reserveStock($items, $idempotencyKey);
                    if (! $reservation->success) {
                        throw new InsufficientStockException(
                            $reservation->reason ?: 'Insufficient stock for one or more products.'
                        );
                    }
                    if (! $reservation->reservationId) {
                        throw new InventoryOutcomeUnknownException('Reservation was not confirmed with an ID.');
                    }

                    $lockedOperation->update([
                        'status' => 'reserved',
                        'reservation_id' => $reservation->reservationId,
                    ]);
                }

                if ($lockedOperation->status !== 'reserved' || ! $lockedOperation->reservation_id) {
                    throw new InventoryOutcomeUnknownException('Reservation operation is not in a recoverable state.');
                }

                return $lockedOperation->fresh();
            });
            $reservationId = $reservedOperation->reservation_id;

            if ($reservedOperation->status === 'completed') {
                return Order::with('items.product')->findOrFail($reservedOperation->order_id);
            }

            $order = DB::transaction(function () use ($operation, $user, $total, $orderItems) {
                $lockedOperation = InventoryOperation::query()
                    ->whereKey($operation->id)
                    ->lockForUpdate()
                    ->firstOrFail();

                if ($lockedOperation->status === 'completed') {
                    return Order::with('items.product')->findOrFail($lockedOperation->order_id);
                }
                if ($lockedOperation->status !== 'reserved' || ! $lockedOperation->reservation_id) {
                    throw new InventoryOutcomeUnknownException('Confirmed reservation state is unavailable.');
                }

                $order = Order::create([
                    'user_id' => $user->id,
                    'total' => $total,
                    'status' => 'pending',
                    'reservation_id' => $lockedOperation->reservation_id,
                ]);

                foreach ($orderItems as $item) {
                    $order->items()->create($item);
                }

                $lockedOperation->update([
                    'status' => 'completed',
                    'order_id' => $order->id,
                    'last_error' => null,
                ]);
                $this->notificationService->createOrderNotification($user, $order, 'order_created');

                return $order;
            });
        } catch (InsufficientStockException|InventoryUnavailableException $exception) {
            throw $exception;
        } catch (\Throwable $e) {
            if ($reservationId === null) {
                try {
                    $durableOperation = InventoryOperation::find($operation->id);
                    if ($durableOperation?->status === 'completed') {
                        return Order::with('items.product')->findOrFail($durableOperation->order_id);
                    }
                    $reservationId = $durableOperation?->reservation_id;
                } catch (\Throwable $lookupException) {
                    Log::critical('Could not determine whether an order reservation was persisted', [
                        'operation_id' => $operation->id,
                        'error' => $lookupException->getMessage(),
                    ]);
                    throw new InventoryOutcomeUnknownException('Order persistence outcome is not known.');
                }
            }

            if ($reservationId === null) {
                throw $e;
            }

            try {
                $durableOperation = InventoryOperation::find($operation->id);
                if ($durableOperation?->status === 'completed') {
                    return Order::with('items.product')->findOrFail($durableOperation->order_id);
                }
            } catch (\Throwable $lookupException) {
                Log::critical('Could not verify order persistence before compensation', [
                    'operation_id' => $operation->id,
                    'reservation_id' => $reservationId,
                    'error' => $lookupException->getMessage(),
                ]);
                throw new InventoryOutcomeUnknownException('Order persistence outcome is not known.');
            }

            Log::error('Order creation failed, attempting stock release', [
                'reservation_id' => $reservationId,
                'error' => $e->getMessage(),
            ]);

            $released = false;
            $compensationError = null;
            try {
                $released = $this->inventoryClient->releaseStock($reservationId);
                if (! $released) {
                    $compensationError = 'Inventory service did not confirm the release.';
                }
            } catch (\Throwable $releaseException) {
                $compensationError = $releaseException->getMessage();
            }

            DB::transaction(function () use ($operation, $reservationId, $released, $compensationError, $e) {
                $lockedOperation = InventoryOperation::query()
                    ->whereKey($operation->id)
                    ->lockForUpdate()
                    ->firstOrFail();
                $lockedOperation->update([
                    'status' => $released ? 'compensated' : 'compensation_pending',
                    'reservation_id' => $reservationId,
                    'last_error' => $released ? $e->getMessage() : $compensationError,
                ]);

                if (! $released) {
                    FailedCompensation::firstOrCreate(
                        ['operation_id' => $lockedOperation->id],
                        [
                            'reservation_id' => $reservationId,
                            'status' => 'pending',
                            'error_message' => $compensationError,
                            'attempts' => 1,
                            'last_attempted_at' => now(),
                        ]
                    );
                }
            });

            if (! $released) {
                Log::critical('Stock compensation recorded for retry', [
                    'operation_id' => $operation->id,
                    'reservation_id' => $reservationId,
                    'error' => $compensationError,
                ]);
            }

            throw $e;
        }

        return $order->load('items.product');
    }

    /**
     * Get paginated orders for a user.
     */
    public function getUserOrders(User $user, ?string $status = null): LengthAwarePaginator
    {
        $query = $user->orders()->with('items.product')->latest();

        if ($status !== null) {
            $query->where('status', $status);
        }

        return $query->paginate(15);
    }

    /**
     * Get a single order with items.
     */
    public function getOrder(int $id): Order
    {
        return Order::with('items.product')->findOrFail($id);
    }

    /**
     * Get all orders (admin).
     */
    public function getAllOrders(?string $status = null): LengthAwarePaginator
    {
        $query = Order::with('items.product', 'user')->latest();

        if ($status !== null) {
            $query->where('status', $status);
        }

        return $query->paginate(15);
    }

    /**
     * Update order status with valid state transitions.
     */
    public function updateStatus(Order $order, string $status): Order
    {
        $validTransitions = [
            'pending' => ['confirmed', 'cancelled'],
            'confirmed' => ['processing', 'cancelled'],
            'processing' => ['shipped', 'cancelled'],
            'shipped' => ['delivered'],
            'delivered' => [],
            'cancelled' => [],
        ];

        $currentStatus = $order->status;

        if (! isset($validTransitions[$currentStatus]) ||
            ! in_array($status, $validTransitions[$currentStatus])) {
            throw new \InvalidArgumentException(
                "Cannot transition from '{$currentStatus}' to '{$status}'."
            );
        }

        if ($status === 'cancelled' && $order->reservation_id !== null) {
            if (! $this->inventoryClient->releaseStock($order->reservation_id)) {
                throw new InventoryUnavailableException('Stock release could not be confirmed.');
            }
        }

        $order->update(['status' => $status]);

        // Notify user of status change
        $this->notificationService->createOrderNotification(
            $order->user,
            $order,
            'order_status_updated'
        );

        return $order->fresh('items.product');
    }
}
