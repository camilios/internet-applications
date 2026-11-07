<?php

namespace App\Services;

final class InventoryReleaseResponse extends InventoryProtoResponse
{
    protected function decode(string $bytes): array
    {
        return InventoryProtoCodec::decodeReleaseStock($bytes);
    }
}
