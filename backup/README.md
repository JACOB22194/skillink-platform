# Database Backup Service

Automatic daily backups for the SkillLink PostgreSQL database.

## How It Works

A dedicated Docker container runs alongside the rest of the stack. Every day at **03:00**, it connects to the `db` container, dumps the entire database using `pg_dump`, compresses it with gzip, and saves it to a persistent Docker volume. Backups older than 7 days are deleted automatically.

```
[backup container]
      │
      │  pg_dump at 03:00 daily
      ▼
[db container: PostgreSQL]
      │
      │  compressed .sql.gz file
      ▼
[Docker volume: db_backups]
```

## Files

```
backup/
├── Dockerfile     # Builds from postgres:15-alpine, sets up the cron job
├── backup.sh      # The backup script (dump → compress → rotate)
└── README.md      # This file
```

## Configuration

Set these in your `.env` file to override the defaults:

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://skillink_user:password123@db:5432/skillink_db` | Connection string to the database |
| `BACKUP_RETENTION_DAYS` | `7` | How many days of backups to keep |

Example `.env` entry:
```env
BACKUP_RETENTION_DAYS=14
```

## Backup File Naming

Each backup is saved as:
```
skillink_YYYYMMDD_HHMMSS.sql.gz
```

Example: `skillink_20260529_030000.sql.gz`

## Common Commands

**Trigger a backup immediately (without waiting for 03:00):**
```bash
docker exec skillink_backup /backup.sh
```

**List all saved backups:**
```bash
docker run --rm -v skillink_db_backups:/backups alpine ls -lh /backups
```

**View backup logs:**
```bash
docker logs skillink_backup
```

## Restoring From a Backup

1. Copy the backup file out of the Docker volume:
```bash
docker run --rm \
  -v skillink_db_backups:/backups \
  -v $(pwd):/output \
  alpine cp /backups/skillink_20260529_030000.sql.gz /output/
```

2. Restore it into the database:
```bash
gunzip -c skillink_20260529_030000.sql.gz | \
  docker exec -i skillink_db psql -U skillink_user -d skillink_db
```

> **Warning:** Restoring overwrites all current data. Stop the backend service first to avoid conflicts:
> ```bash
> docker compose stop backend
> # restore here
> docker compose start backend
> ```

## Where Backups Are Stored

Backups are stored in a Docker named volume called `db_backups`. This volume persists even if containers are stopped or rebuilt.

To find the physical location on the host machine:
```bash
docker volume inspect skillink_db_backups
```
