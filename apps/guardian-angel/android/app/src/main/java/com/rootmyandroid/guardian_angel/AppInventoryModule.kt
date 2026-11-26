// apps/guardian-angel/android/app/src/main/java/com/rootmyandroid/guardian_angel/AppInventoryModule.kt
package com.rootmyandroid.guardian_angel

import android.content.pm.ApplicationInfo
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * The installed-app inventory for Guardian Angel (owner-approved first
 * monitoring slice, 2026-11-25: docs/DECISION-2026-11-25-guardian-monitoring.md).
 *
 * Read-only: package name, label, version, system flag. No permissions
 * beyond QUERY_ALL_PACKAGES (declared in the manifest) — no SMS, no call
 * log, no browser history.
 */
class AppInventoryModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "AppInventory"

  @ReactMethod
  fun listInstalledApps(promise: Promise) {
    try {
      val context = reactApplicationContext
      val pm = context.packageManager
      val apps = Arguments.createArray()
      for (pkg in pm.getInstalledPackages(0)) {
        val info: ApplicationInfo? = pkg.applicationInfo
        val map = Arguments.createMap()
        map.putString("package", pkg.packageName)
        map.putString(
          "label",
          runCatching { info?.let { pm.getApplicationLabel(it).toString() } }
            .getOrNull()
            ?: pkg.packageName,
        )
        map.putString("version", pkg.versionName ?: "")
        map.putBoolean(
          "system",
          ((info?.flags ?: 0) and ApplicationInfo.FLAG_SYSTEM) != 0,
        )
        apps.pushMap(map)
      }
      promise.resolve(apps)
    } catch (e: Exception) {
      promise.reject("APP_INVENTORY_ERROR", e.message, e)
    }
  }
}
