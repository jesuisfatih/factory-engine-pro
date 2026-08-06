import assert from 'node:assert/strict';
import test from 'node:test';
import { AircallApiError, AircallClient } from './aircall.client.js';

const credentials = { apiId: 'api-id', apiToken: 'api-token' };

test('retries transient Aircall GET failures and returns the successful response', async () => {
  let calls = 0;
  const waits: number[] = [];
  const client = new AircallClient(credentials, {
    fetch: (async () => {
      calls += 1;
      if (calls === 1) return new Response('temporarily unavailable', { status: 503, headers: { 'retry-after': '0' } });
      return new Response(JSON.stringify({ calls: [{ id: 42 }] }), { status: 200 });
    }) as typeof fetch,
    sleep: async (delayMs) => { waits.push(delayMs); },
    random: () => 0,
  });

  const result = await client.listCalls({ page: 1, per_page: 50 });

  assert.equal(calls, 2);
  assert.deepEqual(waits, [0]);
  assert.deepEqual(result.calls, [{ id: 42 }]);
});

test('retries a transient Aircall network failure only for safe GET requests', async () => {
  let calls = 0;
  const client = new AircallClient(credentials, {
    fetch: (async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('socket closed');
      return new Response(JSON.stringify({ ping: 'pong' }), { status: 200 });
    }) as typeof fetch,
    sleep: async () => undefined,
    random: () => 0,
  });

  assert.deepEqual(await client.ping(), { ping: 'pong' });
  assert.equal(calls, 2);
});

test('does not retry Aircall dial POST requests', async () => {
  let calls = 0;
  const client = new AircallClient(credentials, {
    fetch: (async () => {
      calls += 1;
      return new Response('temporarily unavailable', { status: 503 });
    }) as typeof fetch,
    sleep: async () => undefined,
  });

  await assert.rejects(
    () => client.dialUser('usr_1', '+13125550100'),
    (error: unknown) => error instanceof AircallApiError && error.status === 503,
  );
  assert.equal(calls, 1);
});

test('does not retry credential failures', async () => {
  let calls = 0;
  const client = new AircallClient(credentials, {
    fetch: (async () => {
      calls += 1;
      return new Response('unauthorized', { status: 401 });
    }) as typeof fetch,
    sleep: async () => undefined,
  });

  await assert.rejects(
    () => client.listUsers(),
    (error: unknown) => error instanceof AircallApiError && error.status === 401,
  );
  assert.equal(calls, 1);
});
