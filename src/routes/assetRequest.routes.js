import express from 'express';
import AssetRequestController from '../controllers/assetRequest.controller.js';
import { authenticate, allowRoles } from '../middlewares/verifyToken.js';

const router = express.Router();
router.use(authenticate);

// GET Routes
router.get('/', allowRoles('admin', 'team'), AssetRequestController.getRequests);
router.get('/stats/summary', allowRoles('admin'), AssetRequestController.getRequestStats);
router.get('/asset/:assetId', allowRoles('admin', 'team'), AssetRequestController.getRequestsByAsset);
router.get('/:id', allowRoles('admin', 'team'), AssetRequestController.getRequestById);
router.get('/:id/tree', allowRoles('admin', 'team'), AssetRequestController.getRequestTree);

// POST Routes
router.post('/parent', allowRoles('admin', 'team'), AssetRequestController.createParentRequest);
router.post('/:parentId/child', allowRoles('admin', 'team'), AssetRequestController.createChildRequest);
router.post('/:requestId/link-asset', allowRoles('admin', 'team'), AssetRequestController.linkChildAsset);

// PATCH Routes
router.patch('/:id/approve', allowRoles('admin'), AssetRequestController.approveRequest);
router.patch('/:id/reject', allowRoles('admin'), AssetRequestController.rejectRequest);
router.patch('/:id/complete', allowRoles('admin', 'team'), AssetRequestController.completeRequest);
router.patch('/:parentId/child/:childId/status', allowRoles('admin', 'team'), AssetRequestController.updateChildStatus);


export default router;