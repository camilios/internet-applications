<?php

namespace Tests\Integration;

use App\Models\Category;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use App\Services\NotificationService;
use App\Services\OrderService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Mockery;
use PDO;
use RuntimeException;
use Tests\TestCase;

class InventoryOrderIntegrationTest extends TestCase
{
    use RefreshDatabase;

    private ?PDO $inventoryDatabase = null;

    private ?int $inventoryProductId = null;

    protected function setUp(): void
    {
        parent::setUp();
        $this->inventoryDatabase = $this->connectToDedicatedInventoryTestDatabase();
    }

    protected function tearDown(): void
    {
        if ($this->inventoryDatabase && $this->inventoryProductId !== null) {
            $this->removeInventoryFixtures($this->inventoryProductId);
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

        $this->withToken($token)
            ->withHeader('Idempotency-Key', $key)
            ->postJson('/api/orders', [
                'items' => [['product_id' => $product->id, 'quantity' => 1]],
            ])
            ->assertCreated();

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

        $notifications = Mockery::mock(NotificationService::class);
        $notifications->shouldReceive('createOrderNotification')
            ->once()
            ->andThrow(new RuntimeException('Simulated notification persistence failure'));
        $this->app->instance(NotificationService::class, $notifications);

        try {
            app(OrderService::class)->createOrder(
                $user,
                [['product_id' => $product->id, 'quantity' => 1]],
                $key
            );
            $this->fail('The simulated persistence failure should be rethrown.');
        } catch (RuntimeException $exception) {
            $this->assertSame('Simulated notification persistence failure', $exception->getMessage());
        }

        $this->assertSame(0, Order::count());
        $this->assertDatabaseHas('inventory_operations', [
            'idempotency_key' => $key,
            'status' => 'compensated',
        ]);
        $this->assertSame(0, (int) $this->inventoryQuantity($product->id)['reserved_quantity']);
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
        $this->inventoryProductId = $productId;
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
