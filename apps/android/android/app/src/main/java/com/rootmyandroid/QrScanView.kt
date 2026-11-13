package com.rootmyandroid

import android.content.Context
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executors

/**
 * Camera preview + QR decode view (owner request 2026-11-13 — "wire-up
 * qr scanning; we will use this to SYNC WITH WEB (ALT CLIENTS)").
 *
 * CameraX Preview feeds an ImageAnalysis stream through ML Kit's bundled
 * barcode scanner (QR format only). Decoded values are emitted to JS as
 * `onQrResult` DeviceEvents ({value: string}); repeats of the same value
 * are suppressed so the JS side doesn't flood. The camera binds to the
 * PROCESS lifecycle (a RN child view has no LifecycleOwner of its own)
 * and unbinds on detach.
 */
class QrScanView(context: Context) : PreviewView(context) {

  private val analysisExecutor = Executors.newSingleThreadExecutor()
  private val scanner =
    BarcodeScanning.getClient(
      BarcodeScannerOptions.Builder()
        .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
        .build(),
    )
  private var cameraProvider: ProcessCameraProvider? = null
  private var started = false
  private var lastEmitted: String? = null

  fun start() {
    if (started) return
    started = true
    val providerFuture = ProcessCameraProvider.getInstance(context)
    providerFuture.addListener({
      try {
        val provider = providerFuture.get()
        cameraProvider = provider
        val preview = Preview.Builder().build().also { it.surfaceProvider = surfaceProvider }
        val analysis =
          ImageAnalysis.Builder()
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build()
        analysis.setAnalyzer(analysisExecutor) { proxy ->
          val image = proxy.image
          if (image == null) {
            proxy.close()
            return@setAnalyzer
          }
          val input = InputImage.fromMediaImage(image, proxy.imageInfo.rotationDegrees)
          scanner
            .process(input)
            .addOnCompleteListener { result ->
              proxy.close()
              result.result.firstOrNull()?.rawValue?.let { value ->
                if (value != lastEmitted) {
                  lastEmitted = value
                  emitResult(value)
                }
              }
            }
        }
        provider.unbindAll()
        provider.bindToLifecycle(
          ProcessLifecycleOwner.get() as LifecycleOwner,
          CameraSelector.DEFAULT_BACK_CAMERA,
          preview,
          analysis,
        )
      } catch (e: Exception) {
        // Camera init can fail (no camera, device policy). The JS side
        // stays in its instruction state; nothing crashes the app.
        started = false
      }
    }, ContextCompat.getMainExecutor(context))
  }

  fun stop() {
    if (!started) return
    started = false
    try {
      cameraProvider?.unbindAll()
    } catch (_: Exception) {
      // unbind is best-effort during teardown.
    }
    lastEmitted = null
  }

  private fun emitResult(value: String) {
    (context as? ReactContext)
      ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      ?.emit(
        "onQrResult",
        Arguments.createMap().apply { putString("value", value) },
      )
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    start()
  }

  override fun onDetachedFromWindow() {
    stop()
    super.onDetachedFromWindow()
  }
}
