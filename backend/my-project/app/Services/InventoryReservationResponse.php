<?php

namespace App\Services;

final class InventoryReservationResponse extends InventoryProtoResponse
{
    protected function decode(string $bytes): array
    {
        return InventoryProtoCodec::decodeReserveStock($bytes);
    }
}
