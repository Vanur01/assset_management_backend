// controllers/dashboard.controller.js
import DashboardService from '../services/dashboard.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/response.js';

class DashboardController {

  /**
   * Single dashboard endpoint — returns role-specific data.
   *
   * GET /api/dashboard
   *
   * Query params (optional):
   *   dateRange  {number}  - days back from today (default 30)
   *   startDate  {string}  - ISO date override
   *   endDate    {string}  - ISO date override
   *
   * Roles:
   *   super_admin  → clients, revenue, checklists, assignments, contact inquiries, activities
   *   admin        → team, assets, checklists, assignments, activities
   *   team         → own tasks, upcoming, weekly trend, completed checklists
   */
  getDashboard = asyncHandler(async (req, res) => {
    const { userRole, userId } = req;

    if (!userRole) {
      return sendResponse(res, 401, 'Unauthorized: role not found', null);
    }

    const result = await DashboardService.getDashboard(userRole, userId, req.query);

    if (!result.success) {
      return sendResponse(res, 500, result.error || 'Failed to fetch dashboard', null);
    }

    return sendResponse(res, 200, 'Dashboard fetched successfully', result.data);
  });
}

export default new DashboardController();