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

    /** Invoked on the main thread whenever an endpoint resolves or is lost. */
    @Volatile var onEndpointsChanged: (() -> Unit)? = null

    // onServiceFound fires once per address family; without this dedupe
    // the duplicate resolve raced into FAILURE_ALREADY_ACTIVE (observed
    // on blueline 2026-11-09).
    private val resolving = java.util.Collections.synchronizedSet(mutableSetOf<String>())
    private val resolveAttempts = java.util.concurrent.ConcurrentHashMap<String, Int>()
    private val handler = android.os.Handler(android.os.Looper.getMainLooper())
    private var autoRestarts = 0
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
        handler.postDelayed(watchdog, WATCHDOG_INTERVAL_MS)
    }

    fun stop() {
        handler.removeCallbacks(watchdog)
        for (l in listeners) runCatching { nsd.stopServiceDiscovery(l) }
        listeners.clear()
        pairingEndpoint = null
        connectEndpoint = null
        started = false
    }

    private fun notifyChanged() = handler.post { onEndpointsChanged?.invoke() }

    // mDNS announcements only ride state changes; a discovery session
    // started BETWEEN announcements can deliver nothing until the next
    // one (observed on blueline 2026-11-09: fresh session silent for
    // minutes until wireless debugging was toggled). Watchdog: while NO
    // endpoint is known, periodically force a fresh session (bounded —
    // the pairing flow's manual restart() remains the escape hatch).
    private val watchdog = object : Runnable {
        override fun run() {
            if (!started) return
            if (pairingEndpoint == null && connectEndpoint == null) {
                if (autoRestarts < MAX_AUTO_RESTARTS) {
                    autoRestarts += 1
                    Log.w(TAG, "watchdog: no endpoints — restarting discovery ($autoRestarts/$MAX_AUTO_RESTARTS)")
                    restart()
                }
            } else {
                autoRestarts = 0
            }
            if (started) handler.postDelayed(this, WATCHDOG_INTERVAL_MS)
        }
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
            resolve(type, info)
        }

        override fun onServiceLost(info: NsdServiceInfo) {
            Log.i(TAG, "lost [$type] name=${info.serviceName}")
            when (type) {
                "_adb-tls-pairing._tcp" -> pairingEndpoint = null
                "_adb-tls-connect._tcp" -> connectEndpoint = null
            }
            notifyChanged()
        }

        override fun onDiscoveryStarted(t: String) { Log.i(TAG, "discovery started [$t]") }
        override fun onDiscoveryStopped(t: String) { Log.i(TAG, "discovery stopped [$t]") }
        override fun onStartDiscoveryFailed(t: String, code: Int) { Log.w(TAG, "start failed [$t] code=$code") }
        override fun onStopDiscoveryFailed(t: String, code: Int) { Log.w(TAG, "stop failed [$t] code=$code") }
    }

    // Android requires a FRESH ResolveListener per resolve call. Resolves
    // fail spuriously under load (code=3 / FAILURE_ALREADY_ACTIVE races,
    // observed on blueline 2026-11-09), so retry a few times per service.
    private fun resolve(type: String, info: NsdServiceInfo) {
        val key = "$type/${info.serviceName}"
        runCatching {
            nsd.resolveService(info, object : NsdManager.ResolveListener {
                override fun onServiceResolved(r: NsdServiceInfo) {
                    resolving.remove(key)
                    resolveAttempts.remove(key)
                    Log.i(TAG, "resolved [$type] name=${r.serviceName} host=${r.host} port=${r.port}")
                    val endpoint = r.host?.hostAddress?.let { it to r.port }
                    when (type) {
                        "_adb-tls-pairing._tcp" -> pairingEndpoint = endpoint
                        "_adb-tls-connect._tcp" -> connectEndpoint = endpoint
                    }
                    autoRestarts = 0
                    notifyChanged()
                }
                override fun onResolveFailed(i: NsdServiceInfo, code: Int) {
                    resolving.remove(key)
                    val attempt = (resolveAttempts[key] ?: 0) + 1
                    resolveAttempts[key] = attempt
                    Log.w(TAG, "resolve failed [$type] code=$code (attempt $attempt/$MAX_RESOLVE_ATTEMPTS)")
                    if (attempt < MAX_RESOLVE_ATTEMPTS && started) {
                        handler.postDelayed({
                            if (started && resolving.add(key)) resolve(type, info)
                        }, RESOLVE_RETRY_DELAY_MS)
                    }
                }
            })
        }.onFailure {
            resolving.remove(key)
            Log.w(TAG, "resolve threw [$type]: $it")
        }
    }

    companion object {
        private const val TAG = "AdbWifi"
        private const val MAX_RESOLVE_ATTEMPTS = 4
        private const val RESOLVE_RETRY_DELAY_MS = 1_000L
        private const val WATCHDOG_INTERVAL_MS = 10_000L
        private const val MAX_AUTO_RESTARTS = 6
        private val SERVICE_TYPES = listOf(
            "_adb-tls-pairing._tcp", // Pairing Server active (user-started)
            "_adb-tls-connect._tcp", // adbd TLS server active (wireless debugging ON)
            "_adb._tcp",             // legacy `adb tcpip` socket
        )
    }
}
