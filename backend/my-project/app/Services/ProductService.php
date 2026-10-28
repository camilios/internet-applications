<?php

namespace App\Services;

use App\Models\Product;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\Storage;

class ProductService
{
    /**
     * List products with pagination and filters.
     */
    public function list(array $filters): LengthAwarePaginator
    {
        $query = Product::with('category')->where('is_active', true);

        if (!empty($filters['category_id'])) {
            $query->where('category_id', $filters['category_id']);
        }

        if (!empty($filters['search'])) {
            $query->where('name', 'like', '%' . $filters['search'] . '%');
        }

        $perPage = $filters['per_page'] ?? 15;

        return $query->latest()->paginate($perPage);
    }

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

        return Product::create($data);
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

        return $product->fresh('category');
    }

    /**
     * Soft delete a product.
     */
    public function delete(int $id): void
    {
        $product = Product::findOrFail($id);
        $product->delete();
    }
}
