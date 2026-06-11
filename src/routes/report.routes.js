// routes/report.routes.js
import express from 'express';
import ReportController from '../controllers/report.controller.js';
import { authenticate } from '../middlewares/verifyToken.js';

const router = express.Router();

// All report routes require authentication
router.use(authenticate);

/**
 * GET /api/reports/:reportType
 * 
 * Report Types by Role:
 * 
 * Super Admin Reports:
 *   - clients              → All client (admin) accounts
 *   - financial            → Revenue and subscription report
 *   - checklists           → All checklists (filter by clientId)
 *   - assignments          → All assignments (filter by clientId)
 *   - audit-logs           → System audit logs (filter by actorId)
 *   - contact-inquiries    → Contact form submissions
 *   - individual-client    → Single client detailed report (requires clientId)
 * 
 * Admin Reports:
 *   - team-members         → Team members under this admin
 *   - checklists           → Admin's own checklists (filter by teamId)
 *   - assignments          → Admin's assignments (filter by teamId)
 *   - audit-logs           → Admin-related audit logs
 *   - assets               → Admin's assets
 *   - individual-team      → Single team member report (requires teamId)
 * 
 * Team Reports:
 *   - assignments          → Team member's own assignments
 *   - audit-logs           → Team member's own audit logs
 */
router.get(
  '/:reportType',
  ReportController.generateReport
);


router.get(
  '/:reportType/export',
  ReportController.exportReport
);

export default router;