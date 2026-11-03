<?php

namespace App\Providers;

use App\Services\InventoryGrpcClient;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(InventoryGrpcClient::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        RateLimiter::for('register', function (Request $request) {
            return Limit::perMinute(10)
                ->by('register:'.$request->ip())
                ->response(function (Request $request, array $headers) {
                    $retryAfter = $headers['Retry-After'] ?? 60;

                    return response()->json([
                        'message' => 'Too Many Requests.',
                        'retry_after' => (int) $retryAfter,
                    ], 429, $headers);
                });
        });

        RateLimiter::for('products', function (Request $request) {
            return Limit::perMinute(60)
                ->by('products:'.$request->ip())
                ->response(function (Request $request, array $headers) {
                    $retryAfter = $headers['Retry-After'] ?? 60;

                    return response()->json([
                        'message' => 'Too Many Requests.',
                        'retry_after' => (int) $retryAfter,
                    ], 429, $headers);
                });
        });

        RateLimiter::for('orders', function (Request $request) {
            return Limit::perMinute(60)
                ->by('orders:'.$request->ip())
                ->response(function (Request $request, array $headers) {
                    $retryAfter = $headers['Retry-After'] ?? 60;

                    return response()->json([
                        'message' => 'Too Many Requests.',
                        'retry_after' => (int) $retryAfter,
                    ], 429, $headers);
                });
        });

        RateLimiter::for('categories', function (Request $request) {
            return Limit::perMinute(60)
                ->by('categories:'.$request->ip())
                ->response(function (Request $request, array $headers) {
                    $retryAfter = $headers['Retry-After'] ?? 60;

                    return response()->json([
                        'message' => 'Too Many Requests.',
                        'retry_after' => (int) $retryAfter,
                    ], 429, $headers);
                });
        });

        RateLimiter::for('notifications', function (Request $request) {
            return Limit::perMinute(60)
                ->by('notifications:'.$request->ip())
                ->response(function (Request $request, array $headers) {
                    $retryAfter = $headers['Retry-After'] ?? 60;

                    return response()->json([
                        'message' => 'Too Many Requests.',
                        'retry_after' => (int) $retryAfter,
                    ], 429, $headers);
                });
        });

        RateLimiter::for('general', function (Request $request) {
            return Limit::perMinute(60)
                ->by('general:'.$request->ip())
                ->response(function (Request $request, array $headers) {
                    $retryAfter = $headers['Retry-After'] ?? 60;

                    return response()->json([
                        'message' => 'Too Many Requests.',
                        'retry_after' => (int) $retryAfter,
                    ], 429, $headers);
                });
        });
    }
}

