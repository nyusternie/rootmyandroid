// apps/rootz/app/src/main/java/com/rootmyandroid/rootz/HarnessHeartbeat.kt
package com.rootmyandroid.rootz

import android.app.ActivityManager
import android.content.Context
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import javax.net.ssl.HttpsURLConnection
import kotlin.math.round

/**
 * Automatic `/harness` heartbeat writer (owner order 2026-11-27).
 *
 * The web page's normal user flow must not depend on an operator running
 * `apps/rootzd/tools/harness-heartbeat.mjs`. This class runs inside the
 * Rootz foreground relay service and posts the registry snapshot to
 * `POST /v1/harness/heartbeat` every 60 s. The route is free (owner ruling
 * 2026-11-26); the account limit is 240/h, so 60 s fits.
 *
 * Snapshot sources:
 *   - device: Build, ActivityManager.MemoryInfo, BatteryManager,
 *     PowerManager.currentThermalStatus (API 29+).
 *   - runtime/agent: the on-device llama-server's `/health` and `/props`
 *     (127.0.0.1:8399 — the same cleartext-localhost exception as the
 *     harness chat in network_security_config.xml).
 *   - model profile: the measured Qwen3-4B Q4_K_M values from
 *     apps/rootzd/tools/harness-snapshot.example.json. A different model
 *     gets its alias/ftype from /props and zeroes for the unmeasured
 *     sizes; the page renders those as 0 rather than inventing numbers.
 *
 * No prompts, completions, chat history, model weights, files, shell
 * output, or user identifiers are sent. The snapshot is registry metadata
 * only and stays under the route's 16 KiB cap.
 */
