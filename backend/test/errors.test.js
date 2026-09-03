// API error-envelope tests (the frontend contract + a security property).
//
// errors.js is self-contained (no SDK, no DB), so this is pure and offline.
// The security case matters: an unmapped failure must NOT leak its internal
// message (which could carry a connection string or key fragment) to the client.
//
//   npm test        (from backend/)

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { statusForCode, ApiError, toErrorResponse } = await import('../src/api/errors.js');

test('statusForCode maps each domain code to its HTTP status', () => {
  assert.equal(statusForCode('QUOTE_EXPIRED'), 409);
  assert.equal(statusForCode('BALANCE_EXCEEDED'), 400);
  assert.equal(statusForCode('NO_EXPIRY'), 404);
  assert.equal(statusForCode('NO_TIERS'), 404);
  assert.equal(statusForCode('NO_BUYABLE_CALLS'), 409);
  assert.equal(statusForCode('INVALID_REQUEST'), 400);
  assert.equal(statusForCode('UPSTREAM_ERROR'), 502);
  assert.equal(statusForCode('anything-unmapped'), 500);
});

test('NO_BUYABLE_CALLS maps to 409 and its message passes through to the client', () => {
  // The coded error quoteVault throws: a plain Error with a `code`. It must
  // reach the client as 409 with its own message, NOT the scrubbed generic one
  // reserved for unmapped failures - the interface needs the reason to tell the
  // user the book is thin for this asset rather than "something broke".
  const coded = Object.assign(
    new Error('quoteVault: no buyable ETH calls above spot right now'),
    { code: 'NO_BUYABLE_CALLS', asset: 'ETH' },
  );
  const { status, body } = toErrorResponse(coded);

  assert.equal(status, 409);
  assert.equal(body.error.code, 'NO_BUYABLE_CALLS');
  assert.equal(body.error.message, 'quoteVault: no buyable ETH calls above spot right now');
  assert.notEqual(body.error.message, 'The service could not complete this request.');
});

test('toErrorResponse maps a known coded error with its message and details', () => {
  const { status, body } = toErrorResponse(new ApiError('BALANCE_EXCEEDED', 'too much', { field: 'units' }));
  assert.equal(status, 400);
  assert.equal(body.error.code, 'BALANCE_EXCEEDED');
  assert.equal(body.error.message, 'too much');
  assert.deepEqual(body.error.details, { field: 'units' });
});

test('toErrorResponse omits details when there are none', () => {
  const { body } = toErrorResponse(new ApiError('NO_TIERS', 'none'));
  assert.equal('details' in body.error, false);
});

test('toErrorResponse never leaks an internal message for an unmapped error', () => {
  const leaky = new Error('postgres://user:password@host/db connection failed');
  const { status, body } = toErrorResponse(leaky);
  assert.equal(status, 502);
  assert.equal(body.error.code, 'UPSTREAM_ERROR');
  assert.equal(body.error.message, 'The service could not complete this request.');
  assert.ok(!body.error.message.includes('password'));   // the secret must not surface
});

test('toErrorResponse handles a thrown non-Error value without crashing', () => {
  const { status, body } = toErrorResponse('a bare string');
  assert.equal(status, 502);
  assert.equal(body.error.code, 'UPSTREAM_ERROR');
});
