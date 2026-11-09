package com.rootmyandroid.rootz

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.util.Log

/**
 * Wireless-debugging discovery spike, per the authoritative AOSP doc
 * (packages/modules/adb, docs/dev/adb_wifi.md): when "Wireless debugging"
 * is on, adbd's TLSServer publishes `_adb-tls-connect._tcp`; when the user
 * starts "Pair device with pairing code", the Pairing Server publishes
 * `_adb-tls-pairing._tcp`. This module is the first slice of the v-next
 * in-app pairing flow: FIND the services and log them. Discovery only —
 * no pairing, no TLS, no writes anywhere.
 */
class AdbWifiDiscovery(context: Context) {

    private val nsd = context.getSystemService(Context.NSD_SERVICE) as NsdManager
    private val listeners = mutableListOf<NsdManager.DiscoveryListener>()

    fun start() {
        for (type in SERVICE_TYPES) {
            val l = listener(type)
            listeners += l
            nsd.discoverServices(type, NsdManager.PROTOCOL_DNS_SD, l)
            Log.i(TAG, "discovering $type")
        }
    }

    fun stop() {
        for (l in listeners) runCatching { nsd.stopServiceDiscovery(l) }
        listeners.clear()
    }

    private fun listener(type: String) = object : NsdManager.DiscoveryListener {
        override fun onServiceFound(info: NsdServiceInfo) {
            Log.i(TAG, "found [$type] name=${info.serviceName} — resolving")
            // Android requires a FRESH ResolveListener per resolve call.
            runCatching {
                nsd.resolveService(info, object : NsdManager.ResolveListener {
                    override fun onServiceResolved(r: NsdServiceInfo) {
                        Log.i(TAG, "resolved [$type] name=${r.serviceName} host=${r.host} port=${r.port}")
                    }
                    override fun onResolveFailed(i: NsdServiceInfo, code: Int) {
                        Log.w(TAG, "resolve failed [$type] code=$code")
                    }
                })
            }.onFailure { Log.w(TAG, "resolve threw [$type]: $it") }
        }

        override fun onServiceLost(info: NsdServiceInfo) {
            Log.i(TAG, "lost [$type] name=${info.serviceName}")
        }

        override fun onDiscoveryStarted(t: String) { Log.i(TAG, "discovery started [$t]") }
        override fun onDiscoveryStopped(t: String) { Log.i(TAG, "discovery stopped [$t]") }
        override fun onStartDiscoveryFailed(t: String, code: Int) { Log.w(TAG, "start failed [$t] code=$code") }
        override fun onStopDiscoveryFailed(t: String, code: Int) { Log.w(TAG, "stop failed [$t] code=$code") }
    }

    companion object {
        private const val TAG = "AdbWifi"
        private val SERVICE_TYPES = listOf(
            "_adb-tls-pairing._tcp", // Pairing Server active (user-started)
            "_adb-tls-connect._tcp", // adbd TLS server active (wireless debugging ON)
            "_adb._tcp",             // legacy `adb tcpip` socket
        )
    }
}
