<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Symfony\Component\HttpFoundation\Response;

class CheckIpLockout
{
    public function handle(Request $request, Closure $next): Response
    {
        $ip = $request->ip();
        $lockoutKey = 'login_lockout:'.$ip;

        if (RateLimiter::tooManyAttempts($lockoutKey, 1)) {
            $seconds = RateLimiter::availableIn($lockoutKey);

            return response()->json([
                'message' => 'Your IP is temporarily locked out due to multiple failed login attempts. Please try again later.',
                'retry_after' => $seconds,
            ], 429, [
                'Retry-After' => (string) $seconds,
            ]);
        }

        return $next($request);
    }
}

