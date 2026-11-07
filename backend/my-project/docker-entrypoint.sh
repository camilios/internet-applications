#!/bin/bash
set -e

# Read secrets from files if they exist
if [ -f "$DB_PASSWORD_FILE" ]; then
    export DB_PASSWORD=$(cat "$DB_PASSWORD_FILE")
fi

# Discard configuration generated before runtime secrets were mounted.
php artisan config:clear

# Wait for database to be ready
echo "Waiting for database..."
max_tries=30
count=0
while ! php -r '
    try {
        new PDO(
            "mysql:host=".getenv("DB_HOST").";port=".(getenv("DB_PORT") ?: "3306").";dbname=".getenv("DB_DATABASE"),
            getenv("DB_USERNAME"), getenv("DB_PASSWORD"), [PDO::ATTR_TIMEOUT => 2]
        );
    } catch (Throwable $exception) {
        exit(1);
    }
'; do
    count=$((count + 1))
    if [ $count -ge $max_tries ]; then
        echo "Database not ready after $max_tries attempts; refusing to start."
        exit 1
    fi
    echo "Waiting for database... ($count/$max_tries)"
    sleep 2
done

if [ "$SKIP_MIGRATIONS" = "true" ]; then
    echo "Skipping migrations for the scheduler process..."
else
    echo "Running migrations..."
    # Schema changes and migration-table reads must always use the primary.
    DB_REPLICA_ENABLED=false php artisan migrate --force
fi

# Create storage link
php artisan storage:link 2>/dev/null || true

# Cache configuration
php artisan config:cache || true
php artisan route:cache || true

echo "Starting Laravel application..."
exec "$@"
