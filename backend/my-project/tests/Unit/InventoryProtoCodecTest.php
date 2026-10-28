<?php

namespace Tests\Unit;

use App\Services\InventoryProtoCodec;
use App\Services\InventoryProtoMessage;
use PHPUnit\Framework\TestCase;

class InventoryProtoCodecTest extends TestCase
{
    public function test_reserve_request_matches_the_proto_wire_format(): void
    {
        $message = new InventoryProtoMessage([
            'items' => [
                ['product_id' => 300, 'quantity' => 2],
            ],
            'idempotency_key' => 'fixed-key',
        ], [InventoryProtoCodec::class, 'encodeReserveStock']);

        $this->assertSame(
            '0a0508ac021002120966697865642d6b6579',
            bin2hex($message->serializeToString())
        );
    }

    public function test_stock_response_decodes_inventory_service_fields(): void
    {
        $wire = chr(8).chr(9)
            .chr(16).chr(12)
            .chr(24).chr(3)
            .chr(32).chr(9)
            .chr(40).chr(1);

        $this->assertSame([
            'product_id' => 9,
            'total_quantity' => 12,
            'reserved_quantity' => 3,
            'available_quantity' => 9,
            'found' => true,
        ], InventoryProtoCodec::decodeGetStock($wire));
    }

    public function test_reservation_response_decodes_repeated_item_results(): void
    {
        $wire = chr(8).chr(1)
            .chr(18).chr(3).'res'
            .chr(34).chr(8).chr(8).chr(1).chr(16).chr(2).chr(24).chr(5).chr(32).chr(1);

        $this->assertSame([
            'success' => true,
            'reservation_id' => 'res',
            'failure_reason' => '',
            'item_results' => [[
                'product_id' => 1,
                'requested_quantity' => 2,
                'available_quantity' => 5,
                'sufficient' => true,
            ]],
        ], InventoryProtoCodec::decodeReserveStock($wire));
    }
}
