// apps/android/qr-scan-view.tsx — JS wrapper for the native camera view
// (QrScanView.kt / QrScanViewManager.kt). The view starts the camera on
// attach and emits `onQrResult` DeviceEvents; permission is requested
// separately through NativeModules.QrScan before this is mounted.
import { requireNativeComponent, type ViewProps } from 'react-native';

type QrScanViewProps = ViewProps;

export const RQrScanView = requireNativeComponent<QrScanViewProps>('RQrScanView');
