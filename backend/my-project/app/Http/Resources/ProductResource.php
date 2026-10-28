<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProductResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'description' => $this->description,
            'price' => $this->price,
            'image_url' => $this->image ? asset('storage/' . $this->image) : null,
            'category' => new CategoryResource($this->whenLoaded('category')),
            'is_active' => $this->is_active,
            'stock' => $this->whenHas('stock', $this->stock ?? null),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
