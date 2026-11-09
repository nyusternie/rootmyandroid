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
    private lateinit var wifiStatus: TextView
    private lateinit var output: TextView
    private lateinit var input: TextInputEditText
    private lateinit var pairStatus: TextView
    private lateinit var pairInput: TextInputEditText
    private lateinit var sendButton: MaterialButton
    private lateinit var outputScroll: ScrollView
    private val adbWifi by lazy { AdbWifiDiscovery(this) }

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
        ).apply { cornerRadius = dp(4).toFloat() } // M2 contained-button spec: 4dp corners
        return MaterialButton(this).apply {
            this.text = text
            backgroundTintList = null
            background = RippleDrawable(ColorStateList.valueOf(0x40FFFFFF), gradient, gradient)
        }
    }

    /** A MaterialCardView wrapping a vertical, padded column of children
     *  with 12dp gaps between them (Material 8dp grid, min touch spacing). */
    private fun sectionCard(vararg children: View): MaterialCardView {
        val inner = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(16), dp(16), dp(16))
            children.forEachIndexed { i, c ->
                addView(
                    c,
                    LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                    ).apply {
                        if (i > 0) topMargin = dp(12)
                    },
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

        wifiStatus = TextView(this)
        status = TextView(this)
        val (commandLayout, commandEdit) = outlinedField("shell command (e.g. id)")
        input = commandEdit
        val send = gradientButton("Send")
        sendButton = send
        val shellCard = sectionCard(wifiStatus, status, commandLayout, send)

        pairStatus = TextView(this).apply { setPadding(0, dp(4), 0, dp(8)) }
        val (pairLayout, pairEdit) = outlinedField("6-digit pairing code") {
            inputType = InputType.TYPE_CLASS_NUMBER
        }
        pairInput = pairEdit
        val pairButton = gradientButton("Pair (wireless debugging)")
        val armButton = gradientButton("Arm pairing notification (same-device)")
        val pairCard = sectionCard(pairStatus, pairLayout, pairButton, armButton)

        output = TextView(this).apply {
            setTextIsSelectable(true)
            typeface = Typeface.MONOSPACE
            textSize = 12f
            setPadding(0, dp(8), 0, dp(8))
        }
        val scroll = ScrollView(this).apply { addView(output) }
        outputScroll = scroll
        val logLabel = TextView(this).apply { text = "output" }
        val clearButton = gradientButton("Clear").apply {
            setOnClickListener { output.text = "" }
        }
        val logHeader = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(
                logLabel,
                LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f),
            )
            addView(
                clearButton,
                LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                ),
            )
        }
        val logInner = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(8), dp(16), dp(16))
            addView(logHeader)
            addView(
                scroll,
                LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f),
            )
        }
        val logCard = MaterialCardView(this).apply {
            radius = dp(12).toFloat()
            cardElevation = dp(2).toFloat()
            useCompatPadding = true
            addView(logInner)
        }

        // Page layout: fixed toolbar, then a SCROLLING content column.
        // The log card needs a fixed height — as a weighted sibling of the
        // two (tall) input cards it was squeezed to ~26dp on a Pixel 3 and
        // the output was invisible (measured via uiautomator bounds).
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(toolbar)
            val content = LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.VERTICAL
                addView(shellCard, cardMargins())
                addView(pairCard, cardMargins())
                addView(
                    logCard,
                    LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT, dp(320),
                    ).apply { setMargins(dp(12), dp(8), dp(12), dp(12)) },
                )
            }
            addView(
                ScrollView(this@MainActivity).apply { addView(content) },
                LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f),
            )
        }
        setContentView(root)

        wifiStatus.text = "wireless adb: searching…"
        wifiStatus.setTextColor(0xFFB0BEC5.toInt())
        status.text = "daemon: not queried yet"
        adbWifi.onEndpointsChanged = {
            val ep = adbWifi.connectEndpoint
            if (ep != null) {
                wifiStatus.text = "wireless adb: ready — ${ep.first}:${ep.second}"
                wifiStatus.setTextColor(0xFF66BB6A.toInt())
            } else {
                wifiStatus.text = "wireless adb: searching…"
                wifiStatus.setTextColor(0xFFB0BEC5.toInt())
            }
        }

        send.setOnClickListener { runCommand(input.text.toString().trim()) }
        pairButton.setOnClickListener { startPairing() }
        // Same-device pairing must NOT foreground this activity — that
        // kills the Settings pairing server (measured on blueline). The
        // notification's inline reply collects the code instead.
        armButton.setOnClickListener {
            PairingNotifier.postPairingPrompt(this)
            pairStatus.text = "pairing notification armed — open the Settings pairing dialog, then type the code into the notification"
        }
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
                val key = AdbKeyStore.get(this)
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

    /** Append a command + its output to the scrollback (terminal style)
     *  and scroll to the bottom. An explicit marker for empty output keeps
     *  silent failures visible (an `ls` that returns nothing MUST still
     *  leave a trace). */
    private fun appendOutput(cmd: String, text: String) {
        output.append("\$ $cmd\n${text.ifEmpty { "(no output)" }}\n\n")
        outputScroll.post { outputScroll.fullScroll(View.FOCUS_DOWN) }
    }

    private fun runCommand(cmd: String, silent: Boolean = false) {
        if (cmd.isEmpty()) return
        runOnUiThread {
            sendButton.isEnabled = false
            sendButton.text = "Running…"
        }
        thread {
          try {
            // Prefer wireless ADB (key enrolled via pairing) when the
            // _adb-tls-connect endpoint is up; fall back to the rootd
            // socket (needed for `su` tiers).
            val ep = adbWifi.connectEndpoint
            if (ep != null) {
                try {
                    val r = AdbConnection(ep.first, ep.second, AdbKeyStore.get(this)).runShell(cmd)
                    val model = r.deviceBanner.split(";")
                        .firstOrNull { it.startsWith("ro.product.model=") }
                        ?.substringAfter("=") ?: "device"
                    runOnUiThread {
                        status.text = "adb: wireless ($model @ ${ep.first}:${ep.second})"
                        if (!silent) appendOutput(cmd, r.output.trim())
                    }
                    return@thread
                } catch (e: Exception) {
                    android.util.Log.e("Rootz", "wireless runCommand failed for '$cmd'", e)
                    runOnUiThread {
                        status.text = "adb: wireless FAILED (${e.message}) — trying daemon"
                    }
                }
            }
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
                    if (!silent) appendOutput(cmd, "(daemon not running)")
                } else {
                    val tier = when {
                        result.contains("uid=0(") -> "root"
                        result.contains("uid=2000(") -> "shell"
                        else -> "unknown"
                    }
                    status.text = "daemon: connected (tier: $tier)"
                    if (!silent) appendOutput(cmd, result.trim())
                }
            }
          } finally {
            runOnUiThread {
                sendButton.isEnabled = true
                sendButton.text = "Send"
            }
          }
        }
    }
}
