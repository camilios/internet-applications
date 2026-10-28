<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('failed_compensations', function (Blueprint $table) {
            $table->foreignId('operation_id')
                ->nullable()
                ->unique()
                ->constrained('inventory_operations')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('failed_compensations', function (Blueprint $table) {
            $table->dropConstrainedForeignId('operation_id');
        });
    }
};
