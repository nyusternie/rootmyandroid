package com.rootmyandroid

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.BatteryManager
import android.os.Build
import android.os.StatFs
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

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

  /** Small key/value store (app-private SharedPreferences) — holds the
   * account number and the locally paired devices, so both survive a
   * restart without pulling in AsyncStorage (no new dependency; F-Droid
   * purity). */
  @ReactMethod
  fun getPref(key: String, promise: Promise) {
    try {
      promise.resolve(prefs.getString(key, null))
    } catch (e: Exception) {
      promise.reject("AUDIT_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun setPref(key: String, value: String, promise: Promise) {
    try {
      prefs.edit().putString(key, value).apply()
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("AUDIT_ERROR", e.message, e)
    }
  }

  /**
   * Battery health snapshot from the sticky ACTION_BATTERY_CHANGED broadcast
   * + BatteryManager. No permission required. Feeds the Tools "Health
   * monitor" row with real numbers instead of a promise of future trends.
   */
  @ReactMethod
  fun getHealth(promise: Promise) {
    try {
      val bm = reactApplicationContext.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
      val level = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
      val sticky = reactApplicationContext.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
      val tempTenths = sticky?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1) ?: -1
      val voltageMv = sticky?.getIntExtra(BatteryManager.EXTRA_VOLTAGE, -1) ?: -1
      val healthCode = sticky?.getIntExtra(BatteryManager.EXTRA_HEALTH, -1) ?: -1
      val health = when (healthCode) {
        BatteryManager.BATTERY_HEALTH_GOOD -> "good"
        BatteryManager.BATTERY_HEALTH_OVERHEAT -> "overheating"
        BatteryManager.BATTERY_HEALTH_DEAD -> "dead"
        BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE -> "over voltage"
        BatteryManager.BATTERY_HEALTH_COLD -> "cold"
        BatteryManager.BATTERY_HEALTH_UNSPECIFIED_FAILURE -> "failure"
        else -> "unknown"
      }
      val map = Arguments.createMap()
      map.putInt("level_percent", level)
      map.putDouble("temperature_c", if (tempTenths >= 0) tempTenths / 10.0 else -1.0)
      map.putInt("voltage_mv", voltageMv)
      map.putString("health", health)
      promise.resolve(map)
    } catch (e: Exception) {
      promise.reject("AUDIT_ERROR", e.message, e)
    }
  }

  /**
   * Encrypt a backup payload with an AES-256-GCM key held in the Android
   * Keystore (hardware-backed where the device provides it; the key is
   * non-exportable and never leaves the keystore). Output is
   * iv || ciphertext, base64-encoded, which is exactly what the API stores
   * in R2 — the server only ever sees ciphertext. Losing the keystore (app
   * uninstall, factory reset) makes the backup unrecoverable, which is what
   * the Backups copy states.
   */
  @ReactMethod
  fun encryptBackup(plaintext: String, promise: Promise) {
    try {
      val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
      val key: SecretKey = if (ks.containsAlias(KEY_ALIAS)) {
        (ks.getEntry(KEY_ALIAS, null) as KeyStore.SecretKeyEntry).secretKey
      } else {
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
          KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
          )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build(),
        )
        gen.generateKey()
      }
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.ENCRYPT_MODE, key)
      val ct = cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))
      val iv = cipher.iv
      val out = ByteArray(iv.size + ct.size)
      System.arraycopy(iv, 0, out, 0, iv.size)
      System.arraycopy(ct, 0, out, iv.size, ct.size)
      val map = Arguments.createMap()
      map.putString("data_b64", Base64.encodeToString(out, Base64.NO_WRAP))
      map.putInt("size_bytes", out.size)
      promise.resolve(map)
    } catch (e: Exception) {
      promise.reject("AUDIT_ERROR", e.message, e)
    }
  }

  /**
   * Real on-device storage figures for the data partition (StatFs on this
   * app's filesDir). No permission required — StatFs reports the filesystem
   * the app already lives on. Replaces the transplanted placeholder numbers
   * the Storage panels used to render (F-Droid gate 5: no mock literals in
   * a listing-facing screen).
   */
  @ReactMethod
  fun getStorage(promise: Promise) {
    try {
      val stat = StatFs(reactApplicationContext.filesDir.absolutePath)
      val total = stat.blockCountLong * stat.blockSizeLong
      val free = stat.availableBlocksLong * stat.blockSizeLong
      val map = Arguments.createMap()
      map.putDouble("total_bytes", total.toDouble())
      map.putDouble("free_bytes", free.toDouble())
      map.putDouble("used_bytes", (total - free).toDouble())
      promise.resolve(map)
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
    private const val KEY_ALIAS = "rma_backup_key"
  }
}
