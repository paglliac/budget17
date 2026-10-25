# Where the Android tools live on this Mac, for the scripts beside this one; Homebrew puts them there (see setup.sh).
[ -z "${JAVA_HOME:-}" ] && [ -d /opt/homebrew/opt/openjdk@17 ] && export JAVA_HOME=/opt/homebrew/opt/openjdk@17
[ -z "${ANDROID_HOME:-}" ] && export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
EMULATOR_NAME=budget
EMULATOR_IMAGE="system-images;android-36;google_apis;arm64-v8a"
