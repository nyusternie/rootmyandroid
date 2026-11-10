// apps/rootz/app/src/main/java/com/rootmyandroid/rootz/ExampleCommands.kt
package com.rootmyandroid.rootz

/**
 * Built-in command examples (aShell You bar, pattern 85 in
 * .session-notes/repo-reviews.md) — onboarding for users who know ADB
 * exists but not the syntax, and the seed substrate for the versioned
 * recipe packs (pattern 3) that come in a later batch.
 *
 * Every entry is READ-ONLY at the shell tier (uid 2000, the wireless-ADB
 * privilege) — nothing here triggers the CommandGuard, which is the
 * point: examples must be safe to run blindly on a first launch.
 */
data class ExampleCommand(val label: String, val command: String)

object ExampleCommands {
    val ALL = listOf(
        ExampleCommand("who am I (user id)", "id"),
        ExampleCommand("device model + Android version", "getprop ro.product.model; getprop ro.build.version.release"),
        ExampleCommand("build fingerprint", "getprop ro.build.fingerprint"),
        ExampleCommand("installed packages (filter with grep)", "pm list packages"),
        ExampleCommand("battery status", "dumpsys battery"),
        ExampleCommand("screen size + density", "wm size; wm density"),
        ExampleCommand("memory info", "cat /proc/meminfo | head -20"),
        ExampleCommand("storage usage", "df -h /data /sdcard"),
        ExampleCommand("uptime", "uptime"),
        ExampleCommand("kernel version", "cat /proc/version"),
        ExampleCommand("last 100 log lines", "logcat -d -t 100"),
        ExampleCommand("running services of an app", "dumpsys activity services"),
    )
}
