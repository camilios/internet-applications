<?php

namespace App\Services\Messaging;

interface MessageBroker
{
    /** Returns only after a positive broker confirm and no mandatory routing return. */
    public function publish(string $body, string $eventId, string $exchange, string $routingKey, int $attempt = 1): void;

    public function receive(): ?IncomingMessage;

    public function health(): void;

    public function close(): void;
}
