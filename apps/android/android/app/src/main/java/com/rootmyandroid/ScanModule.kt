package com.rootmyandroid

import android.content.pm.PackageManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.concurrent.TimeUnit

/**
 * Device-scan collector: raw device facts for the client-side rules engine
 * (apps/android/scan.ts mirrors apps/web/src/lib/scan-report.ts — same
 * rules, same SOURCE policy: absent values become "unknown", never guesses).
 *
 * READ-ONLY by design (the scan never writes, never flashes, never roots):
 *  - getprop is executed read-only (properties are world-readable).
 *  - `command -v su` is a PATH LOOKUP ONLY — it never executes su. A real
 *    su exec would trigger the Magisk grant dialog and breach the
 *    silent-scan contract.
 *  - Root-app detection is a PackageManager query for the known root-app
 *    package IDs (same set as the web /scan rules engine).
 */
class ScanModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "ScanModule"

  /**
   * Raw facts consumed by analyzeScan() in apps/android/scan.ts:
   *  - getpropText: full `getprop` dump (parsed client-side with the same
   *    parser as the web /scan — toybox getprop prints "[key]: [value]").
   *  - suPath: resolved `command -v su` path, or null when absent/failed.
   *  - rootPackages: KNOWN_ROOT_PACKAGES present in PackageManager.
   */
  @ReactMethod
  fun collectScan(promise: Promise) {
    try {
      val result = Arguments.createMap()
      result.putString("getpropText", runCommand(CMD_TIMEOUT_MS, "/system/bin/getprop"))
      result.putString("suPath", runCommand(CMD_TIMEOUT_MS, "/system/bin/sh", "-c", "command -v su"))

      val pm = reactApplicationContext.packageManager
      val packages = Arguments.createArray()
      for (id in KNOWN_ROOT_PACKAGES) {
        try {
          pm.getPackageInfo(id, 0)
          packages.pushString(id)
        } catch (e: PackageManager.NameNotFoundException) {
          // Not installed — the expected case on most devices.
        }
      }
      result.putArray("rootPackages", packages)

      promise.resolve(result)
    } catch (e: Exception) {
      promise.reject("SCAN_ERROR", e.message, e)
    }
  }

  /** Run a command with a hard timeout; null on failure/timeout/empty stdout. */
  private fun runCommand(timeoutMs: Long, vararg cmd: String): String? {
    return try {
      val process = ProcessBuilder(*cmd).start()
      val finished = process.waitFor(timeoutMs, TimeUnit.MILLISECONDS)
      if (!finished) {
        process.destroyForcibly()
        return null
      }
      process.inputStream.bufferedReader().readText().ifBlank { null }
    } catch (e: Exception) {
      null
    }
  }

  companion object {
    private const val CMD_TIMEOUT_MS = 5000L

    // Heuristic root-app package IDs — same set as
    // apps/web/src/lib/scan-report.ts KNOWN_ROOT_PACKAGES. An installed app
    // does not prove an active su daemon; the UI labels this heuristic.
    private val KNOWN_ROOT_PACKAGES = listOf("com.topjohnwu.magisk")
  }
}
