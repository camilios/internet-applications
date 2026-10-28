<?php

namespace App\Services;

use Grpc\BaseStub;
use Grpc\ChannelCredentials;

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

    public function getStock(int $productId): int
    {
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
        $response = $this->call('ReleaseStock', ['reservation_id' => $reservationId]);

        return (bool) ($response['success'] ?? false);
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
