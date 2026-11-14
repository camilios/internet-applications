<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class NotificationDelivery extends Model
{
    protected $primaryKey = 'event_id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['event_id', 'order_id', 'delivered_at', 'delivery_mode'];

    protected function casts(): array
    {
        return ['order_id' => 'integer', 'delivered_at' => 'datetime'];
    }
}
