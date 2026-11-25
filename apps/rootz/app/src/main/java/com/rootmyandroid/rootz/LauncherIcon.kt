// apps/rootz/app/src/main/java/com/rootmyandroid/rootz/LauncherIcon.kt
package com.rootmyandroid.rootz

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager

/**
 * Launcher-icon visibility via the `.LauncherAlias` activity-alias
 * (owner order 2026-11-25, option A in
 * docs/TODO-2026-11-25-icon-removal.md).
 *
 * Why an alias and not DevicePolicyManager.setApplicationHidden: that API
 * needs device-owner provisioning AND suspends the app — which would stop
 * the relay daemon. Disabling the alias only removes the launcher entry;
 * the process, the foreground service and the tunnel keep running
 * (DONT_KILL_APP). The app stays reachable via
 * `adb shell am start -n com.rootmyandroid.rootz/.MainActivity`.
 */
internal object LauncherIcon {

    private fun alias(context: Context) =
        ComponentName(context.packageName, "${context.packageName}.LauncherAlias")

    fun isVisible(context: Context): Boolean {
        val state = context.packageManager.getComponentEnabledSetting(alias(context))
        // COMPONENT_ENABLED_STATE_DEFAULT means "manifest default" (enabled).
        return state != PackageManager.COMPONENT_ENABLED_STATE_DISABLED
    }

    /** @return the state that was applied (the requested one). */
    fun setVisible(context: Context, visible: Boolean): Boolean {
        val state = if (visible) {
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED
        } else {
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED
        }
        context.packageManager.setComponentEnabledSetting(
            alias(context),
            state,
            PackageManager.DONT_KILL_APP,
        )
        return visible
    }
}
