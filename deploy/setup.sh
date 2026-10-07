#!/bin/sh
# Sets up the budget server on a Debian or Ubuntu VPS, run as root by deploy.sh: Node.js from nodejs.org, the app as
# the systemd service «budget» on 127.0.0.1:4317, and Caddy in front of it with an HTTPS certificate of its own.
# Safe to run again: it updates what is there and keeps the data and .env.
#   DOMAIN=budget.example.ru TZ_NAME=Europe/Moscow sh setup.sh
# The code is expected in /opt/budget/app.new; ZENMONEY_TOKEN may come on stdin for a first .env.
set -eu

ROOT=/opt/budget
NODE=/opt/node
DOMAIN=${DOMAIN:?DOMAIN не задан}
TZ_NAME=${TZ_NAME:-Europe/Moscow}

say() { printf '\n== %s\n' "$1"; }

# Read first, before anything else can take stdin.
zenmoney=
[ -f "$ROOT/.env" ] || zenmoney=$(cat)

say "Пакеты"
export DEBIAN_FRONTEND=noninteractive
if ! command -v caddy > /dev/null || ! command -v curl > /dev/null || ! command -v xz > /dev/null; then
  apt-get update -q
  apt-get install -y -q curl xz-utils caddy
fi

say "Node.js 24"
if ! "$NODE/bin/node" --version 2> /dev/null | grep -q '^v24\.'; then
  case $(uname -m) in
    x86_64) arch=x64 ;;
    aarch64) arch=arm64 ;;
    *) echo "Неизвестная архитектура $(uname -m)"; exit 1 ;;
  esac
  base=https://nodejs.org/dist/latest-v24.x
  file=$(curl -fsSL "$base/SHASUMS256.txt" | awk "/linux-$arch.tar.xz\$/ {print \$2}")
  tmp=$(mktemp -d)
  curl -fsSL "$base/$file" -o "$tmp/$file"
  (cd "$tmp" && curl -fsSL "$base/SHASUMS256.txt" | grep " $file\$" | sha256sum -c -)
  rm -rf "$NODE"
  mkdir -p "$NODE"
  tar -xJf "$tmp/$file" -C "$NODE" --strip-components=1
  rm -rf "$tmp"
fi
"$NODE/bin/node" --version

say "Приложение"
id budget > /dev/null 2>&1 || useradd --system --home-dir "$ROOT" --shell /usr/sbin/nologin budget
mkdir -p "$ROOT/data"
chown budget:budget "$ROOT/data"
chmod 700 "$ROOT/data"
if [ -d "$ROOT/app.new" ]; then
  rm -rf "$ROOT/app.old"
  [ -d "$ROOT/app" ] && mv "$ROOT/app" "$ROOT/app.old"
  mv "$ROOT/app.new" "$ROOT/app"
  rm -rf "$ROOT/app.old"
fi
# The server finds its databases next to its code, in app/data; they live apart, so a new version keeps them.
ln -sfn "$ROOT/data" "$ROOT/app/data"

if [ ! -f "$ROOT/.env" ]; then
  access=$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | cut -c1-40)
  umask 077
  printf 'ZENMONEY_TOKEN=%s\nACCESS_TOKEN=%s\n' "$zenmoney" "$access" > "$ROOT/.env"
  chown budget:budget "$ROOT/.env"
  echo "Создан $ROOT/.env с новым токеном доступа."
fi

cat > /etc/systemd/system/budget.service <<UNIT
[Unit]
Description=Budget: web UI and the iPhone app's API
After=network-online.target
Wants=network-online.target

[Service]
User=budget
WorkingDirectory=$ROOT/app
Environment=PORT=4317 HOST=127.0.0.1 TZ=$TZ_NAME
ExecStart=$NODE/bin/node --env-file=$ROOT/.env src/web/server.ts
Restart=always
RestartSec=5
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ReadWritePaths=$ROOT/data

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable budget > /dev/null 2>&1
systemctl restart budget

say "HTTPS"
cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:4317
}
CADDY
systemctl enable caddy > /dev/null 2>&1
systemctl reload caddy 2> /dev/null || systemctl restart caddy

say "Проверка"
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fs -o /dev/null http://127.0.0.1:4317/styles.css; then break; fi
  sleep 1
done
systemctl is-active budget
curl -s -o /dev/null -w 'API без токена: %{http_code} (так и должно быть: 401)\n' http://127.0.0.1:4317/api/session
echo "Сервер: https://$DOMAIN"
