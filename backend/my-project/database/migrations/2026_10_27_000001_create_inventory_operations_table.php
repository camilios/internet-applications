<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inventory_operations', function (Blueprint $table) {
            $table->id();
            $table->string('idempotency_key')->unique();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->char('request_hash', 64);
            $table->string('status')->default('pending');
            $table->string('reservation_id')->nullable()->index();
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->text('last_error')->nullable();
            $table->timestamps();

            $table->index(['status', 'updated_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_operations');
    }
};
