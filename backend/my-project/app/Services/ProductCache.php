<?php

namespace App\Services;

use App\Models\Product;
use Illuminate\Support\Facades\Cache;

class ProductCache
{
    public function get(int $id): ?array
    {
        $value = Cache::get("product:{$id}:details");

        return is_array($value) ? $value : null;
    }

    public function put(Product $product): void
    {
        $product->loadMissing('category');
        $attributes = $product->toArray();
        // Stock must never enter this cache, even if a caller already loaded it.
        unset($attributes['stock']);
        Cache::put("product:{$product->id}:details", $attributes, 300);
    }

    public function forget(int $id): void
    {
        Cache::forget("product:{$id}:details");
    }

    public function forgetCategory(int $categoryId): void
    {
        Product::withTrashed()->where('category_id', $categoryId)->select('id')
            ->chunkById(100, function ($products): void {
                foreach ($products as $product) {
                    $this->forget($product->id);
                }
            });
    }
}
