<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $this->call([
            UserSeeder::class,
            CategorySeeder::class,
            ProductSeeder::class,
            OrderSeeder::class,
        ]);

        // Optional custom admin from environment variables
        $name = env('ADMIN_NAME');
        $email = env('ADMIN_EMAIL');
        $password = env('ADMIN_PASSWORD');

        if ($name && $email && $password) {
            $admin = User::firstOrNew(['email' => $email]);
            $admin->name = $name;
            $admin->password = $password;
            $admin->role = 'admin';
            $admin->save();
        }
    }
}
