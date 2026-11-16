package com.rootmyandroid

import android.content.Context
import android.graphics.SurfaceTexture
import android.util.Log
import android.view.Surface
import android.view.TextureView
import android.widget.FrameLayout
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.core.SurfaceRequest
import androidx.camera.lifecycle.ProcessCameraProvider
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
 * PREVIEW — manual TextureView hand-off (NOT PreviewView): on redfin,
 * PreviewView's surface negotiation hung CameraX's session-configure
 * future at exactly 5000 ms on EVERY open, in BOTH SurfaceView and
 * TextureView implementation modes, bound from attach AND after layout
 * (measured 2026-11-15, CI builds 249c9d4/249f50d/9402258 — the classic
 * "ListFuture ... is not done within 5000 ms" watchdog loop). The scanner
 * pattern used here instead: a plain TextureView whose SurfaceTexture is
 * handed DIRECTLY to the Preview use case's SurfaceRequest the moment it
 * becomes available. If the texture never arrives (RN Modal quirks), the
 * 6 s watchdog rebinds ImageAnalysis-only — decode keeps working, the
 * panel stays black, and the log says so.
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

  // COMPATIBLE (TextureView) rendering; the surface hand-off is manual
  // (see class doc).
  private val textureView = TextureView(context).also {
    it.surfaceTextureListener = textureListener
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

  // Manual preview surface plumbing.
  private var previewRequest: SurfaceRequest? = null
  private var previewSurface: Surface? = null

  private val textureListener = object : TextureView.SurfaceTextureListener {
    override fun onSurfaceTextureAvailable(st: SurfaceTexture, width: Int, height: Int) {
      Log.d(TAG, "surface texture available ${width}x$height")
      deliverSurface()
    }

    override fun onSurfaceTextureSizeChanged(st: SurfaceTexture, width: Int, height: Int) {}

    override fun onSurfaceTextureDestroyed(st: SurfaceTexture): Boolean {
      Log.d(TAG, "surface texture destroyed")
      previewSurface?.release()
      previewSurface = null
      previewRequest = null
      return true
    }

    override fun onSurfaceTextureUpdated(st: SurfaceTexture) {}
  }

  init {
    // Kick CameraX from the first layout pass — binding from
    // onAttachedToWindow raced the layout on redfin (zero-size view).
    post { bindCamera() }
  }

  fun start() {
    if (started) return
    started = true
    // Self-healing watchdog: decode is the contract; the preview image is
    // cosmetic. If no frames arrive within 6 s, rebind with ImageAnalysis
    // only — that path has no surface dependency and configures reliably
    // (measured: it streams at ~15 fps).
    postDelayed({
      if (started && frameCount == 0L) {
        Log.w(TAG, "no frames 6s after bind — rebinding without preview")
        rebindingWithoutPreview = true
        previewRequest = null
        try {
          cameraProvider?.unbindAll()
        } catch (_: Exception) {
          // best-effort
        }
        bindCamera()
      }
    }, WATCHDOG_MS)
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
    previewRequest = null
    previewSurface?.release()
    previewSurface = null
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
          val preview = Preview.Builder().build()
          preview.setSurfaceProvider { request ->
            Log.d(TAG, "preview surface requested ${request.resolution.width}x${request.resolution.height}")
            previewRequest = request
            deliverSurface()
          }
          provider.bindToLifecycle(
            ProcessLifecycleOwner.get() as LifecycleOwner,
            CameraSelector.DEFAULT_BACK_CAMERA,
            preview,
            analysis,
          )
          Log.d(TAG, "camera bound (back, preview+analysis, manual surface)")
        }
      } catch (e: Exception) {
        // Camera init can fail (no camera, device policy). The JS side
        // stays in its instruction state; nothing crashes the app.
        Log.w(TAG, "camera bind failed", e)
        started = false
      }
    }, ContextCompat.getMainExecutor(context))
  }

  /** Hand the TextureView's SurfaceTexture to the pending Preview
   *  SurfaceRequest — whichever becomes ready first. */
  private fun deliverSurface() {
    val request = previewRequest ?: return
    val st = textureView.surfaceTexture ?: return
    previewRequest = null
    try {
      st.setDefaultBufferSize(request.resolution.width, request.resolution.height)
      val surface = Surface(st)
      previewSurface = surface
      request.provideSurface(surface, ContextCompat.getMainExecutor(context)) { result ->
        if (result.resultCode != SurfaceRequest.Result.RESULT_SURFACE_USED_SUCCESSFULLY) {
          Log.w(TAG, "preview surface rejected: ${result.resultCode}")
        }
      }
      Log.d(TAG, "preview surface delivered ${request.resolution.width}x${request.resolution.height}")
    } catch (e: Exception) {
      Log.w(TAG, "preview surface delivery failed", e)
    }
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
