<?php

namespace App\Services;

use Grpc\BaseStub;
use Grpc\ChannelCredentials;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class InventoryGrpcClient
{
    private ?object $client = null;

    private string $host;

    private int $timeoutMicros;

    public function __construct()
    {
        $this->host = (string) config('services.inventory.grpc_host', 'inventory-service:50051');
        $this->timeoutMicros = (int) config('services.inventory.grpc_timeout', 5) * 1_000_000;
    }

    public function isGrpcAvailable(): bool
    {
        return extension_loaded('grpc') && class_exists(BaseStub::class);
    }

    public function getStock(int $productId): int
    {
        if (! $this->isGrpcAvailable()) {
            return $this->fallbackGetStock($productId);
        }

        $response = $this->call('GetStock', ['product_id' => $productId]);

        if (! ($response['found'] ?? false)) {
            return 0;
        }

        return (int) $response['available_quantity'];
    }

    /**
     * @param  array<array{product_id:int, quantity:int}>  $items
     */
    public function reserveStock(array $items, string $idempotencyKey): ReservationResult
    {
        if (! $this->isGrpcAvailable()) {
            return $this->fallbackReserveStock($items, $idempotencyKey);
        }

        $aggregated = [];
        foreach ($items as $item) {
            $productId = (int) $item['product_id'];
            $aggregated[$productId] = ($aggregated[$productId] ?? 0) + (int) $item['quantity'];
        }
        ksort($aggregated, SORT_NUMERIC);

        $requestItems = [];
        foreach ($aggregated as $productId => $quantity) {
            $requestItems[] = ['product_id' => (int) $productId, 'quantity' => $quantity];
        }

        $response = $this->call('ReserveStock', [
            'items' => $requestItems,
            'idempotency_key' => $idempotencyKey,
        ]);

        $success = (bool) ($response['success'] ?? false);
        $reservationId = ($response['reservation_id'] ?? '') !== '' ? $response['reservation_id'] : null;
        if ($success && $reservationId === null) {
            throw new InventoryOutcomeUnknownException('Inventory service confirmed a reservation without an ID.');
        }

        return new ReservationResult(
            success: $success,
            reservationId: $reservationId,
            reason: ($response['failure_reason'] ?? '') !== '' ? $response['failure_reason'] : null,
        );
    }

    public function releaseStock(string $reservationId): bool
    {
        if (! $this->isGrpcAvailable()) {
            return $this->fallbackReleaseStock($reservationId);
        }

        $response = $this->call('ReleaseStock', ['reservation_id' => $reservationId]);

        return (bool) ($response['success'] ?? false);
    }

    private function fallbackGetStock(int $productId): int
    {
        try {
            $item = DB::connection('inventory')->table('inventory_items')
                ->where('product_id', $productId)
                ->first();

            if (! $item) {
                return 0;
            }

            return max(0, (int) $item->total_quantity - (int) $item->reserved_quantity);
        } catch (\Throwable $e) {
            throw new InventoryUnavailableException('Inventory service is unavailable.');
        }
    }

    private function fallbackReserveStock(array $items, string $idempotencyKey): ReservationResult
    {
        try {
            return DB::connection('inventory')->transaction(function () use ($items, $idempotencyKey) {
                $existing = DB::connection('inventory')->table('reservations')
                    ->where('idempotency_key', $idempotencyKey)
                    ->first();

                if ($existing) {
                    if ($existing->status === 'confirmed') {
                        return new ReservationResult(true, $existing->reservation_id, null);
                    }

                    return new ReservationResult(false, null, 'RESERVATION_' . strtoupper($existing->status));
                }

                $aggregated = [];
                foreach ($items as $item) {
                    $pid = (int) $item['product_id'];
                    $aggregated[$pid] = ($aggregated[$pid] ?? 0) + (int) $item['quantity'];
                }
                ksort($aggregated, SORT_NUMERIC);

                foreach ($aggregated as $productId => $quantity) {
                    $inv = DB::connection('inventory')->table('inventory_items')
                        ->where('product_id', $productId)
                        ->lockForUpdate()
                        ->first();

                    if (! $inv) {
                        return new ReservationResult(false, null, 'PRODUCT_NOT_FOUND');
                    }

                    $available = (int) $inv->total_quantity - (int) $inv->reserved_quantity;
                    if ($available < $quantity) {
                        return new ReservationResult(false, null, 'INSUFFICIENT_STOCK');
                    }
                }

                $reservationId = (string) Str::uuid();
                $requestHash = hash('sha256', json_encode(['items' => $items, 'key' => $idempotencyKey]));

                DB::connection('inventory')->table('reservations')->insert([
                    'reservation_id' => $reservationId,
                    'idempotency_key' => $idempotencyKey,
                    'status' => 'confirmed',
                    'request_hash' => $requestHash,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                foreach ($aggregated as $productId => $quantity) {
                    DB::connection('inventory')->table('inventory_items')
                        ->where('product_id', $productId)
                        ->increment('reserved_quantity', $quantity);

                    DB::connection('inventory')->table('reservation_items')->insert([
                        'reservation_id' => $reservationId,
                        'product_id' => $productId,
                        'quantity' => $quantity,
                        'created_at' => now(),
                    ]);
                }

                return new ReservationResult(true, $reservationId, null);
            });
        } catch (\Throwable $e) {
            throw new InventoryUnavailableException('Inventory request failed: ' . $e->getMessage());
        }
    }

    private function fallbackReleaseStock(string $reservationId): bool
    {
        try {
            return DB::connection('inventory')->transaction(function () use ($reservationId) {
                $reservation = DB::connection('inventory')->table('reservations')
                    ->where('reservation_id', $reservationId)
                    ->lockForUpdate()
                    ->first();

                if (! $reservation) {
                    return true;
                }

                if ($reservation->status === 'released') {
                    return true;
                }

                $items = DB::connection('inventory')->table('reservation_items')
                    ->where('reservation_id', $reservationId)
                    ->get();

                foreach ($items as $item) {
                    DB::connection('inventory')->table('inventory_items')
                        ->where('product_id', $item->product_id)
                        ->decrement('reserved_quantity', $item->quantity);
                }

                DB::connection('inventory')->table('reservations')
                    ->where('reservation_id', $reservationId)
                    ->update([
                        'status' => 'released',
                        'updated_at' => now(),
                    ]);

                return true;
            });
        } catch (\Throwable $e) {
            throw new InventoryUnavailableException('Inventory request failed: ' . $e->getMessage());
        }
    }

    private function call(string $method, array $request): array
    {
        $client = $this->client();
        $call = $client->{$method}($request, [], ['timeout' => $this->timeoutMicros]);
        [$response, $status] = $call->wait();

        if ($status->code !== \Grpc\STATUS_OK) {
            if ($status->code === \Grpc\STATUS_DEADLINE_EXCEEDED && $method === 'ReserveStock') {
                throw new InventoryOutcomeUnknownException('Inventory request deadline exceeded.');
            }

            if ($status->code === \Grpc\STATUS_UNAVAILABLE || $status->code === \Grpc\STATUS_DEADLINE_EXCEEDED) {
                throw new InventoryUnavailableException('Inventory service is unavailable.');
            }

            throw new InventoryUnavailableException('Inventory request failed.');
        }

        if (! is_array($response)) {
            throw new InventoryUnavailableException('Inventory service returned an invalid response.');
        }

        return $response;
    }

    private function client(): object
    {
        if ($this->client !== null) {
            return $this->client;
        }

        if (! extension_loaded('grpc') || ! class_exists(BaseStub::class)) {
            throw new InventoryUnavailableException('The PHP gRPC extension is not installed.');
        }

        require_once __DIR__.'/InventoryGrpcStub.php';
        $this->client = new InventoryGrpcStub($this->host, [
            'credentials' => ChannelCredentials::createInsecure(),
        ]);

        return $this->client;
    }
}
