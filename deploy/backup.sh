#!/usr/bin/env bash
# Резервная копия базы Postgres и загруженных фотографий.
# Крон раз в сутки в 4:30:
#   30 4 * * * /srv/cloud/deploy/backup.sh >> /var/log/cloud-backup.log 2>&1
set -euo pipefail

APP_DIR=${APP_DIR:-/srv/cloud}
DEST=${DEST:-/var/backups/cloud}
KEEP_DAYS=${KEEP_DAYS:-14}
DB_NAME=${DB_NAME:-cloud}
DB_USER=${DB_USER:-cloud}
STAMP=$(date +%Y%m%d-%H%M%S)

mkdir -p "$DEST"

# Копия снимается на ходу: pg_dump не блокирует работу приложения.
# Пароль берётся из ~/.pgpass или переменной PGPASSWORD.
pg_dump -U "$DB_USER" -h 127.0.0.1 -Fc "$DB_NAME" > "$DEST/cloud-$STAMP.dump"
tar -czf "$DEST/uploads-$STAMP.tar.gz" -C "$APP_DIR/server" uploads

find "$DEST" -type f -mtime +"$KEEP_DAYS" -delete
echo "[backup] $STAMP готово"