internal class HarnessHeartbeat(
    private val context: Context,
    private val account: String,
    private val identity: RelayIdentity,
) {

    private val executor: ScheduledExecutorService =
        Executors.newSingleThreadScheduledExecutor { runnable ->
            Thread(runnable, "RootzHarnessHeartbeat").apply { isDaemon = true }
        }

    @Volatile
    private var stopped = false

    fun start() {
        executor.scheduleWithFixedDelay(
            {
                if (!stopped) {
                    runCatching { heartbeatOnce() }
                        .onFailure { Log.w(TAG, "heartbeat cycle failed: ${it.message}") }
                }
            },
            0,
            INTERVAL_SECONDS,
            TimeUnit.SECONDS,
        )
    }

    fun stop() {
        stopped = true
        executor.shutdownNow()
    }

    private fun heartbeatOnce() {
        val now = isoNow()
        val health = httpGet("$LLAMA_BASE/health", 3000)
        val healthy = health?.first == 200
        val props = httpGet("$LLAMA_BASE/props", 5000)?.second?.let {
            runCatching { JSONObject(it) }.getOrNull()
        }
        val alias = props?.optString("model_alias").orEmpty()
        val ftype = props?.optString("model_ftype").orEmpty()
        val buildInfo = props?.optString("build_info").orEmpty()
        val contextSize = props
            ?.optJSONObject("default_generation_settings")
            ?.optInt("n_ctx", 0)
            ?: 0
        val profile = profileFor(alias, ftype)

        val memory = ActivityManager.MemoryInfo()
        (context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager)
            .getMemoryInfo(memory)
        val battery = (context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager)
            .getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
            .coerceIn(0, 100)

        val device = JSONObject()
            .put("id", identity.deviceId)
            .put("name", Build.MODEL)
            .put("model", "${Build.MODEL} (${Build.DEVICE})")
            .put("android", "Android ${Build.VERSION.RELEASE}")
            .put("total_ram_gib", round2(memory.totalMem / GIB))
            .put("free_ram_gib", round2(memory.availMem / GIB))
            .put("thermal", thermalLabel())
            .put("battery_pct", battery)
            .put("last_sync", now)

        val runtime = JSONObject()
            .put("name", "llama.cpp")
            .put("version", buildInfo.ifEmpty { "unknown" })
            .put("backend", "CPU")
            .put("threads", Runtime.getRuntime().availableProcessors())
            .put("overhead_gib", 0.12)

        val agent = JSONObject()
            .put("id", "rootz-agent")
            .put("name", "Rootz Agent")
            .put("runtime", "llama.cpp")
            .put("model", profile.name)
            .put("quantization", profile.quantization)
            .put("parameters_b", profile.parametersB)
            .put("context", contextSize)
            .put("model_gib", profile.modelGib)
            .put("resident_gib", if (healthy) profile.residentGib else 0.0)
            .put("status", if (healthy) "running" else "stopped")
            .put("endpoint", LLAMA_ENDPOINT)
            .put("last_heartbeat", now)
            .put(
                "capabilities",
                JSONArray().put("read-only audit").put("shell plan"),
            )

        val snapshot = JSONObject()
            .put("schema", 1)
            .put("collected_at", now)
            .put("device", device)
            .put("runtime", runtime)
            .put("agents", JSONArray().put(agent))

        val payload = JSONObject()
            .put("account_number", account)
            .put("device_id", identity.deviceId)
            .put("device_name", Build.MODEL)
            .put("snapshot", snapshot)

        val body = payload.toString()
        val bytes = body.toByteArray(Charsets.UTF_8).size
        if (bytes > 16 * 1024) {
            Log.w(TAG, "snapshot is $bytes bytes; the dedicated route cap is 16384")
        }
        val response = httpPostJson(API_URL, body)
        if (response == null) {
            Log.w(TAG, "heartbeat network error")
        } else if (response.first == 200) {
            Log.i(TAG, "heartbeat posted (${response.first})")
        } else {
            Log.w(TAG, "heartbeat rejected HTTP ${response.first}: ${response.second.take(200)}")
        }
    }

    private fun httpGet(url: String, timeoutMs: Int): Pair<Int, String>? = try {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = timeoutMs
            readTimeout = timeoutMs
            requestMethod = "GET"
        }
        try {
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val body = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            code to body
        } finally {
            conn.disconnect()
        }
    } catch (e: Exception) {
        Log.w(TAG, "GET $url failed: ${e.message}")
        null
    }

    private fun httpPostJson(url: String, body: String): Pair<Int, String>? = try {
        val conn = (URL(url).openConnection() as HttpsURLConnection).apply {
            connectTimeout = 10_000
            readTimeout = 15_000
            requestMethod = "POST"
            doOutput = true
            setRequestProperty("content-type", "application/json")
            setRequestProperty("User-Agent", "Rootz-Android/${Build.VERSION.RELEASE}")
        }
        try {
            conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val response = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            code to response
        } finally {
            conn.disconnect()
        }
    } catch (e: Exception) {
        Log.w(TAG, "POST $url failed: ${e.message}")
        null
    }

    private fun thermalLabel(): String {
        if (Build.VERSION.SDK_INT < 29) return "unknown"
        val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        return when (power.currentThermalStatus) {
            PowerManager.THERMAL_STATUS_NONE -> "nominal"
            PowerManager.THERMAL_STATUS_LIGHT -> "light"
            PowerManager.THERMAL_STATUS_MODERATE -> "moderate"
            PowerManager.THERMAL_STATUS_SEVERE -> "severe"
            PowerManager.THERMAL_STATUS_CRITICAL -> "critical"
            PowerManager.THERMAL_STATUS_EMERGENCY -> "emergency"
            PowerManager.THERMAL_STATUS_SHUTDOWN -> "shutdown"
            else -> "unknown"
        }
    }

    private data class ModelProfile(
        val name: String,
        val quantization: String,
        val parametersB: Double,
        val modelGib: Double,
        val residentGib: Double,
    )

    private fun profileFor(alias: String, ftype: String): ModelProfile {
        val lower = alias.lowercase(Locale.US)
        if (lower.contains("qwen3-4b") && lower.contains("q4_k_m")) {
            // Measured on redfin 2026-11-26/27 (harness-snapshot.example.json).
            return ModelProfile("Qwen3-4B-Instruct-2507", "Q4_K_M", 4.02, 2.33, 2.93)
        }
        val name = alias.substringBeforeLast('.').ifEmpty { "unknown" }
        val quantization = ftype.ifEmpty { "unknown" }
        return ModelProfile(name, quantization, 0.0, 0.0, 0.0)
    }

    private fun isoNow(): String {
        val format = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        format.timeZone = TimeZone.getTimeZone("UTC")
        return format.format(Date())
    }

    private fun round2(value: Double): Double = round(value * 100.0) / 100.0

    companion object {
        private const val TAG = "RootzHarness"
        private const val API_URL = "https://rootmyandroid.com/v1/harness/heartbeat"
        private const val LLAMA_BASE = "http://127.0.0.1:8399"
        private const val LLAMA_ENDPOINT = "127.0.0.1:8399"
        private const val INTERVAL_SECONDS = 60L
        private const val GIB = 1024.0 * 1024.0 * 1024.0
    }
}
