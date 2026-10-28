<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreProductRequest;
use App\Http\Requests\UpdateProductRequest;
use App\Http\Resources\ProductResource;
use App\Models\Product;
use App\Services\InventoryGrpcClient;
use App\Services\InventoryUnavailableException;
use App\Services\ProductService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class ProductController extends Controller
{
    public function __construct(
        private readonly InventoryGrpcClient $inventoryClient,
        private readonly ProductService $products
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $query = Product::with('category')->where('is_active', true);

        if ($request->filled('category_id')) {
            $query->where('category_id', $request->integer('category_id'));
        }
        if ($request->filled('search')) {
            $query->where('name', 'like', '%'.$request->string('search')->toString().'%');
        }

        $perPage = min(max($request->integer('per_page', 15), 1), 100);

        return ProductResource::collection($query->latest()->paginate($perPage));
    }

    public function show(Product $product): JsonResponse|ProductResource
    {
        if (! $product->is_active && request()->user()?->role !== 'admin') {
            abort(404);
        }

        try {
            $stock = $this->inventoryClient->getStock($product->id);
        } catch (InventoryUnavailableException $exception) {
            return response()->json([
                'message' => 'Current inventory is unavailable. Please try again.',
                'code' => $exception->getCodeName(),
            ], 503);
        }

        $product->setAttribute('stock', $stock);

        return new ProductResource($product->load('category'));
    }

    public function store(StoreProductRequest $request): JsonResponse
    {
        $product = $this->products->create($request->validated());

        return (new ProductResource($product->load('category')))->response()->setStatusCode(201);
    }

    public function update(UpdateProductRequest $request, Product $product): ProductResource
    {
        return new ProductResource($this->products->update($product->id, $request->validated()));
    }

    public function destroy(Product $product): JsonResponse
    {
        $this->products->delete($product->id);

        return response()->json(['message' => 'Product deactivated.']);
    }
}
