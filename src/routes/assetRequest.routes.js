import express from 'express';
import assetRequestController from '../controllers/Assetrequest.controller.js';
import { authenticate, allowRoles } from '../middlewares/verifyToken.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Roles
const ALL_ROLES = ['admin', 'team'];
const ADMIN_ROLES = ['admin'];

// Statistics & Analytics
router.get('/stats', allowRoles(...ALL_ROLES), assetRequestController.getAssetRequestStats);

// Create Request
router.post('/', allowRoles(...ALL_ROLES), assetRequestController.createAssetRequest);
router.get('/my', allowRoles(...ALL_ROLES), assetRequestController.getMyAssetRequests);
router.get('/parent', allowRoles(...ADMIN_ROLES), assetRequestController.getParentAssetRequests);
router.get('/child', allowRoles(...ADMIN_ROLES), assetRequestController.getChildAssetRequests);

// All Requests (Admin view)
router.get('/', allowRoles(...ADMIN_ROLES), assetRequestController.getAllAssetRequests);

// Approve/Reject Requests (Admin only)
router.patch('/:id/approve', allowRoles(...ADMIN_ROLES), assetRequestController.approveAssetRequest);
router.patch('/:id/reject', allowRoles(...ADMIN_ROLES), assetRequestController.rejectAssetRequest);

// Single Request Operations
router.get('/:id', allowRoles(...ALL_ROLES), assetRequestController.getAssetRequestById);
router.delete('/:id', allowRoles(...ALL_ROLES), assetRequestController.deleteAssetRequest);

export default router;