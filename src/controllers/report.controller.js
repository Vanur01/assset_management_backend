// controllers/report.controller.js
import ReportService from '../services/report.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/response.js';

class ReportController {

  /**
   * Generate report based on role and type
   * GET /api/reports/:reportType
   */
  generateReport = asyncHandler(async (req, res) => {
    const { userRole, userId } = req;
    const { reportType } = req.params;
    const filters = req.query;

    if (!userRole) {
      return sendResponse(res, 401, 'Unauthorized: role not found', null);
    }

    // Validate report type access based on role
    const allowedReports = {
      super_admin: [
        'clients', 'financial', 'checklists', 'assignments',
        'audit-logs', 'contact-inquiries', 'individual-client'
      ],
      admin: [
        'team-members', 'checklists', 'assignments', 'audit-logs',
        'assets', 'individual-team'
      ],
      team: ['assignments', 'audit-logs']
    };

    if (!allowedReports[userRole]?.includes(reportType)) {
      return sendResponse(res, 403, `Unauthorized: ${userRole} cannot access ${reportType} report`, null);
    }

    const result = await ReportService.generateReport(userRole, userId, reportType, filters);

    if (!result.success) {
      return sendResponse(res, 500, result.error || 'Failed to generate report', null);
    }

    return sendResponse(res, 200, 'Report generated successfully', result.data);
  });

  /**
   * Export report as CSV
   * GET /api/reports/:reportType/export
   */
  exportReport = asyncHandler(async (req, res) => {
    const { userRole, userId } = req;
    const { reportType } = req.params;
    const filters = req.query;

    const result = await ReportService.generateReport(userRole, userId, reportType, filters);

    if (!result.success) {
      return sendResponse(res, 500, result.error || 'Failed to generate report', null);
    }

    const csv = this.convertToCSV(result.data, reportType);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${reportType}_report_${Date.now()}.csv`);
    res.send(csv);
  });

  convertToCSV = (data, reportType) => {
    if (!data) return '';

    let headers = [];
    let rows = [];

    if (data.clients) {
      headers = ['ID', 'Name', 'Email', 'Status', 'Membership Plan', 'Team Members', 'Total Assignments', 'Completion Rate'];
      rows = data.clients.map(c => [c.id, c.name, c.email, c.status, c.membershipPlan, c.teamMembers, c.totalAssignments, c.completionRate]);
    } else if (data.teamMembers) {
      headers = ['ID', 'Name', 'Email', 'Status', 'Total Assignments', 'Completed', 'Completion Rate', 'Quality Score'];
      rows = data.teamMembers.map(m => [m.id, m.name, m.email, m.status, m.totalAssignments, m.completedAssignments, m.completionRate, m.qualityScore]);
    } else if (data.assignments) {
      headers = ['ID', 'Customer', 'Due Date', 'Status', 'Priority', 'Checklists', 'Is Overdue'];
      rows = data.assignments.map(a => [a.id, a.customer, a.dueDate, a.status, a.priority, a.checklists.join('; '), a.isOverdue]);
    } else if (data.logs) {
      headers = ['ID', 'Action', 'Resource', 'Actor', 'Description', 'Status', 'Timestamp'];
      rows = data.logs.map(l => [l.id, l.action, l.resource, l.actor?.name || 'System', l.description, l.status, l.timestamp]);
    } else if (data.assets) {
      headers = ['ID', 'Asset Name', 'Tag Number', 'Type', 'Status', 'Location', 'Current Value'];
      rows = data.assets.map(a => [a.id, a.assetName, a.tagNumber, a.type, a.status, a.currentLocation, a.currentValue]);
    } else if (data.inquiries) {
      headers = ['ID', 'Full Name', 'Email', 'Phone', 'Message', 'Submitted At'];
      rows = data.inquiries.map(i => [i.id, i.fullName, i.email, i.phone, i.message, i.submittedAt]);
    } else if (data.checklists) {
      headers = ['ID', 'Name', 'Category', 'Status', 'Version', 'Total Fields', 'Total Assignments', 'Completion Rate'];
      rows = data.checklists.map(c => [c.id, c.name, c.category, c.status, c.version, c.totalFields, c.usageStats?.totalAssignments, c.usageStats?.completionRate]);
    } else if (data.clientInfo) {
      headers = ['Field', 'Value'];
      rows = Object.entries(data.clientInfo).map(([key, value]) => [key, value]);
    } else if (data.teamInfo) {
      headers = ['Field', 'Value'];
      rows = Object.entries(data.teamInfo).map(([key, value]) => [key, value]);
    }

    const csvRows = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))];
    return csvRows.join('\n');
  };
}

export default new ReportController();