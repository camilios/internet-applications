<?php

namespace App\Services;

use Illuminate\Database\Connection;

class ReadReplicaRouter
{
    public function route(Connection $connection, bool $recentWrite = false): string
    {
        $connection->useWriteConnectionWhenReading(false);
        if ($recentWrite || $connection->transactionLevel() > 0) {
            $connection->useWriteConnectionWhenReading();
            return 'primary';
        }

        try {
            // A lightweight primary fence also protects anonymous product reads and evicted markers.
            // sticky alone only protects reads within the same request.
            $position = $connection->selectFromWriteConnection('SELECT @@GLOBAL.gtid_executed AS position');
            $gtid = (string) ($position[0]->position ?? '');
            if ($gtid === '') {
                throw new \RuntimeException('A primary GTID fence is required.');
            }
            $statement = $connection->getReadPdo()->prepare('SELECT WAIT_FOR_EXECUTED_GTID_SET(?, 0)');
            $statement->execute([$gtid]);
            if ((string) $statement->fetchColumn() !== '0') {
                throw new \RuntimeException('Replica has not applied the primary fence.');
            }
            return 'replica';
        } catch (\Throwable) {
            // Lag, connection errors, or unverified state must never expose an older representation.
            $connection->useWriteConnectionWhenReading();
            return 'primary';
        }
    }
}
