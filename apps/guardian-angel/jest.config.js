module.exports = {
  preset: '@react-native/jest-preset',
  // SafeAreaProvider renders nothing without native insets (see the file).
  setupFiles: ['<rootDir>/jest.setup.js'],
  // Rendering App pulls in nativewind's css-interop runtime; on the 2-core
  // CI runner the first render needs ~5 s, which is exactly jest's default
  // timeout (measured 2026-11-25 — the sync test timed out there and the
  // worker then hung on the React test renderer's leftover timers).
  testTimeout: 30000,
  forceExit: true,
  // App.tsx imports ./global.css (NativeWind); jest can't parse css.
  // lottie-react-native is native-backed; tests only need a null stub
  // (same pattern as apps/android).
  moduleNameMapper: {
    '\\.css$': '<rootDir>/jest-css-stub.js',
    'lottie-react-native$': '<rootDir>/jest-lottie-stub.js',
  },
  // jsxImportSource: 'nativewind' pulls react-native-css-interop into the
  // JSX runtime; it ships raw JSX (doctor.native.js) and must be transformed.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|nativewind|react-native-css-interop)/)',
  ],
};
