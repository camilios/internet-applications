<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $users = [
            [
                'name' => 'مدير النظام (Admin)',
                'email' => 'admin@example.com',
                'password' => Hash::make('admin123456'),
                'role' => 'admin',
            ],
            [
                'name' => 'أحمد محمد',
                'email' => 'customer@example.com',
                'password' => Hash::make('password123'),
                'role' => 'customer',
            ],
            [
                'name' => 'سارة خالد',
                'email' => 'sarah@example.com',
                'password' => Hash::make('password123'),
                'role' => 'customer',
            ],
            [
                'name' => 'عمر الفاروق',
                'email' => 'omar@example.com',
                'password' => Hash::make('password123'),
                'role' => 'customer',
            ],
        ];

        foreach ($users as $userData) {
            User::updateOrCreate(
                ['email' => $userData['email']],
                $userData
            );
        }
    }
}

