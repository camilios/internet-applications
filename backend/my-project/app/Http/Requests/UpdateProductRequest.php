<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateProductRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'price' => 'sometimes|numeric|min:0.01',
            'image' => 'nullable|image|max:2048',
            'category_id' => 'sometimes|exists:categories,id',
            'is_active' => 'sometimes|boolean',
        ];
    }
}
