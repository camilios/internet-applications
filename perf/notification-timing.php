<?php

// Only the dedicated integration-test schema may be reset by this benchmark.
$password = rtrim(file_get_contents(getenv('DB_PASSWORD_FILE')), "\r\n");
putenv('DB_PASSWORD='.$password);
$_ENV['DB_PASSWORD'] = $_SERVER['DB_PASSWORD'] = $password;
putenv('CACHE_STORE=array');
$_ENV['CACHE_STORE'] = $_SERVER['CACHE_STORE'] = 'array';
require '/var/www/html/vendor/autoload.php';
$app = require '/var/www/html/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$identity = Illuminate\Support\Facades\DB::selectOne('SELECT DATABASE() AS name, CURRENT_USER() AS account');
if ($identity->name !== 'ecommerce_test' || ! str_starts_with($identity->account, 'laravel_test@')) {
    throw new RuntimeException('Refusing to reset a non-test database.');
}
Illuminate\Support\Facades\Artisan::call('migrate:fresh', ['--force' => true]);
$user = App\Models\User::factory()->create();
$category = App\Models\Category::create(['name' => 'Notification timing fixture']);
$product = App\Models\Product::create(['name' => 'Timing fixture', 'price' => '1.00',
    'category_id' => $category->id, 'is_active' => true]);
$levels = [];
$inventory = Mockery::mock(App\Services\InventoryGrpcClient::class);
$inventory->shouldReceive('reserveStock')->times(3)->andReturnUsing(
    fn () => new App\Services\ReservationResult(true, (string) Illuminate\Support\Str::uuid())
);
$app->instance(App\Services\InventoryGrpcClient::class, $inventory);
$notifications = Mockery::mock(App\Services\NotificationService::class);
$notifications->shouldReceive('createOrderNotification')->times(3)->andReturnUsing(function () use (&$levels) {
    $levels[] = Illuminate\Support\Facades\DB::transactionLevel();
    usleep(50000);
});
$app->instance(App\Services\NotificationService::class, $notifications);
$begins = [];
$transactionBodies = [];
Illuminate\Support\Facades\Event::listen(Illuminate\Database\Events\TransactionBeginning::class,
    function () use (&$begins) { $begins[] = hrtime(true); });
Illuminate\Support\Facades\Event::listen(Illuminate\Database\Events\TransactionCommitting::class,
    function () use (&$begins, &$transactionBodies) {
        $transactionBodies[] = (hrtime(true) - array_pop($begins)) / 1e6;
    });
$runs = [];
for ($i = 0; $i < 3; $i++) {
    $start = hrtime(true);
    $before = count($transactionBodies);
    app(App\Services\OrderService::class)->createOrder($user,
        [['product_id' => $product->id, 'quantity' => 1]], (string) Illuminate\Support\Str::uuid());
    if (count($transactionBodies) !== $before + 2) throw new RuntimeException('Unexpected transaction count');
    $runs[] = ['order_call_ms' => (hrtime(true) - $start) / 1e6,
        'order_persistence_transaction_body_ms' => $transactionBodies[$before + 1]];
}
Mockery::close();
echo json_encode(['synthetic_notification_delay_ms' => 50, 'notification_transaction_levels' => $levels,
    'runs' => $runs, 'orders_persisted' => App\Models\Order::count()], JSON_PRETTY_PRINT), PHP_EOL;
