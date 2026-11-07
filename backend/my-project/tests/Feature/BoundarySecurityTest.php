<?php

namespace Tests\Feature;

use App\Services\InventoryGrpcClient;
use App\Services\InventoryUnavailableException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class BoundarySecurityTest extends TestCase
{
    public function test_untrusted_clients_cannot_choose_their_rate_limit_ip(): void
    {
        Route::get('/api/test-client-ip', fn (Request $request) => response()->json(['ip' => $request->ip()]));
        $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.9', 'HTTP_X_FORWARDED_FOR' => '198.18.1.1'])
            ->getJson('/api/test-client-ip')->assertOk()->assertJsonPath('ip', '203.0.113.9');
        $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.9', 'HTTP_X_FORWARDED_FOR' => '198.18.1.2'])
            ->getJson('/api/test-client-ip')->assertOk()->assertJsonPath('ip', '203.0.113.9');
    }

    public function test_inventory_has_no_direct_database_fallback_even_in_local_mode(): void
    {
        $this->app['env'] = 'local';
        $client = \Mockery::mock(InventoryGrpcClient::class)->makePartial();
        $client->shouldReceive('isGrpcAvailable')->andReturn(false);
        foreach ([fn () => $client->getStock(1),
            fn () => $client->reserveStock([['product_id' => 1, 'quantity' => 1]], 'missing-sdk'),
            fn () => $client->releaseStock('missing-sdk')] as $operation) {
            try {
                $operation();
                $this->fail('A missing gRPC runtime must fail closed.');
            } catch (InventoryUnavailableException $exception) {
                $this->assertStringContainsString('PHP gRPC extension', $exception->getMessage());
            }
        }
        $this->assertNull(config('database.connections.inventory'));
    }
}
