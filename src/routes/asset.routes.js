import express from 'express';
import AssetController from '../controllers/asset.controller.js';
import { authenticate } from '../middlewares/verifyToken.js';
import { upload } from '../middlewares/upload.js';

const router = express.Router();

router.use(authenticate);

const setUserContext = (req, res, next) => {
  req.userRole = req.user?.role;
  req.userId = req.user?._id;
  req.adminId = req.user?.adminId || req.user?._id;
  next();
};

router.use(setUserContext);

// ==================== STATIC ROUTES (must come before /:id) ====================

// Asset list and create
router.get('/', AssetController.getAssetList);
router.post('/add', AssetController.addAsset);                         // Admin only

// Asset requests
router.post('/request', AssetController.addAssetRequest);              // Team only
router.get('/requests/parent', AssetController.getParentAssetRequests); // Admin: all | Team: own
router.get('/requests/child', AssetController.getChildAssetRequests);   // Admin: all | Team: own
router.get('/requests/my', AssetController.getMyRequests);              // Team only
router.post('/requests/:requestId/process', AssetController.processAssetRequest); // Admin only

// ==================== DYNAMIC ROUTES (/:id and sub-routes) ====================

router.get('/:id', AssetController.getAssetById);
router.put('/:id', AssetController.editAsset);
router.delete('/:id', AssetController.deleteAsset);
router.patch('/:id/status', AssetController.updateAssetStatus);
router.post('/:id/images', upload.single('image'), AssetController.uploadAssetImage);
router.post('/:id/link', AssetController.linkAsset);
router.post('/:id/clone', AssetController.cloneAsset);
router.get('/:id/clones', AssetController.getCloneList);

export default router;