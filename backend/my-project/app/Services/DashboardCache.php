<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;

class DashboardCache
{
    public static function cacheKey(int $userId, bool $isAdmin): string
    {
        return $isAdmin ? 'dashboard:admin' : "dashboard:user:{$userId}";
    }

    public static function forgetCache(int $userId): void
    {
        Cache::forget(self::cacheKey($userId, false));
        self::forgetAdmin();
    }

    public static function forgetAdmin(): void
    {
        Cache::forget('dashboard:admin');
    }
}
