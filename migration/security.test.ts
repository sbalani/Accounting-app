import test from 'node:test';
import assert from 'node:assert/strict';
import { isSignedStorageUrl, fetchSignedStorageFile } from '../lib/utils/signed-storage-url';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://accounting-api.sharanbalani.com';
const url = 'https://accounting-api.sharanbalani.com/storage/v1/object/sign/statements/u/w/statement/a.csv?token=demo';

test('signed URL accepts only the configured HTTPS bucket and exact origin', () => {
  assert.equal(isSignedStorageUrl(url, 'statements'), true);
  for (const invalid of [
    'http://accounting-api.sharanbalani.com/storage/v1/object/sign/statements/a?token=x',
    'https://accounting-api.sharanbalani.com.evil.test/storage/v1/object/sign/statements/a?token=x',
    'https://accounting-api.sharanbalani.com@evil.test/storage/v1/object/sign/statements/a?token=x',
    'https://accounting-api.sharanbalani.com/storage/v1/object/sign/receipts/a?token=x',
    'https://accounting-api.sharanbalani.com/storage/v1/object/sign/statements/a',
    'http://127.0.0.1/admin',
  ]) assert.equal(isSignedStorageUrl(invalid, 'statements'), false);
});

test('rejects a caller URL before any outbound fetch', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (() => { throw new Error('must not fetch'); }) as typeof fetch;
  try { await assert.rejects(fetchSignedStorageFile('http://127.0.0.1/', 'statements', 3), /Invalid signed/); }
  finally { globalThis.fetch = original; }
});

test('rejects oversized streamed bodies without trusting content-length', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(new Uint8Array([1, 2, 3, 4]))) as typeof fetch;
  try { await assert.rejects(fetchSignedStorageFile(url, 'statements', 3), /too large/); }
  finally { globalThis.fetch = original; }
});
