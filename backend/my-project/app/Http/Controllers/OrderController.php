<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreOrderRequest;
use App\Http\Requests\UpdateOrderStatusRequest;
use App\Http\Resources\OrderResource;
use App\Models\Order;
use App\Services\InsufficientStockException;
use App\Services\InventoryOutcomeUnknownException;
use App\Services\InventoryUnavailableException;
use App\Services\OrderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

class OrderController extends Controller
{
    public function __construct(private readonly OrderService $orders) {}

    public function store(StoreOrderRequest $request): JsonResponse
    {
        try {
            $order = $this->orders->createOrder(
                Auth::guard('api')->user(),
                $request->validated('items'),
                $request->validated('idempotency_key')
            );
        } catch (InsufficientStockException $exception) {
            return response()->json(['message' => $exception->getMessage(), 'code' => 'INSUFFICIENT_STOCK'], 409);
        } catch (InventoryOutcomeUnknownException $exception) {
            return response()->json([
                'message' => 'The reservation result is not yet known. Retry with the same Idempotency-Key.',
                'code' => 'RESERVATION_OUTCOME_UNKNOWN',
            ], 503);
        } catch (InventoryUnavailableException $exception) {
            return response()->json(['message' => 'Inventory service is unavailable. Please retry.', 'code' => $exception->getCodeName()], 503);
        } catch (\InvalidArgumentException $exception) {
            throw ValidationException::withMessages(['items' => [$exception->getMessage()]]);
        }

        return (new OrderResource($order))->response()->setStatusCode(201);
    }

    public function index(Request $request): AnonymousResourceCollection
    {
        $filters = $request->validate([
            'status' => ['nullable', 'in:pending,confirmed,processing,shipped,delivered,cancelled'],
        ]);

        return OrderResource::collection(
            $this->orders->getUserOrders(Auth::guard('api')->user(), $filters['status'] ?? null)
        );
    }

    public function show(Order $order): OrderResource
    {
        $user = Auth::guard('api')->user();
        abort_unless($user->role === 'admin' || $order->user_id === $user->id, 404);

        $relations = ['items.product'];
        if ($user->role === 'admin') {
            $relations[] = 'user';
        }

        return new OrderResource($order->load($relations));
    }

    public function adminIndex(Request $request): AnonymousResourceCollection
    {
        $filters = $request->validate([
            'status' => ['nullable', 'in:pending,confirmed,processing,shipped,delivered,cancelled'],
        ]);

        return OrderResource::collection($this->orders->getAllOrders($filters['status'] ?? null));
    }

    public function updateStatus(UpdateOrderStatusRequest $request, Order $order): OrderResource|JsonResponse
    {
        try {
            return new OrderResource($this->orders->updateStatus($order, $request->validated('status')));
        } catch (\InvalidArgumentException $exception) {
            return response()->json(['message' => $exception->getMessage()], 409);
        } catch (InventoryUnavailableException $exception) {
            return response()->json([
                'message' => 'Inventory release could not be confirmed. Retry the status update.',
                'code' => $exception->getCodeName(),
            ], 503);
        }
    }
}
