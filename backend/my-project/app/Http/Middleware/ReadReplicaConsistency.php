<?php

namespace App\Http\Middleware;

use App\Services\ReadReplicaRouter;
use Closure;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

class ReadReplicaConsistency
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! config('database.replica_enabled') || config('database.default') !== 'mysql') {
            return $next($request);
        }

        $connection = DB::connection('mysql');
        app(ReadReplicaRouter::class)->route($connection);
        $user = Auth::guard('api')->user();
        if ($user !== null) {
            try {
                if (Cache::has('recent-write:user:'.$user->id)) {
                    $connection->useWriteConnectionWhenReading();
                }
            } catch (\Throwable) {
                $connection->useWriteConnectionWhenReading();
            }
        }

        $wrote = false;
        DB::listen(function (QueryExecuted $query) use (&$wrote): void {
            if ($query->connectionName === 'mysql' && preg_match('/^\s*(insert|update|delete|replace|alter|create|drop|truncate)\b/i', $query->sql)) {
                $wrote = true;
            }
        });
        $response = $next($request);
        $user = Auth::guard('api')->user();
        if ($wrote && $user !== null) {
            // The GTID fence remains the safety net even if Redis evicts this optimization marker.
            Cache::put('recent-write:user:'.$user->id, true, 5);
        }
        return $response;
    }
}
