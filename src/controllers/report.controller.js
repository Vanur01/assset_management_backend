// controllers/report.controller.js - Unified Role-Based Report Controller
import ReportService from '../services/report.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/response.js';

/**
 * Role-Based Report Access Matrix:
 *
 * SUPER ADMIN:
 *   GET  /api/reports/clients        → generateClientReport
 *   GET  /api/reports/assets         → generateAssetReport (all assets)
 *   GET  /api/reports/team           → generateTeamReport (all teams)
 *   GET  /api/reports/checklists     → generateChecklistReport (all)
 *   GET  /api/reports/assignments    → generateAssignmentReport (all)
 *   GET  /api/reports/inspections    → generateInspectionReport (all)
 *   GET  /api/reports/revenue        → generateRevenueReport (exclusive)
 *   GET  /api/reports/analytics/dashboard → getDashboardAnalytics (platform-wide)
 *   GET  /api/reports/analytics/kpi       → getKPISummary (platform KPIs)
 *   POST /api/reports/export/bulk         → exportBulkReports
 *   POST /api/reports/schedule            → scheduleReport
 *
 * ADMIN:
 *   GET  /api/reports/assets         → generateAssetReport (own assets only)
 *   GET  /api/reports/team           → generateTeamReport (own team only)
 *   GET  /api/reports/checklists     → generateChecklistReport (own checklists)
 *   GET  /api/reports/assignments    → generateAssignmentReport (own assignments)
 *   GET  /api/reports/inspections    → generateInspectionReport (own inspections)
 *   GET  /api/reports/compliance     → generateComplianceReport
 *   GET  /api/reports/analytics/dashboard → getDashboardAnalytics (org-level)
 *   GET  /api/reports/analytics/kpi       → getKPISummary (org KPIs)
 *   POST /api/reports/export/bulk         → exportBulkReports (own data)
 *   POST /api/reports/schedule            → scheduleReport
 */

class ReportController {

  // ==================== SAFE STRINGIFY ====================

  safeStringifyReport(report) {
    return JSON.parse(JSON.stringify(report, (key, value) => {
      if (['_workbook', '_worksheets', '_workbookRef', '_workbookView', '_worksheetsView', '_workbookRela'].includes(key)) {
        return undefined;
      }
      if (value instanceof Date) return value.toISOString();
      return value;
    }));
  }

  // ==================== SEND REPORT RESPONSE ====================

  /**
   * Handles sending a report response in JSON, Excel or PDF format.
   */
  sendReportResponse(res, result, filePrefix, message) {
    // Excel buffer
    if (Buffer.isBuffer(result) && result[0] === 0x50 && result[1] === 0x4B) {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${filePrefix}_${Date.now()}.xlsx`);
      return res.send(result);
    }

    // PDF buffer
    if (Buffer.isBuffer(result) && result[0] === 0x25 && result[1] === 0x50) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${filePrefix}_${Date.now()}.pdf`);
      return res.send(result);
    }

