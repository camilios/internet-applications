<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FailedCompensation extends Model
{
    protected $table = 'failed_compensations';

    protected $fillable = [
        'reservation_id',
        'operation_id',
        'status',
        'error_message',
        'attempts',
        'last_attempted_at',
    ];

    protected function casts(): array
    {
        return [
            'last_attempted_at' => 'datetime',
            'attempts' => 'integer',
        ];
    }
}
