#!/bin/sh
# Builds the app and installs it on the Android phone plugged into this Mac, then opens it. The phone needs developer
# options with USB debugging on, and to allow this Mac once. A debug build is signed by this Mac's own key and does not
# run out, unlike the iPhone's free signing; a phone with a build from another Mac takes this one only after uninstalling.
set -e
cd "$(dirname "$0")"
. ./env.sh
adb start-server > /dev/null 2>&1
serial=${ANDROID_SERIAL:-$(adb devices | awk 'NR > 1 && $2 == "device" && $1 !~ /^emulator-/ { print $1; exit }')}
if [ -z "$serial" ]; then
  if adb devices | grep -q unauthorized; then
    echo "Телефон не доверяет этому Mac: разблокируйте его и нажмите «Разрешить» в окне отладки по USB."
  else
    echo "Android-телефон не найден: подключите его кабелем и включите «Отладку по USB» (Настройки → Для разработчиков)."
  fi
  exit 1
fi
./gradlew -q --console=plain :app:assembleDebug
adb -s "$serial" install -r app/build/outputs/apk/debug/app-debug.apk > /dev/null
adb -s "$serial" shell am start -n ru.apukhtin.budget/.MainActivity > /dev/null
echo "«Бюджет» установлен и открыт на телефоне $(adb -s "$serial" shell getprop ro.product.model | tr -d '\r')."
