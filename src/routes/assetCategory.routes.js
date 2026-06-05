import express from 'express';
import AssetCategoryController from '../controllers/assetCategory.controller.js';
import { authenticate, allowRoles } from '../middlewares/verifyToken.js';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// ==================== CATEGORY CRUD ROUTES ====================
router.post('/', allowRoles('admin'), AssetCategoryController.createCategory);
router.get('/', allowRoles('admin', 'team'), AssetCategoryController.getCategories);
router.get('/:id', allowRoles('admin'), AssetCategoryController.getCategoryById);
router.put('/:id', allowRoles('admin'), AssetCategoryController.updateCategory);
router.delete('/:id', allowRoles('admin'), AssetCategoryController.deleteCategory);

export default router;