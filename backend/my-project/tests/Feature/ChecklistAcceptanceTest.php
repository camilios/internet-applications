<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ChecklistAcceptanceTest extends TestCase
{
    use RefreshDatabase;

    public function test_stale_order_instances_cannot_reverse_a_cancellation(): void
    {
        $owner = User::factory()->create(['role' => 'customer']);
        $order = Order::create(['user_id' => $owner->id, 'total' => '5.00', 'status' => 'pending']);
        $stale = Order::findOrFail($order->id);
        $service = app(\App\Services\OrderService::class);
        $service->updateStatus($order, 'cancelled');
        try {
            $service->updateStatus($stale, 'confirmed');
            $this->fail('A cancelled order must not be confirmed using an older model.');
        } catch (\InvalidArgumentException $exception) {
            $this->assertStringContainsString('cancelled', $exception->getMessage());
        }
        $this->assertSame('cancelled', $order->fresh()->status);
    }

    public function test_category_filter_and_pagination_keep_other_products_out(): void
    {
        $category = Category::create(['name' => 'Checklist category']);
        $other = Category::create(['name' => 'Other category']);
        foreach ([$category, $category, $category, $other] as $index => $entry) {
            Product::create(['name' => 'Product '.$index, 'price' => '5.00',
                'category_id' => $entry->id, 'is_active' => true]);
        }
        $first = $this->getJson('/api/products?category_id='.$category->id.'&per_page=2')
            ->assertOk()->assertJsonCount(2, 'data')->assertJsonPath('meta.total', 3);
        $nextQuery = parse_url($first->json('links.next'), PHP_URL_QUERY);
        $second = $this->getJson('/api/products?'.$nextQuery)
            ->assertOk()->assertJsonCount(1, 'data');
        $ids = [];
        foreach (array_merge($first->json('data'), $second->json('data')) as $product) {
            $this->assertSame($category->id, $product['category']['id']);
            $ids[] = $product['id'];
        }
        $this->assertCount(3, array_unique($ids));
    }

    public function test_order_pagination_links_preserve_the_status_filter(): void
    {
        $owner = User::factory()->create(['role' => 'customer']);
        foreach (['pending', 'confirmed'] as $status) {
            for ($index = 0; $index < 20; $index++) {
                Order::create(['user_id' => $owner->id, 'total' => '5.00', 'status' => $status]);
            }
        }
        $this->withToken(auth('api')->login($owner));
        $first = $this->getJson('/api/orders?status=confirmed')->assertOk()->assertJsonPath('meta.total', 20);
        $nextQuery = parse_url($first->json('links.next'), PHP_URL_QUERY);
        $second = $this->getJson('/api/orders?'.$nextQuery)->assertOk()
            ->assertJsonPath('meta.total', 20)->assertJsonCount(5, 'data');
        foreach ($second->json('data') as $order) {
            $this->assertSame('confirmed', $order['status']);
        }
    }

    public function test_capture_owner_stranger_and_administrator_responses(): void
    {
        $owner = User::factory()->create(['role' => 'customer']);
        $stranger = User::factory()->create(['role' => 'customer']);
        $admin = User::factory()->create(['role' => 'admin']);
        $order = Order::create(['user_id' => $owner->id, 'total' => '5.00', 'status' => 'pending']);
        $evidence = [];
        foreach ([$owner, $stranger, $admin] as $actor) {
            app('auth')->forgetGuards();
            $token = auth('api')->login($actor);
            $response = $this->withToken($token)->getJson('/api/orders/'.$order->id);
            $response->assertStatus($actor->id === $stranger->id ? 403 : 200);
            $evidence[] = ['actor' => $actor->id === $stranger->id ? 'other customer' : $actor->role,
                'method' => 'GET', 'path' => '/api/orders/'.$order->id,
                'status' => $response->status(), 'response' => $response->json()];
        }
        app('auth')->forgetGuards();
        $response = $this->withToken(auth('api')->login($stranger))
            ->patchJson('/api/admin/orders/'.$order->id.'/status', ['status' => 'confirmed'])
            ->assertForbidden();
        $evidence[] = ['actor' => 'customer', 'method' => 'PATCH',
            'path' => '/api/admin/orders/'.$order->id.'/status', 'request' => ['status' => 'confirmed'],
            'status' => $response->status(), 'response' => $response->json()];
        fwrite(STDOUT, 'AUTHORIZATION_EVIDENCE '.json_encode($evidence, JSON_UNESCAPED_SLASHES).PHP_EOL);
    }
}
