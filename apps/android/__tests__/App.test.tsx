/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

// Renders the whole App tree (navigation + every screen module), so the
// default 5000 ms jest timeout is not enough on a loaded CI box: measured
// 18.4 s on blackhost 2026-11-21 (run 44944675442) and the build failed on
// it. 30 s keeps the assertion identical and removes the load-dependent
// flake — the same commit passed the same step on an idle runner.
test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
}, 30000);
