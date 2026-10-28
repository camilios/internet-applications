<?php

namespace Database\Seeders;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class OrderSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $customer1 = User::where('email', 'customer@example.com')->first();
        $customer2 = User::where('email', 'sarah@example.com')->first();

        if (! $customer1 || ! $customer2) {
            return;
        }

        $sampleOrders = [
            [
                'user_id' => $customer1->id,
                'status' => 'delivered',
                'reservation_id' => (string) Str::uuid(),
                'items' => [
                    ['product_id' => 1, 'quantity' => 1, 'unit_price' => 1199.99],
                    ['product_id' => 9, 'quantity' => 1, 'unit_price' => 249.00],
                ],
            ],
            [
                'user_id' => $customer1->id,
                'status' => 'shipped',
                'reservation_id' => (string) Str::uuid(),
                'items' => [
                    ['product_id' => 7, 'quantity' => 1, 'unit_price' => 399.00],
                    ['product_id' => 11, 'quantity' => 2, 'unit_price' => 129.99],
                ],
            ],
            [
                'user_id' => $customer2->id,
                'status' => 'confirmed',
                'reservation_id' => (string) Str::uuid(),
                'items' => [
                    ['product_id' => 4, 'quantity' => 1, 'unit_price' => 2499.00],
                ],
            ],
            [
                'user_id' => $customer2->id,
                'status' => 'pending',
                'reservation_id' => (string) Str::uuid(),
                'items' => [
                    ['product_id' => 12, 'quantity' => 1, 'unit_price' => 599.00],
                    ['product_id' => 15, 'quantity' => 1, 'unit_price' => 299.00],
                ],
            ],
        ];

        foreach ($sampleOrders as $orderData) {
            $items = $orderData['items'];
            unset($orderData['items']);

            $total = 0;
            foreach ($items as $item) {
                $total += $item['quantity'] * $item['unit_price'];
            }
            $orderData['total'] = $total;

            $order = Order::create($orderData);

            foreach ($items as $item) {
                OrderItem::create([
                    'order_id' => $order->id,
                    'product_id' => $item['product_id'],
                    'quantity' => $item['quantity'],
                    'unit_price' => $item['unit_price'],
                    'subtotal' => $item['quantity'] * $item['unit_price'],
                ]);
            }
        }
    }
}

