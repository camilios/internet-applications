<?php

namespace Tests\Feature;

use App\Events\OrderCreated;
use App\Events\OrderStatusUpdated;
use App\Events\ProductPriceUpdated;
use App\Models\Category;
use App\Models\Order;
use App\Models\OutboxEvent;
use App\Models\Product;
use App\Models\User;
use App\Services\DashboardCache;
use App\Services\InventoryGrpcClient;
use App\Services\OrderService;
use App\Services\ProductService;
use App\Services\ReservationResult;
use Illuminate\Broadcasting\BroadcastEvent;
use Illuminate\Foundation\Testing\RefreshDatabaseState;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Mockery;
use RuntimeException;
use Tests\TestCase;

class OrderBroadcastingTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        // Actual commits are required. Only reset the explicitly configured in-memory test database.
        if (config('database.default') !== 'sqlite' || config('database.connections.sqlite.database') !== ':memory:') {
            throw new RuntimeException('Post-commit tests require the isolated in-memory SQLite database.');
        }
        Artisan::call('migrate:fresh', ['--force' => true]);
        $this->beforeApplicationDestroyed(function (): void {
            RefreshDatabaseState::$migrated = false;
        });
        config([
            'jwt.secret' => str_repeat('a', 32),
            'broadcasting.default' => 'reverb',
            'broadcasting.connections.reverb.key' => 'req4-test-key',
            'broadcasting.connections.reverb.secret' => 'req4-test-secret',
            'broadcasting.connections.reverb.app_id' => 'req4-test-app',
        ]);
        // The test changes broadcaster after application boot, so register its channel callbacks on this connection.
        require base_path('routes/channels.php');
        Queue::fake();
    }

    public function test_created_event_runs_after_commit_and_uses_independent_broadcast_queue(): void
    {
        [$user, $product] = $this->fixture();
        Cache::put(DashboardCache::cacheKey($user->id, false), ['stale' => true]);
        Cache::put('dashboard:admin', ['stale' => true]);
        $dispatched = [];
        Event::listen(OrderCreated::class, function (OrderCreated $event) use (&$dispatched, $user): void {
            $this->assertSame(0, DB::transactionLevel());
            $this->assertSame(1, OutboxEvent::where('order_id', $event->orderId)->count());
            $this->assertFalse(Cache::has('dashboard:admin'));
            $this->assertFalse(Cache::has(DashboardCache::cacheKey($user->id, false)));
            $dispatched[] = $event;
        });

        DB::beginTransaction();
        $order = app(OrderService::class)->createOrder($user, [['product_id' => $product->id, 'quantity' => 1]], (string) Str::uuid());
        $this->assertCount(0, $dispatched);
        Queue::assertNothingPushed();
        DB::commit();

        $this->assertCount(1, $dispatched);
        $this->assertSame('private-admin.orders', $dispatched[0]->broadcastOn()[0]->name);
        $this->assertSame(['event_id', 'order_id', 'occurred_at'], array_keys($dispatched[0]->broadcastWith()));
        Queue::assertPushedOn('broadcasts', BroadcastEvent::class, fn ($job) => $job->event->orderId === $order->id && $job->event->connection === 'database');
    }

    public function test_rolled_back_outer_transaction_leaves_no_order_outbox_or_broadcast(): void
    {
        [$user, $product] = $this->fixture();
        $dispatched = 0;
        Event::listen(OrderCreated::class, function () use (&$dispatched): void {
            $dispatched++;
        });
        DB::beginTransaction();
        app(OrderService::class)->createOrder($user, [['product_id' => $product->id, 'quantity' => 1]], (string) Str::uuid());
        DB::rollBack();

        $this->assertDatabaseCount('orders', 0);
        $this->assertDatabaseCount('outbox_events', 0);
        $this->assertSame(0, $dispatched);
        Queue::assertNothingPushed();
    }

    public function test_status_event_is_post_commit_and_targets_only_that_order(): void
    {
        $user = User::factory()->create();
        $order = Order::create(['user_id' => $user->id, 'total' => '10', 'status' => 'pending']);
        $seen = [];
        Event::listen(OrderStatusUpdated::class, function (OrderStatusUpdated $event) use (&$seen): void {
            $this->assertSame(0, DB::transactionLevel());
            $this->assertSame('confirmed', Order::findOrFail($event->orderId)->status);
            $seen[] = $event;
        });

        app(OrderService::class)->updateStatus($order, 'confirmed');

        $this->assertCount(1, $seen);
        $this->assertSame('private-orders.'.$order->id, $seen[0]->broadcastOn()[0]->name);
        $this->assertSame('OrderStatusUpdated', $seen[0]->broadcastAs());
        $this->assertSame('confirmed', $seen[0]->broadcastWith()['status']);
        $this->assertSame(['event_id', 'order_id', 'status', 'occurred_at'], array_keys($seen[0]->broadcastWith()));
        Queue::assertPushedOn('broadcasts', BroadcastEvent::class);
    }

    public function test_broadcast_failure_does_not_undo_or_compensate_committed_order(): void
    {
        [$user, $product] = $this->fixture();
        Event::listen(OrderCreated::class, fn () => throw new RuntimeException('Broadcast enqueue unavailable'));
        $order = app(OrderService::class)->createOrder($user, [['product_id' => $product->id, 'quantity' => 1]], (string) Str::uuid());
        $this->assertDatabaseHas('orders', ['id' => $order->id, 'status' => 'pending']);
        $this->assertDatabaseCount('outbox_events', 1);
        $this->assertDatabaseCount('failed_compensations', 0);
    }

    public function test_private_channels_require_authentication_actual_admin_role_and_order_ownership(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $admin = User::factory()->create(['role' => 'admin']);
        $order = Order::create(['user_id' => $owner->id, 'total' => '10', 'status' => 'pending']);
        $payload = fn ($channel) => ['socket_id' => '123.456', 'channel_name' => 'private-'.$channel];

        $this->postJson('/api/broadcasting/auth', $payload('admin.orders'))->assertUnauthorized();
        $this->postJson('/api/broadcasting/auth', $payload('catalog.products'))->assertUnauthorized();
        $this->actingAs($other, 'api')->postJson('/api/broadcasting/auth', $payload('admin.orders'))->assertForbidden();
        $this->actingAs($other, 'api')->postJson('/api/broadcasting/auth', $payload('catalog.products'))->assertOk();
        $this->actingAs($admin, 'api')->postJson('/api/broadcasting/auth', $payload('admin.orders'))->assertOk()->assertJsonStructure(['auth']);
        $this->actingAs($owner, 'api')->postJson('/api/broadcasting/auth', $payload('orders.'.$order->id))->assertOk();
        $this->actingAs($other, 'api')->postJson('/api/broadcasting/auth', $payload('orders.'.$order->id))->assertForbidden();
        $this->actingAs($admin, 'api')->postJson('/api/broadcasting/auth', $payload('orders.'.$order->id))->assertForbidden();
        $this->actingAs($owner, 'api')->postJson('/api/broadcasting/auth', $payload('orders.99999'))->assertForbidden();
    }

    public function test_bearer_jwt_authorizes_broadcasting_without_a_web_session(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $token = auth('api')->login($admin);
        auth('api')->forgetUser();
        $this->withToken($token)->postJson('/api/broadcasting/auth', ['socket_id' => '123.456', 'channel_name' => 'private-admin.orders'])->assertOk();
    }

    public function test_catalog_price_broadcast_requires_a_committed_visible_price_change(): void
    {
        $category = Category::create(['name' => 'Catalog']);
        $product = Product::create(['name' => 'Item', 'price' => '5.00', 'is_active' => true, 'category_id' => $category->id]);
        $service = app(ProductService::class);
        $service->update($product->id, ['price' => (float) $product->price, 'description' => 'Updated description']);

        DB::beginTransaction();
        $service->update($product->id, ['price' => '25.00']);
        Queue::assertNothingPushed();
        DB::rollBack();

        Queue::assertNothingPushed();
        $service->update($product->id, ['price' => '25.00']);
        Queue::assertPushedOn('broadcasts', BroadcastEvent::class, fn ($job) =>
            $job->event instanceof ProductPriceUpdated
            && $job->event->broadcastOn()[0]->name === 'private-catalog.products'
            && $job->event->broadcastWith() === ['product_id' => $product->id]);
        $this->assertSame('25.00', $product->fresh()->price);

        $service->update($product->id, ['is_active' => false]);
        $service->update($product->id, ['price' => '30.00']);
        Queue::assertPushed(BroadcastEvent::class, 1);
    }

    private function fixture(): array
    {
        $user = User::factory()->create();
        $category = Category::create(['name' => 'Commit testing']);
        $product = Product::create(['name' => 'Item', 'price' => '5.00', 'is_active' => true, 'category_id' => $category->id]);
        $inventory = Mockery::mock(InventoryGrpcClient::class);
        $inventory->shouldReceive('reserveStock')->once()->andReturn(new ReservationResult(true, 'broadcast-reservation'));
        $inventory->shouldNotReceive('releaseStock');
        $this->app->instance(InventoryGrpcClient::class, $inventory);

        return [$user, $product];
    }
}
