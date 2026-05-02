// controllers/report.controller.js
import ReportService from '../services/report.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/response.js';

class ReportController {
  
  // Helper to safely stringify report data
  safeStringifyReport(report) {
    return JSON.parse(JSON.stringify(report, (key, value) => {
      // Remove circular references and workbook objects
      if (key === '_workbook' || key === '_worksheets' || key === '_workbookRef' || 
          key === '_workbookView' || key === '_worksheetsView' || key === '_workbookRela') {
        return undefined;
      }
      // Handle Date objects
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value;
    }));
  }
  
  // ==================== REPORT GENERATION ====================
  
  /**
   * Generate Client Report
   * GET /api/reports/clients
   */
  generateClientReport = asyncHandler(async (req, res) => {
    const adminId = req.userRole === 'admin' ? req.userId : null;
    const result = await ReportService.generateClientReport(adminId, req.query);
    
    if (req.query.format === 'excel') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=client_report_${Date.now()}.xlsx`);
      return res.send(result);
    } else if (req.query.format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=client_report_${Date.now()}.pdf`);
      return res.send(result);
    }
    
    const safeReport = this.safeStringifyReport(result);
    return sendResponse(res, 200, 'Client report generated successfully', safeReport);
  });
  
  /**
   * Generate Asset Report
   * GET /api/reports/assets
   */
  generateAssetReport = asyncHandler(async (req, res) => {
    const result = await ReportService.generateAssetReport(req.userId, req.query);
    
    if (req.query.format === 'excel') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=asset_report_${Date.now()}.xlsx`);
      return res.send(result);
    } else if (req.query.format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=asset_report_${Date.now()}.pdf`);
      return res.send(result);
    }
    
    const safeReport = this.safeStringifyReport(result);
    return sendResponse(res, 200, 'Asset report generated successfully', safeReport);
  });
  
  /**
   * Generate Team Performance Report
   * GET /api/reports/team
   */
  generateTeamReport = asyncHandler(async (req, res) => {
    const result = await ReportService.generateTeamReport(req.userId, req.query);
    
    if (req.query.format === 'excel') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=team_report_${Date.now()}.xlsx`);
      return res.send(result);
    } else if (req.query.format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=team_report_${Date.now()}.pdf`);
      return res.send(result);
    }
    
    const safeReport = this.safeStringifyReport(result);
    return sendResponse(res, 200, 'Team performance report generated successfully', safeReport);
  });
  
  /**
   * Generate Inspection Report
   * GET /api/reports/inspections
   */
  generateInspectionReport = asyncHandler(async (req, res) => {
    const adminId = req.userRole === 'admin' ? req.userId : null;
    const result = await ReportService.generateInspectionReport(adminId, req.query);
    
    if (req.query.format === 'excel') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=inspection_report_${Date.now()}.xlsx`);
      return res.send(result);
    } else if (req.query.format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=inspection_report_${Date.now()}.pdf`);
      return res.send(result);
    }
    
    const safeReport = this.safeStringifyReport(result);
    return sendResponse(res, 200, 'Inspection report generated successfully', safeReport);
  });
  
  /**
   * Generate Financial Report
   * GET /api/reports/financial
   */
  generateFinancialReport = asyncHandler(async (req, res) => {
    const adminId = req.userRole === 'admin' ? req.userId : null;
    const result = await ReportService.generateFinancialReport(adminId, req.query);
    
    if (req.query.format === 'excel') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=financial_report_${Date.now()}.xlsx`);
      return res.send(result);
    } else if (req.query.format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=financial_report_${Date.now()}.pdf`);
      return res.send(result);
    }
    
    const safeReport = this.safeStringifyReport(result);
    return sendResponse(res, 200, 'Financial report generated successfully', safeReport);
  });
  
  /**
   * Generate Compliance Report
   * GET /api/reports/compliance
   */
  generateComplianceReport = asyncHandler(async (req, res) => {
    const result = await ReportService.generateComplianceReport(req.userId, req.query);
    
    if (req.query.format === 'excel') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=compliance_report_${Date.now()}.xlsx`);
      return res.send(result);
    } else if (req.query.format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=compliance_report_${Date.now()}.pdf`);
      return res.send(result);
    }
    
    const safeReport = this.safeStringifyReport(result);
    return sendResponse(res, 200, 'Compliance report generated successfully', safeReport);
  });
  
  /**
   * Generate Custom Report
   * POST /api/reports/custom
   */
  generateCustomReport = asyncHandler(async (req, res) => {
    const adminId = req.userRole === 'admin' ? req.userId : null;
    const result = await ReportService.generateCustomReport(adminId, req.body);
    
    if (req.body.format === 'excel') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=custom_report_${Date.now()}.xlsx`);
      return res.send(result);
    } else if (req.body.format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=custom_report_${Date.now()}.pdf`);
      return res.send(result);
    }
    
    const safeReport = this.safeStringifyReport(result);
    return sendResponse(res, 200, 'Custom report generated successfully', safeReport);
  });
  
  // ==================== ANALYTICS ENDPOINTS ====================
  
  /**
   * Get Dashboard Analytics
   * GET /api/reports/analytics/dashboard
   */
  getDashboardAnalytics = asyncHandler(async (req, res) => {
    const analytics = await ReportService.getDashboardAnalytics(
      req.userId,
      req.userRole,
      req.query
    );
    return sendResponse(res, 200, 'Dashboard analytics fetched successfully', analytics);
  });
  
  /**
   * Get KPI Summary
   * GET /api/reports/analytics/kpi
   */
  getKPISummary = asyncHandler(async (req, res) => {
    let kpiData;
    
    if (req.userRole === 'super_admin') {
      const report = await ReportService.generateClientReport(null, req.query);
      kpiData = {
        totalClients: report.summary?.totalClients || 0,
        activeClients: report.summary?.activeClients || 0,
        totalRevenue: report.summary?.totalRevenue || 0,
        averageCompletionRate: report.summary?.averageCompletionRate || 0
      };
    } else {
      const assetReport = await ReportService.generateAssetReport(req.userId, req.query);
      const teamReport = await ReportService.generateTeamReport(req.userId, req.query);
      kpiData = {
        totalAssets: assetReport.summary?.total || 0,
        totalTeamMembers: teamReport.summary?.totalMembers || 0,
        activeTeamMembers: teamReport.summary?.activeMembers || 0,
        averagePerformance: teamReport.summary?.averagePerformance || 0,
        totalInspections: teamReport.summary?.totalInspections || 0
      };
    }
    
    return sendResponse(res, 200, 'KPI summary fetched successfully', kpiData);
  });
  
  /**
   * Export Multiple Reports
   * POST /api/reports/export/bulk
   */
  exportBulkReports = asyncHandler(async (req, res) => {
    const { reportTypes, dateRange, format = 'excel' } = req.body;
    const reports = {};
    
    for (const type of reportTypes) {
      switch (type) {
        case 'clients':
          reports.clients = await ReportService.generateClientReport(
            req.userRole === 'admin' ? req.userId : null,
            { ...dateRange, format: 'json' }
          );
          break;
        case 'assets':
          reports.assets = await ReportService.generateAssetReport(req.userId, { ...dateRange, format: 'json' });
          break;
        case 'team':
          reports.team = await ReportService.generateTeamReport(req.userId, { ...dateRange, format: 'json' });
          break;
        case 'inspections':
          reports.inspections = await ReportService.generateInspectionReport(
            req.userRole === 'admin' ? req.userId : null,
            { ...dateRange, format: 'json' }
          );
          break;
        case 'financial':
          reports.financial = await ReportService.generateFinancialReport(
            req.userRole === 'admin' ? req.userId : null,
            { ...dateRange, format: 'json' }
          );
          break;
      }
    }
    
    if (format === 'excel') {
      const workbook = await ReportService.exportMultipleReportsToExcel(reports);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=bulk_reports_${Date.now()}.xlsx`);
      return res.send(workbook);
    }
    
    const safeReports = JSON.parse(JSON.stringify(reports, (key, value) => {
      if (key === '_workbook' || key === '_worksheets' || key === '_workbookRef') {
        return undefined;
      }
      return value;
    }));
    
    return sendResponse(res, 200, 'Bulk reports generated successfully', safeReports);
  });
  
  /**
   * Schedule Report
   * POST /api/reports/schedule
   */
  scheduleReport = asyncHandler(async (req, res) => {
    const { reportType, schedule, recipients, format } = req.body;
    
    const scheduledReport = {
      id: Date.now(),
      reportType,
      schedule,
      recipients,
      format,
      createdBy: req.userId,
      createdAt: new Date(),
      nextRun: this.calculateNextRun(schedule)
    };
    
    return sendResponse(res, 201, 'Report scheduled successfully', scheduledReport);
  });
  
  calculateNextRun(schedule) {
    const now = new Date();
    switch (schedule.frequency) {
      case 'daily':
        now.setDate(now.getDate() + 1);
        break;
      case 'weekly':
        now.setDate(now.getDate() + 7);
        break;
      case 'monthly':
        now.setMonth(now.getMonth() + 1);
        break;
      default:
        now.setDate(now.getDate() + 1);
    }
    now.setHours(schedule.time?.split(':')[0] || 9, schedule.time?.split(':')[1] || 0, 0, 0);
    return now;
  }
}

export default new ReportController();