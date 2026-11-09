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

    /** Latest resolved endpoints (host, port), one per service type. */
    @Volatile var pairingEndpoint: Pair<String, Int>? = null; private set
    @Volatile var connectEndpoint: Pair<String, Int>? = null; private set

    // onServiceFound fires once per address family; without this dedupe
    // the duplicate resolve raced into FAILURE_ALREADY_ACTIVE (observed
    // on blueline 2026-11-09).
    private val resolving = java.util.Collections.synchronizedSet(mutableSetOf<String>())

    private var started = false

    fun start() {
        if (started) return
        started = true
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
        pairingEndpoint = null
        connectEndpoint = null
        started = false
    }

    /**
     * stop()+start(). Fresh discovery sessions reliably find currently-
     * published services, while LONG-RUNNING ones silently stop delivering
     * found-callbacks (observed on blueline 2026-11-09: a pairing service
     * published ~2 min into a session never surfaced; an app restart found
     * services in <1s). Called by the pairing flow before it needs the
     * pairing endpoint.
     */
    fun restart() {
        stop()
        start()
    }

    private fun listener(type: String) = object : NsdManager.DiscoveryListener {
        override fun onServiceFound(info: NsdServiceInfo) {
            Log.i(TAG, "found [$type] name=${info.serviceName} — resolving")
            if (!resolving.add("$type/${info.serviceName}")) {
                Log.i(TAG, "dedupe: resolve already active for ${info.serviceName}")
                return
            }
            // Android requires a FRESH ResolveListener per resolve call.
            runCatching {
                nsd.resolveService(info, object : NsdManager.ResolveListener {
                    override fun onServiceResolved(r: NsdServiceInfo) {
                        resolving.remove("$type/${r.serviceName}")
                        Log.i(TAG, "resolved [$type] name=${r.serviceName} host=${r.host} port=${r.port}")
                        val endpoint = r.host?.hostAddress?.let { it to r.port }
                        when (type) {
                            "_adb-tls-pairing._tcp" -> pairingEndpoint = endpoint
                            "_adb-tls-connect._tcp" -> connectEndpoint = endpoint
                        }
                    }
                    override fun onResolveFailed(i: NsdServiceInfo, code: Int) {
                        resolving.remove("$type/${i.serviceName}")
                        Log.w(TAG, "resolve failed [$type] code=$code")
                    }
                })
            }.onFailure {
                resolving.remove("$type/${info.serviceName}")
                Log.w(TAG, "resolve threw [$type]: $it")
            }
        }

        override fun onServiceLost(info: NsdServiceInfo) {
            Log.i(TAG, "lost [$type] name=${info.serviceName}")
            when (type) {
                "_adb-tls-pairing._tcp" -> pairingEndpoint = null
                "_adb-tls-connect._tcp" -> connectEndpoint = null
            }
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
