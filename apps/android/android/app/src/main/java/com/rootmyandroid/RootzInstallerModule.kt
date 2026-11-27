// apps/android/android/app/src/main/java/com/rootmyandroid/RootzInstallerModule.kt
package com.rootmyandroid

import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Download & install Rootz (the separate relay app) from the project's
 * rolling preview release. Android does not allow a normal app to install
 * silently: the module downloads the APK, verifies the package name and the
 * pinned signer, then hands it to the system package installer for the
 * user's explicit confirmation.
 *
 * The signer pin is the current preview's Android Debug certificate
 * (SHA-256 2bf999d5…). A production Rootz build signed with the upload key
 * needs a new pin; the installed-app comparison is the fallback when the
 * pin is updated.
 */
class RootzInstallerModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "RootzInstallerModule"

  private val context get() = reactApplicationContext

  @ReactMethod
  fun getStatus(promise: Promise) {
    val result = Arguments.createMap()
    try {
      val info = context.packageManager.getPackageInfo(ROOTZ_PACKAGE, 0)
      result.putBoolean("installed", true)
      result.putString("versionName", info.versionName)
      result.putDouble("versionCode", versionCodeOf(info).toDouble())
    } catch (e: PackageManager.NameNotFoundException) {
      result.putBoolean("installed", false)
    }
    result.putBoolean(
      "canInstall",
      Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
        context.packageManager.canRequestPackageInstalls(),
    )
    promise.resolve(result)
  }

  @ReactMethod
  fun downloadAndInstall(promise: Promise) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
      !context.packageManager.canRequestPackageInstalls()
    ) {
      runCatching {
        context.startActivity(
          Intent(
            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:${context.packageName}"),
          ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
      }
      promise.reject(
        "INSTALL_PERMISSION",
        "Allow “Install unknown apps” for Root My Android, then tap Install Rootz again.",
      )
      return
    }

    Thread {
      try {
        val dir = File(context.cacheDir, "updates").apply { mkdirs() }
        val apk = File(dir, "rootz.apk")
        download(ROOTZ_APK_URL, apk)
        val downloadedVersion = verifyApk(apk)
        val installed = runCatching {
          context.packageManager.getPackageInfo(ROOTZ_PACKAGE, 0)
        }.getOrNull()
        if (installed != null) {
          val installedVersion = versionCodeOf(installed)
          if (downloadedVersion < installedVersion) {
            throw IllegalStateException(
              "The installed Rootz build is newer than this download. Uninstall the old Rootz app first, or wait for a newer release.",
            )
          }
        }
        val uri = FileProvider.getUriForFile(
          context,
          "${context.packageName}.fileprovider",
          apk,
        )
        context.startActivity(
          Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
          },
        )
        promise.resolve("Installer opened. Confirm the install on the phone.")
      } catch (e: Exception) {
        promise.reject("ROOTZ_INSTALL_ERROR", e.message, e)
      }
    }.start()
  }

  @ReactMethod
  fun openRootz(promise: Promise) {
    try {
      context.startActivity(
        Intent()
          .setClassName(ROOTZ_PACKAGE, "$ROOTZ_PACKAGE.MainActivity")
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      )
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("ROOTZ_OPEN_ERROR", e.message, e)
    }
  }

  private fun download(url: String, dest: File) {
    val conn = (URL(url).openConnection() as HttpURLConnection).apply {
      connectTimeout = 15_000
      readTimeout = 120_000
      instanceFollowRedirects = true
      setRequestProperty("User-Agent", "RootMyAndroid-Android")
    }
    try {
      val code = conn.responseCode
      if (code !in 200..299) throw IOException("Download failed (HTTP $code).")
      conn.inputStream.use { input ->
        dest.outputStream().use { output -> input.copyTo(output) }
      }
    } finally {
      conn.disconnect()
    }
  }

  /** Verify package + pinned signer; return the APK's versionCode. */
  private fun verifyApk(apk: File): Long {
    val pm = context.packageManager
    val info = archiveInfo(pm, apk.absolutePath)
      ?: throw IllegalStateException("The downloaded file is not a valid APK.")
    if (info.packageName != ROOTZ_PACKAGE) {
      throw IllegalStateException("The downloaded APK is not Rootz.")
    }
    val signer = if (Build.VERSION.SDK_INT >= 28) {
      val signing = info.signingInfo ?: throw IllegalStateException("The Rootz APK has no signer.")
      signing.apkContentsSigners.firstOrNull()
        ?: throw IllegalStateException("The Rootz APK has no signer.")
    } else {
      legacySigner(info)
        ?: throw IllegalStateException("The Rootz APK has no signer.")
    }
    val digest = MessageDigest.getInstance("SHA-256").digest(signer.toByteArray())
    val hex = digest.joinToString("") { "%02x".format(it) }
    if (hex != ROOTZ_SIGNER_SHA256) {
      throw IllegalStateException("Rootz signer mismatch — refusing to install.")
    }
    return versionCodeOf(info)
  }

  @Suppress("DEPRECATION")
  private fun versionCodeOf(info: PackageInfo): Long =
    if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()

  @Suppress("DEPRECATION")
  private fun legacySigner(info: PackageInfo): android.content.pm.Signature? =
    info.signatures?.firstOrNull()

  @Suppress("DEPRECATION")
  private fun archiveInfo(pm: PackageManager, path: String): PackageInfo? =
    if (Build.VERSION.SDK_INT >= 28) {
      pm.getPackageArchiveInfo(path, PackageManager.GET_SIGNING_CERTIFICATES)
    } else {
      pm.getPackageArchiveInfo(path, PackageManager.GET_SIGNATURES)
    }

  companion object {
    private const val ROOTZ_PACKAGE = "com.rootmyandroid.rootz"
    private const val ROOTZ_APK_URL =
      "https://github.com/nyusternie/rootmyandroid/releases/download/rootz-preview-apk/rootz.apk"

    /** Current preview APK: Android Debug cert (apksigner, 2026-11-26). */
    private const val ROOTZ_SIGNER_SHA256 =
      "2bf999d549eea615ca6762d6028b94e030502e1224a6bb8cb91c121b88a75ff8"
  }
}
