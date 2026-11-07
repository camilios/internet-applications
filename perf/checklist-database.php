<?php

// Read-only current dataset, schema and query-plan evidence.
require '/var/www/html/vendor/autoload.php';
$app = require '/var/www/html/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$db = Illuminate\Support\Facades\DB::connection();
$db->useWriteConnectionWhenReading();
$result = [];
foreach (['users', 'products', 'orders', 'order_items'] as $table) {
    $result['counts'][$table] = $db->table($table)->count();
}
$userId = $db->table('orders')->selectRaw('user_id, COUNT(*) AS n')->groupBy('user_id')->orderByDesc('n')->value('user_id');
$queries = [
    ['SELECT * FROM products WHERE is_active = 1 ORDER BY created_at DESC LIMIT 15', []],
    ['SELECT * FROM products WHERE is_active = 1 AND category_id = ? ORDER BY created_at DESC LIMIT 15', [1]],
    ['SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 15', [$userId]],
    ['SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC LIMIT 15', ['shipped']],
    ['SELECT * FROM orders ORDER BY created_at DESC LIMIT 15', []],
    ['SELECT COUNT(*) FROM orders WHERE status <> ?', ['cancelled']],
];
foreach ($queries as [$sql, $bindings]) {
    $result['queries'][] = ['sql' => $sql, 'bindings' => $bindings,
        'explain' => $db->select('EXPLAIN '.$sql, $bindings),
        'analyze' => $db->select('EXPLAIN ANALYZE '.$sql, $bindings)];
}
foreach (['products', 'orders'] as $table) {
    $result['indexes'][$table] = $db->select('SHOW INDEX FROM '.$table);
}
echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES).PHP_EOL;
