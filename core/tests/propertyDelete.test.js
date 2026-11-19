import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch {
  // dotenv is optional in test execution when env already exists.
}

const { default: pool } = await import('../config/database.js');

const connectionConfig = {
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: Number(process.env.DATABASE_PORT ?? 3306),
  user: process.env.DATABASE_USER ?? 'root',
  password: process.env.DATABASE_PASSWORD ?? '',
  database: process.env.DATABASE_NAME ?? 'dormhive_restore'
};

after(async () => pool.end());

async function createTestOwner(connection) {
  const email = `owner-delete-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  const [result] = await connection.execute(
    'INSERT INTO users (name, email, password_hash, role, status, phone) VALUES (?, ?, ?, ?, ?, ?)',
    [`Owner ${Date.now()}`, email, 'hashed-pass', 'owner', 'active', '09170000000']
  );
  return { id: result.insertId, email };
}

async function createProperty(connection, ownerId) {
  const title = `Delete Test Property ${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const [result] = await connection.execute(
    `INSERT INTO properties (owner_id, title, address, municipality, monthly_rent, max_occupants, available_slots, gender_preference, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved')`,
    [ownerId, title, '123 Test Street', 'Quezon City', 15000, 4, 2, 'co-ed']
  );
  return { id: result.insertId, title };
}

async function createBooking(connection, propertyId, tenantId, ownerId) {
  const [result] = await connection.execute(
    'INSERT INTO bookings (property_id, tenant_id, owner_id, move_in_date, occupants, status) VALUES (?, ?, ?, ?, ?, ?)',
    [propertyId, tenantId, ownerId, '2025-01-01', 1, 'pending']
  );
  return result.insertId;
}

test('property deletion removes dependent bookings before deleting the property', async () => {
  const connection = await mysql.createConnection(connectionConfig);
  const createdUserIds = [];
  let propertyId;

  try {
    const owner = await createTestOwner(connection);
    createdUserIds.push(owner.id);
    const [tenantResult] = await connection.execute(
      'INSERT INTO users (name, email, password_hash, role, status, phone) VALUES (?, ?, ?, ?, ?, ?)',
      [`Tenant ${Date.now()}`, `tenant-delete-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`, 'hashed-pass', 'tenant', 'active', '09170000001']
    );
    createdUserIds.push(tenantResult.insertId);
    const property = await createProperty(connection, owner.id);
    propertyId = property.id;
    await createBooking(connection, property.id, tenantResult.insertId, owner.id);

    const [rowsBeforeDelete] = await connection.execute('SELECT id FROM bookings WHERE property_id = ?', [property.id]);
    assert.equal(rowsBeforeDelete.length, 1);

    const { remove } = await import('../models/Property.js');
    await remove(property.id);

    const [remainingBookings] = await connection.execute('SELECT id FROM bookings WHERE property_id = ?', [property.id]);
    const [remainingProperty] = await connection.execute('SELECT id FROM properties WHERE id = ?', [property.id]);

    assert.equal(remainingBookings.length, 0);
    assert.equal(remainingProperty.length, 0);
  } finally {
    try {
      if (propertyId) {
        await connection.execute('DELETE FROM bookings WHERE property_id = ?', [propertyId]);
        await connection.execute('DELETE FROM properties WHERE id = ?', [propertyId]);
      }
      if (createdUserIds.length) {
        const placeholders = createdUserIds.map(() => '?').join(', ');
        await connection.execute(`DELETE FROM users WHERE id IN (${placeholders})`, createdUserIds);
      }
    } finally {
      await connection.end();
    }
  }
});

test('property creation uses its category without a primary room type column', async () => {
  const connection = await mysql.createConnection(connectionConfig);
  const owner = await createTestOwner(connection);
  let propertyId;

  try {
    const { create } = await import('../models/Property.js');
    const property = await create(owner.id, {
      title: `Category Test Property ${Date.now()}`,
      address: '456 Test Street',
      municipality: 'Quezon City',
      propertyCategory: 'bedspace',
      monthlyRent: 12000,
      rentalArrangement: 'shared',
      maxOccupants: 4,
      totalSlots: 2
    });
    propertyId = property.id;

    assert.equal(property.property_category, 'bedspace');
    assert.equal(property.property_category_name, 'Bedspace');
    assert.equal(Object.prototype.hasOwnProperty.call(property, 'room_type'), false);

    const [spaces] = await connection.execute(
      'SELECT rental_arrangement FROM rental_spaces WHERE property_id = ? AND is_default = 1',
      [property.id]
    );
    assert.equal(spaces.length, 1);
    assert.equal(spaces[0].rental_arrangement, 'shared');
  } finally {
    try {
      if (propertyId) {
        const { remove } = await import('../models/Property.js');
        await remove(propertyId);
      }
      await connection.execute('DELETE FROM users WHERE id = ?', [owner.id]);
    } finally {
      await connection.end();
    }
  }
});
