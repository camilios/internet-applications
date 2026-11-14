<?php

namespace App\Console\Commands;

use App\Services\Messaging\MessageBroker;
use Illuminate\Console\Command;

class MessagingHealth extends Command
{
    protected $signature = 'messaging:health';

    protected $description = 'Check RabbitMQ connectivity and the durable order messaging topology';

    public function handle(MessageBroker $broker): int
    {
        try {
            $broker->health();
            $this->info('RabbitMQ topology is available.');

            return self::SUCCESS;
        } catch (\Throwable $exception) {
            $this->error('RabbitMQ unavailable: '.$exception::class);

            return self::FAILURE;
        } finally {
            $broker->close();
        }
    }
}
