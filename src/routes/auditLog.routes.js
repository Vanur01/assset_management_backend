// routes/auditLog.routes.js
import express from 'express';
import auditLogController from '../controllers/auditLog.controller.js';
import { authenticate, allowRoles } from '../middlewares/verifyToken.js';

const router = express.Router();

router.use(authenticate);

router.get('/', allowRoles('super_admin', 'admin', 'team'), auditLogController.getAuditLogs);
router.get('/statistics', allowRoles('super_admin', 'admin', 'team'), auditLogController.getAuditStatistics);

export default router;