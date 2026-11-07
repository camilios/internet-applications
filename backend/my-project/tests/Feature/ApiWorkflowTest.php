<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\FailedCompensation;
use App\Models\InventoryOperation;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use App\Services\InventoryGrpcClient;
use App\Services\InventoryOutcomeUnknownException;
use App\Services\InventoryUnavailableException;
use App\Services\OrderService;
use App\Services\ReservationResult;
use Carbon\Carbon;
use Illuminate\Http\UploadedFile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Mockery;
use RuntimeException;
use Tests\TestCase;

class ApiWorkflowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['jwt.secret' => str_repeat('a', 32)]);
    }

    public function test_registration_login_and_token_protected_identity(): void
    {
        $response = $this->postJson('/api/register', [
            'name' => 'New Customer',
            'email' => 'customer@example.test',
            'password' => 'StrongPass123',
            'password_confirmation' => 'StrongPass123',
            'role' => 'admin',
        ]);

        $response->assertCreated()
            ->assertJsonPath('user.role', 'customer')
            ->assertJsonMissingPath('user.password');

        $user = User::where('email', 'customer@example.test')->firstOrFail();
        $this->assertNotSame('StrongPass123', $user->password);

        $login = $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'StrongPass123',
        ])->assertOk();

        $token = $login->json('access_token');
        $this->withToken($token)->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('data.email', $user->email);

        $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'incorrect',
        ])->assertUnauthorized();
    }

    public function test_protected_identity_rejects_missing_and_invalid_tokens(): void
    {
        $this->getJson('/api/me')->assertUnauthorized();
        $this->withToken('not-a-valid-jwt')->getJson('/api/me')->assertUnauthorized();
    }

    public function test_grpc_client_does_not_fake_a_reservation_when_the_extension_is_missing(): void
    {
        if (extension_loaded('grpc')) {
            $this->markTestSkipped('This assertion only applies when the PHP gRPC extension is unavailable.');
        }

        $this->expectException(InventoryUnavailableException::class);
        app(InventoryGrpcClient::class)->reserveStock(
            [['product_id' => 1, 'quantity' => 1]],
            (string) Str::uuid()
        );
    }

    public function test_logout_invalidates_the_bearer_token(): void
    {
        $user = User::factory()->create();
        $token = auth('api')->login($user);

        $this->withToken($token)->postJson('/api/logout')->assertOk();
        $this->withToken($token)->getJson('/api/me')->assertUnauthorized();
    }

    public function test_registration_rejects_duplicate_and_invalid_data(): void
    {
        User::factory()->create(['email' => 'duplicate@example.test']);

        $this->postJson('/api/register', [
            'name' => 'Duplicate',
            'email' => 'duplicate@example.test',
            'password' => 'StrongPass123',
            'password_confirmation' => 'StrongPass123',
        ])->assertUnprocessable();

        $this->postJson('/api/register', [
            'name' => '',
            'email' => 'not-an-email',
            'password' => 'short',
            'password_confirmation' => 'different',
        ])->assertUnprocessable();
    }

    public function test_customers_cannot_manage_products_but_admins_can(): void
    {
        $category = Category::create(['name' => 'Books']);
        $customer = User::factory()->create();
        $this->withToken(auth('api')->login($customer))
            ->postJson('/api/products', [
                'name' => 'Restricted',
                'price' => '10.00',
                'category_id' => $category->id,
            ])->assertForbidden();

        $admin = User::factory()->create();
        $admin->role = 'admin';
        $admin->save();
        $this->withToken(auth('api')->login($admin))
            ->postJson('/api/products', [
                'name' => 'Book',
                'price' => '10.00',
                'category_id' => $category->id,
            ])->assertCreated();
    }

    public function test_admin_product_management_supports_create_update_and_deactivation(): void
    {
        $category = Category::create(['name' => 'Product management']);
        $customer = User::factory()->create();
        $product = $this->makeProduct();

        $this->withToken(auth('api')->login($customer))
            ->putJson('/api/products/'.$product->id, ['name' => 'Customer edit'])
            ->assertForbidden();
        $this->withToken(auth('api')->login($customer))
            ->deleteJson('/api/products/'.$product->id)
            ->assertForbidden();

        $admin = User::factory()->create(['role' => 'admin']);
        $adminToken = auth('api')->login($admin);

        $created = $this->withToken($adminToken)
            ->postJson('/api/products', [
                'name' => 'Created by admin',
                'price' => '15.00',
                'category_id' => $category->id,
            ])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Created by admin');
        $createdId = $created->json('data.id');

        $this->withToken($adminToken)
            ->putJson('/api/products/'.$createdId, ['name' => 'Updated by admin'])
            ->assertOk()
            ->assertJsonPath('data.name', 'Updated by admin');

        $this->withToken($adminToken)
            ->deleteJson('/api/products/'.$createdId)
            ->assertOk()
            ->assertJsonPath('message', 'Product deactivated.');

        $this->assertSoftDeleted('products', ['id' => $createdId]);
        $this->getJson('/api/products?search=Updated')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_product_images_accept_supported_raster_formats_and_reject_svg(): void
    {
        Storage::fake('public');
        $category = Category::create(['name' => 'Image uploads']);
        $adminToken = auth('api')->login(User::factory()->create(['role' => 'admin']));

        $created = $this->withToken($adminToken)
            ->withHeader('Accept', 'application/json')
            ->post('/api/products', [
            'name' => 'Image product',
            'price' => '20.00',
            'category_id' => $category->id,
            'image' => UploadedFile::fake()->image('product.png', 10, 10),
        ])->assertCreated();

        $imagePath = basename($created->json('data.image_url'));
        Storage::disk('public')->assertExists('products/'.$imagePath);

        $this->withToken($adminToken)
            ->withHeader('Accept', 'application/json')
            ->post('/api/products', [
            'name' => 'SVG product',
            'price' => '20.00',
            'category_id' => $category->id,
            'image' => UploadedFile::fake()->createWithContent(
                'product.svg',
                '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
            ),
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('image');
    }

    public function test_dashboard_and_user_listing_are_connected_and_admin_scoped(): void
    {
        $customer = User::factory()->create();
        $admin = User::factory()->create(['role' => 'admin']);
        Order::create([
            'user_id' => $customer->id,
            'total' => '12.50',
            'status' => 'confirmed',
        ]);

        $customerToken = auth('api')->login($customer);
        $this->withToken($customerToken)
            ->getJson('/api/dashboard')
            ->assertOk()
            ->assertJsonPath('data.total_orders', 1)
            ->assertJsonPath('data.orders_today', 1)
            ->assertJsonPath('data.total_users', null)
            ->assertJsonPath('data.total_sales', '12.50');
        $this->withToken($customerToken)->getJson('/api/users')->assertForbidden();
        $this->withToken($customerToken)
            ->getJson('/api/orders?status=pending')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $adminToken = auth('api')->login($admin);
        $this->withToken($adminToken)
            ->getJson('/api/dashboard')
            ->assertOk()
            ->assertJsonPath('data.total_users', 2)
            ->assertJsonPath('data.total_orders', 1);
        $this->withToken($adminToken)
            ->getJson('/api/users')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonMissingPath('data.0.password');
        $this->withToken($adminToken)
            ->getJson('/api/admin/orders?status=confirmed')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.user.id', $customer->id);
    }

    public function test_product_detail_uses_confirmed_inventory_and_reports_inventory_outage(): void
    {
        $product = $this->makeProduct();
        $inventory = Mockery::mock(InventoryGrpcClient::class);
        $inventory->shouldReceive('getStock')->once()->with($product->id)->andReturn(7);
        $this->app->instance(InventoryGrpcClient::class, $inventory);

        $this->getJson('/api/products/'.$product->id)
            ->assertOk()
            ->assertJsonPath('data.stock', 7);
    }

    public function test_product_detail_never_reports_unavailable_stock_as_current(): void
    {
        $product = $this->makeProduct();
        $inventory = Mockery::mock(InventoryGrpcClient::class);
        $inventory->shouldReceive('getStock')
            ->once()
            ->andThrow(new InventoryUnavailableException('Inventory service is unavailable.'));
        $this->app->instance(InventoryGrpcClient::class, $inventory);

        $this->getJson('/api/products/'.$product->id)
            ->assertStatus(503)
            ->assertJsonPath('code', 'INVENTORY_UNAVAILABLE');
    }

    public function test_order_reserves_once_uses_server_price_and_is_idempotent(): void
    {
        $user = User::factory()->create();
        $product = $this->makeProduct('12.34');
        $inventory = Mockery::mock(InventoryGrpcClient::class);
        $inventory->shouldReceive('reserveStock')
            ->once()
            ->andReturn(new ReservationResult(true, 'reservation-1'));
        $this->app->instance(InventoryGrpcClient::class, $inventory);

        $key = (string) Str::uuid();
        $payload = [
            'items' => [[
                'product_id' => $product->id,
                'quantity' => 2,
                'unit_price' => '0.01',
            ]],
            'total' => '0.02',
        ];
        $token = auth('api')->login($user);

        $this->withToken($token)->withHeader('Idempotency-Key', $key)
            ->postJson('/api/orders', $payload)
            ->assertCreated()
            ->assertJsonPath('data.total', '24.68');

        $this->withToken($token)->withHeader('Idempotency-Key', $key)
            ->postJson('/api/orders', $payload)
            ->assertCreated()
            ->assertJsonPath('data.total', '24.68');

        $this->assertSame(1, Order::count());
    }

    public function test_unknown_reservation_outcome_can_be_retried_with_the_same_idempotency_key(): void
    {
        $user = User::factory()->create();
        $product = $this->makeProduct();
        $key = (string) Str::uuid();
        $items = [['product_id' => $product->id, 'quantity' => 1]];

        $inventory = Mockery::mock(InventoryGrpcClient::class);
        $attempt = 0;
        $inventory->shouldReceive('reserveStock')
            ->twice()
            ->with($items, $key)
            ->andReturnUsing(function () use (&$attempt): ReservationResult {
                if (++$attempt === 1) {
                    throw new InventoryOutcomeUnknownException('deadline');
                }

                return new ReservationResult(true, 'reservation-after-timeout');
            });
        $this->app->instance(InventoryGrpcClient::class, $inventory);
        $token = auth('api')->login($user);

        $this->withToken($token)->withHeader('Idempotency-Key', $key)
            ->postJson('/api/orders', ['items' => $items])
            ->assertStatus(503)
            ->assertJsonPath('code', 'RESERVATION_OUTCOME_UNKNOWN');
        $this->assertSame(0, Order::count());

        $this->withToken($token)->withHeader('Idempotency-Key', $key)
            ->postJson('/api/orders', ['items' => $items])
            ->assertCreated();
        $this->assertSame(1, Order::count());
    }

    public function test_order_rejects_insufficient_stock_and_another_users_order_is_hidden(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        $order = Order::create([
            'user_id' => $otherUser->id,
            'total' => '1.00',
            'status' => 'pending',
        ]);
        $product = $this->makeProduct();

        $inventory = Mockery::mock(InventoryGrpcClient::class);
        $inventory->shouldReceive('reserveStock')
            ->once()
            ->andReturn(new ReservationResult(false, null, 'Insufficient stock'));
        $this->app->instance(InventoryGrpcClient::class, $inventory);

        $token = auth('api')->login($user);
        $this->withToken($token)->getJson('/api/orders/'.$order->id)
            ->assertStatus(403)
            ->assertJsonPath('message', "You don't have access to this order.");
        $this->withToken($token)->withHeader('Idempotency-Key', (string) Str::uuid())
            ->postJson('/api/orders', ['items' => [['product_id' => $product->id, 'quantity' => 1]]])
            ->assertStatus(409)
            ->assertJsonPath('code', 'INSUFFICIENT_STOCK');

        $this->assertSame(1, Order::count());
    }

    public function test_notification_endpoints_are_scoped_to_the_authenticated_user(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        $ownNotification = $user->notifications()->create([
            'id' => (string) Str::uuid(),
            'type' => 'order',
            'data' => ['message' => 'Mine'],
        ]);
        $notification = $otherUser->notifications()->create([
            'id' => (string) Str::uuid(),
            'type' => 'order',
            'data' => ['message' => 'Private'],
        ]);
        $token = auth('api')->login($user);

        $this->withToken($token)->getJson('/api/notifications')
            ->assertOk()
            ->assertJsonCount(1, 'data');
        $this->withToken($token)->patchJson('/api/notifications/read-all')->assertOk();
        $this->withToken($token)->patchJson('/api/notifications/'.$notification->id.'/read')
            ->assertNotFound();
        $this->assertNotNull($ownNotification->fresh()->read_at);
        $this->assertNull($notification->fresh()->read_at);
    }

    public function test_admin_status_changes_are_authorized_and_cancellation_releases_stock(): void
    {
        $customer = User::factory()->create();
        $admin = User::factory()->create();
        $admin->role = 'admin';
        $admin->save();
        $order = Order::create([
            'user_id' => $customer->id,
            'total' => '10.00',
            'status' => 'pending',
            'reservation_id' => 'reservation-cancel',
        ]);

        $inventory = Mockery::mock(InventoryGrpcClient::class);
        $inventory->shouldReceive('releaseStock')
            ->once()
            ->with('reservation-cancel')
            ->andReturn(true);
        $this->app->instance(InventoryGrpcClient::class, $inventory);

        $this->withToken(auth('api')->login($customer))
            ->patchJson('/api/admin/orders/'.$order->id.'/status', ['status' => 'confirmed'])
            ->assertForbidden();

        $adminToken = auth('api')->login($admin);
        $this->withToken($adminToken)
            ->patchJson('/api/admin/orders/'.$order->id.'/status', ['status' => 'confirmed'])
            ->assertOk();
        $this->withToken($adminToken)
            ->patchJson('/api/admin/orders/'.$order->id.'/status', ['status' => 'cancelled'])
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled');

        $this->assertSame(2, $customer->notifications()->count());
    }

    public function test_failed_order_save_releases_stock_and_persists_retryable_compensation(): void
    {
        $user = User::factory()->create();
        $product = $this->makeProduct();
        $operationKey = (string) Str::uuid();

        $inventory = Mockery::mock(InventoryGrpcClient::class);
        $inventory->shouldReceive('reserveStock')
            ->once()
            ->andReturn(new ReservationResult(true, 'reservation-failed-save'));
        $inventory->shouldReceive('releaseStock')
            ->once()
            ->with('reservation-failed-save')
            ->andReturn(false);
        $this->app->instance(InventoryGrpcClient::class, $inventory);

        // Exercise an actual order-persistence failure; notifications now run after commit.
        Order::created(static function (): void {
            throw new RuntimeException('Simulated order persistence failure');
        });

        try {
            app(OrderService::class)->createOrder($user, [
                ['product_id' => $product->id, 'quantity' => 1],
            ], $operationKey);
            $this->fail('The simulated persistence failure should be rethrown.');
        } catch (RuntimeException $exception) {
            $this->assertSame('Simulated order persistence failure', $exception->getMessage());
        }

        $this->assertSame(0, Order::count());
        $this->assertSame('compensation_pending', InventoryOperation::where('idempotency_key', $operationKey)->value('status'));
        $this->assertSame('pending', FailedCompensation::where('reservation_id', 'reservation-failed-save')->value('status'));
    }

    public function test_retry_command_recovers_stale_reservations_and_releases_idempotently(): void
    {
        $user = User::factory()->create();
        $operation = InventoryOperation::create([
            'idempotency_key' => (string) Str::uuid(),
            'user_id' => $user->id,
            'request_hash' => hash('sha256', 'stale'),
            'status' => 'reserved',
            'reservation_id' => 'reservation-stale',
        ]);
        Carbon::setTestNow(now()->subMinutes(6));
        $operation->touch();
        Carbon::setTestNow();

        $inventory = Mockery::mock(InventoryGrpcClient::class);
        $inventory->shouldReceive('releaseStock')
            ->once()
            ->with('reservation-stale')
            ->andReturn(true);
        $this->app->instance(InventoryGrpcClient::class, $inventory);

        $this->assertSame(0, Artisan::call('inventory:retry-compensations'));
        $this->assertSame('compensated', $operation->fresh()->status);
        $this->assertSame(
            'completed',
            FailedCompensation::where('operation_id', $operation->id)->value('status')
        );
    }

    private function makeProduct(string $price = '10.00'): Product
    {
        $category = Category::firstOrCreate(['name' => 'Test category']);

        return Product::create([
            'name' => 'Test product',
            'price' => $price,
            'category_id' => $category->id,
            'is_active' => true,
        ]);
    }

    public function test_order_policy_access_control_cases(): void
    {
        $customerA = User::factory()->create(['role' => 'customer']);
        $customerB = User::factory()->create(['role' => 'customer']);
        $admin = User::factory()->create(['role' => 'admin']);

        $orderA = Order::create([
            'user_id' => $customerA->id,
            'total' => '50.00',
            'status' => 'pending',
        ]);

        $tokenA = auth('api')->login($customerA);
        // 1. Customer A requesting their own order gets 200
        $this->withToken($tokenA)
            ->getJson('/api/orders/'.$orderA->id)
            ->assertOk()
            ->assertJsonPath('data.id', $orderA->id);

        auth('api')->logout();

        // 2. Customer B requesting Customer A's order gets 403 with exact message
        $tokenB = auth('api')->login($customerB);
        $this->withToken($tokenB)
            ->getJson('/api/orders/'.$orderA->id)
            ->assertStatus(403)
            ->assertJsonPath('message', "You don't have access to this order.");

        auth('api')->logout();

        // 3. Admin can view any order
        $tokenAdmin = auth('api')->login($admin);
        $this->withToken($tokenAdmin)
            ->getJson('/api/orders/'.$orderA->id)
            ->assertOk()
            ->assertJsonPath('data.id', $orderA->id);

        auth('api')->logout();

        // 4. Unauthenticated request gets 401
        $this->getJson('/api/orders/'.$orderA->id)
            ->assertStatus(401);
    }

    public function test_rate_limiting_independent_counters_and_no_cross_blocking(): void
    {
        \Illuminate\Support\Facades\RateLimiter::clear('products:127.0.0.1');
        \Illuminate\Support\Facades\RateLimiter::clear('categories:127.0.0.1');
        \Illuminate\Support\Facades\RateLimiter::clear('register:127.0.0.1');

        $this->makeProduct();

        // Perform requests to products
        for ($i = 0; $i < 60; $i++) {
            $this->getJson('/api/products')->assertOk();
        }

        // 61st request to products should be throttled
        $response = $this->getJson('/api/products');
        $response->assertStatus(429)
            ->assertJsonStructure(['message', 'retry_after'])
            ->assertHeader('Retry-After');

        // Products limit reached should NOT block categories
        $this->getJson('/api/categories')->assertOk();

        // Nor register
        $regResponse = $this->postJson('/api/register', []);
        $this->assertNotSame(429, $regResponse->status());
    }

    public function test_login_failed_attempts_trigger_5_minute_lockout_across_entire_api(): void
    {
        $ip = '192.168.1.100';
        \Illuminate\Support\Facades\RateLimiter::clear('login_attempts:'.$ip);
        \Illuminate\Support\Facades\RateLimiter::clear('login_lockout:'.$ip);

        $user = User::factory()->create([
            'email' => 'legit@example.test',
            'password' => bcrypt('password123'),
        ]);

        // 1. Successful login does NOT increment failed login attempts
        $this->withServerVariables(['REMOTE_ADDR' => $ip])
            ->postJson('/api/login', [
                'email' => $user->email,
                'password' => 'password123',
            ])->assertOk();

        $this->assertSame(0, \Illuminate\Support\Facades\RateLimiter::attempts('login_attempts:'.$ip));

        // 2. Perform 4 failed login attempts -> returns 401, not locked out yet
        for ($i = 1; $i <= 4; $i++) {
            $this->withServerVariables(['REMOTE_ADDR' => $ip])
                ->postJson('/api/login', [
                    'email' => $user->email,
                    'password' => 'wrong-pass-'.$i,
                ])->assertStatus(401);
        }

        // Other endpoints still accessible
        $this->withServerVariables(['REMOTE_ADDR' => $ip])
            ->getJson('/api/products')
            ->assertOk();

        // 3. 5th failed attempt activates 5-minute lockout
        $fifthResponse = $this->withServerVariables(['REMOTE_ADDR' => $ip])
            ->postJson('/api/login', [
                'email' => $user->email,
                'password' => 'wrong-pass-5',
            ]);

        $fifthResponse->assertStatus(429)
            ->assertJsonStructure(['message', 'retry_after'])
            ->assertHeader('Retry-After');

        // 4. Entire API is locked out for this IP during lockout
        // Calling login:
        $this->withServerVariables(['REMOTE_ADDR' => $ip])
            ->postJson('/api/login', ['email' => $user->email, 'password' => 'password123'])
            ->assertStatus(429);

        // Calling public products:
        $this->withServerVariables(['REMOTE_ADDR' => $ip])
            ->getJson('/api/products')
            ->assertStatus(429);

        // Calling categories:
        $this->withServerVariables(['REMOTE_ADDR' => $ip])
            ->getJson('/api/categories')
            ->assertStatus(429);

        // Calling register:
        $this->withServerVariables(['REMOTE_ADDR' => $ip])
            ->postJson('/api/register', [])
            ->assertStatus(429);

        // Another IP is NOT affected
        $this->withServerVariables(['REMOTE_ADDR' => '192.168.1.101'])
            ->getJson('/api/products')
            ->assertOk();

        // 5. When 5-minute lockout expires, lockout is removed and failed counter is reset
        Carbon::setTestNow(now()->addMinutes(6));

        $this->withServerVariables(['REMOTE_ADDR' => $ip])
            ->getJson('/api/products')
            ->assertOk();

        $this->withServerVariables(['REMOTE_ADDR' => $ip])
            ->postJson('/api/login', [
                'email' => $user->email,
                'password' => 'password123',
            ])->assertOk();

        Carbon::setTestNow();
    }

    public function test_client_ip_resolution_with_trusted_proxy(): void
    {
        // When client sends X-Forwarded-For through trusted proxy
        $response = $this->withServerVariables([
            'REMOTE_ADDR' => '10.0.0.1', // proxy IP
            'HTTP_X_FORWARDED_FOR' => '203.0.113.195', // real client IP
        ])->getJson('/api/products');

        $response->assertOk();
    }
}
