import express from 'express';
import ChecklistRequestController from '../controllers/ChecklistRequest.controller.js';
import { authenticate, allowRoles } from '../middlewares/verifyToken.js';
import { upload } from '../middlewares/upload.js';
const router = express.Router();

// All routes require authentication
router.use(authenticate);

// ==================== USER ROUTES ====================
router.get(
    '/my-requests',
    ChecklistRequestController.getMyRequests
);

router.post(
    '/',
    upload.array('referenceFiles', 10),
    ChecklistRequestController.createRequest
);

// ==================== ADMIN/SUPER ADMIN ROUTES ====================

// Statistics
router.get(
    '/statistics/all',
    allowRoles('super_admin', 'admin'),
    ChecklistRequestController.getRequestStatistics
);

// List all requests (including filters for deleted)
router.get(
    '/',
    allowRoles('super_admin', 'admin'),
    ChecklistRequestController.getRequests
);

router.get(
    '/deleted',
    allowRoles('super_admin', 'admin'),
    ChecklistRequestController.getDeletedRequests
);

router.get(
    '/:id',
    allowRoles('super_admin', 'admin'),
    ChecklistRequestController.getRequest
);

router.put(
    '/:id/review',
    allowRoles('super_admin'),
    ChecklistRequestController.reviewRequest
);

router.delete(
    '/:id',
    allowRoles('super_admin', 'admin'),
    ChecklistRequestController.softDeleteRequest
);

router.get(
    '/deleted/list',
    allowRoles('super_admin', 'admin'),
    ChecklistRequestController.getDeletedRequests

);

router.patch(
    '/:id/restore',
    allowRoles('super_admin', 'admin'),
    ChecklistRequestController.restoreRequest
);

router.delete(
    '/:id/permanent',
    allowRoles('super_admin', 'admin'),
    ChecklistRequestController.permanentDeleteRequest
);



export default router;