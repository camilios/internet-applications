<?php

namespace Tests\Integration;

use App\Models\Category;
use App\Models\InventoryOperation;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use App\Services\InventoryGrpcClient;
use App\Services\NotificationService;
use App\Services\OrderService;
use App\Services\ReservationResult;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Mockery;
use RuntimeException;
use Tests\TestCase;

class NotificationAfterCommitTest extends TestCase
{
    public function test_notification_failure_keeps_the_committed_order_and_does_not_reserve_again(): void
    {
        $identity = DB::selectOne('SELECT DATABASE() AS name, CURRENT_USER() AS account');
        if ($identity->name !== 'ecommerce_test' || ! str_starts_with($identity->account, 'laravel_test@')) {
            throw new RuntimeException('Refusing to reset a non-test database.');
        }
        // Real commits are required here; RefreshDatabase's outer rollback would defer callbacks.
        Artisan::call('migrate:fresh', ['--force' => true]);
        $user = User::factory()->create();
        $category = Category::create(['name' => 'After-commit category']);
        $product = Product::create(['name' => 'After-commit product', 'price' => '3.00',
            'category_id' => $category->id, 'is_active' => true]);
        $inventory = Mockery::mock(InventoryGrpcClient::class);
        $inventory->shouldReceive('reserveStock')->once()->andReturn(new ReservationResult(true, 'after-commit-reservation'));
        $this->app->instance(InventoryGrpcClient::class, $inventory);
        $notifications = Mockery::mock(NotificationService::class);
        $notifications->shouldReceive('createOrderNotification')->once()->andReturnUsing(function (): void {
            $this->assertSame(0, DB::transactionLevel());
            throw new RuntimeException('Notification storage unavailable');
        });
        $this->app->instance(NotificationService::class, $notifications);
        Log::spy();
        $key = (string) Str::uuid();
        $items = [['product_id' => $product->id, 'quantity' => 1]];
        $order = app(OrderService::class)->createOrder($user, $items, $key);
        $replayed = app(OrderService::class)->createOrder($user, $items, $key);
        $this->assertSame($order->id, $replayed->id);
        $this->assertSame(1, Order::count());
        $this->assertSame('completed', InventoryOperation::where('idempotency_key', $key)->value('status'));
        Log::shouldHaveReceived('error')->once()->withArgs(fn ($message, $context) =>
            $message === 'Order notification failed after commit' && $context['order_id'] === $order->id);
    }
}
