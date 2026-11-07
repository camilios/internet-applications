<?php

namespace Tests\Integration;

use App\Models\Category;
use App\Models\Product;
use App\Models\User;
use App\Services\InventoryGrpcClient;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class InventoryFailureIntegrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_unresponsive_inventory_has_a_real_grpc_deadline_and_creates_no_order(): void
    {
        // The OS accepts TCP handshakes, but no server reads or answers HTTP/2.
        $listener = stream_socket_server('tcp://127.0.0.1:0', $error, $message);
        $this->assertNotFalse($listener, $message);
        try {
            $this->assertFailureResponses(stream_socket_get_name($listener, false), 'RESERVATION_OUTCOME_UNKNOWN');
        } finally {
            fclose($listener);
        }
    }

    public function test_unavailable_inventory_returns_clear_errors_and_creates_no_order(): void
    {
        $listener = stream_socket_server('tcp://127.0.0.1:0', $error, $message);
        $this->assertNotFalse($listener, $message);
        $address = stream_socket_get_name($listener, false);
        fclose($listener);
        $this->assertFailureResponses($address, 'INVENTORY_UNAVAILABLE');
    }

    private function assertFailureResponses(string $address, string $orderCode): void
    {
        config(['services.inventory.grpc_host' => $address, 'services.inventory.grpc_timeout' => 1]);
        $this->app->forgetInstance(InventoryGrpcClient::class);
        $category = Category::create(['name' => 'Failure proof']);
        $product = Product::create(['name' => 'Failure proof', 'price' => '5.00',
            'is_active' => true, 'category_id' => $category->id]);
        $this->withToken(auth('api')->login(User::factory()->create(['role' => 'customer'])));
        $evidence = [];
        $started = microtime(true);
        $detail = $this->getJson('/api/products/'.$product->id)->assertStatus(503)
            ->assertJsonPath('code', 'INVENTORY_UNAVAILABLE');
        $elapsed = microtime(true) - $started;
        $this->assertLessThan(5, $elapsed, 'A one-second gRPC deadline must bound the HTTP wait.');
        $evidence[] = ['method' => 'GET', 'status' => $detail->status(),
            'response' => $detail->json(), 'elapsed_seconds' => $elapsed];

        $started = microtime(true);
        $created = $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/orders',
            ['items' => [['product_id' => $product->id, 'quantity' => 1]]])
            ->assertStatus(503)->assertJsonPath('code', $orderCode);
        $elapsed = microtime(true) - $started;
        $this->assertLessThan(5, $elapsed);
        $this->assertDatabaseCount('orders', 0);
        $evidence[] = ['method' => 'POST', 'status' => $created->status(),
            'response' => $created->json(), 'elapsed_seconds' => $elapsed, 'orders_created' => 0];
        fwrite(STDOUT, 'INVENTORY_FAILURE_EVIDENCE '.json_encode($evidence).PHP_EOL);
    }
}
