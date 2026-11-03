<?php

namespace App\Http\Controllers;

use App\Http\Requests\LoginRequest;
use App\Http\Requests\RegisterRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\AuthService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;

class AuthController extends Controller
{
    public function __construct(private readonly AuthService $auth) {}

    public function register(RegisterRequest $request): JsonResponse
    {
        $data = $request->validated();
        $user = $this->auth->register($data);
        $token = $this->auth->login($data['email'], $data['password']);

        return $this->tokenResponse($token, $user, 201);
    }

    public function login(LoginRequest $request): JsonResponse
    {
        $ip = $request->ip();
        $attemptsKey = 'login_attempts:'.$ip;
        $lockoutKey = 'login_lockout:'.$ip;

        $credentials = $request->safe()->only(['email', 'password']);
        $token = $this->auth->login($credentials['email'], $credentials['password']);

        if (! $token) {
            $attempts = RateLimiter::hit($attemptsKey, 60);

            if ($attempts >= 5) {
                // Activate 5-minute lockout and reset failed attempts counter
                RateLimiter::hit($lockoutKey, 300);
                RateLimiter::clear($attemptsKey);

                $seconds = 300;

                return response()->json([
                    'message' => 'Too many failed login attempts. Your IP has been locked out for 5 minutes.',
                    'retry_after' => $seconds,
                ], 429, [
                    'Retry-After' => (string) $seconds,
                ]);
            }

            return response()->json(['message' => 'Invalid credentials.'], 401);
        }

        RateLimiter::clear($attemptsKey);

        return $this->tokenResponse($token, $this->auth->me());
    }

    public function logout(): JsonResponse
    {
        $this->auth->logout();

        return response()->json(['message' => 'Logged out successfully.']);
    }

    public function me(): UserResource
    {
        return new UserResource($this->auth->me());
    }

    private function tokenResponse(string $token, User $user, int $status = 200): JsonResponse
    {
        return response()->json([
            'access_token' => $token,
            'token_type' => 'bearer',
            'expires_in' => Auth::guard('api')->factory()->getTTL() * 60,
            'user' => (new UserResource($user))->resolve(),
        ], $status);
    }
}
