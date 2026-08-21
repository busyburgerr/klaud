#!/usr/bin/env bash
# Выкатка новой версии: код из git, зависимости, сборка, перезапуск.
#   /srv/cloud/deploy/update.sh
set -euo pipefail

APP_DIR=${APP_DIR:-/srv/cloud}
cd "$APP_DIR"

git pull --ff-only
pnpm install --frozen-lockfile
pnpm build
sudo systemctl restart cloud
sleep 2
systemctl is-active --quiet cloud && echo "[update] сервис работает" || {
  echo "[update] сервис не поднялся, смотрите journalctl -u cloud -n 50"; exit 1;
}
