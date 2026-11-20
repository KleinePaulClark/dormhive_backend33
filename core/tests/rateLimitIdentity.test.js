import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import { createAuthenticatedRateLimiter, identifyRateLimitUser } from '../middleware/rateLimitIdentity.js';

const secret = 'rate-limit-test-secret';
process.env.JWT_ACCESS_SECRET = secret;

test('authenticated users have separate request limits even from the same IP', async (context) => {
  const app = express();
  app.use(identifyRateLimitUser);
  app.use(createAuthenticatedRateLimiter({ windowMs: 60_000, limit: 1 }));
  app.get('/', (_request, response) => response.sendStatus(200));

  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  const address = server.address();
  const requestAs = (userId) => fetch(`http://127.0.0.1:${address.port}/`, {
    headers: { Authorization: `Bearer ${jwt.sign({ sub: userId }, secret)}` }
  });

  const sameUserResponses = await Promise.all([requestAs('user-a'), requestAs('user-a')]);
  const statuses = await Promise.all(sameUserResponses.map(async (response) => {
    await response.text();
    return response.status;
  }));
  assert.deepEqual(statuses.sort(), [200, 429]);

  const otherUserResponse = await requestAs('user-b');
  await otherUserResponse.text();
  assert.equal(otherUserResponse.status, 200);
});

test('invalid bearer tokens do not receive a user-specific rate-limit identity', () => {
  const request = { headers: { authorization: 'Bearer invalid-token' }, rateLimitUserId: 'stale' };
  let nextCalled = false;

  identifyRateLimitUser(request, {}, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(request.rateLimitUserId, null);
});
