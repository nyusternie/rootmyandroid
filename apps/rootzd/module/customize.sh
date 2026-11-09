#!/system/bin/sh
# apps/rootzd/module/customize.sh — install-time checks for the rootzd
# Magisk module. Runs in Magisk's busybox ash environment (module API:
# $ARCH, ui_print, set_perm, abort are provided).

# The shipped binary is arm64-only (aarch64-linux-android).
if [ "$ARCH" != "arm64" ]; then
  abort "! rootzd ships an arm64-v8a binary only (this device: $ARCH)"
fi

ui_print "- rootzd: arch $ARCH OK"
ui_print "- daemon starts at every boot via service.sh"
ui_print "- bridge: 127.0.0.1:7357 (use: adb forward tcp:7357 tcp:7357)"

# Zip extraction does not reliably preserve the exec bit — set it here.
set_perm "$MODPATH/rootzd" 0 0 0755
