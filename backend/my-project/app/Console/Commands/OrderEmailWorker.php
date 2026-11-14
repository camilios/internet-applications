<?php

namespace App\Console\Commands;

use App\Services\Messaging\EmailMessageProcessor;
use App\Services\Messaging\MailDeliveryConfiguration;
use App\Services\Messaging\MailDeliveryConfigurationException;
use App\Services\Messaging\MessageBroker;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class OrderEmailWorker extends Command
{
    protected $signature = 'orders:email-worker {--once : Poll and handle at most one delivery}';

    protected $description = 'Consume RabbitMQ order confirmations independently of broadcasting';

    public function handle(MessageBroker $broker, EmailMessageProcessor $processor, MailDeliveryConfiguration $mailConfiguration): int
    {
        try {
            // Check before connecting to the database or consuming any message.
            $mode = $mailConfiguration->assertDeliverable();
        } catch (MailDeliveryConfigurationException $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        }
        if ($mode === 'mock') {
            $this->warn('MOCK DELIVERY enabled: order confirmations will not send external email.');
            Log::warning('MOCK DELIVERY enabled for order email worker; no external email will be sent');
        }
        DB::connection()->useWriteConnectionWhenReading();
        do {
            try {
                $message = $broker->receive();
                if ($message !== null) {
                    $processor->handle($message);
                } elseif (! $this->option('once')) {
                    sleep(1);
                }
            } catch (MailDeliveryConfigurationException $exception) {
                $broker->close();
                $this->error($exception->getMessage());

                return self::FAILURE;
            } catch (\Throwable $exception) {
                // Closing leaves the delivery unacknowledged; RabbitMQ redelivers on recovery.
                $broker->close();
                Log::error('Order email worker recovering', ['error_type' => $exception::class]);
                if ($this->option('once')) {
                    return self::FAILURE;
                }
                sleep(config('rabbitmq.reconnect_delay'));
            }
        } while (! $this->option('once'));
        $broker->close();

        return self::SUCCESS;
    }
}
