import express from 'express';
import AssetController from '../controllers/asset.controller.js';
import { authenticate, allowRoles } from '../middlewares/verifyToken.js';

const router = express.Router();

// All asset routes require authentication
router.use(authenticate);

// ==========================
// ASSET MANAGEMENT ROUTES
// ==========================
router.get('/', allowRoles('admin', 'team'), AssetController.getAssetList);
router.get('/clones', allowRoles('admin', 'team'), AssetController.getCloneList);
router.get('/:id', allowRoles('admin', 'team'), AssetController.getAssetById);
router.post('/add', allowRoles('admin', 'team'), AssetController.addAsset);
router.post('/:id/clone', allowRoles('admin', 'team'), AssetController.cloneAsset);
router.put('/:id', allowRoles('admin', 'team'), AssetController.editAsset);
router.patch('/:id/status', allowRoles('admin', 'team'), AssetController.updateAssetStatus);
router.delete('/:id', allowRoles('admin'), AssetController.deleteAsset);

export default router;