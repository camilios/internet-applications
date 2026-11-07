<?php

// Run in the backend container. Only uniquely owned fixtures and cache keys change.
require '/var/www/html/vendor/autoload.php';
$app = require '/var/www/html/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
Illuminate\Support\Facades\DB::connection()->useWriteConnectionWhenReading();

function checklistHttp(string $method, string $path, ?string $token = null, ?array $body = null, array $headers = []): array
{
    $headers = array_merge(['Accept: application/json', 'Content-Type: application/json'], $headers);
    if ($token) {
        $headers[] = 'Authorization: Bearer '.$token;
    }
    $context = stream_context_create(['http' => ['method' => $method, 'header' => implode("\r\n", $headers),
        'content' => $body === null ? '' : json_encode($body), 'ignore_errors' => true, 'timeout' => 15]]);
    $raw = file_get_contents('http://127.0.0.1:8000/api'.$path, false, $context);
    if ($raw === false) {
        throw new RuntimeException('HTTP transport failed.');
    }
    preg_match('/\s(\d{3})\s/', $http_response_header[0], $status);
    $responseHeaders = [];
    foreach ($http_response_header as $header) {
        if (str_contains($header, ':')) {
            [$name, $value] = explode(':', $header, 2);
            $responseHeaders[strtolower($name)] = trim($value);
        }
    }
    return ['status' => (int) $status[1], 'headers' => $responseHeaders,
        'body_bytes' => strlen($raw), 'body' => $raw === '' ? null : json_decode($raw, true, flags: JSON_THROW_ON_ERROR)];
}

function checklistRequire(bool $condition, string $message): void
{
    if (! $condition) {
        throw new RuntimeException($message);
    }
}

$cache = app(App\Services\ProductCache::class);
$store = Illuminate\Support\Facades\Cache::store('redis')->getStore();
$ownedName = 'Checklist cache '.Illuminate\Support\Str::uuid();
$category = null;
$product = null;
$probe = 'checklist:expiry:'.Illuminate\Support\Str::uuid();
$result = ['scope' => 'Live HTTP, real Redis, real gRPC stock reads, owned catalog fixtures'];
try {
    $admin = App\Models\User::where('role', 'admin')->firstOrFail();
    $token = auth('api')->login($admin);
    $category = App\Models\Category::create(['name' => $ownedName]);
    $product = app(App\Services\ProductService::class)->create(['name' => $ownedName,
        'price' => '1.00', 'category_id' => $category->id, 'is_active' => true]);
    $path = '/products/'.$product->id;
    $first = checklistHttp('GET', $path);
    checklistRequire($first['status'] === 200, 'Initial product read failed.');
    $snapshot = $cache->get($product->id);
    checklistRequire(is_array($snapshot) && ! array_key_exists('stock', $snapshot), 'Stock must not be cached.');
    $key = 'product:'.$product->id.':details';
    $ttl = (int) $store->connection()->ttl($store->getPrefix().$key);
    checklistRequire($ttl > 0 && $ttl <= 300, 'Product TTL must be at most 300 seconds.');
    $result['product_ttl_seconds'] = $ttl;
    $result['cached_stock'] = false;
    $result['initial_etag'] = $first['headers']['etag'];

    $changed = checklistHttp('PUT', '/categories/'.$category->id, $token, ['name' => $ownedName.' updated']);
    checklistRequire($changed['status'] === 200 && $cache->get($product->id) === null, 'Category cache was not invalidated.');
    $fresh = checklistHttp('GET', $path, headers: ['If-None-Match: '.$first['headers']['etag']]);
    checklistRequire($fresh['status'] === 200 && $fresh['body']['data']['category']['name'] === $ownedName.' updated',
        'Category changes must return a new representation.');
    $result['category_update'] = ['status' => $fresh['status'], 'etag_changed' => $fresh['headers']['etag'] !== $first['headers']['etag']];
    $unchanged = checklistHttp('GET', $path, headers: ['If-None-Match: '.$fresh['headers']['etag']]);
    checklistRequire($unchanged['status'] === 304 && $unchanged['body_bytes'] === 0, 'Unchanged content must return bodyless 304.');
    $result['unchanged'] = ['status' => $unchanged['status'], 'body_bytes' => $unchanged['body_bytes']];

    checklistRequire(checklistHttp('PATCH', $path, $token, ['price' => '2.50'])['status'] === 200, 'Price update failed.');
    checklistRequire($cache->get($product->id) === null, 'Product edit must delete the cache key.');
    $price = checklistHttp('GET', $path, headers: ['If-None-Match: '.$fresh['headers']['etag']]);
    checklistRequire($price['status'] === 200 && $price['body']['data']['price'] === '2.50', 'Price must be immediately current.');
    $result['price_update'] = ['status' => $price['status'], 'price' => $price['body']['data']['price']];

    App\Services\DashboardCache::forgetAdmin();
    checklistRequire(checklistHttp('GET', '/dashboard', $token)['status'] === 200, 'Dashboard read failed.');
    $dashboardTtl = (int) $store->connection()->ttl($store->getPrefix().'dashboard:admin');
    checklistRequire($dashboardTtl > 0 && $dashboardTtl <= 60, 'Dashboard TTL must be at most 60 seconds.');
    $result['dashboard_ttl_seconds'] = $dashboardTtl;
    Illuminate\Support\Facades\Cache::put($probe, 'expiry proof', 1);
    usleep(1_200_000);
    checklistRequire(Illuminate\Support\Facades\Cache::get($probe) === null, 'Real Redis expiry failed.');
    $result['real_redis_expiry'] = true;
    checklistRequire(checklistHttp('DELETE', $path, $token)['status'] === 200, 'Product deletion failed.');
    checklistRequire($cache->get($product->id) === null, 'Deletion must invalidate cache.');
    checklistRequire(checklistHttp('GET', $path)['status'] === 404, 'Deleted product must not remain visible.');
    $result['delete_invalidates'] = true;
    $result['passed'] = true;
} finally {
    if ($product) {
        $owned = App\Models\Product::withTrashed()->find($product->id);
        checklistRequire($owned && $owned->name === $ownedName, 'Fixture ownership mismatch.');
        $owned->forceDelete();
        $cache->forget($product->id);
    }
    $category?->delete();
    Illuminate\Support\Facades\Cache::forget($probe);
    App\Services\DashboardCache::forgetAdmin();
}
echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES).PHP_EOL;
