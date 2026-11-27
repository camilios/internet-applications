<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class TraceRequest
{
    public function handle(Request $request, Closure $next): Response
    {
        $incoming = $request->header('X-Correlation-ID');
        $id = is_string($incoming) && Str::isUuid($incoming) ? strtolower($incoming) : (string) Str::uuid();
        $request->attributes->set('correlation_id', $id);
        $observed = config('logging.default') === 'observability';
        if ($observed) {
            Log::info('HTTP request started', ['correlation_id' => $id]);
        }
        $response = $next($request);
        $response->headers->set('X-Correlation-ID', $id);
        if ($observed) {
            Log::info('HTTP request finished', ['correlation_id' => $id, 'status' => $response->getStatusCode()]);
        }

        return $response;
    }
}
