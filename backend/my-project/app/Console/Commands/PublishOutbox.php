<?php

namespace App\Console\Commands;

use App\Services\Messaging\MessageBroker;
use App\Services\Messaging\OutboxPublisher;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class PublishOutbox extends Command
{
    protected $signature = 'outbox:publish {--once : Process at most one available event}';

    protected $description = 'Publish committed order outbox events with RabbitMQ confirms';

    public function handle(OutboxPublisher $publisher, MessageBroker $broker): int
    {
        DB::connection()->useWriteConnectionWhenReading();
        do {
            try {
                $worked = $publisher->publishNext();
            } catch (\Throwable $exception) {
                $broker->close();
                Log::error('Outbox publisher recovering', ['error_type' => $exception::class]);
                if ($this->option('once')) {
                    return self::FAILURE;
                }
                sleep(config('rabbitmq.reconnect_delay'));

                continue;
            }
            if (! $this->option('once') && ! $worked) {
                sleep(config('rabbitmq.poll_interval'));
            }
        } while (! $this->option('once'));
        $broker->close();

        return self::SUCCESS;
    }
}
