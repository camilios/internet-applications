<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreCategoryRequest;
use App\Http\Resources\CategoryResource;
use App\Models\Category;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class CategoryController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        return CategoryResource::collection(Category::query()->orderBy('name')->paginate(30));
    }

    public function show(Category $category): CategoryResource
    {
        return new CategoryResource($category);
    }

    public function store(StoreCategoryRequest $request): JsonResponse
    {
        $category = Category::create($request->validated());

        return (new CategoryResource($category))->response()->setStatusCode(201);
    }

    public function update(StoreCategoryRequest $request, Category $category): CategoryResource
    {
        $category->update($request->validated());

        return new CategoryResource($category->refresh());
    }

    public function destroy(Category $category): JsonResponse
    {
        if ($category->products()->withTrashed()->exists()) {
            return response()->json(['message' => 'Categories containing products cannot be deleted.'], 409);
        }

        $category->delete();

        return response()->json(['message' => 'Category deleted.']);
    }
}
