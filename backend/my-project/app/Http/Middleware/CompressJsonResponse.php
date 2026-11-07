<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\AcceptHeader;
use Symfony\Component\HttpFoundation\Response;

class CompressJsonResponse
{
    private const MIN_BYTES = 1024;

    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        // Limit compression to JSON reads; never buffer SSE or other streams.
        if (! $request->is('api/*') || ! $request->isMethod('GET') || ! $response instanceof JsonResponse) {
            return $response;
        }
        $response->setVary('Accept-Encoding', false);
        if ($response->getStatusCode() !== 200 || $response->headers->has('Content-Encoding') ||
            $response->headers->hasCacheControlDirective('no-transform')) {
            return $response;
        }

        $accepted = AcceptHeader::fromString($request->header('Accept-Encoding', ''));
        $wildcard = $accepted->get('*');
        $gzip = $accepted->get('gzip') ?? $wildcard;
        $identity = $accepted->get('identity');
        $identityAllowed = $identity ? $identity->getQuality() > 0 : ($wildcard === null || $wildcard->getQuality() > 0);
        $gzipAllowed = $gzip !== null && $gzip->getQuality() > 0 && function_exists('gzencode');
        if (! $gzipAllowed) {
            return $identityAllowed ? $response : $this->notAcceptable();
        }
        if ($identity !== null && $identity->getQuality() > $gzip->getQuality()) {
            return $response;
        }

        $content = $response->getContent();
        if (strlen($content) < self::MIN_BYTES && $identityAllowed) {
            return $response;
        }
        $compressed = gzencode($content, 6);
        if ($compressed === false) {
            return $identityAllowed ? $response : $this->notAcceptable();
        }
        if (strlen($compressed) >= strlen($content) && $identityAllowed) {
            return $response;
        }
        $response->setContent($compressed);
        $response->headers->set('Content-Encoding', 'gzip');
        $response->headers->set('Content-Length', (string) strlen($compressed));

        return $response;
    }

    private function notAcceptable(): JsonResponse
    {
        return new JsonResponse(['message' => 'No acceptable content encoding is available.'], 406,
            ['Vary' => 'Accept-Encoding']);
    }
}
