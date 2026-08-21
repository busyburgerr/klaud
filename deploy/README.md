# Развёртывание «Клауда» на VPS

Инструкция для обычного VPS с Ubuntu 22.04/24.04 (LandVPS, Timeweb, Selectel —
разницы нет, важен только доступ по SSH и root). Рекомендуемая конфигурация —
**1 vCPU / 2 ГБ RAM / 20 ГБ SSD**: на одной машине живут и приложение, и
Postgres.

Итог: один процесс Node отдаёт API и собранный сайт, снаружи стоит nginx с
HTTPS, служба поднимается сама после перезагрузки.

---

## 1. Сервер и домен

1. Создайте VPS с образом **Ubuntu 24.04**, запишите IP и пароль root.
2. В панели домена добавьте A-записи на этот IP:
   `@ → 203.0.113.10` и `www → 203.0.113.10`.
3. Подключитесь: `ssh root@203.0.113.10`.

## 2. Базовая настройка

```bash
apt update && apt upgrade -y
apt install -y git curl nginx postgresql ufw

adduser --disabled-password --gecos "" cloud
usermod -aG sudo cloud

ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable
```

## 3. Postgres

Пакет `postgresql` уже установлен на предыдущем шаге и слушает только петлю —
наружу база не выставляется. Заведите пользователя и базу:

```bash
sudo -u postgres psql -c "CREATE USER cloud WITH PASSWORD 'ПРИДУМАЙТЕ-ПАРОЛЬ';"
```

```bash
sudo -u postgres psql -c "CREATE DATABASE cloud OWNER cloud;"
```

Проверить подключение:

```bash
PGPASSWORD='ПРИДУМАЙТЕ-ПАРОЛЬ' psql -h 127.0.0.1 -U cloud -d cloud -c "SELECT version();"
```

## 4. Node 22 и pnpm

Нужен Node **22 LTS или новее**. Нативных модулей у проекта нет, компилировать
на сервере нечего.

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
corepack enable && corepack prepare pnpm@10.34.3 --activate
node -v && pnpm -v
```

## 5. Код проекта

```bash
mkdir -p /srv/cloud && chown cloud:cloud /srv/cloud
su - cloud
git clone https://github.com/busyburgerr/klaud.git /srv/cloud
cd /srv/cloud
git checkout feat/backend-and-marketplace   # или main, когда ветка будет влита
pnpm install --frozen-lockfile
```

Если репозиторий приватный — заведите
[deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh)
и клонируйте по SSH: `git clone git@github.com:busyburgerr/klaud.git`.

## 6. Настройки окружения

```bash
cd /srv/cloud
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
nano .env    # вставьте вывод в JWT_SECRET и пароль базы в DATABASE_URL
chmod 600 .env
```

Заполнить нужно две строки:

```
JWT_SECRET=<48 случайных байт из команды выше>
DATABASE_URL=postgres://cloud:ПАРОЛЬ@127.0.0.1:5432/cloud
```

Без `JWT_SECRET` длиной от 32 символов прод не запустится — это защита от
токенов, подписанных дефолтным секретом. Пароль базы в проде тоже обязателен.

## 7. Сборка и база

```bash
pnpm build                 # соберёт dist/
pnpm run api:reset         # схема, категории, города, справка, аккаунты персонала
```

`api:reset` создаёт **чистую** базу: схема, справочники и два служебных
аккаунта. Схема применяется и сама при каждом старте службы, отдельных
миграций накатывать не нужно. Если хотите стартовать с наполненным каталогом для демонстрации —
добавьте `pnpm run api:catalog`.

Служебные входы (телефон / пароль):

| Роль          | Телефон      | Пароль       |
|---------------|--------------|--------------|
| Администратор | `9000000001` | `cloud12345` |

Больше на чистой базе аккаунтов нет: модераторов администратор назначает сам
на `/moderation` во вкладке «Пользователи».

**Смените пароль сразу после первого входа** — он опубликован в коде.

## 8. Служба systemd

```bash
exit                       # обратно в root
cp /srv/cloud/deploy/cloud.service /etc/systemd/system/cloud.service
systemctl daemon-reload
systemctl enable --now cloud
systemctl status cloud
curl -s localhost:3001/api/health
```

Логи: `journalctl -u cloud -f`.

## 9. nginx

```bash
cp /srv/cloud/deploy/nginx.conf /etc/nginx/sites-available/cloud
sed -i 's/klaud\.ru/ВАШ-ДОМЕН.ру/g' /etc/nginx/sites-available/cloud
ln -sf /etc/nginx/sites-available/cloud /etc/nginx/sites-enabled/cloud
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

Сайт уже открывается по HTTP на домене.

## 10. HTTPS

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d ВАШ-ДОМЕН.ру -d www.ВАШ-ДОМЕН.ру
```

Certbot сам перепишет конфиг и настроит автопродление. **HTTPS обязателен**:
в проде cookie входа помечена флагом `secure` и по HTTP просто не сохранится.

## 11. Проверка

- `https://домен` — каталог открывается, картинки грузятся;
- вход админом → `/moderation` доступен;
- размещение лота с фотографией → файл появляется в `/srv/cloud/server/uploads`;
- `systemctl restart cloud` → сайт поднимается сам.

---

## Обновление

```bash
su - cloud
/srv/cloud/deploy/update.sh
```

Скрипт делает `git pull`, ставит зависимости, пересобирает фронтенд и
перезапускает службу. Схема обновляется сама при старте: `schema.sql`
идемпотентен, данные не теряются.

## Резервные копии

```bash
mkdir -p /var/backups/cloud
crontab -e
# 30 4 * * * /srv/cloud/deploy/backup.sh >> /var/log/cloud-backup.log 2>&1
```

Копируются база (`pg_dump -Fc`, на ходу и без остановки сервиса) и папка
загрузок; хранится 14 дней. Чтобы крон не спрашивал пароль, положите его в
`~/.pgpass` пользователя `cloud`:

```bash
echo "127.0.0.1:5432:cloud:cloud:ПАРОЛЬ" > ~/.pgpass && chmod 600 ~/.pgpass
```

Восстановление: остановить службу и накатить дамп.

```bash
pg_restore -U cloud -h 127.0.0.1 -d cloud --clean --if-exists /var/backups/cloud/cloud-ГГГГММДД-ЧЧММСС.dump
```

## Что стоит помнить

- **Всё состояние — в двух местах:** база Postgres и `server/uploads/` (фото).
  Их и надо бэкапить; остальное восстанавливается из git.
- **Один процесс.** Лимитер запросов и файлы живут в памяти и на диске этой
  машины, поэтому второй инстанс просто так не добавить — понадобится общее
  хранилище (S3 + Redis). Сама база к этому уже готова.
- **Почта не отправляется.** Подтверждение адреса и уведомления сохраняются в
  базе, но писем нет — SMTP не подключён.
- **Контакты поддержки в справке — заглушки** (`help@klaud.ru`,
  `8 800 123-45-67`, файл `server/db/help-content.js`). Замените на свои до
  запуска.
- **Сообщения работают опросом раз в 5 секунд**, не через WebSocket. На
  небольшом трафике это нормально.
