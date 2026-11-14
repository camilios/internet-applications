<?php

use App\Models\Category;
use App\Models\NotificationDelivery;
use App\Models\Order;
use App\Models\OutboxEvent;
use App\Models\Product;
use App\Models\User;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

[$app] = require __DIR__.'/reverb-bootstrap.php';

if (($argv[1] ?? null) === 'init') {
    Artisan::call('migrate:fresh', ['--force' => true]);
    $admin = User::factory()->create(['role' => 'admin']);
    $owner = User::factory()->create(['role' => 'customer']);
    $other = User::factory()->create(['role' => 'customer']);
    $category = Category::create(['name' => 'Isolated Reverb QA']);
    $product = Product::create([
        'name' => 'QA product', 'price' => '12.50', 'is_active' => true, 'category_id' => $category->id,
    ]);
    echo json_encode([
        'admin' => auth('api')->login($admin), 'owner' => auth('api')->login($owner),
        'other' => auth('api')->login($other), 'product_id' => $product->id,
    ], JSON_THROW_ON_ERROR);
} else {
    echo json_encode([
        'orders' => Order::count(),
        'outbox' => OutboxEvent::count(),
        'unpublished' => OutboxEvent::whereNull('published_at')->count(),
        'deliveries' => NotificationDelivery::count(),
        'queued_broadcasts' => DB::table('jobs')->where('queue', 'broadcasts')->count(),
    ], JSON_THROW_ON_ERROR);
}
