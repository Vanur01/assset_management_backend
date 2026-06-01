import express from 'express';
import ContactController from '../controllers/contact.controller.js';
import { authenticate, allowRoles } from '../middlewares/verifyToken.js';
import {
  validateCreateContact,
  validateContactId,
  validateListContacts
} from '../validation/user.validation.js';

const router = express.Router();

// Public route - anyone can submit a contact inquiry
router.post('/', validateCreateContact, ContactController.createContact);

// Protected routes - only super admin can view/manage contacts
router.get('/', authenticate, allowRoles('super_admin'), validateListContacts, ContactController.getAllContacts);
router.get('/:id', authenticate, allowRoles('super_admin'), validateContactId, ContactController.getContactById);
router.delete('/:id', authenticate, allowRoles('super_admin'), validateContactId, ContactController.deleteContact);

export default router;