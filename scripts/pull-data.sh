#!/bin/sh
# Copies the server's databases into this checkout's data/, so a worktree can be developed and tested on what the
# phone sees, phone marking included.
#   make pull-data                  from budget.gang.su over ssh
#   make pull-data VDS=user@host    from another ssh host
# The server has no sqlite3, so its node takes a VACUUM INTO of each database: a whole snapshot even while the
# service is writing. Nothing on the server changes.
set -eu
cd "$(dirname "$0")/.."
host=${VDS:-budget.gang.su}
dbs="settings.db zenmoney.db"

if [ -L data ]; then
  echo "data — ссылка на $(readlink data), базы затёрлись бы там. Уберите ссылку (rm data) и повторите." >&2
  exit 1
fi
# The main checkout keeps what was entered on the Mac; a worktree only keeps copies.
if [ -d .git ]; then
  printf "Это основная копия: базы в data/ с тем, что введено на Mac, заменятся серверными. Продолжить? [y/N] "
  read -r answer
  [ "$answer" = y ] || exit 1
fi
mkdir -p data
tmp=$(mktemp -d data/.pull.XXXXXX)
trap 'rm -rf "$tmp"' EXIT
ssh "$host" sh -s $dbs > "$tmp/data.tar" <<'SH'
set -eu
cd /
dir=$(sudo -n -u budget mktemp -d)
trap 'sudo -n -u budget rm -rf "$dir"' EXIT
sudo -n -u budget /opt/node/bin/node - "$dir" "$@" <<'JS'
const { DatabaseSync } = require('node:sqlite');
const [, , dir, ...names] = process.argv;
for (const name of names) {
  const db = new DatabaseSync(`/srv/budget/data/${name}`, { readOnly: true });
  db.exec(`VACUUM INTO '${dir}/${name}'`);
  db.close();
}
JS
sudo -n -u budget tar -C "$dir" -cf - "$@"
SH
tar -xf "$tmp/data.tar" -C "$tmp"
for db in $dbs; do
  if [ "$(sqlite3 -readonly "$tmp/$db" 'PRAGMA integrity_check')" != ok ]; then
    echo "С сервера пришла повреждённая $db, data/ не тронута." >&2
    exit 1
  fi
done
# The server opens the databases per request, so a running one reads the new files from its next request on.
# A journal left from the old file would be rolled back into the new one.
for db in $dbs; do
  rm -f "data/$db-journal" "data/$db-wal" "data/$db-shm"
  mv "$tmp/$db" "data/$db"
done
synced=$(sqlite3 -readonly data/zenmoney.db "SELECT strftime('%d.%m %H:%M', server_timestamp, 'unixepoch', 'localtime') FROM sync_state")
echo "Базы с $host — в data/. Сервер последний раз брал операции из ZenMoney $synced."
