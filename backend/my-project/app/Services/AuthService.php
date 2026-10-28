<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\Auth;

class AuthService
{
    /**
     * Register a new user.
     */
    public function register(array $data): User
    {
        $user = User::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => $data['password'], // hashed by model cast
        ]);
        $user->role = 'customer';
        $user->save();

        return $user->refresh();
    }

    /**
     * Attempt to log in a user and return a JWT token.
     */
    public function login(string $email, string $password): ?string
    {
        $token = Auth::guard('api')->attempt([
            'email' => $email,
            'password' => $password,
        ]);

        return $token ?: null;
    }

    /**
     * Log out the authenticated user (invalidate token).
     */
    public function logout(): void
    {
        Auth::guard('api')->logout();
    }

    /**
     * Get the currently authenticated user.
     */
    public function me(): User
    {
        return Auth::guard('api')->user();
    }
}
