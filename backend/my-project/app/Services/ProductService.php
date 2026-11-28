<?php

namespace App\Services;

use App\Events\ProductPriceUpdated;
use App\Models\Product;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
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
        [$product, $priceChanged] = DB::transaction(function () use ($id, $data): array {
            $product = Product::query()->lockForUpdate()->findOrFail($id);
            $wasActive = $product->is_active;

            if (isset($data['image']) && $data['image'] instanceof \Illuminate\Http\UploadedFile) {
                // Delete old image if exists
                if ($product->image) {
                    Storage::disk('public')->delete($product->image);
                }
                $data['image'] = $data['image']->store('products', 'public');
            }

            $product->update($data);

            return [$product, $product->wasChanged('price') && ($wasActive || $product->is_active)];
        });
        $this->cache->forget($id);
        DashboardCache::forgetAdmin();

        if ($priceChanged) {
            DB::afterCommit(function () use ($id): void {
                try {
                    event(new ProductPriceUpdated($id));
                } catch (\Throwable $exception) {
                    Log::error('Product price broadcast enqueue failed after commit', ['error_type' => $exception::class]);
                }
            });
        }

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
