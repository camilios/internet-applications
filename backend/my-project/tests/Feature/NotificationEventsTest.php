<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class NotificationEventsTest extends TestCase
{
    use RefreshDatabase;

    public function test_event_feed_requires_authentication(): void
    {
        $this->get('/api/notifications/events')->assertUnauthorized()->assertJsonStructure(['message']);
    }

    public function test_reconnecting_event_feed_is_private_and_reflects_changes(): void
    {
        $owner = User::factory()->create(['role' => 'customer']);
        $other = User::factory()->create(['role' => 'customer']);
        $id = $this->notify($owner, 'Own update');
        $this->notify($other, 'Other customer secret');
        $this->withToken(auth('api')->login($owner));
        $before = $this->snapshot();
        $this->assertCount(1, $before['data']);
        $this->assertSame($id, $before['data'][0]['id']);
        $this->assertNull($before['data'][0]['read_at']);
        $this->patchJson('/api/notifications/'.$id.'/read')->assertOk();
        $after = $this->snapshot();
        $this->assertNotNull($after['data'][0]['read_at']);
        $newId = $this->notify($owner, 'New order status update');
        $latest = $this->snapshot();
        $this->assertCount(2, $latest['data']);
        $this->assertContains($newId, array_column($latest['data'], 'id'));
        $this->assertStringNotContainsString('Other customer secret', json_encode($latest));
        fwrite(STDOUT, 'NOTIFICATION_EVENTS_EVIDENCE '.json_encode([
            'authenticated' => true, 'other_customer_hidden' => true,
            'read_status_changed' => true, 'new_notification_visible' => true,
            'reconnect_milliseconds' => 2000,
        ]).PHP_EOL);
    }

    private function snapshot(): array
    {
        $response = $this->get('/api/notifications/events')->assertOk()
            ->assertHeader('Content-Type', 'text/event-stream; charset=UTF-8')
            ->assertHeader('X-Accel-Buffering', 'no');
        $stream = $response->streamedContent();
        $this->assertStringContainsString("retry: 2000\n", $stream);
        $this->assertStringContainsString("event: notifications\n", $stream);
        preg_match('/^data: (.+)$/m', $stream, $matches);
        return json_decode($matches[1], true, flags: JSON_THROW_ON_ERROR);
    }

    private function notify(User $user, string $message): string
    {
        $id = (string) Str::uuid();
        $user->notifications()->create(['id' => $id, 'type' => 'App\\Notifications\\OrderNotification',
            'data' => ['message' => $message]]);
        return $id;
    }
}
