# Task: API rate limiting + order access control (Laravel API)

Project: `backend/my-project` (Laravel, JWT auth via `auth:api`, `admin` middleware alias → `EnsureAdmin`).

## 1. API rate limiting by IP

### Goal

Apply rate limiting to the login endpoint and the rest of the API using the client's IP address as the identifier.

- Use the IP address as the rate-limit key for both authenticated and unauthenticated requests. Do not use `user_id` or JWT identity as the primary rate-limit key.
- Give each API group/endpoint its own independent counter. Reaching the limit for one group must not consume the counter of another group.
- A limit being reached on one ordinary API group must not automatically block the other API groups.
- Return a clear JSON response with HTTP `429 Too Many Requests` and a `Retry-After` header when a limit is exceeded.
- Ensure Laravel resolves the real client IP correctly when the application is behind a trusted reverse proxy or load balancer. Do not trust arbitrary forwarded-IP headers.

### Required limits

Use these initial limits (they can be adjusted after testing real application traffic):

| API group | Limit | Key |
|---|---:|---|
| Login | 5 failed login attempts per minute | `login:{ip}` |
| Register | 10 requests per minute | `register:{ip}` |
| Products | 60 requests per minute | `products:{ip}` |
| Orders | 60 requests per minute | `orders:{ip}` |
| Other API groups | 60 requests per minute initially | A distinct key for each group, e.g. `{group}:{ip}` |

The limits for Register, Products, Orders, and other API groups count requests, regardless of whether the response is successful or unsuccessful. Login is different: **only failed authentication attempts count toward the five-attempt threshold**. A successful login must not increase the failed-attempt counter.

### Login failure lockout

When the same IP address makes 5 failed login attempts within a one-minute window:

1. Block that IP address from using the API for 5 minutes, not merely from calling the login endpoint.
2. During the lockout, API requests from that IP must be rejected with HTTP `429` and a clear JSON message indicating that the IP is temporarily blocked and when it can retry.
3. The lockout must be checked before protected or public API endpoint logic runs, so changing endpoints does not bypass the lockout.
4. After the five-minute lockout expires, remove the lockout and reset the failed-login counter so the IP can try again.
5. A successful login does not count as a failed attempt. Define and test the counter reset behavior explicitly; the required behavior after lockout expiry is a reset.

Important: because the lockout is IP-based, users who share the same public IP (for example, users on the same Wi-Fi or behind the same NAT) can be affected by the same lockout. This trade-off is intentional for this requirement.

### Implementation guidance

Define named limiters in `app/Providers/AppServiceProvider.php` using `Illuminate\Cache\RateLimiting\Limit`, `Illuminate\Http\Request`, and `Illuminate\Support\Facades\RateLimiter`.

Use distinct keys for each API group, for example:

```php
RateLimiter::for('register', fn (Request $request) =>
    Limit::perMinute(10)->by('register:'.$request->ip())
);

RateLimiter::for('products', fn (Request $request) =>
    Limit::perMinute(60)->by('products:'.$request->ip())
);

RateLimiter::for('orders', fn (Request $request) =>
    Limit::perMinute(60)->by('orders:'.$request->ip())
);
```

The examples above illustrate independent request counters. Implement login failed-attempt counting and the five-minute IP-wide API lockout with appropriate application logic; a normal `Limit::perMinute(5)` middleware alone is not sufficient because it counts requests rather than only failed authentication attempts and does not by itself create the required API-wide lockout.

Apply the named middleware to the matching routes/groups in `routes/api.php`. Ensure every API route is covered by the appropriate group limiter, including public routes. Avoid accidentally applying two group limiters to the same route unless that is intentional.

Use a shared cache store suitable for the deployment environment if the application runs on multiple instances, so counters and lockout state are consistent across instances. Do not rely on per-process in-memory state.

### Acceptance criteria

- The first five failed login attempts from one IP within one minute are processed as failed login attempts; the fifth failure activates the five-minute IP-wide API lockout.
- A successful login does not increment the failed-login counter.
- During the lockout, requests to login, register, products, orders, and other API routes from the blocked IP are rejected with HTTP `429`.
- The lockout response is JSON and includes a useful message and `retry_after`; the HTTP response includes `Retry-After`.
- When the five-minute lockout expires, the IP is allowed to use the API again and the failed-login counter is reset.
- Each ordinary API group has its own IP-based counter. For example, requests to Products do not consume the Orders or Register counters.
- Exceeding an ordinary group limit does not, by itself, block other groups.
- Verify correct client IP handling when deployed behind the configured trusted proxy.
- Add tests in `tests/Feature/ApiWorkflowTest.php` for the above behavior.

## 2. Order access control ("You don't have access" for other users' data)

### Important finding

`products` has **no `user_id`**. Products are a public catalog (`GET /products/{product}` is outside `auth:api`; only admins write). There is no "another user's product" to block.

The user-owned resource is **orders**. Apply the access check there.

### Required changes

1. Inspect `OrderController`, `OrderService`, `Order` model, `OrderResource`, and the orders migration. Confirm orders have `user_id`.
2. Create `app/Policies/OrderPolicy.php`:

```php
use Illuminate\Auth\Access\Response;

public function view(User $user, Order $order): Response
{
    return $user->role === 'admin' || $order->user_id === $user->id
        ? Response::allow()
        : Response::deny('You don\\'t have access to this order.');
}
```

3. In `OrderController::show`, call `Gate::authorize('view', $order);` before returning the resource. The policy is auto-discovered, so no registration is needed.
4. Verify `OrderController::index` only returns the authenticated user's orders (admins use `/admin/orders`).
5. In `bootstrap/app.php` → `withExceptions`, make sure a 403 renders as JSON `{ "message": "..." }` for API requests, consistent with the other error responses.

### Acceptance criteria

- Customer A requesting Customer B's `/orders/{id}` gets **403** with `"You don't have access to this order."`
- Customer A requesting their own order gets **200**.
- Admin can view any order.
- Unauthenticated request still gets 401.
- Add tests for all four cases in `tests/Feature/ApiWorkflowTest.php`.

## Constraints

- Don't change the existing response shapes for other endpoints, except for the explicitly required rate-limit and authorization error responses.
- Run `php artisan test` before finishing and report the results.
