<?php

namespace Tests\Feature;

use Tests\TestCase;

class ChecklistSecurityTest extends TestCase
{
    public function test_security_headers_cover_public_and_rejected_requests(): void
    {
        foreach (['/up' => 200, '/api/me' => 401, '/api/missing-checklist-route' => 404] as $path => $status) {
            $this->getJson($path)->assertStatus($status)
                ->assertHeader('X-Content-Type-Options', 'nosniff')
                ->assertHeader('X-Frame-Options', 'DENY')
                ->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        }
    }

    public function test_api_errors_are_json_even_without_an_accept_header(): void
    {
        $this->get('/api/me')->assertUnauthorized()
            ->assertHeader('Content-Type', 'application/json')
            ->assertJsonStructure(['message']);

        $this->get('/api/missing-checklist-route')->assertNotFound()
            ->assertHeader('Content-Type', 'application/json')
            ->assertJsonStructure(['message']);

        $this->post('/api/login', [])->assertUnprocessable()
            ->assertHeader('Content-Type', 'application/json')
            ->assertJsonStructure(['message', 'errors']);
    }
}
