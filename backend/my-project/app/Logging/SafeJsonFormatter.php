<?php

namespace App\Logging;

use Illuminate\Support\Str;
use Monolog\Formatter\JsonFormatter;
use Monolog\LogRecord;
use Throwable;

class SafeJsonFormatter extends JsonFormatter
{
    // Exception messages, SQL bindings, mail bodies and arbitrary library messages may contain credentials.
    private const EVENTS = [
        'HTTP request started', 'HTTP request finished', 'Outbox publication confirmed',
        'Outbox publication deferred', 'Outbox publisher recovering', 'Order email processing',
        'Order email processed', 'Order email deferred', 'Order email worker recovering',
        'Order confirmation accepted by delivery transport',
        'MOCK DELIVERY: order confirmation processed without an external email',
        'Could not determine whether an order reservation was persisted',
        'Could not verify order persistence before compensation',
        'Order creation failed, attempting stock release', 'Stock compensation recorded for retry',
        'Inventory compensation retry failed', 'Order dashboard cache invalidation failed',
        'Order broadcast enqueue failed after commit', 'Order notification failed after commit',
    ];

    public function formatBatch(array $records): string
    {
        return implode('', array_map($this->format(...), $records));
    }

    public function format(LogRecord $record): string
    {
        $row = ['time' => $record->datetime->format('Y-m-d\TH:i:s.uP'), 'level' => $record->level->getName(),
            'message' => in_array($record->message, self::EVENTS, true) ? $record->message : 'Application diagnostic'];
        foreach (['event_id', 'correlation_id'] as $key) {
            $value = $record->context[$key] ?? null;
            if (is_string($value) && Str::isUuid($value)) {
                $row[$key] = $value;
            }
        }
        foreach (['order_id', 'attempt', 'status', 'operation_id', 'compensation_id'] as $key) {
            if (isset($record->context[$key]) && is_int($record->context[$key])) {
                $row[$key] = $record->context[$key];
            }
        }
        foreach (['delivery_mode' => ['external', 'mock'], 'destination' => ['retry', 'dead_letter']] as $key => $values) {
            if (in_array($record->context[$key] ?? null, $values, true)) {
                $row[$key] = $record->context[$key];
            }
        }
        if (($record->context['exception'] ?? null) instanceof Throwable) {
            $row['exception_type'] = $record->context['exception']::class;
        }

        return json_encode($row, JSON_THROW_ON_ERROR)."\n";
    }
}
