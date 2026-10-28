<?php

namespace App\Services;

use UnexpectedValueException;

class InventoryProtoCodec
{
    public static function encodeGetStock(array $message): string
    {
        return self::encodeVarintField(1, (int) ($message['product_id'] ?? 0));
    }

    public static function decodeGetStock(string $bytes): array
    {
        $decoded = self::decodeFields($bytes, [1 => 'varint', 2 => 'varint', 3 => 'varint', 4 => 'varint', 5 => 'varint']);

        return [
            'product_id' => $decoded[1] ?? 0,
            'total_quantity' => $decoded[2] ?? 0,
            'reserved_quantity' => $decoded[3] ?? 0,
            'available_quantity' => $decoded[4] ?? 0,
            'found' => (bool) ($decoded[5] ?? false),
        ];
    }

    public static function encodeReserveStock(array $message): string
    {
        $bytes = '';
        foreach ($message['items'] ?? [] as $item) {
            $nested = self::encodeVarintField(1, (int) ($item['product_id'] ?? 0));
            $nested .= self::encodeVarintField(2, (int) ($item['quantity'] ?? 0));
            $bytes .= self::encodeBytesField(1, $nested);
        }
        $bytes .= self::encodeStringField(2, (string) ($message['idempotency_key'] ?? ''));

        return $bytes;
    }

    public static function decodeReserveStock(string $bytes): array
    {
        $decoded = self::decodeFields($bytes, [1 => 'varint', 2 => 'string', 3 => 'string', 4 => 'repeated']);
        $items = [];
        foreach ($decoded[4] ?? [] as $itemBytes) {
            $item = self::decodeFields($itemBytes, [1 => 'varint', 2 => 'varint', 3 => 'varint', 4 => 'varint']);
            $items[] = [
                'product_id' => $item[1] ?? 0,
                'requested_quantity' => $item[2] ?? 0,
                'available_quantity' => $item[3] ?? 0,
                'sufficient' => (bool) ($item[4] ?? false),
            ];
        }

        return [
            'success' => (bool) ($decoded[1] ?? false),
            'reservation_id' => $decoded[2] ?? '',
            'failure_reason' => $decoded[3] ?? '',
            'item_results' => $items,
        ];
    }

    public static function encodeReleaseStock(array $message): string
    {
        return self::encodeStringField(1, (string) ($message['reservation_id'] ?? ''));
    }

    public static function decodeReleaseStock(string $bytes): array
    {
        $decoded = self::decodeFields($bytes, [1 => 'varint', 2 => 'string']);

        return [
            'success' => (bool) ($decoded[1] ?? false),
            'message' => $decoded[2] ?? '',
        ];
    }

    private static function encodeVarintField(int $field, int $value): string
    {
        return self::encodeVarint(($field << 3)).self::encodeVarint($value);
    }

    private static function encodeStringField(int $field, string $value): string
    {
        return $value === '' ? '' : self::encodeBytesField($field, $value);
    }

    private static function encodeBytesField(int $field, string $value): string
    {
        return self::encodeVarint(($field << 3) | 2).self::encodeVarint(strlen($value)).$value;
    }

    private static function encodeVarint(int $value): string
    {
        $encoded = '';
        do {
            $byte = $value & 0x7F;
            $value >>= 7;
            $encoded .= chr($value === 0 ? $byte : ($byte | 0x80));
        } while ($value !== 0);

        return $encoded;
    }

    /**
     * @param  array<int, string>  $fields
     */
    private static function decodeFields(string $bytes, array $fields): array
    {
        $result = [];
        $offset = 0;
        $length = strlen($bytes);

        while ($offset < $length) {
            $tag = self::decodeVarint($bytes, $offset);
            $field = $tag >> 3;
            $wireType = $tag & 0x07;

            if (! isset($fields[$field])) {
                self::skipField($bytes, $offset, $wireType);

                continue;
            }

            $value = match ($wireType) {
                0 => self::decodeVarint($bytes, $offset),
                2 => self::decodeBytes($bytes, $offset),
                default => throw new UnexpectedValueException('Unsupported protobuf wire type.'),
            };

            if ($fields[$field] === 'repeated') {
                $result[$field][] = $value;
            } elseif ($fields[$field] === 'string') {
                $result[$field] = $value;
            } else {
                $result[$field] = $value;
            }
        }

        return $result;
    }

    private static function decodeVarint(string $bytes, int &$offset): int
    {
        $value = 0;
        $shift = 0;
        $length = strlen($bytes);

        while ($offset < $length && $shift < 64) {
            $byte = ord($bytes[$offset++]);
            $value |= ($byte & 0x7F) << $shift;
            if (($byte & 0x80) === 0) {
                return $value;
            }
            $shift += 7;
        }

        throw new UnexpectedValueException('Malformed protobuf varint.');
    }

    private static function decodeBytes(string $bytes, int &$offset): string
    {
        $length = self::decodeVarint($bytes, $offset);
        if ($length < 0 || $offset + $length > strlen($bytes)) {
            throw new UnexpectedValueException('Malformed length-delimited protobuf field.');
        }
        $value = substr($bytes, $offset, $length);
        $offset += $length;

        return $value;
    }

    private static function skipField(string $bytes, int &$offset, int $wireType): void
    {
        match ($wireType) {
            0 => self::decodeVarint($bytes, $offset),
            1 => $offset += 8,
            2 => $offset += self::decodeVarint($bytes, $offset),
            5 => $offset += 4,
            default => throw new UnexpectedValueException('Unsupported protobuf wire type.'),
        };

        if ($offset > strlen($bytes)) {
            throw new UnexpectedValueException('Malformed protobuf field.');
        }
    }
}
