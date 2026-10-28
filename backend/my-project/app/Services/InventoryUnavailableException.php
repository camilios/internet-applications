<?php

namespace App\Services;

use RuntimeException;

class InventoryUnavailableException extends RuntimeException
{
    public function getCodeName(): string
    {
        return 'INVENTORY_UNAVAILABLE';
    }
}
