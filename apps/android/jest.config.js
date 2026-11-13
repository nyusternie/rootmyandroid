module.exports = {
  preset: '@react-native/jest-preset',
  // App.tsx imports ./global.css (NativeWind); jest can't parse css.
  // lottie-react-native is native-backed; tests only need a null stub.
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
