<?php

namespace App\Services;

class InventoryProtoMessage
{
    public function __construct(
        private readonly array $data,
        private readonly mixed $encoder
    ) {}

    public function serializeToString(): string
    {
        return (string) call_user_func($this->encoder, $this->data);
    }
}
