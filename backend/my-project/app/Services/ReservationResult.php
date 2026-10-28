<?php

namespace App\Services;

class ReservationResult
{
    public function __construct(
        public readonly bool $success,
        public readonly ?string $reservationId = null,
        public readonly ?string $reason = null,
    ) {}
}
