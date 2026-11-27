<?php

namespace Tests\Feature;

use App\Logging\SafeJsonFormatter;
use DateTimeImmutable;
use Illuminate\Support\Str;
use Monolog\Level;
use Monolog\LogRecord;
use Tests\TestCase;

class ObservabilityTest extends TestCase
{
    public function test_http_preserves_a_valid_trace_and_replaces_untrusted_input(): void
    {
        $id = (string) Str::uuid();
        $this->get('/up', ['X-Correlation-ID' => $id])->assertOk()->assertHeader('X-Correlation-ID', $id);
        $response = $this->get('/up', ['X-Correlation-ID' => 'private-value'])->assertOk();
        $this->assertTrue(Str::isUuid($response->headers->get('X-Correlation-ID')));
    }

    public function test_even_exception_messages_nested_context_and_extras_cannot_leak(): void
    {
        $secret = 'test-sensitive-password-token';
        $id = (string) Str::uuid();
        $record = new LogRecord(new DateTimeImmutable(), 'test', Level::Error, 'SQL error '.$secret,
            ['correlation_id' => $id, 'password' => $secret, 'exception' => new \RuntimeException($secret),
                'headers' => ['Authorization' => $secret]], ['extra' => $secret]);
        $formatter = new SafeJsonFormatter();
        $line = $formatter->formatBatch([$record]);
        $this->assertStringNotContainsString($secret, $line);
        $logged = json_decode($line, true, flags: JSON_THROW_ON_ERROR);
        $this->assertSame($id, $logged['correlation_id']);
        $this->assertSame(\RuntimeException::class, $logged['exception_type']);
    }
}
