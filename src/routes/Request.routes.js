// routes/request.routes.js
import express from 'express';
import ChecklistRequestController from '../controllers/ChecklistRequest.controller.js';
import { authenticate, allowRoles } from '../middlewares/verifyToken.js';
import { upload } from '../middlewares/upload.js';

const router = express.Router();

router.use(authenticate);

router.post(
    '/',
    allowRoles('super_admin', 'admin'),
    upload.single('referenceFiles'),
    ChecklistRequestController.createRequest
);

router.get(
    '/',
    allowRoles('super_admin', 'admin'),
    ChecklistRequestController.getRequests
);

router.get('/statistics', allowRoles('super_admin', 'admin'), ChecklistRequestController.getRequestStatistics);
router.get('/:id', allowRoles('super_admin', 'admin'), ChecklistRequestController.getRequest);

router.put(
    '/:id/review',
    allowRoles('super_admin'),
    ChecklistRequestController.reviewRequest
);

router.delete('/:id', allowRoles('super_admin', 'admin'), ChecklistRequestController.deleteRequest);

export default router;