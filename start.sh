#!/bin/sh
set -e

# Ensure the data directory exists on the persistent volume
mkdir -p "$(dirname "$DB_PATH")"
mkdir -p /data/backups

# Run database migrations (safe to re-run — uses CREATE TABLE IF NOT EXISTS)
echo "Running database migrations..."
node migrate.js
echo "Database ready at $DB_PATH"

# Background: daily local backup (keeps last 7 days on the same volume)
(
  while true; do
    sleep 86400  # 24 hours
    STAMP=$(date +%Y-%m-%d)
    sqlite3 "$DB_PATH" "VACUUM INTO '/data/backups/schedule-${STAMP}.db'" 2>/dev/null || true
    # Delete backups older than 7 days
    find /data/backups -name "schedule-*.db" -mtime +7 -delete 2>/dev/null || true
    echo "Backup created: schedule-${STAMP}.db"
  done
) &

# Start the Next.js standalone server
exec node server.js
