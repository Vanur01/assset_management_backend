// src/routes/asset.routes.js
import express from 'express';
import AssetController from '../controllers/asset.controller.js';
import { authenticate, allowRoles } from '../middlewares/verifyToken.js';

const router = express.Router();

router.use(authenticate);

// GET routes
router.get('/', allowRoles('admin', 'team'), AssetController.getAssetList);
router.get('/:id', allowRoles('admin', 'team'), AssetController.getAssetById);
router.get('/:id/clones', allowRoles('admin', 'team'), AssetController.getCloneList);

// POST routes
router.post('/add', allowRoles('admin', 'team'), AssetController.addAsset);
router.post('/:id/clone', allowRoles('admin', 'team'), AssetController.cloneAsset);

// PUT routes
router.put('/:id', allowRoles('admin', 'team'), AssetController.editAsset);

// PATCH routes
router.patch('/:id/status', allowRoles('admin', 'team'), AssetController.updateAssetStatus);

// DELETE routes (admin only)
router.delete('/:id', allowRoles('admin'), AssetController.deleteAsset);

export default router;