<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class HttpCompressionTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Route::get('/api/compression-fixture', fn () => response()->json(['data' => str_repeat('catalog ', 1000)],
            200, ['Vary' => 'Origin']))->middleware('conditional.get');
        Route::get('/api/compression-small', fn () => response()->json(['data' => 'small']));
        Route::get('/api/compression-events', fn () => response()->stream(static function (): void {
            echo str_repeat("event: update\ndata: test\n\n", 200);
        }, 200, ['Content-Type' => 'text/event-stream']));
    }

    public function test_gzip_decodes_to_the_same_json_and_preserves_vary(): void
    {
        $identity = $this->withHeader('Accept-Encoding', 'identity')->get('/api/compression-fixture')->assertOk();
        $gzip = $this->withHeader('Accept-Encoding', 'gzip')->get('/api/compression-fixture')
            ->assertOk()->assertHeader('Content-Encoding', 'gzip');
        $this->assertSame($identity->getContent(), gzdecode($gzip->getContent()));
        $this->assertSame((string) strlen($gzip->getContent()), $gzip->headers->get('Content-Length'));
        $this->assertLessThan(strlen($identity->getContent()), strlen($gzip->getContent()));
        $this->assertSame($identity->headers->get('ETag'), $gzip->headers->get('ETag'));
        $this->assertStringStartsWith('W/', $gzip->headers->get('ETag'));
        $this->assertContains('Origin', $gzip->baseResponse->getVary());
        $this->assertContains('Accept-Encoding', $gzip->baseResponse->getVary());
    }

    public function test_conditional_gzip_read_keeps_304_bodyless_and_varied(): void
    {
        $first = $this->withHeader('Accept-Encoding', 'gzip')->get('/api/compression-fixture')->assertOk();
        $response = $this->withHeader('If-None-Match', $first->headers->get('ETag'))
            ->get('/api/compression-fixture')->assertStatus(304)->assertContent('');
        $response->assertHeaderMissing('Content-Encoding');
        $this->assertContains('Accept-Encoding', $response->baseResponse->getVary());
    }

    public function test_zero_quality_and_explicit_identity_preference_are_respected(): void
    {
        foreach (['gzip;q=0, *;q=1', 'gzip;q=0.2, identity;q=1', 'br'] as $header) {
            $this->withHeader('Accept-Encoding', $header)->get('/api/compression-fixture')
                ->assertOk()->assertHeaderMissing('Content-Encoding')->assertJsonStructure(['data']);
        }
    }

    public function test_small_json_and_event_streams_are_not_buffered_or_compressed(): void
    {
        $this->withHeader('Accept-Encoding', 'gzip')->get('/api/compression-small')
            ->assertOk()->assertHeaderMissing('Content-Encoding')->assertJsonPath('data', 'small');
        $stream = $this->get('/api/compression-events')->assertOk()->assertHeaderMissing('Content-Encoding');
        $this->assertStringContainsString('event: update', $stream->streamedContent());
    }

    public function test_gzip_is_used_for_small_json_when_identity_is_forbidden(): void
    {
        $response = $this->withHeader('Accept-Encoding', 'gzip, identity;q=0')->get('/api/compression-small')
            ->assertOk()->assertHeader('Content-Encoding', 'gzip');
        $this->assertSame(['data' => 'small'], json_decode(gzdecode($response->getContent()), true));
    }

    public function test_unacceptable_encodings_return_a_consistent_406_error(): void
    {
        $this->withHeader('Accept-Encoding', 'gzip;q=0, identity;q=0')->get('/api/compression-fixture')
            ->assertStatus(406)->assertJsonStructure(['message'])->assertHeader('Vary', 'Accept-Encoding');
    }
}
