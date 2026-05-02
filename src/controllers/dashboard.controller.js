import DashboardService from '../services/dashboard.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/response.js';

class DashboardController {
  
  /**
   * Super Admin Dashboard
   * GET /api/dashboard/super-admin
   */
  getsuper_adminDashboard = asyncHandler(async (req, res) => {
    const dashboard = await DashboardService.getsuper_adminDashboard(req.query);
    return sendResponse(res, 200, 'Super admin dashboard fetched successfully', dashboard);
  });
  
  /**
   * Admin Dashboard
   * GET /api/dashboard/admin
   */
  getAdminDashboard = asyncHandler(async (req, res) => {
    const dashboard = await DashboardService.getAdminDashboard(req.userId, req.query);
    return sendResponse(res, 200, 'Admin dashboard fetched successfully', dashboard);
  });
  
  /**
   * Get Dashboard Stats Summary (Quick view)
   * GET /api/dashboard/stats
   */
  getDashboardStats = asyncHandler(async (req, res) => {
    let stats;
    if (req.userRole === 'super_admin') {
      const dashboard = await DashboardService.getsuper_adminDashboard(req.query);
      stats = dashboard.overview;
    } else if (req.userRole === 'admin') {
      const dashboard = await DashboardService.getAdminDashboard(req.userId, req.query);
      stats = dashboard.overview;
    } else {
      // Team member dashboard stats
      stats = await DashboardService.getTeamDashboardStats(req.userId);
    }
    return sendResponse(res, 200, 'Dashboard stats fetched successfully', stats);
  });
  
  /**
   * Get Chart Data Only (For performance)
   * GET /api/dashboard/charts
   */
  getChartData = asyncHandler(async (req, res) => {
    const { chartType } = req.query;
    let chartData;
    
    if (req.userRole === 'super_admin') {
      const dashboard = await DashboardService.getsuper_adminDashboard(req.query);
      chartData = dashboard.charts;
    } else if (req.userRole === 'admin') {
      const dashboard = await DashboardService.getAdminDashboard(req.userId, req.query);
      chartData = dashboard.charts;
    }
    
    if (chartType && chartData[chartType]) {
      chartData = chartData[chartType];
    }
    
    return sendResponse(res, 200, 'Chart data fetched successfully', chartData);
  });
  
  /**
   * Get Recent Activities
   * GET /api/dashboard/activities
   */
  getRecentActivities = asyncHandler(async (req, res) => {
    const { limit = 10 } = req.query;
    let activities;
    
    if (req.userRole === 'super_admin') {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 30);
      const dashboard = await DashboardService.getsuper_adminDashboard(req.query);
      activities = dashboard.recentActivities;
    } else if (req.userRole === 'admin') {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 30);
      activities = await DashboardService.getAdminRecentActivities(req.userId, start, end, parseInt(limit));
    }
    
    return sendResponse(res, 200, 'Recent activities fetched successfully', activities);
  });
  
  /**
   * Get Export Dashboard Report
   * GET /api/dashboard/export
   */
  exportDashboardReport = asyncHandler(async (req, res) => {
    let reportData;
    
    if (req.userRole === 'super_admin') {
      reportData = await DashboardService.getsuper_adminDashboard(req.query);
    } else if (req.userRole === 'admin') {
      reportData = await DashboardService.getAdminDashboard(req.userId, req.query);
    }
    
    // Format for export
    const exportData = {
      generatedAt: new Date().toISOString(),
      reportType: `${req.userRole}_dashboard`,
      data: reportData
    };
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=dashboard_report_${Date.now()}.json`);
    return res.send(JSON.stringify(exportData, null, 2));
  });
  
  /**
   * Team Member Dashboard Stats
   * GET /api/dashboard/team
   */
  getTeamDashboard = asyncHandler(async (req, res) => {
    const stats = await DashboardService.getTeamDashboardStats(req.userId);
    return sendResponse(res, 200, 'Team dashboard fetched successfully', stats);
  });
}

export default new DashboardController();