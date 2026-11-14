<?php

namespace App\Services\Messaging;

use Closure;

class IncomingMessage
{
    public function __construct(
        public readonly string $body,
        public readonly int $attempt,
        private readonly Closure $acknowledger,
    ) {}

    public function acknowledge(): void
    {
        ($this->acknowledger)();
    }
}
