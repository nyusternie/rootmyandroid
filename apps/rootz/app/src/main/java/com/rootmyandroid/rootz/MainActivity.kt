// apps/rootz/app/src/main/java/com/rootmyandroid/rootz/MainActivity.kt
package com.rootmyandroid.rootz

import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import java.net.Socket
import kotlin.concurrent.thread

/**
 * Rootz MVP (v0.1): minimal client for the rootzd daemon bridge
 * (127.0.0.1:7357). Built from scratch — no fork, no third-party code.
 *
 * The daemon is started OUTSIDE the app for now (adb push for shell tier,
 * Magisk module for root tier — see apps/rootzd/README.md). The v0.2 line
 * adds in-app wireless-debugging pairing (this build) and self-start
 * (later); the binder API for third-party apps (our own namespace,
 * HANDOFF §13 addendum) is v0.3.
 *
 * Protocol: one fresh TCP connection per command — write the command plus
 * "exit", then read until EOF (each connection gets its own piped sh in
 * the daemon, so "exit" cleanly closes it).
 *
 * UI: Material Components, dark (terminal-green Rootz identity).
 */
class MainActivity : AppCompatActivity() {

    private lateinit var status: TextView
    private lateinit var output: TextView
    private lateinit var input: TextInputEditText
    private lateinit var pairStatus: TextView
    private lateinit var pairInput: TextInputEditText
    private val adbWifi by lazy { AdbWifiDiscovery(this) }
    private var adbKey: AdbKey? = null

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun cardMargins(height: Int = LinearLayout.LayoutParams.WRAP_CONTENT) =
        LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, height).apply {
            setMargins(dp(12), dp(8), dp(12), 0)
        }

    /**
     * A MaterialButton with a diagonal green gradient fill. The gradient
     * replaces the tinted Material background, so backgroundTintList must
     * be nulled (documented MaterialButton pattern); the ripple is kept by
     * wrapping the gradient in a RippleDrawable (gradient doubles as the
     * ripple mask so the ripple respects the rounded corners).
     */
    private fun gradientButton(text: String): MaterialButton {
        val gradient = GradientDrawable(
            GradientDrawable.Orientation.TL_BR,
            intArrayOf(0xFF66BB6A.toInt(), 0xFF2E7D32.toInt()),
        ).apply { cornerRadius = dp(28).toFloat() }
        return MaterialButton(this).apply {
            this.text = text
            backgroundTintList = null
            background = RippleDrawable(ColorStateList.valueOf(0x40FFFFFF), gradient, gradient)
        }
    }

    /** A MaterialCardView wrapping a vertical, padded column of children. */
    private fun sectionCard(vararg children: View): MaterialCardView {
        val inner = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(12), dp(16), dp(16))
            for (c in children) {
                addView(
                    c,
                    LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                    ),
                )
            }
        }
        return MaterialCardView(this).apply {
            radius = dp(12).toFloat()
            cardElevation = dp(2).toFloat()
            useCompatPadding = true
            addView(inner)
        }
    }

    private fun outlinedField(hintText: String, configure: TextInputEditText.() -> Unit = {}): Pair<TextInputLayout, TextInputEditText> {
        val layout = TextInputLayout(this).apply {
            hint = hintText
            boxBackgroundMode = TextInputLayout.BOX_BACKGROUND_OUTLINE
        }
        // TextInputEditText must be created with the TextInputLayout's
        // (theme-wrapped) context — documented Material requirement.
        val edit = TextInputEditText(layout.context).apply(configure)
        layout.addView(edit)
        return layout to edit
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_YES)

        val toolbar = MaterialToolbar(this).apply { title = "Rootz" }

        status = TextView(this).apply { setPadding(0, dp(4), 0, dp(8)) }
        val (commandLayout, commandEdit) = outlinedField("shell command (e.g. id)")
        input = commandEdit
        val send = gradientButton("Send")
        val shellCard = sectionCard(status, commandLayout, send)

        pairStatus = TextView(this).apply { setPadding(0, dp(4), 0, dp(8)) }
        val (pairLayout, pairEdit) = outlinedField("6-digit pairing code") {
            inputType = InputType.TYPE_CLASS_NUMBER
        }
        pairInput = pairEdit
        val pairButton = gradientButton("Pair (wireless debugging)")
        val pairCard = sectionCard(pairStatus, pairLayout, pairButton)

        output = TextView(this).apply {
            setTextIsSelectable(true)
            typeface = Typeface.MONOSPACE
            textSize = 12f
            setPadding(dp(16), dp(12), dp(16), dp(12))
        }
        val scroll = ScrollView(this).apply { addView(output) }
        val logCard = MaterialCardView(this).apply {
            radius = dp(12).toFloat()
            cardElevation = dp(2).toFloat()
            useCompatPadding = true
            addView(scroll)
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(toolbar)
            addView(shellCard, cardMargins())
            addView(pairCard, cardMargins())
            addView(
                logCard,
                LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f,
                ).apply { setMargins(dp(12), dp(8), dp(12), dp(12)) },
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
        // The pairing server lives only ~37s after the dialog opens
        // (observed on blueline 2026-11-09) — every second matters. Fast
        // path: use the already-resolved endpoint; a dead server fails the
        // TLS connect within ms. Fallback: refresh discovery and retry once
        // (long-running discovery silently stops surfacing new services —
        // also observed on blueline).
        pairStatus.text = "pairing: starting…"
        thread {
            // Capture into an immutable: posting a lambda that reads the
            // var races with the refresh path nulling it (observed on
            // blueline: NPE in the posted lambda killed the process).
            val ep0 = adbWifi.pairingEndpoint
            var result: PairingSession.Result? = null
            if (ep0 != null) {
                runOnUiThread { pairStatus.text = "pairing: contacting ${ep0.first}:${ep0.second}…" }
                result = attemptPair(ep0, code)
            }
            if (result == null) {
                runOnUiThread { pairStatus.text = "pairing: refreshing discovery…" }
                adbWifi.restart()
                var ep: Pair<String, Int>? = null
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

    // Retry a few times: adbd advertises the pairing service over mDNS
    // before its listener is accepting (observed on blueline: immediate
    // ECONNREFUSED on a freshly-published, correct port).
    private fun attemptPair(ep: Pair<String, Int>, code: String): PairingSession.Result? {
        repeat(3) { i ->
            if (i > 0) Thread.sleep(400)
            try {
                val key = adbKey ?: loadOrCreateAdbKey().also { adbKey = it }
                return PairingSession(ep.first, ep.second, code, key).run()
            } catch (e: Exception) {
                android.util.Log.e("RootzPair", "pairing attempt ${i + 1} failed", e)
            }
        }
        return null
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
