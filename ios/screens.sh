#!/bin/sh
# Walks the app's screens in the iOS simulator against a running server and saves a screenshot of each, to look at
# with eyes. It only opens and closes things, so it is safe against real data (see BudgetUITests/ScreensTests.swift).
#   ios/screens.sh http://localhost:4318 <folder> ["iPhone 17"]
set -e
server=${1:?Укажите сервер, например http://localhost:4318}
folder=${2:?Укажите папку для скриншотов}
device=${3:-iPhone 17}
cd "$(dirname "$0")"
[ -z "${DEVELOPER_DIR:-}" ] && [ -d /Applications/Xcode.app ] && export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
mkdir -p "$folder"
TEST_RUNNER_SERVER=$server TEST_RUNNER_SCREENSHOTS=$(cd "$folder" && pwd) xcodebuild test -project Budget.xcodeproj -scheme Budget \
  -destination "platform=iOS Simulator,name=$device" -derivedDataPath .build/xcode CODE_SIGNING_ALLOWED=NO -quiet
ls "$folder"
