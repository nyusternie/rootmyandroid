package com.rootmyandroid

import android.content.Context
import android.util.Log
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

  companion object {
    private const val TAG = "QrScanView"
    private const val WATCHDOG_MS = 6000L

    /** Pure luminance-array rotation, 90° clockwise. Top-level so it is
     *  unit-testable without Android classes. */
    fun rotate90(src: ByteArray, width: Int, height: Int): ByteArray {
      val dst = ByteArray(src.size)
      for (row in 0 until height) {
        for (col in 0 until width) {
          dst[col * height + (height - 1 - row)] = src[row * width + col]
        }
      }
      return dst
    }

    /** Pure luminance-array rotation, 180°. */
    fun rotate180(src: ByteArray, width: Int, height: Int): ByteArray {
      val dst = ByteArray(src.size)
      val n = src.size
      for (i in 0 until n) {
        dst[i] = src[n - 1 - i]
      }
      return dst
    }
  }

  // COMPATIBLE (TextureView) is REQUIRED here: default PERFORMANCE mode
  // (SurfaceView) never delivered a usable surface inside this React Native
  // view hierarchy — the camera device opened (onOpened) but session
  // configuration hung exactly 5000 ms, every time (CameraX's watchdog:
  // "ListFuture ... is not done within 5000 ms" → "Resetting Capture
  // Session" loop, measured on redfin 2026-11-15). TextureView inside the
  // normal view tree gives CameraX a valid surface immediately.
  private val previewView = PreviewView(context).also {
    it.implementationMode = PreviewView.ImplementationMode.COMPATIBLE
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
  private var frameCount = 0L
  private var rebindingWithoutPreview = false
  private var bindGeneration = 0L

  fun start() {
    if (started) return
    started = true
    // Bind on the FIRST layout pass (post{}), not from onAttachedToWindow:
    // at attach time the view has zero size and the preview surface does not
    // exist yet — measured on redfin 2026-11-15, binding from attach left the
    // session-configure future hanging (CameraX 5 s watchdog → "Resetting
    // Capture Session" loop, with BOTH SurfaceView and TextureView modes).
    post { bindCamera() }
    // Self-healing watchdog: decode is the contract; the preview image is
    // cosmetic. If no frames arrive within 6 s (preview-surface stalls
    // inside RN's view tree), rebind with ImageAnalysis only — that path has
    // no external surface dependency and configures reliably.
    postDelayed({
      if (started && frameCount == 0L) {
        Log.w(TAG, "no frames 6s after bind — rebinding without preview")
        rebindingWithoutPreview = true
        try {
          cameraProvider?.unbindAll()
        } catch (_: Exception) {
          // best-effort
        }
        bindCamera()
      }
    }, WATCHDOG_MS)
  }

  private fun bindCamera() {
    if (!started) return
    // Each bind bumps the generation; a stale getInstance() listener that
    // resolves after a newer bind (watchdog rebind) must not run.
    val generation = ++bindGeneration
    val providerFuture = ProcessCameraProvider.getInstance(context)
    providerFuture.addListener({
      if (generation != bindGeneration) return@addListener
      try {
        val provider = providerFuture.get()
        cameraProvider = provider
        val preview = Preview.Builder().build().also { it.surfaceProvider = previewView.surfaceProvider }
        val analysis =
          ImageAnalysis.Builder()
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build()
        analysis.setAnalyzer(analysisExecutor) { proxy ->
          frameCount++
          if (frameCount % 30L == 0L) {
            Log.d(TAG, "frames=$frameCount ${proxy.width}x${proxy.height} lastDecoded=$lastEmitted")
          }
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
            // ImageAnalysis buffers arrive in SENSOR orientation; CameraX
            // rotates the PREVIEW stream for display but does NOT rotate
            // analysis buffers. Without this compensation a portrait-held
            // phone (redfin: rotationDegrees=90) feeds ZXing a sideways
            // QR that it can never decode (measured 2026-11-15: frames
            // streamed, zero decodes, no exceptions).
            val rotation = proxy.imageInfo.rotationDegrees
            val (rotated, rw, rh) = when (rotation) {
              90 -> Triple(rotate90(yBytes, width, height), height, width)
              180 -> Triple(rotate180(yBytes, width, height), width, height)
              270 -> Triple(rotate90(rotate180(yBytes, width, height), width, height), height, width)
              else -> Triple(yBytes, width, height)
            }
            val source = PlanarYUVLuminanceSource(rotated, rw, rh, 0, 0, rw, rh, false)
            // Frame forensics (over adb): overwrite the latest ANALYZED
            // luminance array as a PGM so the host can decode what the
            // camera actually delivered. External files dir → pull with:
            // adb pull /sdcard/Android/data/com.rootmyandroid/files/qr-frame.pgm
            if (frameCount % 300L == 0L) {
              try {
                java.io.File(context.getExternalFilesDir(null), "qr-frame.pgm").writeBytes(
                  "P5\n$rw $rh\n255\n".toByteArray() + rotated,
                )
              } catch (_: Exception) {
                // diagnostics only — never break the scan loop
              }
            }
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
                Log.d(TAG, "decoded: $value")
                lastEmitted = value
                emitResult(value)
              }
            }
          } catch (e: Exception) {
            // Frame errors (format surprises, buffer races) never crash
            // the app; the next frame tries again. Logged so the scan
            // path stays debuggable over adb.
            Log.w(TAG, "analyzer frame error", e)
          } finally {
            proxy.close()
          }
        }
        provider.unbindAll()
        if (rebindingWithoutPreview) {
          provider.bindToLifecycle(
            ProcessLifecycleOwner.get() as LifecycleOwner,
            CameraSelector.DEFAULT_BACK_CAMERA,
            analysis,
          )
          Log.d(TAG, "camera bound (back, analysis-only fallback)")
        } else {
          provider.bindToLifecycle(
            ProcessLifecycleOwner.get() as LifecycleOwner,
            CameraSelector.DEFAULT_BACK_CAMERA,
            preview,
            analysis,
          )
          Log.d(TAG, "camera bound (back, preview+analysis)")
        }
      } catch (e: Exception) {
        // Camera init can fail (no camera, device policy). The JS side
        // stays in its instruction state; nothing crashes the app.
        Log.w(TAG, "camera bind failed", e)
        started = false
      }
    }, ContextCompat.getMainExecutor(context))
  }

  fun stop() {
    if (!started) return
    started = false
    removeCallbacks(null)
    try {
      cameraProvider?.unbindAll()
    } catch (_: Exception) {
      // unbind is best-effort during teardown.
    }
    lastEmitted = null
    rebindingWithoutPreview = false
    frameCount = 0L
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
