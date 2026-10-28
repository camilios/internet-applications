<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use RuntimeException;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $name = env('ADMIN_NAME');
        $email = env('ADMIN_EMAIL');
        $password = env('ADMIN_PASSWORD');

        if (! $name && ! $email && ! $password) {
            return;
        }
        if (! $name || ! $email || ! $password) {
            throw new RuntimeException('Set ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD together to create the local admin.');
        }

        $admin = User::firstOrNew(['email' => $email]);
        if ($admin->exists) {
            if ($admin->role !== 'admin') {
                throw new RuntimeException('The configured admin email already belongs to a non-admin account.');
            }

            return;
        }

        $admin->name = $name;
        $admin->password = $password;
        $admin->role = 'admin';
        $admin->save();
    }
}
