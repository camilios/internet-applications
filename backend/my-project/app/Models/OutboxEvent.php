<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OutboxEvent extends Model
{
    protected $primaryKey = 'event_id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['event_id', 'order_id', 'event_type', 'payload', 'attempts', 'available_at', 'published_at', 'last_error'];

    protected function casts(): array
    {
        return ['order_id' => 'integer', 'payload' => 'array', 'attempts' => 'integer', 'available_at' => 'datetime', 'published_at' => 'datetime'];
    }
}
