#!/bin/sh
# Walks the app's screens and saves a screenshot of each, to look at with eyes. It only opens and closes things, so it
# is safe against real data. In the emulator it runs against a server on this Mac: the emulator starts by itself if none
# runs (setup.sh makes it), and the server's port is what the emulator sees at 10.0.2.2. On the phone on the cable it
# walks the app as installed, on the phone's own server; the phone must be unlocked.
#   android/screens.sh http://localhost:4341 <folder>
#   android/screens.sh phone <folder>
set -e
server=${1:?Укажите сервер, например http://localhost:4341, или phone}
folder=${2:?Укажите папку для скриншотов}
cd "$(dirname "$0")"
. ./env.sh
mkdir -p "$folder"

if [ "$server" = phone ]; then
  device=$(adb devices | awk 'NR > 1 && $2 == "device" && $1 !~ /^emulator-/ { print $1; exit }')
  [ -z "$device" ] && { echo "Телефон не подключён: см. android/install.sh." >&2; exit 1; }
  export ANDROID_SERIAL=$device
  # From the main page, whichever tab the app was left on.
  adb shell am start -a android.intent.action.VIEW -d budget://week ru.apukhtin.budget > /dev/null
else
  port=${server##*:}
  port=${port%%/*}
  if ! adb devices | grep -q '^emulator-.*device$'; then
    emulator -avd "$EMULATOR_NAME" -no-window -no-audio -no-boot-anim -no-snapshot-save > /dev/null 2>&1 &
  fi
  device=$(adb devices | awk '$1 ~ /^emulator-/ { print $1; exit }')
  while [ -z "$device" ]; do sleep 2; device=$(adb devices | awk '$1 ~ /^emulator-/ { print $1; exit }'); done
  export ANDROID_SERIAL=$device
  adb wait-for-device shell 'while [ -z "$(getprop sys.boot_completed)" ]; do sleep 2; done'
  ./gradlew -q --console=plain :app:assembleDebug
  adb install -r app/build/outputs/apk/debug/app-debug.apk > /dev/null
  adb shell am force-stop ru.apukhtin.budget
  adb shell am start -n ru.apukhtin.budget/.MainActivity -e server "http://10.0.2.2:$port" > /dev/null
fi

shot() {
  sleep 3
  adb exec-out screencap -p > "$folder/$1.png"
}

# Taps what the screen reader would call by this name, or the text on it, from the dump of the screen.
tap() {
  adb shell uiautomator dump /sdcard/screen.xml > /dev/null
  bounds=$(adb shell cat /sdcard/screen.xml | tr '>' '\n' | grep -E "(content-desc|text)=\"$1\"" | head -1 | sed -E 's/.*bounds="\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]".*/\1 \2 \3 \4/')
  if [ -z "$bounds" ]; then
    echo "На экране нет «$1»" >&2
    return 1
  fi
  set -- $bounds
  adb shell input tap $(( ($1 + $3) / 2 )) $(( ($2 + $4) / 2 ))
}

# Taps the first row whose id starts so, such as an expense's spending-…, at its left, on its icon: a step such as
# «Принять» in the middle of a line would change the data.
tap_id() {
  adb shell uiautomator dump /sdcard/screen.xml > /dev/null
  bounds=$(adb shell cat /sdcard/screen.xml | tr '>' '\n' | grep -E "resource-id=\"$1" | head -1 | sed -E 's/.*bounds="\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]".*/\1 \2 \3 \4/')
  if [ -z "$bounds" ]; then
    echo "На экране нет «$1…»" >&2
    return 1
  fi
  set -- $bounds
  adb shell input tap $(( $1 + 60 )) $(( ($2 + $4) / 2 ))
}

# Waits up to a minute for a word on the screen, as the main page's «Неделя» after a cold start.
wait_for() {
  i=0
  while [ $i -lt 30 ] && ! adb shell uiautomator dump /sdcard/screen.xml > /dev/null 2>&1 || ! adb shell cat /sdcard/screen.xml | grep -q "text=\"$1\""; do
    i=$((i + 1))
    [ $i -ge 30 ] && break
    sleep 2
  done
}

link() {
  adb shell am start -a android.intent.action.VIEW -d "budget://$1" ru.apukhtin.budget > /dev/null
}

# Back, and a moment for a sheet to slide away.
back() {
  adb shell input keyevent KEYCODE_BACK
  sleep 1
}

wait_for "Неделя"
shot 01-week
tap "Сегодня потрачено" && shot 02-week-spending
if tap_id spending-; then
  shot 07-spending
  tap_id place && shot 08-spending-place && tap_id place
  tap_id more && shot 09-spending-more
  back
fi
back
tap "Месяц" && shot 03-month
adb shell input swipe 540 1800 540 500 300 && shot 04-month-end
link week && tap "Выбрать неделю" && shot 05-week-picker && back
tap "Ещё" && shot 50-regular && tap "Настройки" && shot 06-settings && back
tap "Доходы" && shot 51-income
tap "Категории" && shot 52-categories && tap_id category- && shot 53-category && back
tap "Магазины" && shot 54-shops && tap_id shop- && shot 55-shop && back
tap "Регулярные"
link week
tap "Операции" && shot 10-operations
tap_id regroup && shot 11-operations-by-category && tap_id regroup
tap "Категории" && shot 12-categories && back
tap "Ждут разбора" && shot 13-operations-pending
if tap_id spending-; then
  shot 14-spending-queue
  back
fi
tap "Все"
link week
tap "Зарезервировано" && shot 20-plan
if tap_id purchase-; then
  shot 21-purchase
  back
fi
tap_id add-purchase && shot 22-plan-add && back
adb shell input swipe 540 1800 540 400 300 && adb shell input swipe 540 1800 540 400 300
tap_id plan-paid && shot 23-plan-paid
link week
tap "Доп. бюджет" && shot 30-extras && tap_id extras-details && shot 31-extras-details && back
back
tap "Месяц" && adb shell input swipe 540 1800 540 400 300 && tap_id month-extras && shot 32-month-extras && back
tap "Желания" && shot 40-wishes
if tap_id wish-card-; then
  shot 41-wish
  adb shell input swipe 540 1600 540 600 300 && shot 42-wish-plan
  back
fi
tap "Месяцы" && shot 43-wishes-months && tap "Карточки"
link week
# A week past its amount, if the month has one, and why it went there.
tap "Месяц" && tap "[^\"]*перерасход" && shot 33-week-past && tap_id week-why && shot 34-week-why && back
link week
ls "$folder"
