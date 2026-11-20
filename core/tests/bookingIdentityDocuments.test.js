import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareBookingIdentityDocuments } from '../controllers/bookingController.js';
import { canViewBookingIdentityDocuments, shouldDeleteIdentityDocumentsForStatus } from '../models/Booking.js';

const validFiles = () => ({
  idFront: [{ originalname: 'id-front.jpg', mimetype: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff]) }],
  idBack: [{ originalname: 'id-back.png', mimetype: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) }]
});

test('booking request requires consent and both ID sides', () => {
  assert.equal(prepareBookingIdentityDocuments(validFiles(), 'philid', 'false').valid, false);
  assert.equal(prepareBookingIdentityDocuments({ idFront: validFiles().idFront }, 'philid', 'true').valid, false);
});

test('booking request accepts supported ID types and verified image files', () => {
  const result = prepareBookingIdentityDocuments(validFiles(), 'philid', 'true');
  assert.equal(result.valid, true);
  assert.equal(result.documents.length, 2);
  assert.deepEqual(result.documents.map(({ side }) => side), ['front', 'back']);
});

test('booking request rejects unsupported document types and forged MIME types', () => {
  const files = validFiles();
  files.idFront[0] = { originalname: 'id.txt', mimetype: 'text/plain', buffer: Buffer.from('not an ID image') };
  assert.equal(prepareBookingIdentityDocuments(files, 'philid', 'true').valid, false);

  const forgedFiles = validFiles();
  forgedFiles.idFront[0].mimetype = 'image/png';
  assert.throws(() => prepareBookingIdentityDocuments(forgedFiles, 'philid', 'true'), { statusCode: 422 });
});

test('only the booking tenant, assigned owner, and admins can view its ID', () => {
  const booking = { tenant_id: 12, owner_id: 34 };
  assert.equal(canViewBookingIdentityDocuments(booking, { id: 12, role: 'tenant' }), true);
  assert.equal(canViewBookingIdentityDocuments(booking, { id: 34, role: 'owner' }), true);
  assert.equal(canViewBookingIdentityDocuments(booking, { id: 56, role: 'owner' }), false);
  assert.equal(canViewBookingIdentityDocuments(booking, { id: 99, role: 'admin' }), true);
  assert.equal(canViewBookingIdentityDocuments(booking, { id: 56, role: 'tenant' }), false);
});

test('ID documents are deleted when a booking is rejected, cancelled, or completed', () => {
  assert.equal(shouldDeleteIdentityDocumentsForStatus('rejected'), true);
  assert.equal(shouldDeleteIdentityDocumentsForStatus('cancelled'), true);
  assert.equal(shouldDeleteIdentityDocumentsForStatus('completed'), true);
  assert.equal(shouldDeleteIdentityDocumentsForStatus('approved'), false);
  assert.equal(shouldDeleteIdentityDocumentsForStatus('pending'), false);
});
