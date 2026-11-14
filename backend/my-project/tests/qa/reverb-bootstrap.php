<?php

use Illuminate\Contracts\Http\Kernel;
use Illuminate\Http\Request;

// Test-only harness. Refuse all application/production databases before booting.
$base = dirname(__DIR__, 2);
$database = getenv('REQ4_QA_DATABASE');
if (getenv('APP_ENV') !== 'testing' || getenv('DB_CONNECTION') !== 'sqlite'
    || ! is_string($database) || getenv('DB_DATABASE') !== $database
    || realpath(dirname($database)) !== realpath($base.'/.tools')
    || ! preg_match('/^req4-qa-[a-f0-9-]+\.sqlite$/', basename($database))) {
    throw new RuntimeException('Live Reverb QA requires its isolated generated SQLite database.');
}

require $base.'/vendor/autoload.php';
$app = require $base.'/bootstrap/app.php';
if (PHP_SAPI === 'cli-server') {
    $app->instance('request', Request::capture());
}
$kernel = $app->make(PHP_SAPI === 'cli-server'
    ? Kernel::class
    : Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();
if (config('database.default') !== 'sqlite' || config('database.connections.sqlite.database') !== $database) {
    throw new RuntimeException('Refusing an unexpected configured QA database.');
}

return [$app, $kernel];
