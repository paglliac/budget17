#!/bin/sh
# Builds the app with its widget for the paired iPhone and installs it. With a free Apple ID the app stops opening after
# 7 days, and this is how it gets signed again. The phone must be on the cable or the same Wi-Fi, trust this Mac and
# have developer mode on.
set -e
cd "$(dirname "$0")"
[ -z "${DEVELOPER_DIR:-}" ] && [ -d /Applications/Xcode.app ] && export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
devices=$(mktemp)
trap 'rm -f "$devices"' EXIT
xcrun devicectl list devices --json-output "$devices" > /dev/null
udid=$(node -e '
  const { devices } = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).result;
  const phone = devices.find((d) => d.hardwareProperties?.platform === "iOS" && d.connectionProperties?.pairingState === "paired");
  if (phone) console.log(phone.hardwareProperties.udid);
' "$devices")
if [ -z "$udid" ]; then
  echo "iPhone не найден: подключите его кабелем и нажмите на нём «Доверять этому компьютеру»."
  exit 1
fi
xcodebuild -project Budget.xcodeproj -scheme Budget -destination "platform=iOS,id=$udid" -derivedDataPath .build/device \
  -allowProvisioningUpdates -quiet build
xcrun devicectl device install app --device "$udid" .build/device/Build/Products/Debug-iphoneos/Budget.app > /dev/null
if xcrun devicectl device process launch --device "$udid" ru.apukhtin.budget > /dev/null 2>&1; then
  echo "«Бюджет» установлен и открыт на iPhone."
else
  echo "«Бюджет» установлен; телефон заблокирован, откройте приложение на нём."
fi
