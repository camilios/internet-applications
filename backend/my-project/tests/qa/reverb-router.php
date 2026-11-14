<?php

use App\Services\InventoryGrpcClient;
use App\Services\ReservationResult;
use Illuminate\Http\Request;

[$app, $kernel] = require __DIR__.'/reverb-bootstrap.php';

// The wire smoke test exercises production HTTP/auth/order/broadcast code. Only
// the inventory boundary is stubbed; real gRPC acceptance is a separate check.
$inventory = Mockery::mock(InventoryGrpcClient::class);
$inventory->shouldReceive('reserveStock')->andReturnUsing(
    fn (array $items, string $key) => new ReservationResult(true, 'qa-'.$key)
);
$inventory->shouldReceive('getStock')->andReturn(100);
$inventory->shouldReceive('releaseStock')->andReturn(true);
$app->instance(InventoryGrpcClient::class, $inventory);

$request = Request::capture();
$response = $kernel->handle($request);
$response->send();
$kernel->terminate($request, $response);
