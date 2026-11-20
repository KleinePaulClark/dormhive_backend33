import pool, { query } from '../config/database.js';

let bookingIdentityDocumentTable;

async function ensureBookingIdentityDocumentTable() {
  if (!bookingIdentityDocumentTable) {
    bookingIdentityDocumentTable = (async () => {
      const bookingColumns = await query('SHOW COLUMNS FROM bookings');
      const statusType = String(bookingColumns.find((column) => column.Field === 'status')?.Type ?? '');
      if (!statusType.includes("'completed'")) {
        await query("ALTER TABLE bookings MODIFY COLUMN status ENUM('pending', 'approved', 'rejected', 'cancelled', 'completed') DEFAULT 'pending'");
      }
      await query(`CREATE TABLE IF NOT EXISTS booking_identity_documents (
        booking_id INT NOT NULL,
        side ENUM('front', 'back') NOT NULL,
        uploaded_by INT NOT NULL,
        id_type VARCHAR(40) NOT NULL,
        original_filename VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        file_size INT NOT NULL,
        file_data LONGBLOB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (booking_id, side),
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
        FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_booking_identity_uploaded_by (uploaded_by)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    })()
      .catch((error) => {
        bookingIdentityDocumentTable = null;
        throw error;
      });
  }
  await bookingIdentityDocumentTable;
}

export function canViewBookingIdentityDocuments(booking, user) {
  if (!booking || !user) return false;
  return user.role === 'admin'
    || (user.role === 'tenant' && Number(booking.tenant_id) === Number(user.id))
    || (user.role === 'owner' && Number(booking.owner_id) === Number(user.id));
}

export function shouldDeleteIdentityDocumentsForStatus(status) {
  return ['rejected', 'cancelled', 'completed'].includes(String(status ?? '').toLowerCase());
}

export function buildBookingListSql(role = 'owner') {
  const fields = "b.*, p.title AS property_title, p.monthly_rent, p.owner_id, p.image_url, p.images, COALESCE(CONCAT_WS(' ', u.first_name, u.last_name), u.name) AS tenant_name, u.avatar_url AS tenant_avatar_url";

  if (role === 'admin') {
    return `SELECT ${fields} FROM bookings b JOIN properties p ON p.id = b.property_id JOIN users u ON u.id = b.tenant_id ORDER BY b.created_at DESC`;
  }

  if (role === 'tenant') {
    return `SELECT ${fields} FROM bookings b JOIN properties p ON p.id = b.property_id JOIN users u ON u.id = b.tenant_id WHERE b.tenant_id = ? AND p.status != 'archived' ORDER BY b.created_at DESC`;
  }

  return `SELECT ${fields} FROM bookings b JOIN properties p ON p.id = b.property_id JOIN users u ON u.id = b.tenant_id WHERE p.owner_id = ? ORDER BY b.created_at DESC`;
}

export async function create(tenantId, { propertyId, ownerId, moveInDate, moveOutDate, isIndefiniteMoveOut = false, viewingDate, viewingTime, occupants, message, idType }, identityDocuments) {
  await ensureBookingIdentityDocumentTable();
  const viewingScheduleSubmitted = Boolean(viewingDate && viewingTime);
  const connection = await pool.getConnection();
  let bookingId;
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      "INSERT INTO bookings (property_id, tenant_id, owner_id, move_in_date, move_out_date, is_indefinite_move_out, viewing_date, viewing_time, viewing_schedule_tenant_submitted, occupants, message, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')",
      [propertyId, tenantId, ownerId, moveInDate, moveOutDate ?? null, isIndefiniteMoveOut ? 1 : 0, viewingDate ?? null, viewingTime ?? null, viewingScheduleSubmitted ? 1 : 0, occupants, message ?? null]
    );
    bookingId = result.insertId;
    for (const document of identityDocuments) {
      await connection.execute(
        'INSERT INTO booking_identity_documents (booking_id, side, uploaded_by, id_type, original_filename, mime_type, file_size, file_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [bookingId, document.side, tenantId, idType, document.filename, document.mimeType, document.buffer.length, document.buffer]
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return findById(bookingId);
}

export async function listIdentityDocuments(bookingId) {
  await ensureBookingIdentityDocumentTable();
  return query(
    'SELECT side, id_type, original_filename, mime_type FROM booking_identity_documents WHERE booking_id = ? ORDER BY FIELD(side, "front", "back")',
    [bookingId]
  );
}

export async function findIdentityDocument(bookingId, side) {
  await ensureBookingIdentityDocumentTable();
  const rows = await query(
    'SELECT side, id_type, original_filename, mime_type, file_size, file_data FROM booking_identity_documents WHERE booking_id = ? AND side = ? LIMIT 1',
    [bookingId, side]
  );
  return rows[0] ?? null;
}

export async function deleteIdentityDocuments(bookingId) {
  await ensureBookingIdentityDocumentTable();
  await query('DELETE FROM booking_identity_documents WHERE booking_id = ?', [bookingId]);
}

export async function cleanupEndedIdentityDocuments() {
  await ensureBookingIdentityDocumentTable();
  await query(`DELETE d FROM booking_identity_documents d
    JOIN bookings b ON b.id = d.booking_id
    WHERE b.status IN ('rejected', 'cancelled', 'completed')
      OR (b.status = 'approved' AND b.is_indefinite_move_out = 0
        AND b.move_out_date IS NOT NULL AND b.move_out_date < CURRENT_DATE())`);
}

export async function findById(id) {
  const rows = await query('SELECT b.*, p.title AS property_title, p.monthly_rent, p.owner_id, p.image_url, p.images FROM bookings b JOIN properties p ON p.id = b.property_id WHERE b.id = ? LIMIT 1', [id]);
  return rows[0] ?? null;
}

export async function countApprovedOccupants(propertyId) {
  const rows = await query("SELECT COALESCE(SUM(COALESCE(occupants, 1)), 0) AS count FROM bookings WHERE property_id = ? AND status = 'approved'", [propertyId]);
  return Number(rows[0]?.count ?? 0);
}

export async function countApprovedSlots(propertyId) {
  const rows = await query("SELECT COUNT(*) AS count FROM bookings WHERE property_id = ? AND status = 'approved'", [propertyId]);
  return Number(rows[0]?.count ?? 0);
}

export async function listForUser(user) {
  const sql = buildBookingListSql(user.role);
  return query(sql, [user.id]);
}

export async function updateStatus(id, status) {
  await query('UPDATE bookings SET status = ? WHERE id = ?', [status, id]);
  return findById(id);
}

export async function updateViewingSchedule(id, viewingDate, viewingTime) {
  await query('UPDATE bookings SET viewing_date = ?, viewing_time = ?, viewing_schedule_tenant_submitted = 1 WHERE id = ?', [viewingDate, viewingTime, id]);
  return findById(id);
}

export async function updateMoveOut(id, moveOutDate, isIndefiniteMoveOut) {
  await query('UPDATE bookings SET move_out_date = ?, is_indefinite_move_out = ? WHERE id = ?', [moveOutDate, isIndefiniteMoveOut ? 1 : 0, id]);
  return findById(id);
}
