<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class PerformanceCachingTest extends TestCase
{
    use RefreshDatabase;

    public function test_category_edits_invalidate_cached_product_details_and_etags(): void
    {
        $category = \App\Models\Category::create(['name' => 'Original category']);
        $product = \App\Models\Product::create(['name' => 'Category cache proof', 'price' => '5.00',
            'category_id' => $category->id, 'is_active' => true]);
        $inventory = \Mockery::mock(\App\Services\InventoryGrpcClient::class);
        $inventory->shouldReceive('getStock')->twice()->with($product->id)->andReturn(1);
        $this->app->instance(\App\Services\InventoryGrpcClient::class, $inventory);
        $first = $this->getJson('/api/products/'.$product->id)->assertOk()
            ->assertJsonPath('data.category.name', 'Original category');
        $this->assertNotNull(app(\App\Services\ProductCache::class)->get($product->id));
        $this->actingAs(User::factory()->create(['role' => 'admin']), 'api')
            ->putJson('/api/categories/'.$category->id, ['name' => 'Updated category'])->assertOk();
        $this->withHeader('If-None-Match', $first->headers->get('ETag'))
            ->getJson('/api/products/'.$product->id)->assertOk()
            ->assertJsonPath('data.category.name', 'Updated category');
    }

    public function test_product_and_dashboard_cache_expiry_matches_the_declared_policy(): void
    {
        $this->freezeTime();
        try {
            $category = \App\Models\Category::create(['name' => 'Expiry proof']);
            $product = \App\Models\Product::create(['name' => 'Expiry proof', 'price' => '5.00',
                'category_id' => $category->id, 'is_active' => true]);
            $cache = app(\App\Services\ProductCache::class);
            $cache->put($product);
            $user = User::factory()->create(['role' => 'customer']);
            $this->actingAs($user, 'api')->getJson('/api/dashboard')->assertOk();
            $this->travel(61)->seconds();
            $this->assertFalse(Cache::has('dashboard:user:'.$user->id));
            $this->assertNotNull($cache->get($product->id));
            $this->travel(240)->seconds();
            $this->assertNull($cache->get($product->id));
        } finally {
            $this->travelBack();
        }
    }

    public function test_dashboard_cache_is_scoped_and_preserves_the_json_contract(): void
    {
        $first = User::factory()->create(['role' => 'customer']);
        $second = User::factory()->create(['role' => 'customer']);
        $admin = User::factory()->create(['role' => 'admin']);
        Order::create(['user_id' => $first->id, 'total' => '10.25', 'status' => 'pending']);
        Order::create(['user_id' => $second->id, 'total' => '20.50', 'status' => 'pending']);
        Order::create(['user_id' => $second->id, 'total' => '4.00', 'status' => 'cancelled']);

        $body = $this->actingAs($first, 'api')->getJson('/api/dashboard')
            ->assertOk()->assertJsonPath('data.total_orders', 1)
            ->assertJsonPath('data.total_users', null)
            ->assertJsonPath('data.total_sales', '10.25')->json('data');
        $this->assertEqualsCanonicalizing([
            'total_products', 'orders_today', 'total_orders', 'total_users', 'total_sales',
        ], array_keys($body));
        $this->assertTrue(Cache::has('dashboard:user:'.$first->id));

        $this->actingAs($second, 'api')->getJson('/api/dashboard')
            ->assertOk()->assertJsonPath('data.total_orders', 2)
            ->assertJsonPath('data.total_sales', '20.50');
        $this->actingAs($admin, 'api')->getJson('/api/dashboard')
            ->assertOk()->assertJsonPath('data.total_orders', 3)
            ->assertJsonPath('data.total_users', 3)
            ->assertJsonPath('data.total_sales', '30.75');
        $this->actingAs($first, 'api')->getJson('/api/dashboard')
            ->assertOk()->assertJsonPath('data.total_orders', 1);
    }

    public function test_order_pagination_is_complete_when_timestamps_are_equal(): void
    {
        $user = User::factory()->create();
        $ids = [];
        $timestamp = now()->startOfSecond();
        for ($i = 0; $i < 43; $i++) {
            $ids[] = Order::create(['user_id' => $user->id, 'total' => '1.00',
                'status' => 'pending', 'created_at' => $timestamp])->id;
        }
        $received = [];
        for ($page = 1; $page <= 3; $page++) {
            $response = $this->actingAs($user, 'api')->getJson('/api/orders?page='.$page)
                ->assertOk()->assertJsonPath('meta.total', 43);
            $received = array_merge($received, array_column($response->json('data'), 'id'));
        }
        $this->assertCount(43, array_unique($received));
        $this->assertSame(array_reverse($ids), $received);
    }


    public function test_product_cache_excludes_stock_and_invalidates_after_writes(): void
    {
        $category = \App\Models\Category::create(['name' => 'Cache category']);
        $product = \App\Models\Product::create(['name' => 'Cache product', 'price' => '10.00',
            'category_id' => $category->id, 'is_active' => true]);
        $cache = app(\App\Services\ProductCache::class);
        $product->load('category')->setAttribute('stock', 99);
        $cache->put($product);
        $this->assertArrayNotHasKey('stock', $cache->get($product->id));
        app(\App\Services\ProductService::class)->update($product->id, ['price' => '12.34']);
        $this->assertNull($cache->get($product->id));

        $inventory = \Mockery::mock(\App\Services\InventoryGrpcClient::class);
        $inventory->shouldReceive('getStock')->twice()->with($product->id)->andReturn(6, 4);
        $this->app->instance(\App\Services\InventoryGrpcClient::class, $inventory);
        $this->getJson('/api/products/'.$product->id)->assertOk()
            ->assertJsonPath('data.price', '12.34')->assertJsonPath('data.stock', 6);
        $this->getJson('/api/products/'.$product->id)->assertOk()->assertJsonPath('data.stock', 4);
        $this->assertArrayNotHasKey('stock', $cache->get($product->id));
        app(\App\Services\ProductService::class)->delete($product->id);
        $this->assertNull($cache->get($product->id));
        $this->getJson('/api/products/'.$product->id)->assertNotFound();
    }


    public function test_etag_revalidates_live_stock_and_keeps_an_empty_304_body(): void
    {
        $category = \App\Models\Category::create(['name' => 'Conditional category']);
        $product = \App\Models\Product::create(['name' => 'Conditional product', 'price' => '1.00',
            'category_id' => $category->id, 'is_active' => true]);
        $inventory = \Mockery::mock(\App\Services\InventoryGrpcClient::class);
        $inventory->shouldReceive('getStock')->times(3)->andReturn(9, 9, 8);
        $this->app->instance(\App\Services\InventoryGrpcClient::class, $inventory);
        $first = $this->getJson('/api/products/'.$product->id)->assertOk();
        $etag = $first->headers->get('ETag');
        $this->assertNotEmpty($etag);
        $this->assertStringContainsString('private', $first->headers->get('Cache-Control'));
        $this->assertStringContainsString('no-cache', $first->headers->get('Cache-Control'));
        $this->withHeader('If-None-Match', $etag)->getJson('/api/products/'.$product->id)
            ->assertStatus(304)->assertContent('');
        $last = $this->withHeader('If-None-Match', $etag)->getJson('/api/products/'.$product->id)
            ->assertOk()->assertJsonPath('data.stock', 8);
        $this->assertNotSame($etag, $last->headers->get('ETag'));
    }


    public function test_product_management_refreshes_the_cached_admin_product_count(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $category = \App\Models\Category::create(['name' => 'Dashboard category']);
        $this->actingAs($admin, 'api')->getJson('/api/dashboard')
            ->assertOk()->assertJsonPath('data.total_products', 0);
        $product = $this->postJson('/api/products', ['name' => 'Dashboard product', 'price' => '2.00',
            'category_id' => $category->id, 'is_active' => true])->assertCreated()->json('data');
        $this->getJson('/api/dashboard')->assertOk()->assertJsonPath('data.total_products', 1);
        $this->deleteJson('/api/products/'.$product['id'])->assertOk();
        $this->getJson('/api/dashboard')->assertOk()->assertJsonPath('data.total_products', 0);
    }

}
