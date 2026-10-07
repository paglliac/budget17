#!/bin/sh
# Checks the iPhone app: its models read every screen of the server's JSON API, and its sources build — for the iOS
# simulator when Xcode is installed, as a Mac build of the same sources otherwise.
set -e
cd "$(dirname "$0")"
# Xcode may be installed while the system still points at the Command Line Tools.
[ -z "${DEVELOPER_DIR:-}" ] && [ -d /Applications/Xcode.app ] && export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
fixtures=$(mktemp -d)
trap 'rm -rf "$fixtures"' EXIT
node fixtures.ts "$fixtures" > /dev/null
swift run -q FixtureCheck "$fixtures" | grep -v '^ok' || true
swift run -q FixtureCheck "$fixtures" > /dev/null
if xcodebuild -version > /dev/null 2>&1; then
  xcodebuild -project Budget.xcodeproj -scheme Budget -destination 'generic/platform=iOS Simulator' \
    -derivedDataPath .build/xcode CODE_SIGNING_ALLOWED=NO -quiet build
  echo "Приложение для iPhone собирается под iOS и читает JSON сервера."
else
  swift build -q
  echo "Приложение для iPhone собирается (под macOS: Xcode не установлен) и читает JSON сервера."
fi
