#!/bin/sh
# Checks the Android app: its models read every screen of the server's JSON API, and it builds. The screens come from
# demo data by the same script as the iPhone's check (ios/fixtures.ts).
set -e
cd "$(dirname "$0")"
. ./env.sh
if [ ! -d "$ANDROID_HOME/platforms" ] || [ -z "${JAVA_HOME:-}" ]; then
  echo "Нет JDK 17 или Android SDK: запустите android/setup.sh."
  exit 1
fi
fixtures=$(mktemp -d)
trap 'rm -rf "$fixtures"' EXIT
node ../ios/fixtures.ts "$fixtures" > /dev/null
./gradlew -q --console=plain -Pfixtures="$fixtures" :app:testDebugUnitTest :app:assembleDebug
echo "Приложение для Android собирается и читает JSON сервера."
