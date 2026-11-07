<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\User;
use App\Services\DashboardCache;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    /**
     * Dashboard numbers may be up to this many seconds old.
     * Services that change orders should call DashboardCache::forgetCache() so the
     * affected user sees fresh numbers immediately.
     */
    private const CACHE_TTL_SECONDS = 60;

    public function __invoke(): JsonResponse
    {
        $user = Auth::guard('api')->user();
        $isAdmin = $user->role === 'admin';

        $data = Cache::remember(
            DashboardCache::cacheKey($user->id, $isAdmin),
            self::CACHE_TTL_SECONDS,
            fn () => $this->buildStats($user->id, $isAdmin)
        );

        return response()->json(['data' => $data]);
    }

    private function buildStats(int $userId, bool $isAdmin): array
    {
        // One pass over the orders table instead of three separate queries.
        // created_at is compared as a range, not with whereDate(), so an index can still be used.
        $orders = DB::table('orders');
        if (! $isAdmin) {
            $orders->where('user_id', $userId);
        }

        $orderStats = $orders->selectRaw(
            'COUNT(*) AS total_orders,
             COALESCE(SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END), 0) AS orders_today,
             COALESCE(SUM(CASE WHEN status <> ? THEN total ELSE 0 END), 0) AS total_sales',
            [now()->startOfDay(), 'cancelled']
        )->first();

        return [
            'total_products' => Product::query()->where('is_active', true)->count(),
            'orders_today' => (int) $orderStats->orders_today,
            'total_orders' => (int) $orderStats->total_orders,
            'total_users' => $isAdmin ? User::query()->count() : null,
            // bcmath keeps money as a decimal string, consistent with OrderService.
            'total_sales' => bcadd((string) $orderStats->total_sales, '0', 2),
        ];
    }
}
