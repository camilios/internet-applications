<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreProductRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'price' => 'required|numeric|min:0.01',
            'image' => 'nullable|image|max:2048',
            'category_id' => 'required|exists:categories,id',
            'is_active' => 'sometimes|boolean',
        ];
    }
}
