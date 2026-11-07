<?php

// Read-only wire checks; PHP streams do not automatically decode Content-Encoding.
$expectGzip = in_array('--expect-gzip', $argv, true);
function compressionRequest(array $headers): array
{
    $started = microtime(true);
    $raw = file_get_contents('http://127.0.0.1:8000/api/products?per_page=15', false,
        stream_context_create(['http' => ['header' => implode("\r\n", array_merge(['Accept: application/json'], $headers)),
            'timeout' => 15, 'ignore_errors' => true]]));
    if ($raw === false) {
        throw new RuntimeException('Wire-check transport failed.');
    }
    preg_match('/\s(\d{3})\s/', $http_response_header[0], $status);
    $responseHeaders = [];
    foreach ($http_response_header as $header) {
        if (str_contains($header, ':')) {
            [$name, $value] = explode(':', $header, 2);
            $responseHeaders[strtolower($name)] = trim($value);
        }
    }
    return ['status' => (int) $status[1], 'headers' => $responseHeaders, 'raw' => $raw,
        'elapsed_ms' => (microtime(true) - $started) * 1000];
}
function compressionRequire(bool $condition, string $message): void
{
    if (! $condition) {
        throw new RuntimeException($message);
    }
}
$identity = compressionRequest(['Accept-Encoding: identity']);
$gzip = compressionRequest(['Accept-Encoding: gzip']);
$rejected = compressionRequest(['Accept-Encoding: gzip;q=0, identity;q=1']);
$etag = $gzip['headers']['etag'] ?? '';
$conditional = compressionRequest(['Accept-Encoding: gzip', 'If-None-Match: '.$etag]);
compressionRequire($identity['status'] === 200 && $gzip['status'] === 200, 'Product reads failed.');
compressionRequire(! isset($rejected['headers']['content-encoding']), 'gzip;q=0 must not be compressed.');
compressionRequire($conditional['status'] === 304 && $conditional['raw'] === '', '304 must be bodyless.');
$compressed = ($gzip['headers']['content-encoding'] ?? '') === 'gzip';
$decoded = $compressed ? gzdecode($gzip['raw']) : $gzip['raw'];
compressionRequire(is_string($decoded) && $decoded === $identity['raw'], 'Decoded representation differs from identity.');
$data = json_decode($decoded, true, flags: JSON_THROW_ON_ERROR);
compressionRequire(isset($data['data']) && is_array($data['data']), 'Decoded product schema is invalid.');
if ($expectGzip) {
    compressionRequire($compressed, 'Backend gzip is not active.');
    compressionRequire(str_starts_with($etag, 'W/'), 'Shared gzip/identity validator must be weak.');
    compressionRequire($etag === $identity['headers']['etag'], 'Equivalent representations must share the weak validator.');
    compressionRequire(str_contains(strtolower($conditional['headers']['vary'] ?? ''), 'accept-encoding'), '304 must retain Vary.');
    compressionRequire((int) ($gzip['headers']['content-length'] ?? -1) === strlen($gzip['raw']), 'Compressed Content-Length is incorrect.');
}
echo json_encode([
    'gzip_active' => $compressed, 'identity_body_bytes' => strlen($identity['raw']),
    'gzip_requested_body_bytes' => strlen($gzip['raw']), 'decoded_body_bytes' => strlen($decoded),
    'saved_body_percent' => 100 * (1 - strlen($gzip['raw']) / strlen($identity['raw'])),
    'gzip_magic_hex' => bin2hex(substr($gzip['raw'], 0, 2)), 'etag' => $etag,
    'vary' => $gzip['headers']['vary'] ?? null, 'q_zero_respected' => true,
    'conditional_status' => $conditional['status'], 'conditional_body_bytes' => strlen($conditional['raw']),
    'valid_json' => true, 'same_decoded_representation' => true, 'passed' => true,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES).PHP_EOL;
