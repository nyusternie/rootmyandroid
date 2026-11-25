// apps/rootz/app/src/main/java/com/rootmyandroid/rootz/AdbWifi.kt
package com.rootmyandroid.rootz

import android.content.Context

/**
 * One AdbWifiDiscovery per process, shared by MainActivity (pairing UI +
 * "wireless adb: ready" line) and RelayService (the daemon's command
 * executor). Two independent NSD clients would double the mDNS sessions
 * and could disagree about the endpoint.
 *
 * Discovery starts on first access and is not stopped: its watchdog is
 * bounded (AdbWifiDiscovery.MAX_AUTO_RESTARTS), so an idle process stops
 * churning sessions by itself, and the daemon may need the endpoint at
 * any time.
 */
internal object AdbWifi {

    @Volatile
    private var instance: AdbWifiDiscovery? = null

    fun get(context: Context): AdbWifiDiscovery =
        instance ?: synchronized(this) {
            instance ?: AdbWifiDiscovery(context.applicationContext).also {
                instance = it
                it.start()
            }
        }
}
