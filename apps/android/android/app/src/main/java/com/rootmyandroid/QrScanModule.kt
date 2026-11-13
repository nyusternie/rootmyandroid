package com.rootmyandroid

import android.Manifest
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener

/**
 * Camera permission gate for the QR scanner (owner request 2026-11-13 —
 * the QR icon's wire-up; pairing with web / alt clients comes later).
 * Only asks for CAMERA; the preview + decode live in QrScanView.
 */
class QrScanModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), PermissionListener {

  override fun getName() = "QrScan"

  private var pendingPermission: Promise? = null

  @ReactMethod
  fun requestCameraPermission(promise: Promise) {
    val activity = currentActivity
    if (activity == null) {
      promise.reject("E_NO_ACTIVITY", "No foreground activity to host the permission dialog.")
      return
    }
    if (
      ContextCompat.checkSelfPermission(activity, Manifest.permission.CAMERA) ==
      PackageManager.PERMISSION_GRANTED
    ) {
      promise.resolve(true)
      return
    }
    pendingPermission = promise
    (activity as PermissionAwareActivity).requestPermissions(
      arrayOf(Manifest.permission.CAMERA),
      PERMISSION_REQUEST_CODE,
      this,
    )
  }

  @ReactMethod
  fun isCameraPermissionGranted(promise: Promise) {
    val activity = currentActivity
    if (activity == null) {
      promise.resolve(false)
      return
    }
    promise.resolve(
      ContextCompat.checkSelfPermission(activity, Manifest.permission.CAMERA) ==
        PackageManager.PERMISSION_GRANTED,
    )
  }

  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<out String>,
    grantResults: IntArray,
  ): Boolean {
    if (requestCode != PERMISSION_REQUEST_CODE) return false
    val granted = grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
    pendingPermission?.resolve(granted)
    pendingPermission = null
    return true
  }

  companion object {
    const val PERMISSION_REQUEST_CODE = 9001
  }
}
