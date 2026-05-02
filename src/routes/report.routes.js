// routes/report.routes.js
import express from 'express';
import ReportController from '../controllers/report.controller.js';
import { authenticate, allowRoles } from '../middlewares/verifyToken.js';
import { validateReportFilters, validateCustomReport } from '../validation/report.validation.js';
import { handleValidation } from '../validation/validationResult.js';

const router = express.Router();

// All report routes require authentication
router.use(authenticate);

// ==================== REPORT GENERATION ====================

/**
 * Client Report
 * GET /api/reports/clients
 * Access: Super Admin, Admin
 */
router.get(
  '/clients',
  allowRoles('super_admin', 'superadmin', 'admin'),
  validateReportFilters,
  handleValidation,
  ReportController.generateClientReport
);

/**
 * Asset Report
 * GET /api/reports/assets
 * Access: Admin only
 */
router.get(
  '/assets',
  allowRoles('admin'),
  validateReportFilters,
  handleValidation,
  ReportController.generateAssetReport
);

/**
 * Team Performance Report
 * GET /api/reports/team
 * Access: Admin only
 */
router.get(
  '/team',
  allowRoles('admin'),
  validateReportFilters,
  handleValidation,
  ReportController.generateTeamReport
);

/**
 * Inspection Report
 * GET /api/reports/inspections
 * Access: Super Admin, Admin
 */
router.get(
  '/inspections',
  allowRoles('super_admin', 'superadmin', 'admin'),
  validateReportFilters,
  handleValidation,
  ReportController.generateInspectionReport
);

/**
 * Financial Report
 * GET /api/reports/financial
 * Access: Super Admin, Admin
 */
router.get(
  '/financial',
  allowRoles('super_admin', 'superadmin', 'admin'),
  validateReportFilters,
  handleValidation,
  ReportController.generateFinancialReport
);

/**
 * Compliance Report
 * GET /api/reports/compliance
 * Access: Admin only
 */
router.get(
  '/compliance',
  allowRoles('admin'),
  validateReportFilters,
  handleValidation,
  ReportController.generateComplianceReport
);

/**
 * Custom Report
 * POST /api/reports/custom
 * Access: Super Admin, Admin
 */
router.post(
  '/custom',
  allowRoles('super_admin', 'superadmin', 'admin'),
  validateCustomReport,
  handleValidation,
  ReportController.generateCustomReport
);

// ==================== ANALYTICS ENDPOINTS ====================

/**
 * Dashboard Analytics
 * GET /api/reports/analytics/dashboard
 * Access: Super Admin, Admin
 */
router.get(
  '/analytics/dashboard',
  allowRoles('super_admin', 'superadmin', 'admin'),
  ReportController.getDashboardAnalytics
);

/**
 * KPI Summary
 * GET /api/reports/analytics/kpi
 * Access: Super Admin, Admin
 */
router.get(
  '/analytics/kpi',
  allowRoles('super_admin', 'admin'),
  ReportController.getKPISummary
);

// ==================== BULK OPERATIONS ====================

/**
 * Export Multiple Reports
 * POST /api/reports/export/bulk
 * Access: Super Admin, Admin
 */
router.post(
  '/export/bulk',
  allowRoles('super_admin', 'admin'),
  ReportController.exportBulkReports
);

/**
 * Schedule Report
 * POST /api/reports/schedule
 * Access: Super Admin, Admin
 */
router.post(
  '/schedule',
  allowRoles('super_admin', 'admin'),
  ReportController.scheduleReport
);

export default router;