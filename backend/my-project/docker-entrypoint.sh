#!/bin/bash
set -e

# Read secrets from files if they exist
if [ -f "$DB_PASSWORD_FILE" ]; then
    export DB_PASSWORD=$(cat "$DB_PASSWORD_FILE")
fi

# Wait for database to be ready
echo "Waiting for database..."
max_tries=30
count=0
while ! mysqladmin ping -h"$DB_HOST" --silent 2>/dev/null; do
    count=$((count + 1))
    if [ $count -ge $max_tries ]; then
        echo "Database not ready after $max_tries attempts, starting anyway..."
        break
    fi
    echo "Waiting for database... ($count/$max_tries)"
    sleep 2
done

if [ "$SKIP_MIGRATIONS" = "true" ]; then
    echo "Skipping migrations for the scheduler process..."
else
    echo "Running migrations..."
    php artisan migrate --force
fi

# Create storage link
php artisan storage:link 2>/dev/null || true

# Cache configuration
php artisan config:cache || true
php artisan route:cache || true

echo "Starting Laravel application..."
exec "$@"
