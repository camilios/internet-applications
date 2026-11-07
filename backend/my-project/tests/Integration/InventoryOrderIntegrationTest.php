<?php

namespace Tests\Integration;

use App\Models\Category;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use App\Services\OrderService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use PDO;
use RuntimeException;
use Tests\TestCase;

class InventoryOrderIntegrationTest extends TestCase
{
    use RefreshDatabase;

    private ?PDO $inventoryDatabase = null;

    private array $inventoryProductIds = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->inventoryDatabase = $this->connectToDedicatedInventoryTestDatabase();
    }

    protected function tearDown(): void
    {
        if ($this->inventoryDatabase) {
            foreach ($this->inventoryProductIds as $productId) {
                $this->removeInventoryFixtures($productId);
            }
        }

        $this->inventoryDatabase = null;
        parent::tearDown();
    }

    public function test_order_reserves_mysql_inventory_through_the_real_grpc_service(): void
    {
        $user = User::factory()->create();
        $product = $this->makeProduct();
        $this->seedInventory($product->id, 1);
        $key = (string) Str::uuid();
        $token = auth('api')->login($user);

        $before = $this->withToken($token)->getJson('/api/dashboard')
            ->assertOk()->assertJsonPath('data.total_orders', 0)->json();
        $this->withToken($token)->getJson('/api/products/'.$product->id)
            ->assertOk()->assertJsonPath('data.stock', 1);

        $this->withToken($token)
            ->withHeader('Idempotency-Key', $key)
            ->postJson('/api/orders', [
                'items' => [['product_id' => $product->id, 'quantity' => 1]],
            ])
            ->assertCreated();

        $after = $this->withToken($token)->getJson('/api/dashboard')
            ->assertOk()->assertJsonPath('data.total_orders', 1)->json();
        $this->withToken($token)->getJson('/api/products/'.$product->id)
            ->assertOk()->assertJsonPath('data.stock', 0);
        fwrite(STDOUT, 'DASHBOARD_RESPONSE_CHECK '.json_encode(['before' => $before, 'after' => $after]).PHP_EOL);

        $this->assertSame(1, (int) $this->inventoryQuantity($product->id)['reserved_quantity']);
        $this->assertDatabaseHas('inventory_operations', [
            'idempotency_key' => $key,
            'status' => 'completed',
        ]);
    }

    public function test_failed_order_persistence_releases_the_real_mysql_reservation(): void
    {
        $user = User::factory()->create();
        $product = $this->makeProduct();
        $this->seedInventory($product->id, 1);
        $key = (string) Str::uuid();

        // Exercise an actual order-persistence failure; notifications now run after commit.
        Order::created(static function (): void {
            throw new RuntimeException('Simulated order persistence failure');
        });

        try {
            app(OrderService::class)->createOrder(
                $user,
                [['product_id' => $product->id, 'quantity' => 1]],
                $key
            );
            $this->fail('The simulated persistence failure should be rethrown.');
        } catch (RuntimeException $exception) {
            $this->assertSame('Simulated order persistence failure', $exception->getMessage());
        }

        $this->assertSame(0, Order::count());
        $this->assertDatabaseHas('inventory_operations', [
            'idempotency_key' => $key,
            'status' => 'compensated',
        ]);
        $this->assertSame(0, (int) $this->inventoryQuantity($product->id)['reserved_quantity']);
    }

    public function test_multi_product_orders_are_all_or_nothing(): void
    {
        $first = $this->makeProduct();
        $second = $this->makeProduct();
        $this->seedInventory($first->id, 2);
        $this->seedInventory($second->id, 0);
        $this->withToken(auth('api')->login(User::factory()->create(['role' => 'customer'])));
        $payload = ['items' => [
            ['product_id' => $first->id, 'quantity' => 1],
            ['product_id' => $second->id, 'quantity' => 1],
        ]];
        $rejected = $this->withHeader('Idempotency-Key', (string) Str::uuid())
            ->postJson('/api/orders', $payload)->assertStatus(409)
            ->assertJsonPath('code', 'INSUFFICIENT_STOCK');
        $this->assertDatabaseCount('orders', 0);
        $this->assertSame(0, (int) $this->inventoryQuantity($first->id)['reserved_quantity']);

        $this->seedInventory($second->id, 1);
        $accepted = $this->withHeader('Idempotency-Key', (string) Str::uuid())
            ->postJson('/api/orders', $payload)->assertCreated()->assertJsonCount(2, 'data.items');
        $this->assertDatabaseCount('orders', 1);
        $this->assertSame(1, (int) $this->inventoryQuantity($first->id)['reserved_quantity']);
        $this->assertSame(1, (int) $this->inventoryQuantity($second->id)['reserved_quantity']);
        fwrite(STDOUT, 'MULTI_PRODUCT_EVIDENCE '.json_encode([
            'rejected' => ['status' => $rejected->status(), 'response' => $rejected->json(), 'orders_created' => 0],
            'accepted' => ['status' => $accepted->status(), 'items' => count($accepted->json('data.items'))],
        ]).PHP_EOL);
    }

    public function test_simultaneous_real_grpc_reservations_cannot_oversell_the_last_unit(): void
    {
        $product = $this->makeProduct();
        $this->seedInventory($product->id, 1);
        $client = new \App\Services\InventoryGrpcStub(config('services.inventory.grpc_host'),
            ['credentials' => \Grpc\ChannelCredentials::createInsecure()]);
        $calls = [];
        // Start every RPC before waiting for any response, bypassing the HTTP server.
        for ($index = 0; $index < 30; $index++) {
            $calls[] = $client->ReserveStock([
                'items' => [['product_id' => $product->id, 'quantity' => 1]],
                'idempotency_key' => (string) Str::uuid(),
            ], [], ['timeout' => 10_000_000]);
        }
        $accepted = 0;
        $rejected = 0;
        foreach ($calls as $call) {
            [$response, $status] = $call->wait();
            $this->assertSame(\Grpc\STATUS_OK, $status->code);
            $result = $response->toArray();
            if ($result['success']) {
                $accepted++;
            } else {
                $this->assertStringContainsString('Insufficient stock', $result['failure_reason']);
                $rejected++;
            }
        }
        $client->close();
        $this->assertSame(1, $accepted);
        $this->assertSame(29, $rejected);
        $this->assertSame(1, (int) $this->inventoryQuantity($product->id)['reserved_quantity']);
        fwrite(STDOUT, 'GRPC_CONCURRENCY_EVIDENCE '.json_encode([
            'initial_stock' => 1, 'simultaneous_calls' => 30,
            'accepted' => $accepted, 'rejected' => $rejected, 'remaining_stock' => 0,
        ]).PHP_EOL);
    }

    private function connectToDedicatedInventoryTestDatabase(): PDO
    {
        $host = (string) getenv('INVENTORY_TEST_DB_HOST');
        $port = (string) getenv('INVENTORY_TEST_DB_PORT');
        $database = (string) getenv('INVENTORY_TEST_DB_NAME');
        $user = (string) getenv('INVENTORY_TEST_DB_USER');
        $password = getenv('INVENTORY_TEST_DB_PASSWORD');
        if ($password === false) {
            $passwordFile = (string) getenv('INVENTORY_TEST_DB_PASSWORD_FILE');
            $password = rtrim((string) file_get_contents($passwordFile), "\r\n");
        }

        $connection = new PDO(
            "mysql:host={$host};port={$port};dbname={$database};charset=utf8mb4",
            $user,
            $password,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
        );
        $identity = $connection->query(
            'SELECT DATABASE() AS database_name, CURRENT_USER() AS database_user'
        )->fetch(PDO::FETCH_ASSOC);

        if (
            ($identity['database_name'] ?? null) !== 'inventory_test' ||
            ! str_starts_with((string) ($identity['database_user'] ?? ''), 'inventory_test_user@')
        ) {
            throw new RuntimeException('Refusing to alter a non-test inventory database.');
        }

        return $connection;
    }

    private function makeProduct(): Product
    {
        $category = Category::create(['name' => 'MySQL integration category']);

        return Product::create([
            'name' => 'MySQL integration product',
            'price' => '9.99',
            'category_id' => $category->id,
            'is_active' => true,
        ]);
    }

    private function seedInventory(int $productId, int $quantity): void
    {
        if (! in_array($productId, $this->inventoryProductIds, true)) {
            $this->inventoryProductIds[] = $productId;
        }
        $this->removeInventoryFixtures($productId);
        $statement = $this->inventoryDatabase->prepare(
            'INSERT INTO inventory_items (product_id, total_quantity, reserved_quantity) VALUES (?, ?, 0)'
        );
        $statement->execute([$productId, $quantity]);
    }

    private function inventoryQuantity(int $productId): array
    {
        $statement = $this->inventoryDatabase->prepare(
            'SELECT total_quantity, reserved_quantity FROM inventory_items WHERE product_id = ?'
        );
        $statement->execute([$productId]);

        return $statement->fetch(PDO::FETCH_ASSOC) ?: [];
    }

    private function removeInventoryFixtures(int $productId): void
    {
        $reservations = $this->inventoryDatabase->prepare(
            'DELETE FROM reservations WHERE reservation_id IN
             (SELECT reservation_id FROM reservation_items WHERE product_id = ?)'
        );
        $reservations->execute([$productId]);
        $statement = $this->inventoryDatabase->prepare(
            'DELETE FROM inventory_items WHERE product_id = ?'
        );
        $statement->execute([$productId]);
    }
}
