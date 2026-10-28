<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

class DashboardController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $user = Auth::guard('api')->user();
        $orders = Order::query();

        if ($user->role !== 'admin') {
            $orders->where('user_id', $user->id);
        }

        return response()->json([
            'data' => [
                'total_products' => Product::query()->where('is_active', true)->count(),
                'orders_today' => (clone $orders)->whereDate('created_at', today())->count(),
                'total_orders' => (clone $orders)->count(),
                'total_users' => $user->role === 'admin' ? User::query()->count() : null,
                'total_sales' => number_format(
                    (float) (clone $orders)->where('status', '!=', 'cancelled')->sum('total'),
                    2,
                    '.',
                    ''
                ),
            ],
        ]);
    }
}
