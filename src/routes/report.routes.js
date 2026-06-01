// routes/report.routes.js - Role-Based Report Routes
import express from 'express';
import ReportController from '../controllers/report.controller.js';
import { authenticate, allowRoles } from '../middlewares/verifyToken.js';


const router = express.Router();

// All report routes require authentication
router.use(authenticate);

// ==================== ROLE ACCESS REFERENCE ====================
//
// SUPER ADMIN exclusive:
//   GET  /clients   - All client/admin accounts
//   GET  /revenue   - Platform revenue analytics
//
// Both roles (scoped by role):
//   GET  /assets         - Super Admin: all | Admin: own org
//   GET  /team           - Super Admin: all | Admin: own team
//   GET  /checklists     - Super Admin: all | Admin: own + global
//   GET  /assignments    - Super Admin: all | Admin: own
//   GET  /inspections    - Super Admin: all | Admin: own
//   GET  /compliance     - Super Admin: global | Admin: own org
//   GET  /analytics/dashboard
//   GET  /analytics/kpi
//   POST /export/bulk
//   POST /schedule

// ==================== SUPER ADMIN ONLY ROUTES ====================

/**
 * Client Report — all registered admin accounts
 * GET /api/reports/clients
 */
router.get(
  '/clients',
  allowRoles('super_admin'),
  ReportController.generateClientReport
);

/**
 * Revenue Report — platform-wide MRR, ARR, plan distribution
 * GET /api/reports/revenue
 */
router.get(
  '/revenue',
  allowRoles('super_admin'),
  ReportController.generateRevenueReport
);

// ==================== SHARED ROUTES (scoped per role internally) ====================

/**
 * Asset Report
 * Super Admin → all assets platform-wide
 * Admin       → own org assets only
 * GET /api/reports/assets
 */
router.get(
  '/assets',
  allowRoles('super_admin', 'admin'),
  ReportController.generateAssetReport
);

/**
 * Team Report
 * Super Admin → all team members platform-wide
 * Admin       → own team members only
 * GET /api/reports/team
 */
router.get(
  '/team',
  allowRoles('super_admin', 'admin'),
  ReportController.generateTeamReport
);

/**
 * Checklist Report
 * Super Admin → all checklists (global + custom)
 * Admin       → own checklists + global checklists
 * GET /api/reports/checklists
 */
router.get(
  '/checklists',
  allowRoles('super_admin', 'admin'),
  ReportController.generateChecklistReport
);

/**
 * Assignment Report
 * Super Admin → all assignments platform-wide
 * Admin       → assignments they created
 * GET /api/reports/assignments
 */
router.get(
  '/assignments',
  allowRoles('super_admin',  'admin'),
  ReportController.generateAssignmentReport
);

/**
 * Inspection Report
 * Super Admin → all inspections platform-wide
 * Admin       → inspections under their org
 * GET /api/reports/inspections
 */
router.get(
  '/inspections',
  allowRoles('super_admin', 'admin'),
  ReportController.generateInspectionReport
);

/**
 * Compliance Report
 * Super Admin → platform-wide compliance overview
 * Admin       → own org compliance
 * GET /api/reports/compliance
 */
router.get(
  '/compliance',
  allowRoles('super_admin', 'admin'),
  ReportController.generateComplianceReport
);

// ==================== ANALYTICS ====================

/**
 * Dashboard Analytics
 * Super Admin → platform-wide: client growth, revenue, checklist usage, top performers
 * Admin       → org-level: team performance, asset health, inspection trends
 * GET /api/reports/analytics/dashboard
 */
router.get(
  '/analytics/dashboard',
  allowRoles('super_admin', 'admin'),
  ReportController.getDashboardAnalytics
);

/**
 * KPI Summary
 * Super Admin → totalClients, MRR, totalAssets, totalAssignments, activeChecklists, completionRate
 * Admin       → totalTeamMembers, totalAssets, totalAssignments, activeChecklists, completionRate
 * GET /api/reports/analytics/kpi
 */
router.get(
  '/analytics/kpi',
  allowRoles('super_admin', 'admin'),
  ReportController.getKPISummary
);

// ==================== BULK OPERATIONS ====================

/**
 * Bulk Export
 * Super Admin report types: clients, assets, team, checklists, assignments, inspections, revenue, compliance
 * Admin report types:       assets, team, checklists, assignments, inspections, compliance
 * POST /api/reports/export/bulk
 * Body: { reportTypes: string[], dateRange: { startDate?, endDate? }, format: 'excel'|'json' }
 */
router.post(
  '/export/bulk',
  allowRoles('super_admin', 'admin'),
  ReportController.exportBulkReports
);

/**
 * Schedule Report
 * POST /api/reports/schedule
 * Body: { reportType, schedule: { frequency, time }, recipients: string[], format }
 * Note: Admin cannot schedule 'clients' or 'revenue' reports (returns 403)
 */
router.post(
  '/schedule',
  allowRoles('super_admin', 'admin'),
  ReportController.scheduleReport
);

export default router;