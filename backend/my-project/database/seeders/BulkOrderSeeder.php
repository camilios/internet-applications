<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Generates a large dataset for performance testing (Requirement 3).
 *
 * Run AFTER UserSeeder and ProductSeeder:
 *   BULK_ORDER_COUNT=300000 php artisan db:seed --class=Database\\Seeders\\BulkOrderSeeder
 *
 * Inserts are chunked and use the query builder (no Eloquent events, no model hydration)
 * so that hundreds of thousands of rows can be created in a reasonable time.
 * The seeder refuses to run twice; run `php artisan migrate:fresh --seed` to regenerate.
 */
class BulkOrderSeeder extends Seeder
{
    private const DEFAULT_ORDER_COUNT = 300000;
    private const BULK_CUSTOMERS = 5000;
    private const ORDERS_PER_CHUNK = 1000;
    private const ITEM_INSERT_BATCH = 1000;
    private const HISTORY_SECONDS = 365 * 24 * 3600;

    // Weights are percentages and must add up to 100.
    private const STATUS_WEIGHTS = [
        'pending' => 5,
        'confirmed' => 10,
        'processing' => 10,
        'shipped' => 15,
        'delivered' => 55,
        'cancelled' => 5,
    ];

    public function run(): void
    {
        DB::disableQueryLog();

        if (DB::table('users')->where('email', 'like', 'bulk-customer-%')->exists()) {
            $this->command?->warn('Bulk data already exists. Run migrate:fresh --seed to regenerate.');

            return;
        }

        $products = DB::table('products')
            ->where('is_active', true)
            ->whereNull('deleted_at')
            ->get(['id', 'price'])
            ->all();

        if (count($products) === 0) {
            $this->command?->error('No active products found. Run ProductSeeder first.');

            return;
        }

        $targetOrders = (int) (getenv('BULK_ORDER_COUNT') ?: self::DEFAULT_ORDER_COUNT);
        $customerIds = $this->createCustomers();

        $remaining = $targetOrders;
        $generated = 0;

        while ($remaining > 0) {
            $size = min(self::ORDERS_PER_CHUNK, $remaining);
            $this->insertOrderChunk($size, $customerIds, $products);

            $remaining -= $size;
            $generated += $size;

            if ($generated % 50000 === 0 || $remaining === 0) {
                $this->command?->info("Generated {$generated} / {$targetOrders} orders");
            }
        }

        $this->command?->info('Bulk seeding finished.');
    }

    /**
     * @return array<int, int> customer user IDs
     */
    private function createCustomers(): array
    {
        // Hash once and reuse. Bcrypt per user would make seeding very slow.
        $password = Hash::make('password123');
        $now = now()->format('Y-m-d H:i:s');

        $rows = [];
        for ($i = 1; $i <= self::BULK_CUSTOMERS; $i++) {
            $rows[] = [
                'name' => "Bulk Customer {$i}",
                'email' => "bulk-customer-{$i}@example.test",
                'password' => $password,
                'role' => 'customer',
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        foreach (array_chunk($rows, 1000) as $chunk) {
            DB::table('users')->insert($chunk);
        }

        return DB::table('users')
            ->where('email', 'like', 'bulk-customer-%')
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    private function insertOrderChunk(int $size, array $customerIds, array $products): void
    {
        DB::transaction(function () use ($size, $customerIds, $products) {
            $orderRows = [];
            $itemsByReservation = [];

            for ($i = 0; $i < $size; $i++) {
                $reservationId = (string) Str::uuid();
                $createdAt = now()->subSeconds(random_int(0, self::HISTORY_SECONDS))->format('Y-m-d H:i:s');

                $total = '0.00';
                $items = [];
                $itemCount = random_int(1, 4);

                for ($j = 0; $j < $itemCount; $j++) {
                    $product = $products[array_rand($products)];
                    $quantity = random_int(1, 3);
                    $subtotal = bcmul((string) $product->price, (string) $quantity, 2);
                    $total = bcadd($total, $subtotal, 2);

                    $items[] = [
                        'product_id' => $product->id,
                        'quantity' => $quantity,
                        'unit_price' => $product->price,
                        'subtotal' => $subtotal,
                        'created_at' => $createdAt,
                        'updated_at' => $createdAt,
                    ];
                }

                $orderRows[] = [
                    'user_id' => $customerIds[array_rand($customerIds)],
                    'total' => $total,
                    'status' => $this->pickStatus(),
                    'reservation_id' => $reservationId,
                    'created_at' => $createdAt,
                    'updated_at' => $createdAt,
                ];
                $itemsByReservation[$reservationId] = $items;
            }

            // Remember the highest ID before this chunk. The new orders are exactly the rows above it.
            // This avoids relying on auto-increment values being consecutive for multi-row inserts.
            $maxIdBefore = (int) DB::table('orders')->max('id');

            DB::table('orders')->insert($orderRows);

            $orderIdByReservation = DB::table('orders')
                ->where('id', '>', $maxIdBefore)
                ->pluck('id', 'reservation_id');

            $itemRows = [];
            foreach ($itemsByReservation as $reservationId => $items) {
                $orderId = $orderIdByReservation[$reservationId];
                foreach ($items as $item) {
                    $item['order_id'] = $orderId;
                    $itemRows[] = $item;
                }
            }

            foreach (array_chunk($itemRows, self::ITEM_INSERT_BATCH) as $batch) {
                DB::table('order_items')->insert($batch);
            }
        });
    }

    private function pickStatus(): string
    {
        $roll = random_int(1, 100);
        $cumulative = 0;

        foreach (self::STATUS_WEIGHTS as $status => $weight) {
            $cumulative += $weight;
            if ($roll <= $cumulative) {
                return $status;
            }
        }

        return 'pending';
    }
}
