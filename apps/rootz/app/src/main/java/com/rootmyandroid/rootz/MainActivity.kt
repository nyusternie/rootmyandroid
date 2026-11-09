// apps/rootz/app/src/main/java/com/rootmyandroid/rootz/MainActivity.kt
package com.rootmyandroid.rootz

import android.app.Activity
import android.os.Bundle
import android.text.InputType
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.net.Socket
import kotlin.concurrent.thread

/**
 * Rootz MVP (v0.1): minimal client for the rootzd daemon bridge
 * (127.0.0.1:7357). Built from scratch — no fork, no third-party code.
 *
 * The daemon is started OUTSIDE the app for now (adb push for shell tier,
 * Magisk module for root tier — see apps/rootzd/README.md). In-app
 * wireless-debugging pairing + self-start is v0.2; the binder API for
 * third-party apps (our own namespace, HANDOFF §13 addendum) is v0.3.
 *
 * Protocol: one fresh TCP connection per command — write the command plus
 * "exit", then read until EOF (each connection gets its own piped sh in
 * the daemon, so "exit" cleanly closes it).
 */
class MainActivity : Activity() {

    private lateinit var status: TextView
    private lateinit var output: TextView
    private lateinit var input: EditText
    private lateinit var pairStatus: TextView
    private lateinit var pairInput: EditText
    private val adbWifi by lazy { AdbWifiDiscovery(this) }
    private var adbKey: AdbKey? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val pad = (16 * resources.displayMetrics.density).toInt()
        status = TextView(this)
        input = EditText(this).apply { hint = "command (e.g. id)" }
        val send = Button(this).apply { text = "Send" }
        output = TextView(this).apply { setTextIsSelectable(true) }
        val scroll = ScrollView(this).apply { addView(output) }
        pairStatus = TextView(this)
        pairInput = EditText(this).apply {
            hint = "6-digit pairing code"
            inputType = InputType.TYPE_CLASS_NUMBER
        }
        val pairButton = Button(this).apply { text = "Pair (wireless debugging)" }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
            addView(status)
            addView(input)
            addView(send)
            addView(pairStatus)
            addView(pairInput)
            addView(pairButton)
            addView(
                scroll,
                LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f,
                ),
            )
        }
        setContentView(root)

        send.setOnClickListener { runCommand(input.text.toString().trim()) }
        pairButton.setOnClickListener { startPairing() }
        runCommand("id", silent = true)
        handlePairIntent(intent)

        // Wireless-debugging discovery spike: logcat-only (tag "AdbWifi").
        adbWifi.start()
    }

    override fun onDestroy() {
        adbWifi.stop()
        super.onDestroy()
    }

    /**
     * v0.2 pairing slice: SPAKE2 handshake against the device's on-board
     * Pairing Server (see docs/wireless-debugging-setup.md). Requires the
     * user to open Developer options → Wireless debugging → "Pair device
     * with pairing code" and type the shown 6-digit code here.
     */
    private fun startPairing() {
        val code = pairInput.text.toString().trim()
        if (code.length != 6 || code.any { !it.isDigit() }) {
            pairStatus.text = "pairing: enter the 6-digit code shown on the device"
            return
        }
        // Long-running discovery silently stops surfacing new services
        // (observed on blueline); refresh and give the pairing service a
        // few seconds to resolve before giving up.
        // The pairing server lives only ~37s after the dialog opens
        // (observed on blueline 2026-11-09) — every second matters. Fast
        // path: use the already-resolved endpoint; a dead server fails the
        // TLS connect within ms. Fallback: refresh discovery and retry once.
        pairStatus.text = "pairing: starting…"
        thread {
            var ep = adbWifi.pairingEndpoint
            var result: PairingSession.Result? = null
            if (ep != null) {
                runOnUiThread { pairStatus.text = "pairing: contacting ${ep!!.first}:${ep!!.second}…" }
                result = attemptPair(ep!!, code)
            }
            if (result == null) {
                runOnUiThread { pairStatus.text = "pairing: refreshing discovery…" }
                adbWifi.restart()
                ep = null
                var tries = 0
                while (ep == null && tries < 50) {
                    Thread.sleep(100)
                    ep = adbWifi.pairingEndpoint
                    tries += 1
                }
                val ep2 = ep
                if (ep2 == null) {
                    runOnUiThread {
                        pairStatus.text =
                            "pairing: no _adb-tls-pairing service found — close & re-open the pairing dialog, then retry"
                    }
                    return@thread
                }
                runOnUiThread { pairStatus.text = "pairing: contacting ${ep2.first}:${ep2.second}…" }
                result = attemptPair(ep2, code)
            }
            val res = result
            runOnUiThread {
                pairStatus.text = if (res == null) {
                    "pairing: FAILED — wrong code or timeout (see logcat tag RootzPair)"
                } else {
                    "pairing: SUCCESS — device guid ${res.deviceGuid}"
                }
            }
        }
    }

    private fun attemptPair(ep: Pair<String, Int>, code: String): PairingSession.Result? = try {
        val key = adbKey ?: loadOrCreateAdbKey().also { adbKey = it }
        PairingSession(ep.first, ep.second, code, key).run()
    } catch (e: Exception) {
        android.util.Log.e("RootzPair", "pairing attempt failed", e)
        null
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        handlePairIntent(intent)
    }

    /**
     * Automation hook (and future QR/deep-link path):
     *   am start -n com.rootmyandroid.rootz/.MainActivity --es pair_code NNNNNN
     * fills the code and starts pairing immediately, skipping all UI
     * automation latency (the pairing server window is ~37s).
     */
    private fun handlePairIntent(intent: Intent?) {
        val code = intent?.getStringExtra("pair_code") ?: return
        pairInput.setText(code)
        startPairing()
    }

    /**
     * The app's persistent ADB identity (RSA-2048). Generated once and
     * stored in SharedPreferences; the device enrolls THIS key during
     * pairing, so regenerating it would force re-pairing. (Preview-grade
     * storage; hardware-backed keystore hardening is a later slice.)
     */
    private fun loadOrCreateAdbKey(): AdbKey {
        val prefs = getSharedPreferences("rootz", MODE_PRIVATE)
        val privB64 = prefs.getString("adb_priv", null)
        val pubB64 = prefs.getString("adb_pub", null)
        if (privB64 != null && pubB64 != null) {
            return AdbKey.restore(
                android.util.Base64.decode(privB64, android.util.Base64.NO_WRAP),
                android.util.Base64.decode(pubB64, android.util.Base64.NO_WRAP),
            )
        }
        val key = AdbKey.generate()
        prefs.edit()
            .putString(
                "adb_priv",
                android.util.Base64.encodeToString(key.keyPair.private.encoded, android.util.Base64.NO_WRAP),
            )
            .putString(
                "adb_pub",
                android.util.Base64.encodeToString(key.keyPair.public.encoded, android.util.Base64.NO_WRAP),
            )
            .apply()
        return key
    }

    private fun runCommand(cmd: String, silent: Boolean = false) {
        if (cmd.isEmpty()) return
        thread {
            val result = try {
                Socket("127.0.0.1", 7357).use { s ->
                    s.soTimeout = 10_000
                    s.getOutputStream().write("$cmd\nexit\n".toByteArray(Charsets.UTF_8))
                    s.getOutputStream().flush()
                    s.getInputStream().readBytes().toString(Charsets.UTF_8)
                }
            } catch (e: Exception) {
                android.util.Log.e("Rootz", "runCommand failed for '$cmd'", e)
                null
            }
            runOnUiThread {
                if (result == null) {
                    status.text =
                        "daemon: NOT RUNNING — start rootzd via adb (see apps/rootz/README.md)"
                    if (!silent) output.text = ""
                } else {
                    val tier = when {
                        result.contains("uid=0(") -> "root"
                        result.contains("uid=2000(") -> "shell"
                        else -> "unknown"
                    }
                    status.text = "daemon: connected (tier: $tier)"
                    if (!silent) output.text = result.trim()
                }
            }
        }
    }
}
