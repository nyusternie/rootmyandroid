/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

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
