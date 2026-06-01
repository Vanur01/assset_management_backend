import express from 'express';
import ClientController from '../controllers/client.controller.js';
import { authenticate, allowRoles } from '../middlewares/verifyToken.js';
import {
  validateCreateClient,
  validateUpdateClient,
  validateClientId,
  validateToggleClientStatus,
  validateListClients
} from '../validation/user.validation.js';

const router = express.Router();

// All client routes require authentication and super_admin role
router.use(authenticate, allowRoles('super_admin'));

router.post('/', validateCreateClient, ClientController.createClient);
router.get('/', validateListClients, ClientController.getAllClients);
router.get('/:id', validateClientId, ClientController.getClientById);
router.put('/:id', validateClientId, validateUpdateClient, ClientController.updateClient);
router.delete('/:id', validateClientId, ClientController.deleteClient);
router.patch('/:id/status', validateClientId, validateToggleClientStatus, ClientController.toggleClientStatus);
router.patch('/:id/auto-renewal', validateClientId, ClientController.toggleAutoRenewal);

export default router;