// apps/rootz/app/src/main/java/com/rootmyandroid/rootz/MainActivity.kt
package com.rootmyandroid.rootz

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.widget.ImageView
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
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import java.net.Socket
import kotlin.concurrent.thread

/**
 * Rootz MVP: the relay DAEMON on the phone, plus the pairing surfaces.
 * Built from scratch — no fork, no third-party code.
 *
 * Date-based versioning YY.M.D (monorepo rulings 2026-11-09/10 — no v0.x
 * codes). 26.11.8 added in-app wireless-debugging pairing; self-start and
 * the binder API for third-party apps (our own namespace, HANDOFF §13
 * addendum) are later milestones.
 *
 * rootzd is still started OUTSIDE the app (adb push for shell tier,
 * Magisk module for root tier — see apps/rootzd/README.md); the
 * SHELL-tier RELAY daemon runs IN the app (RelayDaemon.kt — owner
 * ruling 2026-11-11: the APK is the daemon on non-rooted phones).
 *
 * No command surface (owner order 2026-11-24): the screen is three
 * sections — Device (identity + account/sync status), Account pairing
 * (QR + 16-digit account), Wireless debugging (6-digit ADB pairing).
 * Every shell session runs through a CLIENT (web /terminal, the Root My
 * Android apps, Desktop) over the relay; runCommand below is used only
 * for the silent startup status probe.
 *
 * Protocol (status probe + relay sessions): one fresh TCP connection per
 * command — write the command plus "exit", then read until EOF (each
 * connection gets its own piped sh in the daemon, so "exit" cleanly
 * closes it).
 *
 * UI: Material Components, dark (terminal-green Rootz identity).
 */
class MainActivity : AppCompatActivity() {

    private lateinit var status: TextView
    private lateinit var wifiStatus: TextView
    private lateinit var output: TextView
    private lateinit var pairStatus: TextView
    private lateinit var pairInput: TextInputEditText
    private lateinit var relayStatus: TextView
    private lateinit var relayDevice: TextView
    private lateinit var relayQr: ImageView
    private lateinit var relayQrWrap: LinearLayout
    private lateinit var relayQrHint: TextView
    private lateinit var relayDisconnect: MaterialButton
    private lateinit var relayAccount: TextInputEditText
    private lateinit var outputScroll: ScrollView
    private val adbWifi by lazy { AdbWifiDiscovery(this) }
    private val guard by lazy { CommandGuard(this) }
    private var relayIdentity: RelayIdentity? = null
    private var relayDaemon: RelayDaemon? = null

    // Relay roles (owner ruling 2026-11-11): the Rootz APK is the relay
    // DAEMON on non-rooted phones (the device lane — RelayDaemon.kt,
    // wired below). The relay CLIENTS are the web /terminal page, the
    // Root My Android android/ios apps, and the Desktop app — never this
    // APK.

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    /** QR payload: the web terminal opens with the device field prefilled
     *  (apps/web/src/scripts/terminal.ts reads ?device=). */
    private fun pairingPayload(deviceId: String) =
        "https://rootmyandroid.com/terminal?device=$deviceId"

