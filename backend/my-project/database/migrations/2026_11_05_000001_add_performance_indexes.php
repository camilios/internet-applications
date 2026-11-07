<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            // Default product listing: WHERE is_active = 1 ORDER BY created_at DESC
            $table->index(['is_active', 'created_at'], 'products_active_created_idx');

            // Category listing: WHERE is_active = 1 AND category_id = ? ORDER BY created_at DESC
            $table->index(['is_active', 'category_id', 'created_at'], 'products_active_category_created_idx');
        });

        Schema::table('orders', function (Blueprint $table) {
            // Customer order history: WHERE user_id = ? ORDER BY created_at DESC
            $table->index(['user_id', 'created_at'], 'orders_user_created_idx');

            // Admin status filter: WHERE status = ? ORDER BY created_at DESC
            $table->index(['status', 'created_at'], 'orders_status_created_idx');

            // Admin unfiltered list: ORDER BY created_at DESC
            $table->index('created_at', 'orders_created_idx');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropIndex('orders_created_idx');
            $table->dropIndex('orders_status_created_idx');
            $table->dropIndex('orders_user_created_idx');
        });

        Schema::table('products', function (Blueprint $table) {
            $table->dropIndex('products_active_category_created_idx');
            $table->dropIndex('products_active_created_idx');
        });
    }
};
