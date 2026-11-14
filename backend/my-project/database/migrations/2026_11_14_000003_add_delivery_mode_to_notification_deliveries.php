<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notification_deliveries', function (Blueprint $table) {
            // Null denotes an older delivery whose transport mode was not recorded.
            $table->string('delivery_mode', 16)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('notification_deliveries', fn (Blueprint $table) => $table->dropColumn('delivery_mode'));
    }
};
