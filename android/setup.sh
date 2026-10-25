#!/bin/sh
# Installs what building the Android app takes on this Mac, and does nothing for what is there already: JDK 17 and the
# Android command-line tools from Homebrew, then the SDK's platform, build tools, adb, and an emulator with its phone.
set -e
. "$(dirname "$0")/env.sh"
brew list openjdk@17 > /dev/null 2>&1 || brew install openjdk@17
brew list --cask android-commandlinetools > /dev/null 2>&1 || brew install --cask android-commandlinetools
yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses > /dev/null
"$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" "platform-tools" "platforms;android-36" "build-tools;36.0.0" \
  "emulator" "$EMULATOR_IMAGE" > /dev/null
if ! "$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager" list avd -c | grep -qx "$EMULATOR_NAME"; then
  echo no | "$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager" create avd -n "$EMULATOR_NAME" -k "$EMULATOR_IMAGE" -d pixel_8 > /dev/null
fi
echo "Всё для сборки под Android на месте: JDK 17, Android SDK и эмулятор $EMULATOR_NAME."
