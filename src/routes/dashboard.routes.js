import express from 'express';
import DashboardController from '../controllers/dashboard.controller.js';
import { authenticate, allowRoles } from '../middlewares/verifyToken.js';
import { validateDashboardFilters } from '../validation/dashboard.validation.js';
import { handleValidation } from '../validation/validationResult.js';

const router = express.Router();

// All dashboard routes require authentication
router.use(authenticate);

/**
 * Super Admin Dashboard
 * GET /api/dashboard/super-admin
 * Access: Super Admin only
 */
router.get(
  '/super-admin',
  allowRoles('super_admin'),
  validateDashboardFilters,
  handleValidation,
  DashboardController.getsuper_adminDashboard
);

/**
 * Admin Dashboard
 * GET /api/dashboard/admin
 * Access: Admin only
 */
router.get(
  '/admin',
  allowRoles('admin'),
  validateDashboardFilters,
  handleValidation,
  DashboardController.getAdminDashboard
);

/**
 * Team Member Dashboard Stats
 * GET /api/dashboard/team
 * Access: Team only
 */
router.get(
  '/team',
  allowRoles('team'),
  DashboardController.getTeamDashboard
);

/**
 * Dashboard Stats Summary (Role-based)
 * GET /api/dashboard/stats
 * Access: All authenticated users
 */
router.get(
  '/stats',
  validateDashboardFilters,
  handleValidation,
  DashboardController.getDashboardStats
);

/**
 * Chart Data Only (For performance)
 * GET /api/dashboard/charts
 * Access: Super Admin & Admin
 */
router.get(
  '/charts',
  allowRoles('super_admin', 'admin'),
  DashboardController.getChartData
);

/**
 * Recent Activities
 * GET /api/dashboard/activities
 * Access: Super Admin & Admin
 */
router.get(
  '/activities',
  allowRoles('super_admin', 'admin'),
  DashboardController.getRecentActivities
);

/**
 * Export Dashboard Report
 * GET /api/dashboard/export
 * Access: Super Admin & Admin
 */
router.get(
  '/export',
  allowRoles('super_admin', 'admin'),
  DashboardController.exportDashboardReport
);

export default router;