    // JSON
    const safeReport = this.safeStringifyReport(result);
    return sendResponse(res, 200, message, safeReport);
  }

  // ==================== CLIENT REPORT (Super Admin only) ====================

  /**
   * GET /api/reports/clients
   * Super Admin: all clients | Admin: own profile only
   */
  generateClientReport = asyncHandler(async (req, res) => {
    const result = await ReportService.generateClientReport(
      req.userId,
      req.userRole,
      req.query
    );
    return this.sendReportResponse(res, result, 'client_report', 'Client report generated successfully');
  });

  // ==================== ASSET REPORT (Super Admin: all, Admin: own) ====================

  /**
   * GET /api/reports/assets
   * Super Admin: all assets globally | Admin: own org assets
   */
  generateAssetReport = asyncHandler(async (req, res) => {
    const result = await ReportService.generateAssetReport(
      req.userId,
      req.userRole,
      req.query
    );
    return this.sendReportResponse(res, result, 'asset_report', 'Asset report generated successfully');
  });

  // ==================== TEAM REPORT (Super Admin: all, Admin: own) ====================

  /**
   * GET /api/reports/team
   * Super Admin: all team members globally | Admin: own team
   */
  generateTeamReport = asyncHandler(async (req, res) => {
    const result = await ReportService.generateTeamReport(
      req.userId,
      req.userRole,
      req.query
    );
    return this.sendReportResponse(res, result, 'team_report', 'Team performance report generated successfully');
  });

  // ==================== CHECKLIST REPORT (Super Admin: all, Admin: own + global) ====================

  /**
   * GET /api/reports/checklists
   * Super Admin: all checklists | Admin: own + global checklists
   */
  generateChecklistReport = asyncHandler(async (req, res) => {
    const result = await ReportService.generateChecklistReport(
      req.userId,
      req.userRole,
      req.query
    );
    return this.sendReportResponse(res, result, 'checklist_report', 'Checklist report generated successfully');
  });

  // ==================== ASSIGNMENT REPORT (Super Admin: all, Admin: own) ====================

  /**
   * GET /api/reports/assignments
   * Super Admin: all assignments | Admin: own org assignments
   */
  generateAssignmentReport = asyncHandler(async (req, res) => {
    const result = await ReportService.generateAssignmentReport(
      req.userId,
      req.userRole,
      req.query
    );
    return this.sendReportResponse(res, result, 'assignment_report', 'Assignment report generated successfully');
  });

  // ==================== INSPECTION REPORT (Super Admin: all, Admin: own) ====================

  /**
   * GET /api/reports/inspections
   * Super Admin: all inspections | Admin: own org inspections
   */
  generateInspectionReport = asyncHandler(async (req, res) => {
    const result = await ReportService.generateInspectionReport(
      req.userId,
      req.userRole,
      req.query
    );
    return this.sendReportResponse(res, result, 'inspection_report', 'Inspection report generated successfully');
  });

  // ==================== REVENUE REPORT (Super Admin only) ====================

  /**
   * GET /api/reports/revenue
   * Super Admin ONLY - platform-wide revenue analytics
   */
  generateRevenueReport = asyncHandler(async (req, res) => {
    const isSuperAdmin = req.userRole === 'super_admin' || req.userRole === 'superadmin';
    if (!isSuperAdmin) {
      return sendResponse(res, 403, 'Access denied: Revenue reports are only available to super admins', null);
    }

    const result = await ReportService.generateRevenueReport(
      req.userId,
      req.userRole,
      req.query
    );
    return this.sendReportResponse(res, result, 'revenue_report', 'Revenue report generated successfully');
  });

  // ==================== COMPLIANCE REPORT (Admin + Super Admin) ====================

  /**
   * GET /api/reports/compliance
   * Admin: own org compliance | Super Admin: global compliance
   */
  generateComplianceReport = asyncHandler(async (req, res) => {
    const result = await ReportService.generateComplianceReport(
      req.userId,
      req.userRole,
      req.query
    );
    return this.sendReportResponse(res, result, 'compliance_report', 'Compliance report generated successfully');
  });

  // ==================== DASHBOARD ANALYTICS ====================

  /**
   * GET /api/reports/analytics/dashboard
   * Super Admin: platform-wide analytics
   * Admin: org-level analytics
   */
  getDashboardAnalytics = asyncHandler(async (req, res) => {
    const analytics = await ReportService.getDashboardAnalytics(
      req.userId,
      req.userRole,
      req.query
    );
    return sendResponse(res, 200, 'Dashboard analytics fetched successfully', analytics);
  });

  // ==================== KPI SUMMARY ====================

  /**
   * GET /api/reports/analytics/kpi
   * Super Admin: platform KPIs (clients, revenue, assets, assignments, checklists)
   * Admin: org KPIs (team, assets, assignments, checklists)
   */
  getKPISummary = asyncHandler(async (req, res) => {
    const kpiData = await ReportService.getKPISummary(
      req.userId,
      req.userRole,
      req.query
    );
    return sendResponse(res, 200, 'KPI summary fetched successfully', kpiData);
  });

  // ==================== BULK EXPORT ====================

  /**
   * POST /api/reports/export/bulk
   * Body: { reportTypes: ['clients','assets','team','checklists','assignments','inspections','revenue','compliance'], dateRange: {}, format: 'excel' }
   *
   * Super Admin can include: clients, assets, team, checklists, assignments, inspections, revenue, compliance
   * Admin can include: assets, team, checklists, assignments, inspections, compliance
   */
  exportBulkReports = asyncHandler(async (req, res) => {
    const { format = 'excel' } = req.body;

    const result = await ReportService.exportBulkReports(
      req.userId,
      req.userRole,
      req.body
    );

    if (format === 'excel' && Buffer.isBuffer(result)) {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=bulk_reports_${Date.now()}.xlsx`);
      return res.send(result);
    }

    const safeReports = JSON.parse(JSON.stringify(result, (key, value) => {
      if (['_workbook', '_worksheets', '_workbookRef'].includes(key)) return undefined;
      return value;
    }));

    return sendResponse(res, 200, 'Bulk reports generated successfully', safeReports);
  });

  // ==================== SCHEDULE REPORT ====================

  /**
   * POST /api/reports/schedule
   * Body: { reportType, schedule: { frequency: 'daily'|'weekly'|'monthly', time: 'HH:MM' }, recipients: [], format }
   */
  scheduleReport = asyncHandler(async (req, res) => {
    const { reportType, schedule, recipients, format } = req.body;

    // Validate that admin isn't trying to schedule super-admin-only reports
    const isSuperAdmin = req.userRole === 'super_admin' || req.userRole === 'superadmin';
    const superAdminOnlyReports = ['clients', 'revenue'];

    if (!isSuperAdmin && superAdminOnlyReports.includes(reportType)) {
      return sendResponse(res, 403, `Access denied: '${reportType}' reports can only be scheduled by super admins`, null);
    }

    const scheduledReport = {
      id: `SR-${Date.now()}`,
      reportType,
      schedule,
      recipients,
      format,
      createdBy: req.userId,
      createdByRole: req.userRole,
      createdAt: new Date(),
      nextRun: this.calculateNextRun(schedule),
      status: 'scheduled',
    };

    return sendResponse(res, 201, 'Report scheduled successfully', scheduledReport);
  });

  // ==================== HELPER METHODS ====================

  calculateNextRun(schedule) {
    const now = new Date();
    switch (schedule?.frequency) {
      case 'daily':   now.setDate(now.getDate() + 1); break;
      case 'weekly':  now.setDate(now.getDate() + 7); break;
      case 'monthly': now.setMonth(now.getMonth() + 1); break;
      default:        now.setDate(now.getDate() + 1);
    }
    const [hours = 9, minutes = 0] = (schedule?.time || '09:00').split(':').map(Number);
    now.setHours(hours, minutes, 0, 0);
    return now;
  }
}

export default new ReportController();