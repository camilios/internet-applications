<?php

$required = [
    'RUN_MYSQL_INTEGRATION_TESTS' => 'true',
    'DB_CONNECTION' => 'mysql',
    'DB_HOST' => 'mysql-integration',
    'DB_PORT' => '3306',
    'DB_DATABASE' => 'ecommerce_test',
    'DB_USERNAME' => 'laravel_test',
    'DB_URL' => '',
    'INVENTORY_TEST_DB_HOST' => 'inventory-mysql-integration',
    'INVENTORY_TEST_DB_PORT' => '3306',
    'INVENTORY_TEST_DB_NAME' => 'inventory_test',
    'INVENTORY_TEST_DB_USER' => 'inventory_test_user',
    'INVENTORY_GRPC_HOST' => 'inventory-service-integration:50051',
];

foreach ($required as $name => $expected) {
    if (getenv($name) !== $expected) {
        throw new RuntimeException(
            "MySQL integration tests require {$name}={$expected}; refusing to run."
        );
    }
}

if (! extension_loaded('pdo_mysql') || ! extension_loaded('grpc')) {
    throw new RuntimeException(
        'MySQL integration tests require the pdo_mysql and grpc PHP extensions.'
    );
}

$readPassword = static function (string $passwordName, string $fileName): string {
    $password = getenv($passwordName);
    if ($password !== false) {
        return $password;
    }

    $file = getenv($fileName);
    if ($file === false || ! is_file($file)) {
        throw new RuntimeException("MySQL integration tests require {$passwordName} or {$fileName}.");
    }

    return rtrim((string) file_get_contents($file), "\r\n");
};

$verifyDatabase = static function (
    string $host,
    string $port,
    string $database,
    string $user,
    string $password,
): void {
    $pdo = new PDO(
        "mysql:host={$host};port={$port};dbname={$database};charset=utf8mb4",
        $user,
        $password,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
    $identity = $pdo->query(
        'SELECT DATABASE() AS database_name, CURRENT_USER() AS database_user'
    )->fetch(PDO::FETCH_ASSOC);
    $pdo = null;

    if (
        ($identity['database_name'] ?? null) !== $database ||
        ! str_starts_with((string) ($identity['database_user'] ?? ''), "{$user}@")
    ) {
        throw new RuntimeException(
            "Connected MySQL schema or account does not match the dedicated {$database} test database."
        );
    }
};

$laravelPassword = $readPassword('DB_PASSWORD', 'DB_PASSWORD_FILE');
$inventoryPassword = $readPassword(
    'INVENTORY_TEST_DB_PASSWORD',
    'INVENTORY_TEST_DB_PASSWORD_FILE'
);

$verifyDatabase(
    (string) getenv('DB_HOST'),
    (string) getenv('DB_PORT'),
    (string) getenv('DB_DATABASE'),
    (string) getenv('DB_USERNAME'),
    $laravelPassword,
);
$verifyDatabase(
    (string) getenv('INVENTORY_TEST_DB_HOST'),
    (string) getenv('INVENTORY_TEST_DB_PORT'),
    (string) getenv('INVENTORY_TEST_DB_NAME'),
    (string) getenv('INVENTORY_TEST_DB_USER'),
    $inventoryPassword,
);

require dirname(__DIR__).'/vendor/autoload.php';
