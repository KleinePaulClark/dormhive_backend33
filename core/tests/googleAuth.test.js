import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import pool from '../config/database.js';
import { becomeOwner, googleAuthConfig, googleLogin, login, oauthStart } from '../controllers/authController.js';

function makeResponse() {
  return {
    statusCode: 200,
    headers: {},
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
}

test('Google config returns the public client ID without caching it', () => {
  const previousClientId = process.env.GOOGLE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_ID = 'google-client-id-for-test';
  const response = makeResponse();

  try {
    googleAuthConfig({}, response);
    assert.deepEqual(response.payload, { clientId: 'google-client-id-for-test' });
    assert.equal(response.headers['Cache-Control'], 'no-store');
  } finally {
    if (previousClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = previousClientId;
  }
});

test('Google config reports missing server configuration', () => {
  const previousClientId = process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_ID;
  const response = makeResponse();

  try {
    googleAuthConfig({}, response);
    assert.equal(response.statusCode, 503);
    assert.match(response.payload.message, /not configured/i);
  } finally {
    if (previousClientId !== undefined) process.env.GOOGLE_CLIENT_ID = previousClientId;
  }
});

test('Google OAuth asks the account chooser to appear after the sign-in button is clicked', () => {
  const previousClientId = process.env.GOOGLE_CLIENT_ID;
  const previousClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const previousApiUrl = process.env.API_URL;
  const previousJwtSecret = process.env.JWT_ACCESS_SECRET;
  process.env.GOOGLE_CLIENT_ID = 'google-client-id-for-test';
  process.env.GOOGLE_CLIENT_SECRET = 'google-client-secret-for-test';
  process.env.API_URL = 'https://api.example.test';
  process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
  const response = {
    cookie() {},
    redirect(url) {
      this.redirectUrl = url;
      return this;
    }
  };

  try {
    oauthStart({ params: { provider: 'google' }, query: { mode: 'login' } }, response);
    const authorizationUrl = new URL(response.redirectUrl);
    assert.equal(authorizationUrl.searchParams.get('prompt'), 'select_account');
    assert.equal(authorizationUrl.searchParams.get('response_type'), 'code');
  } finally {
    if (previousClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = previousClientId;
    if (previousClientSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
    else process.env.GOOGLE_CLIENT_SECRET = previousClientSecret;
    if (previousApiUrl === undefined) delete process.env.API_URL;
    else process.env.API_URL = previousApiUrl;
    if (previousJwtSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = previousJwtSecret;
  }
});

test('Google login rejects a credential Google cannot verify', async () => {
  const previousClientId = process.env.GOOGLE_CLIENT_ID;
  const previousVerifier = OAuth2Client.prototype.verifyIdToken;
  process.env.GOOGLE_CLIENT_ID = 'google-client-id-for-test';
  OAuth2Client.prototype.verifyIdToken = async () => {
    throw new Error('Invalid credential');
  };
  const response = makeResponse();

  try {
    await googleLogin({ body: { credential: 'invalid-google-token' } }, response, (error) => {
      throw error;
    });
    assert.equal(response.statusCode, 401);
    assert.match(response.payload.message, /invalid or expired/i);
  } finally {
    OAuth2Client.prototype.verifyIdToken = previousVerifier;
    if (previousClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = previousClientId;
  }
});

test('Google login rejects identities without a verified email', async () => {
  const previousClientId = process.env.GOOGLE_CLIENT_ID;
  const previousVerifier = OAuth2Client.prototype.verifyIdToken;
  process.env.GOOGLE_CLIENT_ID = 'google-client-id-for-test';
  OAuth2Client.prototype.verifyIdToken = async () => ({
    getPayload: () => ({ email: 'unverified@example.invalid', email_verified: false })
  });
  const response = makeResponse();

  try {
    await googleLogin({ body: { credential: 'google-token' } }, response, (error) => {
      throw error;
    });
    assert.equal(response.statusCode, 401);
    assert.match(response.payload.message, /verified google email/i);
  } finally {
    OAuth2Client.prototype.verifyIdToken = previousVerifier;
    if (previousClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = previousClientId;
  }
});

test('Google login creates a tenant account using the Google profile name', async () => {
  const previousClientId = process.env.GOOGLE_CLIENT_ID;
  const previousJwtSecret = process.env.JWT_ACCESS_SECRET;
  const previousVerifier = OAuth2Client.prototype.verifyIdToken;
  const profile = {
    email: 'new.user@example.com',
    email_verified: true,
    name: 'New User',
    given_name: 'New',
    family_name: 'User'
  };
  const users = [];
  process.env.GOOGLE_CLIENT_ID = 'google-client-id-for-test';
  process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
  const verifier = mock.method(OAuth2Client.prototype, 'verifyIdToken', async () => ({
    getPayload: () => profile
  }));
  const database = mock.method(pool, 'execute', async (sql, values) => {
    if (sql.includes('FROM users WHERE email = ? LIMIT 1')) {
      return [users.filter((user) => user.email === values[0]), []];
    }
    if (sql.startsWith('INSERT INTO users')) {
      const [name, first_name, last_name, username, email, password_hash, phone, role, status, verification_status] = values;
      users.push({
        id: 1,
        name,
        first_name,
        last_name,
        username,
        email,
        password_hash,
        phone,
        role,
        status,
        verification_status
      });
      return [{ insertId: 1 }, []];
    }
    if (sql.includes('FROM users WHERE id = ? LIMIT 1')) {
      return [users.filter((user) => user.id === values[0]).map(({ password_hash, ...user }) => user), []];
    }
    if (sql.startsWith('UPDATE users SET last_login_at')) return [{ affectedRows: 1 }, []];
    throw new Error(`Unexpected SQL in Google login test: ${sql}`);
  });
  const response = makeResponse();

  try {
    await googleLogin({ body: { credential: 'google-token' } }, response, (error) => {
      throw error;
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.user.name, 'New User');
    assert.equal(response.payload.user.first_name, 'New');
    assert.equal(response.payload.user.last_name, 'User');
    assert.equal(response.payload.user.role, 'tenant');
    assert.equal(response.payload.firstLogin, true);
    assert.equal(users.length, 1);
    assert.equal(users[0].status, 'active');
    assert.equal(users[0].verification_status, 'approved');
    assert.match(users[0].password_hash, /^\$2[aby]\$/);
    assert.ok(response.payload.accessToken);
  } finally {
    database.mock.restore();
    verifier.mock.restore();
    if (previousClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = previousClientId;
    if (previousJwtSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = previousJwtSecret;
  }
});

test('becoming an owner updates the account role and returns a matching access token', async () => {
  const previousJwtSecret = process.env.JWT_ACCESS_SECRET;
  process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
  const tenant = { id: 21, name: 'Taylor Example', role: 'tenant', status: 'active', verification_status: 'approved' };
  const database = mock.method(pool, 'execute', async (sql, values) => {
    if (sql.startsWith("UPDATE users SET role = 'owner'")) {
      assert.deepEqual(values, [tenant.id]);
      return [{ affectedRows: 1 }, []];
    }
    if (sql.includes('FROM users WHERE id = ? LIMIT 1')) {
      return [[{ ...tenant, role: 'owner' }], []];
    }
    throw new Error(`Unexpected SQL in owner promotion test: ${sql}`);
  });
  const response = makeResponse();

  try {
    await becomeOwner({ user: tenant }, response, (error) => {
      throw error;
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.user.role, 'owner');
    assert.ok(response.payload.accessToken);
  } finally {
    database.mock.restore();
    if (previousJwtSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = previousJwtSecret;
  }
});

test('becoming an owner rejects accounts that are not tenants', async () => {
  const response = makeResponse();

  await becomeOwner({ user: { role: 'admin' } }, response, (error) => {
    throw error;
  });

  assert.equal(response.statusCode, 403);
  assert.match(response.payload.message, /only tenant accounts/i);
});

test('password login marks only the first successful login as firstLogin', async () => {
  const previousJwtSecret = process.env.JWT_ACCESS_SECRET;
  process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
  const user = {
    id: 32,
    name: 'Taylor Example',
    email: 'taylor@example.com',
    username: 'taylor',
    password_hash: await bcrypt.hash('correct-password', 4),
    role: 'tenant',
    status: 'active',
    verification_status: 'approved',
    last_login_at: null
  };
  const database = mock.method(pool, 'execute', async (sql, values) => {
    if (sql.includes('FROM users WHERE email = ? LIMIT 1')) {
      return [values[0] === user.email ? [user] : [], []];
    }
    if (sql.startsWith('UPDATE users SET last_login_at')) {
      user.last_login_at = new Date().toISOString();
      return [{ affectedRows: 1 }, []];
    }
    if (sql.includes('FROM users WHERE id = ? LIMIT 1')) {
      const { password_hash, ...publicUser } = user;
      return [[publicUser], []];
    }
    throw new Error(`Unexpected SQL in first-login test: ${sql}`);
  });

  try {
    const firstResponse = makeResponse();
    await login({ body: { identifier: user.email, password: 'correct-password' } }, firstResponse, (error) => {
      throw error;
    });
    assert.equal(firstResponse.payload.firstLogin, true);

    const nextResponse = makeResponse();
    await login({ body: { identifier: user.email, password: 'correct-password' } }, nextResponse, (error) => {
      throw error;
    });
    assert.equal(nextResponse.payload.firstLogin, false);
  } finally {
    database.mock.restore();
    if (previousJwtSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = previousJwtSecret;
  }
});
