/**
 * The synced card must show the stored device id (added 2026-11-25 so
 * support can match a phone against the /guardian device list).
 *
 * uiautomator cannot read the screen any more — the Lottie pulse never
 * idles — so the wiring is pinned here instead.
 *
 * App.tsx destructures NativeModules at module load, so the mock must be
 * installed BEFORE the module is required (hence the require below).
 *
 * @format
 */

import React from 'react';
import { NativeModules } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

jest.useFakeTimers();

const DEVICE_ID = '8e2c2b1b-a98b-4cea-a3ad-c9f3821dbb2b';

test('the synced card shows the stored device id', async () => {
  (NativeModules as unknown as { SyncStore: unknown }).SyncStore = {
    getSync: () =>
      Promise.resolve({ accountNumber: '0711465548568044', deviceId: DEVICE_ID }),
    getDeviceName: () => Promise.resolve('Google Pixel 5'),
    saveSync: () => Promise.resolve(true),
  };

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const App = require('../App').default;

  let tree: ReactTestRenderer.ReactTestRenderer | null = null;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<App />);
  });
  // Let the mount-time getSync() promise resolve and re-render.
  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
  });

  const root = tree as unknown as ReactTestRenderer.ReactTestRenderer;
  const texts = root.root
    .findAll((node) => typeof node.type === 'string' && node.type === 'Text')
    .flatMap((node) => node.children)
    .filter((child): child is string => typeof child === 'string');

  expect(texts).toContain('Device id');
  expect(texts).toContain(DEVICE_ID);
  // JSX splits "•••• {last4}" into two children.
  expect(texts.join('')).toContain('•••• 8044');

  await ReactTestRenderer.act(() => {
    root.unmount();
  });
});
