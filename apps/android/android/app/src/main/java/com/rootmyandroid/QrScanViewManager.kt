package com.rootmyandroid

import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewGroupManager

/** ViewManager for [QrScanView] — JS name `RQrScanView`. */
class QrScanViewManager : ViewGroupManager<QrScanView>() {
  override fun getName() = "RQrScanView"

  override fun createViewInstance(reactContext: ThemedReactContext): QrScanView =
    QrScanView(reactContext)

  override fun onDropViewInstance(view: QrScanView) {
    view.stop()
    super.onDropViewInstance(view)
  }
}
