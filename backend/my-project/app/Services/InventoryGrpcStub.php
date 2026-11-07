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
            [InventoryStockResponse::class, 'decode'],
            $metadata,
            $options
        );
    }

    public function ReserveStock(array $argument, array $metadata = [], array $options = []): object
    {
        return $this->_simpleRequest(
            '/inventory.InventoryService/ReserveStock',
            new InventoryProtoMessage($argument, [InventoryProtoCodec::class, 'encodeReserveStock']),
            [InventoryReservationResponse::class, 'decode'],
            $metadata,
            $options
        );
    }

    public function ReleaseStock(array $argument, array $metadata = [], array $options = []): object
    {
        return $this->_simpleRequest(
            '/inventory.InventoryService/ReleaseStock',
            new InventoryProtoMessage($argument, [InventoryProtoCodec::class, 'encodeReleaseStock']),
            [InventoryReleaseResponse::class, 'decode'],
            $metadata,
            $options
        );
    }
}
