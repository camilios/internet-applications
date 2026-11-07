<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ConditionalGet
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        if ($request->isMethod('GET') && $response instanceof JsonResponse && $response->getStatusCode() === 200) {
            // Compute after rendering: the representation still includes live stock.
            $response->setEtag('"'.sha1($response->getContent()).'"');
            $response->headers->set('Cache-Control', 'private, no-cache');
            $response->isNotModified($request);
        }

        return $response;
    }
}
