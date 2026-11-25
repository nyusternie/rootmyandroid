/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

// The avatar's Animated.loop schedules a frame every ~16 ms forever; with
// real timers `act` keeps flushing those frames until the 5 s test timeout
// (measured on the CI runner 2026-11-25). Fake timers keep the loop parked.
jest.useFakeTimers();

test('renders correctly', async () => {
  let tree: ReactTestRenderer.ReactTestRenderer | null = null;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<App />);
  });
  // Unmount so the avatar's Animated.loop is stopped by its effect cleanup —
  // otherwise the timer keeps jest alive after the run.
  await ReactTestRenderer.act(() => {
    tree?.unmount();
  });
});
