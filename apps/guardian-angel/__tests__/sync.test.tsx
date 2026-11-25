/**
 * The sync URL regression test.
 *
 * The app shipped for months posting to `/v1/guardian-angel/sync` — a path
 * the API has never routed, so every sync answered 404 and no phone could
 * pair (found 2026-11-25; fixed in 26.11.30). Nothing caught it because no
 * test looked at the request. This one does: the sync button must POST to
 * `/v1/guardian/sync` with the account digits and nothing else.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.useFakeTimers();

/** First node carrying a testID (the composite one: it owns the handlers). */
function byTestId(tree: ReactTestRenderer.ReactTestRenderer, id: string) {
  const found = tree.root.findAll((node) => (node.props as { testID?: string })?.testID === id);
  if (!found.length) throw new Error(`no node with testID="${id}"`);
  return found[0];
}

test('sync posts to /v1/guardian/sync with the raw digits', async () => {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    status: 201,
    json: async () => ({ ok: true, device_id: 'test-device-id' }),
  });
  (global as unknown as { fetch: unknown }).fetch = fetchMock;

  let tree: ReactTestRenderer.ReactTestRenderer | null = null;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<App />);
  });
  const root = tree as unknown as ReactTestRenderer.ReactTestRenderer;

  // Spaces are allowed in the field; only the digits go over the wire.
  await ReactTestRenderer.act(() => {
    byTestId(root, 'account-input').props.onChangeText('0711 4655 4856 8044');
  });
  await ReactTestRenderer.act(async () => {
    await byTestId(root, 'sync-button').props.onPress();
  });

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('https://rootmyandroid.com/v1/guardian/sync');
  expect(init.method).toBe('POST');
  expect(init.headers).toEqual({ 'content-type': 'application/json' });
  expect(JSON.parse(init.body)).toEqual({
    account_number: '0711465548568044',
    device_name: null,
  });

  await ReactTestRenderer.act(() => {
    root.unmount();
  });
});
