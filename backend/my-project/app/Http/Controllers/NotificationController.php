<?php

namespace App\Http\Controllers;

use App\Http\Resources\NotificationResource;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Auth;

class NotificationController extends Controller
{
    public function __construct(private readonly NotificationService $notifications) {}

    public function index(): AnonymousResourceCollection
    {
        return NotificationResource::collection(
            $this->notifications->getUserNotifications(Auth::guard('api')->user())
        );
    }

    public function markAsRead(string $notification): JsonResponse
    {
        $this->notifications->markAsRead($notification, Auth::guard('api')->user());

        return response()->json(['message' => 'Notification marked as read.']);
    }

    public function markAllAsRead(): JsonResponse
    {
        $this->notifications->markAllAsRead(Auth::guard('api')->user());

        return response()->json(['message' => 'Notifications marked as read.']);
    }
}
