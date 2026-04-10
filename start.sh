#!/bin/sh
set -e

# Ensure the data directory exists on the persistent volume
mkdir -p "$(dirname "$DB_PATH")"

# Run database migrations (safe to re-run — uses CREATE TABLE IF NOT EXISTS)
echo "Running database migrations..."
node migrate.js
echo "Database ready at $DB_PATH"

# Start the Next.js standalone server
exec node server.js
