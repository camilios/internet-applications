#!/bin/sh
set -e

# Read secrets from files if they exist
if [ -f "$DB_PASSWORD_FILE" ]; then
    export DB_PASSWORD=$(cat "$DB_PASSWORD_FILE")
fi

# Wait for MySQL to be ready
echo "Waiting for MySQL..."
max_tries=30
count=0
while ! nc -z "${DB_HOST:-inventory-mysql}" "${DB_PORT:-3306}" 2>/dev/null; do
    count=$((count + 1))
    if [ $count -ge $max_tries ]; then
        echo "MySQL did not become ready after $max_tries attempts."
        exit 1
    fi
    echo "Waiting for MySQL... ($count/$max_tries)"
    sleep 2
done

# Run migrations
echo "Running database migrations..."
node dist/database/migrate.js

# Run seeds if SEED_DB is set
if [ "$SEED_DB" = "true" ]; then
    echo "Seeding database..."
    node dist/database/seed.js
fi

echo "Starting Inventory gRPC Service..."
exec "$@"
