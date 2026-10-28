<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('failed_compensations', function (Blueprint $table) {
            $table->id();
            $table->string('reservation_id');
            $table->string('status')->default('pending'); // pending, completed, failed
            $table->text('error_message')->nullable();
            $table->integer('attempts')->default(0);
            $table->timestamp('last_attempted_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('failed_compensations');
    }
};
