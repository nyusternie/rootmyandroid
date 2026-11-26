// apps/guardian-angel/android/app/src/main/java/com/rootmyandroid/guardian_angel/BootReceiver.kt
package com.rootmyandroid.guardian_angel

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Re-posts the entry-point notification after a reboot or an app update —
 * the app has no launcher icon, so without this the user would have no way
 * back in (owner order 2026-11-25, option B).
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) {
            return
        }
        GuardianNotifier.post(context)
    }
}
