// apps/rootz/app/src/main/java/com/rootmyandroid/rootz/BootReceiver.kt
package com.rootmyandroid.rootz

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Brings the relay lane back without the user opening the app (owner
 * order 2026-11-25):
 *  - BOOT_COMPLETED: after a reboot the daemon is not running; the
 *    account number and the ADB pairing key both survive, so the tunnel
 *    can be rebuilt unattended.
 *  - MY_PACKAGE_REPLACED: an app update kills the process; restart the
 *    service so a sideloaded update does not silently drop the device
 *    offline.
 *
 * Wireless debugging itself is a system setting that stays on across
 * reboots; if the user turned it off, the daemon still connects to the
 * relay but commands answer "wireless adb not ready" (the honest error
 * the web terminal shows).
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) {
            return
        }
        val account = context.getSharedPreferences(RelayService.PREFS_RELAY, Context.MODE_PRIVATE)
            .getString(RelayService.KEY_ACCOUNT, null)
            ?.trim()
        if (account == null || account.length != 16) return
        // Direct boot is not supported (prefs are credential-encrypted), so
        // BOOT_COMPLETED is delivered after the user unlocks.
        // The entry notification comes back first: with no launcher icon it
        // is the only way back into the app (owner order 2026-11-25).
        RootzNotifier.post(context)
        runCatching { RelayService.start(context) }
    }
}
