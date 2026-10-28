<?php

namespace App\Services;

class InventoryOutcomeUnknownException extends InventoryUnavailableException
{
    public function getCodeName(): string
    {
        return 'RESERVATION_OUTCOME_UNKNOWN';
    }
}
