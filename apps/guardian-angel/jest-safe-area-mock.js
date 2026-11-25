// jest-safe-area-mock.js — the safe-area mock used by jest.setup.js.
//
// SafeAreaProvider renders nothing until the native side reports insets;
// under jest that never happens, so every test saw an empty tree (found
// 2026-11-25 while writing the sync-URL regression test). The library's
// own mock lacks `displayName`, which nativewind's css-interop reads when
// it patches the module — so this supplies plain components WITH
// displayNames and zero insets.
const React = require('react');

const SafeAreaProvider = ({ children }) => React.createElement('View', null, children);
SafeAreaProvider.displayName = 'SafeAreaProvider';

const SafeAreaView = ({ children, edges, ...props }) =>
  React.createElement('View', props, children);
SafeAreaView.displayName = 'SafeAreaView';

module.exports = {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaInsetsContext: React.createContext({ top: 0, bottom: 0, left: 0, right: 0 }),
  initialWindowMetrics: { insets: { top: 0, bottom: 0, left: 0, right: 0 } },
};
