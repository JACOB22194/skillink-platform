#!/bin/sh

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="/backups/skillink_${TIMESTAMP}.sql.gz"
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-7}

echo "[$(date)] Starting database backup..."

# Retry up to 5 times in case DB is still warming up
attempt=0
until pg_dump "$DATABASE_URL" | gzip > "$BACKUP_FILE"; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 5 ]; then
    echo "[$(date)] Backup failed after 5 attempts. Skipping."
    rm -f "$BACKUP_FILE"
    exit 0
  fi
  echo "[$(date)] pg_dump failed (attempt $attempt), retrying in 10s..."
  sleep 10
done

echo "[$(date)] Backup saved: $BACKUP_FILE ($(du -sh "$BACKUP_FILE" | cut -f1))"

find /backups -name "skillink_*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete
echo "[$(date)] Cleaned up backups older than ${RETENTION_DAYS} days."
