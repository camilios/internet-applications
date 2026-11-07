<?php

namespace App\Services;

/** Adapter for grpc/grpc's generated-message deserialization contract. */
abstract class InventoryProtoResponse
{
    private array $data = [];

    final public function mergeFromString(string $bytes): void
    {
        $this->data = $this->decode($bytes);
    }

    final public function toArray(): array
    {
        return $this->data;
    }

    abstract protected function decode(string $bytes): array;
}
