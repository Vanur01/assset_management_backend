import express from 'express';
import AssetController from '../controllers/asset.controller.js';
import { authenticate, allowRoles, ROLES } from '../middlewares/verifyToken.js';
import { upload } from '../middlewares/upload.js';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// ==================== ASSET CRUD OPERATIONS ====================
router.post('/', allowRoles(ROLES.ADMIN, ROLES.TEAM), AssetController.createAsset);
router.get('/', allowRoles(ROLES.ADMIN, ROLES.TEAM), AssetController.getAllAssets);
router.get('/deleted', allowRoles(ROLES.ADMIN), AssetController.getDeletedAssets);
router.get('/:id', allowRoles(ROLES.ADMIN, ROLES.TEAM), AssetController.getAssetById);
router.put('/:id', allowRoles(ROLES.ADMIN, ROLES.TEAM), AssetController.updateAsset);
router.delete('/:id', allowRoles(ROLES.ADMIN, ROLES.TEAM), AssetController.deleteAsset);
router.patch('/:id/status', allowRoles(ROLES.ADMIN, ROLES.TEAM), AssetController.updateAssetStatus);
router.post('/:id/restore', allowRoles(ROLES.ADMIN), AssetController.restoreAsset);

// ==================== ASSET IMAGE MANAGEMENT ====================
router.post(
  '/:id/images',
  allowRoles(ROLES.ADMIN, ROLES.TEAM),
  upload.single('image'),
  AssetController.addAssetImage
);
router.post(
  '/:id/images/multiple',
  allowRoles(ROLES.ADMIN, ROLES.TEAM),
  upload.array('images', 10),
  AssetController.addMultipleAssetImages
);
router.delete(
  '/:id/images/:imageId',
  allowRoles(ROLES.ADMIN, ROLES.TEAM),
  AssetController.removeAssetImage
);
router.put(
  '/:id/images/:imageId/primary',
  allowRoles(ROLES.ADMIN, ROLES.TEAM),
  AssetController.setPrimaryImage
);

// ==================== CHILD ASSET MANAGEMENT ====================
router.post('/:id/link-children', allowRoles(ROLES.ADMIN, ROLES.TEAM), AssetController.linkChildAssets);
router.delete('/:id/children/:childId', allowRoles(ROLES.ADMIN, ROLES.TEAM), AssetController.unlinkChildAsset);
router.get('/:id/children', allowRoles(ROLES.ADMIN, ROLES.TEAM), AssetController.getChildAssets);

// ==================== ASSET REQUEST APPROVAL ====================
router.post('/requests/:requestId/approve', allowRoles(ROLES.ADMIN), AssetController.approveAssetRequest);
router.post('/requests/:requestId/reject', allowRoles(ROLES.ADMIN), AssetController.rejectAssetRequest);

// ==================== CLONE OPERATIONS ====================
router.post('/:id/clone', allowRoles(ROLES.ADMIN, ROLES.TEAM), AssetController.cloneAsset);
router.get('/:id/clones', allowRoles(ROLES.ADMIN, ROLES.TEAM, ROLES.SUPER_ADMIN), AssetController.getAssetClones);
router.get('/:id/clone-tree', allowRoles(ROLES.ADMIN), AssetController.getCloneTree);

// ==================== BULK OPERATIONS ====================
router.post('/bulk/delete', allowRoles(ROLES.ADMIN), AssetController.bulkDeleteAssets);
router.post('/bulk/status', allowRoles(ROLES.ADMIN, ROLES.TEAM), AssetController.bulkUpdateAssetStatus);

// ==================== EXPORT & STATISTICS ====================
router.get('/export/all', allowRoles(ROLES.ADMIN, ROLES.TEAM), AssetController.exportAssets);
router.get('/statistics/summary', allowRoles(ROLES.ADMIN, ROLES.TEAM), AssetController.getAssetStatistics);

export default router;