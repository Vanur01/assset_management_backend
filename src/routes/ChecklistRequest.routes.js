// routes/ChecklistRequest.routes.js
import express from 'express';
import ChecklistRequestController from '../controllers/ChecklistRequest.controller.js';
import { authenticate, allowRoles } from '../middlewares/verifyToken.js';
import { upload } from '../middlewares/upload.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

router.get(
    '/my-requests',
    ChecklistRequestController.getMyRequests
);

router.post(
    '/',
    upload.array('referenceFiles'), 
    ChecklistRequestController.createRequest
);

router.get(
    '/:id',
    allowRoles('super_admin', 'admin'),
    ChecklistRequestController.getRequest
);


router.get(
    '/statistics/all',
    allowRoles('super_admin', 'admin'),
    ChecklistRequestController.getRequestStatistics
);


router.get(
    '/',
    allowRoles('super_admin', 'admin'),
    ChecklistRequestController.getRequests
);

router.put(
    '/:id/review',
    allowRoles('super_admin'),
    ChecklistRequestController.reviewRequest
);

router.delete(
    '/:id',
    allowRoles('super_admin', 'admin'),
    ChecklistRequestController.deleteRequest
);


export default router;