<?php

namespace Tests\Unit;

use App\Services\ReadReplicaRouter;
use Illuminate\Database\Connection;
use Mockery;
use PHPUnit\Framework\TestCase;

class ReadReplicaRouterTest extends TestCase
{
    protected function tearDown(): void { Mockery::close(); parent::tearDown(); }

    public function test_recent_writes_use_the_primary_without_consulting_replica(): void
    {
        $connection = Mockery::mock(Connection::class);
        $connection->shouldReceive('useWriteConnectionWhenReading')->once()->with(false);
        $connection->shouldReceive('useWriteConnectionWhenReading')->once()->withNoArgs();
        $this->assertSame('primary', (new ReadReplicaRouter)->route($connection, true));
    }

    public function test_only_a_replica_that_applied_the_primary_fence_is_eligible(): void
    {
        foreach ([0 => 'replica', 1 => 'primary'] as $waitResult => $expected) {
            $statement = $this->createMock(\PDOStatement::class);
            $statement->expects($this->once())->method('execute')->with(['source:1-9'])->willReturn(true);
            $statement->method('fetchColumn')->willReturn($waitResult);
            $pdo = $this->createMock(\PDO::class);
            $pdo->method('prepare')->with('SELECT WAIT_FOR_EXECUTED_GTID_SET(?, 0)')->willReturn($statement);
            $connection = Mockery::mock(Connection::class);
            $connection->shouldReceive('useWriteConnectionWhenReading')->with(false)->once();
            $connection->shouldReceive('transactionLevel')->andReturn(0);
            $connection->shouldReceive('selectFromWriteConnection')->andReturn([(object) ['position' => 'source:1-9']]);
            $connection->shouldReceive('getReadPdo')->andReturn($pdo);
            if ($expected === 'primary') $connection->shouldReceive('useWriteConnectionWhenReading')->withNoArgs()->once();
            $this->assertSame($expected, (new ReadReplicaRouter)->route($connection));
        }
    }

    public function test_unavailable_or_unverified_replica_falls_back_to_primary(): void
    {
        $connection = Mockery::mock(Connection::class);
        $connection->shouldReceive('useWriteConnectionWhenReading')->with(false)->once();
        $connection->shouldReceive('transactionLevel')->andReturn(0);
        $connection->shouldReceive('selectFromWriteConnection')->andThrow(new \PDOException('Unavailable'));
        $connection->shouldReceive('useWriteConnectionWhenReading')->withNoArgs()->once();
        $this->assertSame('primary', (new ReadReplicaRouter)->route($connection));
    }
}
