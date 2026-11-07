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
}
