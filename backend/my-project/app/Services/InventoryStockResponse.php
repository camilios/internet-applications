<?php

namespace App\Services;

final class InventoryStockResponse extends InventoryProtoResponse
{
    protected function decode(string $bytes): array
    {
        return InventoryProtoCodec::decodeGetStock($bytes);
    }
}
