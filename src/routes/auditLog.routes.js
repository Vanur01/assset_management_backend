// routes/auditLog.routes.js
import express from 'express';
import auditLogController from '../controllers/auditLog.controller.js';
import { authenticate, allowRoles } from '../middlewares/verifyToken.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Main audit logs - different roles see different data based on their role
router.get(
  '/',
  allowRoles('super_admin', 'admin', 'team'),
  auditLogController.getAuditLogs
);

// Statistics - role-based aggregation
router.get(
  '/statistics',
  allowRoles('super_admin', 'admin', 'team'),
  auditLogController.getAuditStatistics
);

// Export logs
router.get(
  '/export',
  allowRoles('super_admin', 'admin', 'team'),
  auditLogController.exportAuditLogs
);

// My own activity (convenience endpoint)
router.get(
  '/my-activity',
  allowRoles('super_admin', 'admin', 'team'),
  auditLogController.getMyActivity
);

// Organization activity (admin only - see team activity)
router.get(
  '/organization',
  allowRoles('admin'),
  auditLogController.getOrganizationActivity
);

// Resource audit trail (open to all authenticated users, but only for resources they have access to)
router.get(
  '/resource/:resource/:resourceId',
  authenticate,
  auditLogController.getResourceAuditTrail
);

export default router;