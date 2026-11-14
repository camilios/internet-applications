<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Order confirmation</title></head>
<body>
    <h1>Thank you for your order</h1>
    <p>Your order #{{ $order->id }} has been placed successfully.</p>
    <ul>
        @foreach ($order->items as $item)
            <li>{{ $item->product?->name ?? 'Product' }} &times; {{ $item->quantity }} — {{ $item->subtotal }}</li>
        @endforeach
    </ul>
    <p>Total: {{ $order->total }}</p>
</body>
</html>
