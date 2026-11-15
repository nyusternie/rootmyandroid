package com.rootmyandroid

import android.content.Context
import android.widget.FrameLayout
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.NotFoundException
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import java.util.concurrent.Executors

/**
 * Camera preview + QR decode view (owner request 2026-11-13 — "wire-up
 * qr scanning; we will use this to SYNC WITH WEB (ALT CLIENTS)").
 *
 * CameraX Preview feeds an ImageAnalysis stream (YUV_420_888) through a
 * ZXing MultiFormatReader restricted to QR codes. ZXing core is Apache-2.0
 * and builds from source; the original ML Kit choice was a closed-source
 * Google AAR and would have failed F-Droid review (owner ruling
 * 2026-11-13: swap to ZXing; sidecoin removed vision-camera/MLKit for the
 * same reason). Decoded values are emitted to JS as `onQrResult`
 * DeviceEvents ({value: string}); repeats of the same value are suppressed
 * so the JS side doesn't flood. The camera binds to the PROCESS lifecycle
 * (a RN child view has no LifecycleOwner of its own) and unbinds on
 * detach.
 *
 * Note: CameraX 1.4's PreviewView is final, so this container is a
 * FrameLayout wrapping a full-size PreviewView child.
 */
class QrScanView(context: Context) : FrameLayout(context) {

  private val previewView = PreviewView(context).also {
    addView(it, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  private val analysisExecutor = Executors.newSingleThreadExecutor()
  private val reader = MultiFormatReader()
  private val hints =
    mapOf(
      DecodeHintType.POSSIBLE_FORMATS to listOf(BarcodeFormat.QR_CODE),
      DecodeHintType.TRY_HARDER to java.lang.Boolean.TRUE,
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
        val preview = Preview.Builder().build().also { it.surfaceProvider = previewView.surfaceProvider }
        val analysis =
          ImageAnalysis.Builder()
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build()
        analysis.setAnalyzer(analysisExecutor) { proxy ->
          try {
            // Y plane of YUV_420_888; rows are typically padded
            // (rowStride >= width), so copy row by row into a tightly
            // packed luminance array for ZXing.
            val plane = proxy.planes[0]
            val buffer = plane.buffer
            val width = proxy.width
            val height = proxy.height
            val rowStride = plane.rowStride
            val yBytes = ByteArray(width * height)
            for (row in 0 until height) {
              buffer.position(row * rowStride)
              buffer.get(yBytes, row * width, width)
            }
            val source = PlanarYUVLuminanceSource(yBytes, width, height, 0, 0, width, height, false)
            val result =
              try {
                // decode() sets hints then decodes; reset() per frame per
                // MultiFormatReader's decodeWithState contract.
                reader.decode(BinaryBitmap(HybridBinarizer(source)), hints)
              } catch (_: NotFoundException) {
                // No QR code in this frame — normal.
                null
              } finally {
                reader.reset()
              }
            result?.text?.let { value ->
              if (value != lastEmitted) {
                lastEmitted = value
                emitResult(value)
              }
            }
          } catch (_: Exception) {
            // Frame errors (format surprises, buffer races) never crash
            // the app; the next frame tries again.
          } finally {
            proxy.close()
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