    /** Black-on-white QR only — inverted codes do not decode on Android's
     *  ZXing port (measured 2026-11-16, AGENTS.md test-QR discipline). */
    private fun qrBitmap(text: String, sizePx: Int): Bitmap? = try {
        val matrix = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, sizePx, sizePx)
        Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888).apply {
            for (y in 0 until sizePx) for (x in 0 until sizePx) {
                setPixel(x, y, if (matrix[x, y]) 0xFF000000.toInt() else 0xFFFFFFFF.toInt())
            }
        }
    } catch (e: Exception) {
        android.util.Log.e("Rootz", "QR render failed", e)
        null
    }

    private fun setPairingQrVisible(visible: Boolean) {
        relayQrWrap.visibility = if (visible) View.VISIBLE else View.GONE
        relayQrHint.visibility = if (visible) View.VISIBLE else View.GONE
    }

    private fun cardMargins(height: Int = LinearLayout.LayoutParams.WRAP_CONTENT) =
        LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, height).apply {
            // 16dp between sections (was 8dp): the three cards read as
            // separate blocks (owner order 2026-11-24).
            setMargins(dp(12), dp(16), dp(12), 0)
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
            textSize = 18.2f // button label 14sp + 30% (owner order 2026-11-24)
            backgroundTintList = null
            background = RippleDrawable(ColorStateList.valueOf(0x40FFFFFF), gradient, gradient)
        }
    }

    /** Section heading inside a card (owner order 2026-11-24: the three
     *  sections must read as separate blocks, not one blended column). */
    private fun sectionTitle(text: String) = TextView(this).apply {
        this.text = text
        // 16sp + 30% (owner order 2026-11-24).
        textSize = 20.8f
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(0xFFE8EAED.toInt())
    }

    /** Plain status line: Material body 14sp + 30% (owner order
     *  2026-11-24: ALL text up 30%). */
    private fun statusText() = TextView(this).apply { textSize = 18.2f }

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
            // 16sp + 30% for the floating label (owner order 2026-11-24).
            setHintTextAppearance(R.style.TextAppearance_Rootz_FieldHint)
        }
        // TextInputEditText must be created with the TextInputLayout's
        // (theme-wrapped) context — documented Material requirement.
        val edit = TextInputEditText(layout.context).apply {
            textSize = 20.8f // 16sp + 30% (owner order 2026-11-24)
            configure()
        }
        layout.addView(edit)
        return layout to edit
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_YES)

        // Brand row: app icon left of the wordmark, wordmark at 2x the
        // Material title size (owner order 2026-11-24).
        val brandIcon = ImageView(this).apply {
            setImageResource(R.drawable.rootz_icon)
            contentDescription = null
        }
        val brandTitle = TextView(this).apply {
            text = "Rootz"
            textSize = 40f // 20sp title doubled
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(0xFFE8EAED.toInt())
            setPadding(dp(12), 0, 0, 0)
        }
        val brandRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = android.view.Gravity.CENTER_VERTICAL
            addView(brandIcon, LinearLayout.LayoutParams(dp(44), dp(44)))
            addView(
                brandTitle,
                LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                ),
            )
        }
        val toolbar = MaterialToolbar(this).apply {
            addView(
                brandRow,
                androidx.appcompat.widget.Toolbar.LayoutParams(
                    androidx.appcompat.widget.Toolbar.LayoutParams.WRAP_CONTENT,
                    androidx.appcompat.widget.Toolbar.LayoutParams.WRAP_CONTENT,
                ),
            )
        }

        // Section 1 — DEVICE: identity + the current account/sync state.
        // Status only: NO command surface (owner order 2026-11-24: "we DO
        // NOT give any control on this app — EVERYTHING RUNS THRU THE
        // CLIENT"). The shell lives in the web /terminal page and the Root
        // My Android apps; this app is the relay daemon.
        wifiStatus = statusText()
        status = statusText()
        relayStatus = statusText().apply { setPadding(0, dp(4), 0, dp(8)) }
        relayDevice = TextView(this).apply {
            setTextIsSelectable(true)
            typeface = Typeface.MONOSPACE
            textSize = 14.3f // 11sp + 30%
            setPadding(0, 0, 0, dp(8))
        }
        val deviceCard = sectionCard(
            sectionTitle("Device"),
            relayStatus,
            relayDevice,
            wifiStatus,
            status,
        )

        // Section 2 — ACCOUNT PAIRING: the QR (until paired) and the
        // 16-digit account number that starts the relay lane.
        relayQr = ImageView(this).apply {
            contentDescription = "pairing QR — scan with the Root My Android app"
            scaleType = ImageView.ScaleType.FIT_CENTER
            setBackgroundColor(0xFFFFFFFF.toInt())
        }
        relayQrWrap = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = android.view.Gravity.CENTER_HORIZONTAL
            addView(relayQr, LinearLayout.LayoutParams(dp(220), dp(220)))
        }
        relayQrHint = TextView(this).apply {
            text = "Scan with Root My Android → Devices → Pair a new device, or open rootmyandroid.com/terminal on a computer."
            setTextColor(0xFFB0BEC5.toInt())
            textSize = 15.6f // 12sp + 30%
        }
        val (relayAccountLayout, relayAccountEdit) = outlinedField("16-digit account number") {
            inputType = InputType.TYPE_CLASS_NUMBER
        }
        relayAccount = relayAccountEdit
        val relayButton = gradientButton("Pair & start relay daemon")
        // Secondary action: outlined (not the green filled style) so the
        // primary "pair & start" action keeps visual weight.
        relayDisconnect = MaterialButton(
            this,
            null,
            com.google.android.material.R.attr.materialButtonOutlinedStyle,
        ).apply {
            text = "Disconnect"
            textSize = 18.2f // 14sp + 30%
            isEnabled = false
        }
        val accountCard = sectionCard(
            sectionTitle("Account pairing"),
            relayQrWrap,
            relayQrHint,
            relayAccountLayout,
            relayButton,
            relayDisconnect,
        )

        // Section 3 — WIRELESS ADB PAIRING (device setup, not control):
        // title + description on owner order 2026-11-24.
        pairStatus = statusText().apply { setPadding(0, dp(4), 0, dp(8)) }
        val pairDesc = TextView(this).apply {
            text = "Pair this app with your phone's own ADB pairing server. Open " +
                "Developer options → Wireless debugging → \"Pair device with pairing " +
                "code\", then type the 6-digit code it shows here. The code expires in " +
                "under a minute. On the same phone, arm the notification first and type " +
                "the code there."
            textSize = 15.6f // 12sp + 30%
            setTextColor(0xFFB0BEC5.toInt())
        }
        val (pairLayout, pairEdit) = outlinedField("6-digit pairing code") {
            inputType = InputType.TYPE_CLASS_NUMBER
        }
        pairInput = pairEdit
        val pairButton = gradientButton("Pair (wireless debugging)")
        val armButton = gradientButton("Arm pairing notification (same-device)")
        val pairCard = sectionCard(
            sectionTitle("Wireless debugging"),
            pairDesc,
            pairStatus,
            pairLayout,
            pairButton,
            armButton,
        )

        output = TextView(this).apply {
            setTextIsSelectable(true)
            typeface = Typeface.MONOSPACE
            textSize = 15.6f // 12sp + 30%
            setPadding(0, dp(8), 0, dp(8))
        }
        val scroll = ScrollView(this).apply { addView(output) }
        outputScroll = scroll
        // The scrollback card was REMOVED from this screen (owner order
        // 2026-11-24): Rootz is the relay daemon, not a terminal — the
        // terminal lives in the web /terminal page and the Root My Android
        // apps. The buffer is kept (detached) because the relay receipts
        // (onReceipt) still write it.

        // Page layout: fixed toolbar, then a SCROLLING content column.
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            // Taller bar for the 40sp wordmark + 44dp icon.
            addView(
                toolbar,
                LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    dp(88),
                ),
            )
            val content = LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.VERTICAL
                addView(deviceCard, cardMargins())
                addView(accountCard, cardMargins())
                addView(pairCard, cardMargins())
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

        pairButton.setOnClickListener { startPairing() }
        // Same-device pairing must NOT foreground this activity — that
        // kills the Settings pairing server (measured on blueline). The
        // notification's inline reply collects the code instead.
        armButton.setOnClickListener {
            // Android 13+ drops notifications without the runtime grant and
            // the same-device flow lives in the notification's inline reply.
            if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            ) {
                requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQ_POST_NOTIFICATIONS)
                pairStatus.text = "pairing: allow notifications, then tap ARM PAIRING NOTIFICATION again"
                return@setOnClickListener
            }
            armPairingNotification()
        }
        relayButton.setOnClickListener {
            val account = relayAccount.text.toString().trim()
            if (account.length != 16 || account.any { !it.isDigit() }) {
                relayStatus.text = "relay: enter the 16-digit account number from your Root My Android account"
                return@setOnClickListener
            }
            getSharedPreferences(PREFS_RELAY, MODE_PRIVATE).edit().putString(KEY_ACCOUNT, account).apply()
            relayStatus.text = "relay: starting…"
            setPairingQrVisible(false)
            startRelayDaemon(account)
        }
        // Disconnect (owner order 2026-11-24): stop the lane and FORGET the
        // account so the daemon does not auto-start on the next launch; the
        // pairing QR returns. The relay pairing marker is kept — re-pairing
        // the same key is idempotent (API: POST /v1/relay/devices).
        relayDisconnect.setOnClickListener {
            relayDaemon?.stop()
            relayDaemon = null
            getSharedPreferences(PREFS_RELAY, MODE_PRIVATE).edit().remove(KEY_ACCOUNT).apply()
            relayDisconnect.isEnabled = false
            relayStatus.text = "relay: disconnected — scan the QR or enter your 16-digit account number"
            setPairingQrVisible(true)
        }
        runCommand("id", silent = true)
        handlePairIntent(intent)

        // Wireless-debugging discovery spike: logcat-only (tag "AdbWifi").
        adbWifi.start()

        // Relay-DAEMON lane startup: the identity load is one BigInteger
        // scalar multiplication — off the UI thread. Auto-starts when an
        // account number is already stored (paired earlier).
        thread {
            val id = RelayIdentity.loadOrGenerate(this)
            val bmp = qrBitmap(pairingPayload(id.deviceId), dp(220))
            val saved = getSharedPreferences(PREFS_RELAY, MODE_PRIVATE).getString(KEY_ACCOUNT, null)
            runOnUiThread {
                relayIdentity = id
                if (bmp != null) relayQr.setImageBitmap(bmp)
                relayDevice.text = "device id: ${id.deviceId}"
                relayStatus.text =
                    if (saved != null) "relay: starting…"
                    else "relay: idle — scan the QR or enter your 16-digit account number"
                setPairingQrVisible(saved == null)
                if (saved != null) startRelayDaemon(saved)
            }
        }
    }

    /**
     * Wireless debugging can be switched on AFTER this app started; the
     * discovery watchdog gives up after MAX_AUTO_RESTARTS, so the card
     * would sit on "searching…" forever (measured on redfin 2026-11-25).
     * Every return to the app with no endpoint restarts discovery with a
     * fresh budget.
     */
    override fun onResume() {
        super.onResume()
        if (adbWifi.connectEndpoint == null) adbWifi.restartWithFreshBudget()
    }

    override fun onDestroy() {
        relayDaemon?.stop()
        adbWifi.stop()
        super.onDestroy()
    }

    private fun armPairingNotification() {
        PairingNotifier.postPairingPrompt(this)
        pairStatus.text = "pairing notification armed — open the Settings pairing dialog, then type the code into the notification"
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_POST_NOTIFICATIONS) {
            if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
                armPairingNotification()
            } else {
                pairStatus.text = "pairing: notifications denied — the inline code field cannot be shown"
            }
        }
    }

    /**
     * Pairing slice (26.11.8): SPAKE2 handshake against the device's on-board
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

    /**
     * Start (or restart) the relay-DAEMON lane for [account]. Status lines
     * land in the daemon card; receipts (tunnel auth, session opens, guard
     * blocks) append to the output log.
     */
    private fun startRelayDaemon(account: String) {
        val id = relayIdentity ?: return
        relayDaemon?.stop()
        val version = packageManager.getPackageInfo(packageName, 0).versionName ?: "unknown"
        val daemon = RelayDaemon(
            context = applicationContext,
            account = account,
            identity = id,
            tier = "shell",
            version = version,
            deviceName = android.os.Build.MODEL,
            adbWifi = adbWifi,
            guard = guard,
            onStatus = { msg -> runOnUiThread { relayStatus.text = msg } },
            onReceipt = { line ->
                runOnUiThread {
                    output.append("$line\n\n")
                    outputScroll.post { outputScroll.fullScroll(View.FOCUS_DOWN) }
                }
            },
        )
        relayDaemon = daemon
        relayDisconnect.isEnabled = true
        setPairingQrVisible(false)
        daemon.start()
    }

    private fun runCommand(cmd: String, silent: Boolean = false) {
        if (cmd.isEmpty()) return
        thread {
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
        }
    }


    companion object {
        private const val PREFS_RELAY = "relay"
        private const val KEY_ACCOUNT = "account"
        private const val REQ_POST_NOTIFICATIONS = 1001
    }
}
