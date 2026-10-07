#!/bin/sh
# Puts the budget server on a Debian or Ubuntu VPS, or updates it, from this Mac. Run it from the main copy, where
# .env and data/ are:
#   deploy/deploy.sh root@203.0.113.7               the code, Node.js, the service and HTTPS
#   deploy/deploy.sh root@203.0.113.7 --data        the same, then this Mac's data/ over the server's
#   deploy/deploy.sh root@203.0.113.7 --token       prints the server's access token for the app
# The site is https://<ip>.sslip.io unless DOMAIN names a domain pointed at the server. ZENMONEY_TOKEN goes from this
# .env into the server's on the first run, together with a new ACCESS_TOKEN; later runs keep the server's .env.
set -eu

host=${1:?Укажите сервер: deploy/deploy.sh root@адрес}
shift
cd "$(dirname "$0")/.."

if [ "${1:-}" = "--token" ]; then
  ssh "$host" "sed -n 's/^ACCESS_TOKEN=//p' /opt/budget/.env"
  exit 0
fi

ip=$(echo "${host#*@}" | grep -E '^[0-9.]+$' || ssh "$host" "hostname -I | cut -d' ' -f1")
domain=${DOMAIN:-$(echo "$ip" | tr . -).sslip.io}
tz=$(readlink /etc/localtime | sed 's|.*/zoneinfo/||')

echo "Код → $host:/opt/budget/app"
ssh "$host" "rm -rf /opt/budget/app.new && mkdir -p /opt/budget/app.new"
COPYFILE_DISABLE=1 tar --no-xattrs -czf - package.json Makefile README.md src | ssh "$host" "tar -xzf - -C /opt/budget/app.new"

# The ZenMoney token goes on stdin rather than on a command line, where other users of the server could see it.
scp -q deploy/setup.sh "$host:/tmp/budget-setup.sh"
sed -n 's/^ZENMONEY_TOKEN=//p' .env 2> /dev/null | ssh "$host" "DOMAIN='$domain' TZ_NAME='$tz' sh /tmp/budget-setup.sh; rm -f /tmp/budget-setup.sh"

if [ "${1:-}" = "--data" ]; then
  echo "Данные → $host:/opt/budget/data"
  tmp=$(mktemp -d)
  # A backup rather than a copy, so a database the Mac's server is writing to comes over whole.
  sqlite3 data/settings.db ".backup '$tmp/settings.db'"
  sqlite3 data/zenmoney.db ".backup '$tmp/zenmoney.db'"
  ssh "$host" "systemctl stop budget"
  scp -q "$tmp/settings.db" "$tmp/zenmoney.db" "$host:/opt/budget/data/"
  ssh "$host" "chown budget:budget /opt/budget/data/*.db && chmod 600 /opt/budget/data/*.db && systemctl start budget"
  rm -rf "$tmp"
fi

echo
echo "Готово: https://$domain"
echo "Токен для приложения: deploy/deploy.sh $host --token"
