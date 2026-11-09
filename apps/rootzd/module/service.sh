#!/system/bin/sh
# apps/rootzd/module/service.sh — Magisk module boot script for rootzd.
# Runs late-boot as root. Supersedes the manual /data/adb/service.d/rootzd.sh
# install (the module replaces it — never run both: the second bind to
# 127.0.0.1:7357 would collide).
MODDIR=${0%/*}
chmod 755 "$MODDIR/rootzd" 2>/dev/null
nohup "$MODDIR/rootzd" >/dev/null 2>&1 </dev/null &
