// apps/rootz/app/src/main/java/com/rootmyandroid/rootz/MainActivity.kt
package com.rootmyandroid.rootz

import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.os.Bundle
import android.text.InputType
import android.text.SpannableString
import android.text.Spanned
import android.text.style.BackgroundColorSpan
import android.view.View
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.content.FileProvider
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import java.io.File
import java.net.Socket
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.concurrent.thread

/**
 * Rootz MVP: minimal client for the rootzd daemon bridge
 * (127.0.0.1:7357). Built from scratch — no fork, no third-party code.
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
    private lateinit var relayStatus: TextView
    private lateinit var relayDevice: TextView
    private lateinit var relayAccount: TextInputEditText
    private lateinit var sendButton: MaterialButton
    private lateinit var outputScroll: ScrollView
    private val adbWifi by lazy { AdbWifiDiscovery(this) }
    private val guard by lazy { CommandGuard(this) }
    private val bookmarks by lazy { Bookmarks(this) }
    private var relayIdentity: RelayIdentity? = null
    private var relayDaemon: RelayDaemon? = null

    // Relay roles (owner ruling 2026-11-11): the Rootz APK is the relay
    // DAEMON on non-rooted phones (the device lane — RelayDaemon.kt,
    // wired below). The relay CLIENTS are the web /terminal page, the
    // Root My Android android/ios apps, and the Desktop app — never this
    // APK.

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

        // Overflow menu (no icons → all items land in the three-dot
        // overflow by default): the Terminal Editor surface (aShell You
        // bar, pattern 85 in .session-notes/repo-reviews.md).
        toolbar.menu.add(0, MENU_EXAMPLES, 0, "Examples")
        toolbar.menu.add(0, MENU_SAVED, 1, "Saved commands")
        toolbar.menu.add(0, MENU_SEARCH, 2, "Search output")
        toolbar.menu.add(0, MENU_EXPORT, 3, "Export output (.txt)")
        toolbar.setOnMenuItemClickListener { item ->
            when (item.itemId) {
                MENU_EXAMPLES -> { showExamples(); true }
                MENU_SAVED -> { showSaved(); true }
                MENU_SEARCH -> { showSearch(); true }
                MENU_EXPORT -> { exportOutput(); true }
                else -> false
            }
        }

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

        // Relay-daemon card (the APK's primary role — owner ruling
        // 2026-11-11): device id for pairing + the account number that
        // starts the lane.
        relayStatus = TextView(this).apply { setPadding(0, dp(4), 0, dp(8)) }
        relayDevice = TextView(this).apply {
            setTextIsSelectable(true)
            typeface = Typeface.MONOSPACE
            textSize = 11f
            setPadding(0, 0, 0, dp(8))
        }
        val (relayAccountLayout, relayAccountEdit) = outlinedField("16-digit account number") {
            inputType = InputType.TYPE_CLASS_NUMBER
        }
        relayAccount = relayAccountEdit
        val relayButton = gradientButton("Pair & start relay daemon")
        val relayCard = sectionCard(relayStatus, relayDevice, relayAccountLayout, relayButton)

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
                addView(relayCard, cardMargins())
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

        send.setOnClickListener { guardedRun(input.text.toString().trim()) }
        pairButton.setOnClickListener { startPairing() }
        // Same-device pairing must NOT foreground this activity — that
        // kills the Settings pairing server (measured on blueline). The
        // notification's inline reply collects the code instead.
        armButton.setOnClickListener {
            PairingNotifier.postPairingPrompt(this)
            pairStatus.text = "pairing notification armed — open the Settings pairing dialog, then type the code into the notification"
        }
        relayButton.setOnClickListener {
            val account = relayAccount.text.toString().trim()
            if (account.length != 16 || account.any { !it.isDigit() }) {
                relayStatus.text = "relay: enter the 16-digit account number from your Root My Android account"
                return@setOnClickListener
            }
            getSharedPreferences(PREFS_RELAY, MODE_PRIVATE).edit().putString(KEY_ACCOUNT, account).apply()
            relayStatus.text = "relay: starting…"
            startRelayDaemon(account)
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
            val saved = getSharedPreferences(PREFS_RELAY, MODE_PRIVATE).getString(KEY_ACCOUNT, null)
            runOnUiThread {
                relayIdentity = id
                relayDevice.text = "device id (pair this into your Root My Android account):\n${id.deviceId}"
                relayStatus.text =
                    if (saved != null) "relay: starting…" else "relay: idle — enter your 16-digit account number to pair"
                if (saved != null) startRelayDaemon(saved)
            }
        }
    }

    override fun onDestroy() {
        relayDaemon?.stop()
        adbWifi.stop()
        super.onDestroy()
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
        daemon.start()
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

    /**
     * Entry point for USER-typed commands: consult the CommandGuard before
     * touching any transport (wireless ADB shell tier OR the daemon socket,
     * which may be uid 0 — the gate must live at this single choke point).
     * Repo rule 6 enforced in-app (CommandGuard.kt docstring).
     */
    private fun guardedRun(cmd: String) {
        if (cmd.isEmpty()) return
        val decision = guard.decisionFor(cmd)
        if (decision.allow) {
            runCommand(cmd)
            return
        }
        val gated = decision.findings.filter { it.risk != Risk.SAFE }
        val reasons = gated.joinToString("\n\n") { "${it.patternKey}\n${it.reason}" }
        val builder = MaterialAlertDialogBuilder(this)
            .setTitle("Confirm command — ${decision.risk.name.lowercase()}")
            .setMessage("$cmd\n\n$reasons")
            .setPositiveButton("Run once") { _, _ ->
                guard.recordRunOnce(decision)
                appendGuardReceipt(
                    if (decision.risk == Risk.CAUTION) {
                        ReceiptCode.ASK_ALLOWED_SESSION
                    } else {
                        ReceiptCode.ASK_ALLOWED_ONCE
                    },
                    cmd,
                )
                runCommand(cmd)
            }
            .setNegativeButton("Cancel") { _, _ ->
                appendGuardReceipt(ReceiptCode.ASK_CANCELLED, cmd)
            }
        // "Always allow" is never offered for DESTRUCTIVE — wipes are
        // re-confirmed every single time (pattern 61, AndroidHarness).
        if (decision.offerAlways) {
            builder.setNeutralButton("Always allow (all such commands)") { _, _ ->
                guard.recordAlways(decision)
                appendGuardReceipt(ReceiptCode.ASK_ALLOWED_ALWAYS, cmd)
                runCommand(cmd)
            }
        }
        builder.show()
    }

    /** Guard audit receipt in the scrollback: one line, closed reason
     *  codes, no payloads (pattern 8, Argus). Only gated commands get a
     *  receipt — SAFE commands leave no line because the `$ cmd` echo is
     *  already the record. */
    private fun appendGuardReceipt(code: ReceiptCode, cmd: String) {
        output.append("[guard] ${code.tag}: $cmd\n\n")
    }

    /** Built-in examples → tap fills the command field (never runs it —
     *  the user still presses Send, so the guard still applies). */
    private fun showExamples() {
        val labels = ExampleCommands.ALL
            .map { "${it.label} — ${it.command}" }
            .toTypedArray()
        MaterialAlertDialogBuilder(this)
            .setTitle("Examples (tap to fill)")
            .setItems(labels) { _, which ->
                input.setText(ExampleCommands.ALL[which].command)
                input.setSelection(input.text?.length ?: 0)
            }
            .show()
    }

    /** Saved commands: tap fills, long-press deletes (a Toast is the
     *  undo-free record). Saving replaces same-named entries (see
     *  Bookmarks.kt docstring). */
    private fun showSaved() {
        val all = bookmarks.all()
        if (all.isEmpty()) {
            Toast.makeText(
                this,
                "no saved commands yet — type a command, then use \"Save current input\" here",
                Toast.LENGTH_LONG,
            ).show()
        }
        val labels = all.map { "${it.name} — ${it.command}" }.toTypedArray()
        val dialog = MaterialAlertDialogBuilder(this)
            .setTitle("Saved commands")
            .setItems(labels) { _, which ->
                input.setText(all[which].command)
                input.setSelection(input.text?.length ?: 0)
            }
            .setNeutralButton("Save current input") { _, _ ->
                val cmd = input.text.toString().trim()
                if (cmd.isEmpty()) {
                    Toast.makeText(this, "command field is empty", Toast.LENGTH_SHORT).show()
                } else {
                    val name = bookmarks.save(cmd)
                    Toast.makeText(this, "saved: $name", Toast.LENGTH_SHORT).show()
                }
            }
            .show()
        dialog.listView.setOnItemLongClickListener { _, _, position, _ ->
            bookmarks.remove(all[position].name)
            Toast.makeText(this, "deleted: ${all[position].name}", Toast.LENGTH_SHORT).show()
            dialog.dismiss()
            true
        }
    }

    private fun showSearch() {
        val (layout, edit) = outlinedField("find in output")
        layout.setPadding(dp(16), dp(8), dp(16), 0)
        MaterialAlertDialogBuilder(this)
            .setTitle("Search output")
            .setView(layout)
            .setPositiveButton("Find next") { _, _ -> findNext(edit.text.toString()) }
            .setNegativeButton("Close", null)
            .show()
    }

    /** Highlight every match and scroll to the next one (repeated
     *  "Find next" with the same term cycles, wrapping at the end). */
    private fun findNext(term: String) {
        if (term.isEmpty()) return
        val text = output.text.toString()
        val startFrom = if (term == lastSearch) lastSearchIndex + 1 else 0
        var idx = text.indexOf(term, startIndex = startFrom, ignoreCase = true)
        if (idx < 0 && startFrom > 0) idx = text.indexOf(term, 0, ignoreCase = true)
        if (idx < 0) {
            Toast.makeText(this, "no match: $term", Toast.LENGTH_SHORT).show()
            return
        }
        lastSearch = term
        lastSearchIndex = idx
        val spanned = SpannableString(text)
        var h = text.indexOf(term, 0, ignoreCase = true)
        while (h >= 0) {
            spanned.setSpan(
                BackgroundColorSpan(SEARCH_HIGHLIGHT),
                h,
                h + term.length,
                Spanned.SPAN_EXCLUSIVE_EXCLUSIVE,
            )
            h = text.indexOf(term, h + term.length, ignoreCase = true)
        }
        output.text = spanned
        // Scroll after layout so output.layout is non-null.
        output.post {
            val l = output.layout ?: return@post
            val target = maxOf(0, l.getLineTop(l.getLineForOffset(idx)) - dp(8))
            outputScroll.scrollTo(0, target)
        }
    }

    /** Export the scrollback as a real .txt file via the share sheet
     *  (FileProvider into cacheDir — no storage permission needed). */
    private fun exportOutput() {
        val text = output.text.toString()
        if (text.isBlank()) {
            Toast.makeText(this, "nothing to export yet", Toast.LENGTH_SHORT).show()
            return
        }
        val dir = File(cacheDir, "exports").apply { mkdirs() }
        val stamp = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(Date())
        val file = File(dir, "rootz-output-$stamp.txt")
        file.writeText(text)
        val uri = FileProvider.getUriForFile(this, "${packageName}.fileprovider", file)
        val share = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        startActivity(Intent.createChooser(share, "Export output (.txt)"))
    }

    private var lastSearch: String? = null
    private var lastSearchIndex = -1

    companion object {
        private const val MENU_EXAMPLES = 1
        private const val MENU_SAVED = 2
        private const val MENU_SEARCH = 3
        private const val MENU_EXPORT = 4

        private const val PREFS_RELAY = "relay"
        private const val KEY_ACCOUNT = "account"
        /** Semi-transparent Rootz green for search highlights. */
        private const val SEARCH_HIGHLIGHT = 0x5566BB6A
    }
}
