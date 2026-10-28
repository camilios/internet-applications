<?php

namespace App\Http\Controllers;

use App\Http\Requests\LoginRequest;
use App\Http\Requests\RegisterRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\AuthService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

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
        $credentials = $request->safe()->only(['email', 'password']);
        $token = $this->auth->login($credentials['email'], $credentials['password']);

        if (! $token) {
            return response()->json(['message' => 'Invalid credentials.'], 401);
        }

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
