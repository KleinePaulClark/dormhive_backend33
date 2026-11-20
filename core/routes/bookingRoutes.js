import { Router } from 'express';
import * as controller from '../controllers/bookingController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { uploadIdentityDocument } from '../config/upload.js';

const router = Router();
router.use(authenticate);
router.get('/', controller.list);
router.get('/:id/identity-documents', controller.listIdentityDocuments);
router.get('/:id/identity-documents/:side', controller.getIdentityDocument);
router.get('/:id', controller.get);
router.get('/:id/ticket', controller.ticket);
router.post(
  '/',
  authorize('tenant'),
  uploadIdentityDocument.fields([{ name: 'idFront', maxCount: 1 }, { name: 'idBack', maxCount: 1 }]),
  validate(['propertyId', 'moveInDate', 'occupants']),
  controller.create
);
router.patch('/:id/move-out', controller.updateMoveOut);
router.patch('/:id/viewing-schedule', validate(['viewingDate', 'viewingTime']), controller.updateViewingSchedule);
router.patch('/:id/status', validate(['status']), controller.updateStatus);
export default router;
