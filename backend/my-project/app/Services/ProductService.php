<?php

namespace App\Services;

use App\Models\Product;
use Illuminate\Support\Facades\Storage;

class ProductService
{
    public function __construct(private readonly ProductCache $cache) {}

    /**
     * Find a single product by ID.
     */
    public function find(int $id): Product
    {
        return Product::with('category')->findOrFail($id);
    }

    /**
     * Create a new product with optional image upload.
     */
    public function create(array $data): Product
    {
        if (isset($data['image']) && $data['image'] instanceof \Illuminate\Http\UploadedFile) {
            $data['image'] = $data['image']->store('products', 'public');
        }

        $product = Product::create($data);
        DashboardCache::forgetAdmin();

        return $product;
    }

    /**
     * Update an existing product.
     */
    public function update(int $id, array $data): Product
    {
        $product = Product::findOrFail($id);

        if (isset($data['image']) && $data['image'] instanceof \Illuminate\Http\UploadedFile) {
            // Delete old image if exists
            if ($product->image) {
                Storage::disk('public')->delete($product->image);
            }
            $data['image'] = $data['image']->store('products', 'public');
        }

        $product->update($data);
        $this->cache->forget($id);
        DashboardCache::forgetAdmin();

        return $product->fresh('category');
    }

    /**
     * Soft delete a product.
     */
    public function delete(int $id): void
    {
        $product = Product::findOrFail($id);
        $product->delete();
        $this->cache->forget($id);
        DashboardCache::forgetAdmin();
    }
}
