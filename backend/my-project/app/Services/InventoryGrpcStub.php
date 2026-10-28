<?php

namespace App\Services;

use Grpc\BaseStub;

class InventoryGrpcStub extends BaseStub
{
    public function GetStock(array $argument, array $metadata = [], array $options = []): object
    {
        return $this->_simpleRequest(
            '/inventory.InventoryService/GetStock',
            new InventoryProtoMessage($argument, [InventoryProtoCodec::class, 'encodeGetStock']),
            [InventoryProtoCodec::class, 'decodeGetStock'],
            $metadata,
            $options
        );
    }

    public function ReserveStock(array $argument, array $metadata = [], array $options = []): object
    {
        return $this->_simpleRequest(
            '/inventory.InventoryService/ReserveStock',
            new InventoryProtoMessage($argument, [InventoryProtoCodec::class, 'encodeReserveStock']),
            [InventoryProtoCodec::class, 'decodeReserveStock'],
            $metadata,
            $options
        );
    }

    public function ReleaseStock(array $argument, array $metadata = [], array $options = []): object
    {
        return $this->_simpleRequest(
            '/inventory.InventoryService/ReleaseStock',
            new InventoryProtoMessage($argument, [InventoryProtoCodec::class, 'encodeReleaseStock']),
            [InventoryProtoCodec::class, 'decodeReleaseStock'],
            $metadata,
            $options
        );
    }
}
