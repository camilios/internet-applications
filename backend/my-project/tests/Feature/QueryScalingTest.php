<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class QueryScalingTest extends TestCase
{
    use RefreshDatabase;

    private function queryCount(string $url): int
    {
        DB::enableQueryLog();
        DB::flushQueryLog();
        $this->getJson($url)->assertOk();
        $count = count(DB::getQueryLog());
        DB::disableQueryLog();
        return $count;
    }

    public function test_product_and_order_lists_do_not_add_one_query_per_row(): void
    {
        $category = Category::create(['name' => 'Query scaling']);
        $product = Product::create(['name' => 'First', 'price' => '2.00', 'category_id' => $category->id, 'is_active' => true]);
        $smallProducts = $this->queryCount('/api/products?per_page=15');
        for ($i = 0; $i < 20; $i++) {
            Product::create(['name' => 'Product '.$i, 'price' => '2.00', 'category_id' => $category->id, 'is_active' => true]);
        }
        $largeProducts = $this->queryCount('/api/products?per_page=15');
        $this->assertLessThanOrEqual($smallProducts + 1, $largeProducts);

        $user = User::factory()->create();
        $this->withToken(auth('api')->login($user));
        $create = function () use ($user, $product): void {
            $order = Order::create(['user_id' => $user->id, 'total' => '2.00', 'status' => 'pending']);
            $order->items()->create(['product_id' => $product->id, 'quantity' => 1, 'unit_price' => '2.00', 'subtotal' => '2.00']);
        };
        $create();
        $smallOrders = $this->queryCount('/api/orders');
        for ($i = 0; $i < 20; $i++) $create();
        $largeOrders = $this->queryCount('/api/orders');
        $this->assertLessThanOrEqual($smallOrders + 1, $largeOrders);
        fwrite(STDOUT, 'QUERY_SCALING '.json_encode(compact('smallProducts', 'largeProducts', 'smallOrders', 'largeOrders')).PHP_EOL);
    }
}
