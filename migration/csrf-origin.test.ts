import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { middleware, isAllowedRequestOrigin } from '../middleware';

const app = 'https://accounting.sharanbalani.com';

test('unsafe requests require exact app Origin, not a same-site sibling or text/plain loophole', async () => {
  process.env.NEXT_PUBLIC_APP_URL = app;
  // No backend settings: a 403 proves the guard ran before Supabase setup.
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const request = new NextRequest(`${app}/api/payment-methods`, {
    method: 'POST',
    headers: {
      Origin: 'https://unrelated.sharanbalani.com',
      'Content-Type': 'text/plain',
      Cookie: 'synthetic-session=not-a-real-credential',
    },
    body: JSON.stringify({ name: 'synthetic account' }),
  });
  const response = await middleware(request);
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('same-origin browser POST passes the guard into the existing middleware path', async () => {
  process.env.NEXT_PUBLIC_APP_URL = app;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.invalid';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'synthetic-public-key';
  const response = await middleware(new NextRequest(`${app}/api/payment-methods`, {
    method: 'POST', headers: { Origin: app, 'Content-Type': 'text/plain' },
    body: JSON.stringify({ name: 'synthetic account' }),
  }));
  assert.equal(response.status, 200);
});

test('missing, null, malformed and forged Origins fail closed for all unsafe methods', () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    for (const origin of [null, 'null', 'not-a-url', 'https://unrelated.sharanbalani.com',
      'https://accounting.sharanbalani.com.evil.test', `${app}/path`, `${app}/`,
      'http://accounting.sharanbalani.com', 'https://user@accounting.sharanbalani.com']) {
      assert.equal(isAllowedRequestOrigin(method, origin, app), false, `${method}: ${origin}`);
    }
    assert.equal(isAllowedRequestOrigin(method, app, app), true);
    assert.equal(isAllowedRequestOrigin(method, app, undefined), false);
  }
});

test('safe methods, including auth callback GET and health GET, need no Origin', () => {
  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    assert.equal(isAllowedRequestOrigin(method, null, undefined), true);
  }
  assert.equal(isAllowedRequestOrigin('POST', 'http://localhost:3000', 'http://localhost:3000'), true);
  assert.equal(isAllowedRequestOrigin('POST', 'http://unrelated.sharanbalani.com',
    'http://unrelated.sharanbalani.com'), false);
});
