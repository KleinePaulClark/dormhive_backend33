import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../config/database.js';
import { deleteOwnAccount } from '../controllers/userController.js';

function makeResponse() {
  return {
    statusCode: 200,
    payload: null,
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    }
  };
}

test('account deletion permanently removes signed-in tenant and owner accounts', async () => {
  const database = mock.method(pool, 'execute', async (sql, values) => {
    assert.equal(sql, 'DELETE FROM users WHERE id = ?');
    assert.ok([42, 43].includes(values[0]));
    return [{ affectedRows: 1 }, []];
  });

  try {
    for (const user of [{ id: 42, role: 'tenant' }, { id: 43, role: 'owner' }]) {
      const response = makeResponse();
      await deleteOwnAccount(
        { params: { id: String(user.id) }, user },
        response,
        (error) => { throw error; }
      );
      assert.equal(response.statusCode, 204);
      assert.equal(response.ended, true);
    }
    assert.equal(database.mock.callCount(), 2);
  } finally {
    database.mock.restore();
  }
});

test('account deletion rejects requests for another account or an admin account', async () => {
  const database = mock.method(pool, 'execute', async () => {
    throw new Error('Deletion should not reach the database.');
  });

  try {
    const otherAccountResponse = makeResponse();
    await deleteOwnAccount(
      { params: { id: '43' }, user: { id: 42, role: 'tenant' } },
      otherAccountResponse,
      (error) => { throw error; }
    );
    assert.equal(otherAccountResponse.statusCode, 403);

    const adminResponse = makeResponse();
    await deleteOwnAccount(
      { params: { id: '42' }, user: { id: 42, role: 'admin' } },
      adminResponse,
      (error) => { throw error; }
    );
    assert.equal(adminResponse.statusCode, 403);
    assert.equal(database.mock.callCount(), 0);
  } finally {
    database.mock.restore();
  }
});
