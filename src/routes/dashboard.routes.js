// routes/dashboard.routes.js
import express from 'express';
import DashboardController from '../controllers/dashboard.controller.js';
import { authenticate } from '../middlewares/verifyToken.js';
import { validateDashboardFilters } from '../validation/dashboard.validation.js';
import { handleValidation } from '../validation/validationResult.js';

const router = express.Router();

// All dashboard routes require authentication
router.use(authenticate);

/**
 * GET /api/dashboard
 *
 * Single endpoint for all roles:
 *   - super_admin → platform-wide stats
 *   - admin       → org-level stats
 *   - team        → personal task stats
 *
 * Optional query params:
 *   dateRange  {number}  days back (default 30)
 *   startDate  {string}  ISO date
 *   endDate    {string}  ISO date
 */
router.get(
  '/',
  validateDashboardFilters,
  handleValidation,
  DashboardController.getDashboard,
);

export default router;