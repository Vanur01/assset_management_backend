// routes/dashboard.routes.js
import express from 'express';
import DashboardController from '../controllers/dashboard.controller.js';
import { authenticate } from '../middlewares/verifyToken.js';

const router = express.Router();

// All dashboard routes require authentication
router.use(authenticate);

/**
 * GET /api/dashboard
 *
 * Single endpoint for all roles:
 *   - super_admin → platform-wide stats (clients, revenue, checklists, assignments)
 *   - admin       → org-level stats (team, assets, checklists, assignments)
 *   - team        → personal task stats (own tasks, upcoming, weekly trend)
 *
 * Optional query params:
 *   dateRange  {number}  days back (default 30)
 *   startDate  {string}  ISO date
 *   endDate    {string}  ISO date
 */
router.get(
  '/',
  DashboardController.getDashboard
);

export default router;