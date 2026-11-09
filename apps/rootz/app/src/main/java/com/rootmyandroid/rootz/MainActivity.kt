// apps/rootz/app/src/main/java/com/rootmyandroid/rootz/MainActivity.kt
package com.rootmyandroid.rootz

import android.app.Activity
import android.os.Bundle
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
    private val adbWifi by lazy { AdbWifiDiscovery(this) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val pad = (16 * resources.displayMetrics.density).toInt()
        status = TextView(this)
        input = EditText(this).apply { hint = "command (e.g. id)" }
        val send = Button(this).apply { text = "Send" }
        output = TextView(this).apply { setTextIsSelectable(true) }
        val scroll = ScrollView(this).apply { addView(output) }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
            addView(status)
            addView(input)
            addView(send)
            addView(
                scroll,
                LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f,
                ),
            )
        }
        setContentView(root)

        send.setOnClickListener { runCommand(input.text.toString().trim()) }
        runCommand("id", silent = true)

        // Wireless-debugging discovery spike: logcat-only (tag "AdbWifi").
        adbWifi.start()
    }

    override fun onDestroy() {
        adbWifi.stop()
        super.onDestroy()
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
