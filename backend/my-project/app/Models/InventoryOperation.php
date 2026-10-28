<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InventoryOperation extends Model
{
    protected $fillable = [
        'idempotency_key',
        'user_id',
        'request_hash',
        'status',
        'reservation_id',
        'order_id',
        'last_error',
    ];

    public function order()
    {
        return $this->belongsTo(Order::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
