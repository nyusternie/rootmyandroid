package com.rootmyandroid

import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.UUID

/**
 * Backup-audit collector + audit device identity.
 *
 * collectBackupAudit() reads every installed app's backup participation
 * straight from PackageManager — no root required: the allow-backup flag
 * (the fullBackupContent / dataExtractionRules resource fields no longer
 * exist in the SDK 37 stubs, so declared backup configuration is not read).
 * Apps that opted out of backup entirely are the "not covered at
 * all" set of the audit; participation alone says nothing about whether a
 * backup has actually completed (last-backup timestamps and schedule live in
 * BackupManager/bmgr and need root or our ADB tooling — deferred).
 *
 * The audit device id is generated once and persisted in app-private
 * SharedPreferences so repeated syncs upsert the same (account, device,
 * audit_type) row on the API instead of creating duplicates.
 */
class AuditModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val prefs =
    reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  override fun getName(): String = "AuditModule"

  /** Stable per-install device id used for audit syncs. */
  @ReactMethod
  fun getDeviceId(promise: Promise) {
    try {
      var id = prefs.getString(KEY_DEVICE_ID, null)
      if (id == null) {
        id = UUID.randomUUID().toString()
        prefs.edit().putString(KEY_DEVICE_ID, id).apply()
      }
      promise.resolve(id)
    } catch (e: Exception) {
      promise.reject("AUDIT_ERROR", e.message, e)
    }
  }

  /** Human-readable device label sent to the API at sync time, e.g. "Google Pixel 5". */
  @ReactMethod
  fun getDeviceName(promise: Promise) {
    try {
      promise.resolve("${Build.MANUFACTURER} ${Build.MODEL}".trim())
    } catch (e: Exception) {
      promise.reject("AUDIT_ERROR", e.message, e)
    }
  }

  /**
   * Snapshot of backup participation across installed apps, in the shape the
   * app posts to POST /v1/device/audit as audit_type "backup".
   */
  @ReactMethod
  fun collectBackupAudit(promise: Promise) {
    try {
      val pm = reactApplicationContext.packageManager
      val ownPackage = reactApplicationContext.packageName
      val apps = pm.getInstalledApplications(PackageManager.GET_META_DATA)

      data class Entry(
        val packageName: String,
        val label: String,
        val allowBackup: Boolean,
        val systemApp: Boolean,
        val targetSdk: Int,
      )

      val entries = ArrayList<Entry>(apps.size)
      var participating = 0
      var excluded = 0
      var userApps = 0

      for (info in apps) {
        // Our own app is not part of the device's backup posture.
        if (info.packageName == ownPackage) continue

        val isSystem = (info.flags and ApplicationInfo.FLAG_SYSTEM) != 0
        val isUpdatedSystem = (info.flags and ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) != 0
        if (!isSystem && !isUpdatedSystem) userApps++

        val allowBackup = (info.flags and ApplicationInfo.FLAG_ALLOW_BACKUP) != 0

        if (allowBackup) participating++ else excluded++

        val label = try {
          pm.getApplicationLabel(info).toString()
        } catch (e: Exception) {
          info.packageName
        }

        entries.add(
          Entry(
            packageName = info.packageName,
            label = label,
            allowBackup = allowBackup,
            systemApp = isSystem || isUpdatedSystem,
            targetSdk = info.targetSdkVersion,
          )
        )
      }

      entries.sortBy { it.label.lowercase() }

      val packages = Arguments.createArray()
      for (e in entries) {
        val map = Arguments.createMap()
        map.putString("package", e.packageName)
        map.putString("label", e.label)
        map.putBoolean("allow_backup", e.allowBackup)
        map.putBoolean("system_app", e.systemApp)
        map.putInt("target_sdk", e.targetSdk)
        packages.pushMap(map)
      }

      val counts = Arguments.createMap()
      counts.putInt("installed_total", entries.size)
      counts.putInt("user_apps", userApps)
      counts.putInt("participating", participating)
      counts.putInt("excluded", excluded)

      val snapshot = Arguments.createMap()
      snapshot.putString("os", "Android ${Build.VERSION.RELEASE} (SDK ${Build.VERSION.SDK_INT})")
      snapshot.putString("build_fingerprint", Build.FINGERPRINT)
      snapshot.putMap("counts", counts)
      snapshot.putArray("packages", packages)

      promise.resolve(snapshot)
    } catch (e: Exception) {
      promise.reject("AUDIT_ERROR", e.message, e)
    }
  }

  companion object {
    private const val PREFS_NAME = "rooted_audit"
    private const val KEY_DEVICE_ID = "audit_device_id"
  }
}
