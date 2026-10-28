<?php

namespace App\Console\Commands;

use App\Models\FailedCompensation;
use App\Models\InventoryOperation;
use App\Services\InventoryGrpcClient;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class RetryInventoryCompensations extends Command
{
    protected $signature = 'inventory:retry-compensations';

    protected $description = 'Retry durable inventory releases that previously failed.';

    public function handle(InventoryGrpcClient $inventory): int
    {
        $this->recordAbandonedReservations();
        $pending = FailedCompensation::query()->where('status', 'pending')->orderBy('id');

        $pending->chunkById(100, function ($compensations) use ($inventory) {
            foreach ($compensations as $compensation) {
                $this->retry($compensation, $inventory);
            }
        });

        $this->info('Pending inventory compensations processed.');

        return self::SUCCESS;
    }

    private function recordAbandonedReservations(): void
    {
        $cutoff = now()->subMinutes(5);

        InventoryOperation::query()
            ->where('status', 'reserved')
            ->whereNull('order_id')
            ->where('updated_at', '<', $cutoff)
            ->orderBy('id')
            ->chunkById(100, function ($operations) use ($cutoff) {
                foreach ($operations as $operation) {
                    DB::transaction(function () use ($operation, $cutoff) {
                        $locked = InventoryOperation::query()
                            ->whereKey($operation->id)
                            ->lockForUpdate()
                            ->first();

                        if (
                            ! $locked ||
                            $locked->status !== 'reserved' ||
                            $locked->order_id !== null ||
                            $locked->updated_at->greaterThanOrEqualTo($cutoff)
                        ) {
                            return;
                        }

                        $locked->update([
                            'status' => 'compensation_pending',
                            'last_error' => 'Reservation had no persisted order after five minutes.',
                        ]);
                        FailedCompensation::firstOrCreate(
                            ['operation_id' => $locked->id],
                            [
                                'reservation_id' => $locked->reservation_id,
                                'status' => 'pending',
                                'error_message' => 'Reservation had no persisted order after five minutes.',
                                'attempts' => 0,
                            ]
                        );
                    });
                }
            });
    }

    private function retry(FailedCompensation $compensation, InventoryGrpcClient $inventory): void
    {
        $compensation->increment('attempts');
        $compensation->forceFill(['last_attempted_at' => now()])->save();

        try {
            if (! $inventory->releaseStock($compensation->reservation_id)) {
                throw new \RuntimeException('Inventory service did not confirm the release.');
            }

            DB::transaction(function () use ($compensation) {
                $compensation->refresh();
                $compensation->update([
                    'status' => 'completed',
                    'error_message' => null,
                ]);

                InventoryOperation::query()
                    ->whereKey($compensation->operation_id)
                    ->where('status', 'compensation_pending')
                    ->update(['status' => 'compensated', 'last_error' => null]);
            });
        } catch (\Throwable $exception) {
            $compensation->update(['error_message' => $exception->getMessage()]);
            Log::error('Inventory compensation retry failed', [
                'compensation_id' => $compensation->id,
                'reservation_id' => $compensation->reservation_id,
                'error' => $exception->getMessage(),
            ]);
            $this->error("Compensation {$compensation->id} remains pending.");
        }
    }
}
