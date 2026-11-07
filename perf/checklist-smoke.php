<?php

require '/var/www/html/vendor/autoload.php';
$app = require '/var/www/html/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$db = Illuminate\Support\Facades\DB::connection();
$db->useWriteConnectionWhenReading();
$admin = App\Models\User::where('role', 'admin')->firstOrFail();
$customer = App\Models\User::where('role', 'customer')->orderBy('id')->firstOrFail();
$adminToken = auth('api')->login($admin);
$customerToken = auth('api')->login($customer);
$call = static function (string $path, ?string $token = null): array {
    $headers = ['Accept: application/json'];
    if ($token) {
        $headers[] = 'Authorization: Bearer '.$token;
    }
    $body = file_get_contents('http://127.0.0.1:8000'.$path, false, stream_context_create([
        'http' => ['header' => implode("\r\n", $headers), 'ignore_errors' => true, 'timeout' => 15],
    ]));
    if ($body === false) {
        throw new RuntimeException('Smoke-check transport failed.');
    }
    preg_match('/\s(\d{3})\s/', $http_response_header[0], $status);
    return ['status' => (int) $status[1], 'headers' => $http_response_header, 'raw' => $body];
};
$require = static function (bool $condition, string $message): void {
    if (! $condition) {
        throw new RuntimeException($message);
    }
};
$result = [];
$require($call('/up')['status'] === 200, 'Health check failed.');
$first = $call('/api/products?category_id=1&per_page=2');
$require($first['status'] === 200, 'Product list failed.');
$first = json_decode($first['raw'], true, flags: JSON_THROW_ON_ERROR);
$next = $first['links']['next'];
parse_str(parse_url($next, PHP_URL_QUERY), $query);
$require(($query['category_id'] ?? null) === '1' && ($query['per_page'] ?? null) === '2', 'Product filter link is incorrect.');
$second = $call(parse_url($next, PHP_URL_PATH).'?'.parse_url($next, PHP_URL_QUERY));
$require($second['status'] === 200, 'Following product pagination failed.');
$second = json_decode($second['raw'], true, flags: JSON_THROW_ON_ERROR);
foreach ($second['data'] as $product) {
    $require($product['category']['id'] === 1, 'Category filter was lost.');
}
$result['product_pagination'] = ['first_count' => count($first['data']), 'next_count' => count($second['data']), 'query' => $query];
$orders = $call('/api/admin/orders?status=shipped', $adminToken);
$require($orders['status'] === 200, 'Admin order list failed.');
$orders = json_decode($orders['raw'], true, flags: JSON_THROW_ON_ERROR);
parse_str(parse_url($orders['links']['next'], PHP_URL_QUERY), $query);
$require(($query['status'] ?? null) === 'shipped', 'Order filter link is incorrect.');
$result['order_pagination_filter'] = $query;
$denied = $call('/api/notifications/events');
$require($denied['status'] === 401, 'Anonymous SSE request was not rejected.');
$events = $call('/api/notifications/events', $customerToken);
$require($events['status'] === 200 && str_contains($events['raw'], "retry: 2000\n") &&
    str_contains($events['raw'], "event: notifications\n"), 'Authenticated event snapshot failed.');
$result['events'] = ['unauthenticated_status' => $denied['status'], 'authenticated_status' => $events['status'],
    'retry_milliseconds' => 2000, 'headers' => $events['headers']];
$missing = $call('/api/checklist-missing-route');
$error = json_decode($missing['raw'], true, flags: JSON_THROW_ON_ERROR);
$require($missing['status'] === 404 && ! isset($error['trace']) && isset($error['message']), 'API error leaks debug information.');
$result['error'] = ['status' => $missing['status'], 'body' => $error];
foreach (['users', 'products', 'orders', 'order_items'] as $table) {
    $result['counts'][$table] = $db->table($table)->count();
}
$result['passed'] = true;
echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES).PHP_EOL;
