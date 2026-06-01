// services/report.service.js - Unified Role-Based Report Service
import User from '../models/user.model.js';
import Asset from '../models/asset.model.js';
import Checklist from '../models/checklist.model.js';
import Assignment from '../models/AssignedChecklist.model.js';
import ChecklistRequest from '../models/Checklistrequest.model.js';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

/**
 * Role-Based Report Access Matrix:
 *
 * SUPER ADMIN can access:
 *   - Client Reports       (all clients/admins)
 *   - Checklist Reports    (all checklists globally)
 *   - Asset Reports        (all assets globally)
 *   - Assignment Reports   (all assignments globally)
 *   - Inspection Reports   (all inspections globally)
 *   - Revenue Reports      (financial/revenue data)
 *   - Team Reports         (all teams globally)
 *   - Dashboard Analytics  (platform-wide analytics)
 *
 * ADMIN can access:
 *   - Team Reports         (their own team members)
 *   - Checklist Reports    (their own checklists)
 *   - Asset Reports        (their own assets)
 *   - Assignment Reports   (assignments they created)
 *   - Inspection Reports   (inspections under them)
 *   - Compliance Reports   (compliance for their org)
 *   - Dashboard Analytics  (org-level analytics)
 */

class ReportService {

  // ==================== SAFE NUMBER HELPER ====================

  safeNumber(value, defaultValue = 0, decimals = 1) {
    const num = parseFloat(value);
    if (isNaN(num)) return defaultValue;
    return parseFloat(num.toFixed(decimals));
  }

  // ==================== ROLE ACCESS GUARD ====================

  /**
   * Returns scoped query filters based on role.
   * superAdmin → no adminId restriction (global)
   * admin       → restricted to their adminId
   */
  getRoleScope(userId, userRole) {
    const isSuperAdmin = userRole === 'super_admin' || userRole === 'superadmin';
    return { isSuperAdmin, adminId: isSuperAdmin ? null : userId };
  }

  // ==================== CLIENT REPORT (Super Admin only) ====================

  async generateClientReport(userId, userRole, filters = {}) {
    const { isSuperAdmin, adminId } = this.getRoleScope(userId, userRole);
    const { startDate, endDate, membershipPlan, status, format = 'json' } = filters;

    // Only super_admin can see client reports
    if (!isSuperAdmin && adminId) {
      // Admins get their own profile as a single-client report
      const query = { _id: new mongoose.Types.ObjectId(adminId), role: 'admin', isDeleted: false };
      return this._buildClientReport([await User.findOne(query).lean()].filter(Boolean), filters, format);
    }

    const query = { role: 'admin', isDeleted: false };
    if (membershipPlan) query.membershipPlan = membershipPlan;
    if (status) query.status = status;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const clients = await User.find(query)
      .select('customerName email phone website membershipPlan subscriptionStartDate subscriptionEndDate status licenseLimit usersUsed storageUsed storageLimit apiCallsThisMonth apiCallLimit createdAt')
      .lean();

    return this._buildClientReport(clients, filters, format);
  }

  async _buildClientReport(clients, filters, format) {
    const { startDate, endDate, membershipPlan, status } = filters;

    const clientsWithStats = await Promise.all(clients.map(async (client) => {
      const [teamCount, assetCount, inspectionCount, completedInspections] = await Promise.all([
        User.countDocuments({ adminId: client._id, role: 'team', isDeleted: false }),
        Asset.countDocuments({ adminId: client._id, isDeleted: false }),
        Assignment.countDocuments({ assignedBy: client._id }),
        Assignment.countDocuments({ assignedBy: client._id, status: 'completed' }),
      ]);

      const daysRemaining = client.subscriptionEndDate
        ? Math.max(0, Math.ceil((new Date(client.subscriptionEndDate) - new Date()) / (1000 * 60 * 60 * 24)))
        : 0;
      const usagePercentage = client.licenseLimit > 0
        ? Math.round((client.usersUsed / client.licenseLimit) * 100)
        : 0;

      return {
        ...client,
        teamCount,
        assetCount,
        inspectionCount,
        completedInspections,
        completionRate: inspectionCount > 0 ? this.safeNumber((completedInspections / inspectionCount) * 100, 0, 2) : 0,
        daysRemaining,
        usagePercentage,
      };
    }));

    const planPricing = { free: 0, standard: 49, premium: 99, enterprise: 299 };
    const totalRevenue = clientsWithStats.reduce((total, c) => total + (planPricing[c.membershipPlan] || 0) * 12, 0);

    const summary = {
      totalClients: clientsWithStats.length,
      activeClients: clientsWithStats.filter(c => c.status === 'active').length,
      totalRevenue,
      totalAssets: clientsWithStats.reduce((sum, c) => sum + (c.assetCount || 0), 0),
      totalInspections: clientsWithStats.reduce((sum, c) => sum + (c.inspectionCount || 0), 0),
      averageCompletionRate: this.safeNumber(
        clientsWithStats.reduce((sum, c) => sum + parseFloat(c.completionRate), 0) / (clientsWithStats.length || 1),
        0, 2
      ),
    };

    const report = {
      generatedAt: new Date(),
      reportType: 'client_report',
      filters: { startDate, endDate, membershipPlan, status },
      summary,
      data: clientsWithStats,
      totalRecords: clientsWithStats.length,
    };

    return this.formatReport(report, format);
  }

  // ==================== ASSET REPORT (Super Admin: all, Admin: own) ====================

  async generateAssetReport(userId, userRole, filters = {}) {
    const { isSuperAdmin, adminId } = this.getRoleScope(userId, userRole);
    const { startDate, endDate, status, category, condition, format = 'json' } = filters;

    const query = { isDeleted: false };

    // Admin scoped to their own assets; super_admin sees all
    if (!isSuperAdmin) {
      query.adminId = new mongoose.Types.ObjectId(adminId);
    }

    if (status) query.status = status;
    if (category) query.assetCategory = category;
    if (condition) query.assetCondition = condition;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const assets = await Asset.find(query)
      .populate('assignedUsers.primaryUser', 'firstName lastName email')
      .populate('parentAsset', 'assetName assetId')
      .lean();

    const stats = {
      total: assets.length,
      byStatus: this.groupBy(assets, 'status'),
      byCategory: this.groupBy(assets, 'assetCategory'),
      byCondition: this.groupBy(assets, 'assetCondition'),
      totalValue: assets.reduce((sum, a) => sum + (a.purchaseCost || 0), 0),
      averageHealthScore: this.safeNumber(
        assets.reduce((sum, a) => sum + (a.healthScore || 0), 0) / (assets.length || 1),
        0, 1
      ),
      assetsNeedingMaintenance: assets.filter(a => a.status === 'In Maintenance').length,
      assetsExpiringWarranty: assets.filter(a => {
        if (!a.warrantyExpiry) return false;
        const daysLeft = (new Date(a.warrantyExpiry) - new Date()) / (1000 * 60 * 60 * 24);
        return daysLeft <= 90 && daysLeft > 0;
      }).length,
    };

    const report = {
      generatedAt: new Date(),
      reportType: 'asset_report',
      filters: { startDate, endDate, status, category, condition },
      summary: stats,
      data: assets,
      totalRecords: assets.length,
    };

    return this.formatReport(report, format);
  }

  // ==================== TEAM REPORT (Super Admin: all, Admin: own) ====================

  async generateTeamReport(userId, userRole, filters = {}) {
    const { isSuperAdmin, adminId } = this.getRoleScope(userId, userRole);
    const { startDate, endDate, teamRole, status, format = 'json' } = filters;

    const query = { role: 'team', isDeleted: false };

    if (!isSuperAdmin) {
      query.adminId = new mongoose.Types.ObjectId(adminId);
    }

    if (teamRole) query.teamRole = teamRole;
    if (status) query.status = status;

    const teamMembers = await User.find(query)
      .select('firstName lastName email teamRole status assignedCount completedCount onTimeRate qualityScore performanceScore joinDate certifications adminId')
      .lean();

    const membersWithData = await Promise.all(teamMembers.map(async (member) => {
      const inspectionQuery = { 'assignedToTeamMembers.userId': member._id };
      if (startDate || endDate) {
        inspectionQuery.submittedAt = {};
        if (startDate) inspectionQuery.submittedAt.$gte = new Date(startDate);
        if (endDate) inspectionQuery.submittedAt.$lte = new Date(endDate);
      }

      const inspections = await Assignment.find(inspectionQuery).lean();
      const completed = inspections.filter(i => i.status === 'completed');
      const approved = inspections.filter(i => i.submissionStatus === 'approved');
      const onTime = completed.filter(i => i.submittedAt && i.dueDate && new Date(i.submittedAt) <= new Date(i.dueDate));

      return {
        ...member,
        totalInspections: inspections.length,
        completedInspections: completed.length,
        approvedInspections: approved.length,
        onTimeInspections: onTime.length,
        onTimeRate: this.safeNumber(completed.length > 0 ? (onTime.length / completed.length) * 100 : 0, 0, 1),
        approvalRate: this.safeNumber(inspections.length > 0 ? (approved.length / inspections.length) * 100 : 0, 0, 1),
        averageCompletionTime: this.calculateAvgCompletionTime(completed),
        monthlyTrend: this.calculateMonthlyTrend(inspections),
      };
    }));

    const summary = {
      totalMembers: membersWithData.length,
      activeMembers: membersWithData.filter(m => m.status === 'active').length,
      averagePerformance: this.safeNumber(
        membersWithData.reduce((sum, m) => sum + (m.performanceScore || 0), 0) / (membersWithData.length || 1),
        0, 1
      ),
      totalInspections: membersWithData.reduce((sum, m) => sum + (m.totalInspections || 0), 0),
      totalCompleted: membersWithData.reduce((sum, m) => sum + (m.completedInspections || 0), 0),
      averageOnTimeRate: this.safeNumber(
        membersWithData.reduce((sum, m) => sum + (m.onTimeRate || 0), 0) / (membersWithData.length || 1),
        0, 1
      ),
      topPerformers: [...membersWithData].sort((a, b) => b.performanceScore - a.performanceScore).slice(0, 5),
      byRole: this.groupBy(membersWithData, 'teamRole'),
    };

    const report = {
      generatedAt: new Date(),
      reportType: 'team_performance_report',
      filters: { startDate, endDate, teamRole, status },
      summary,
      data: membersWithData,
      totalRecords: membersWithData.length,
    };

    return this.formatReport(report, format);
  }

  // ==================== CHECKLIST REPORT (Super Admin: all, Admin: own) ====================

  async generateChecklistReport(userId, userRole, filters = {}) {
    const { isSuperAdmin, adminId } = this.getRoleScope(userId, userRole);
    const { startDate, endDate, type, status, category, format = 'json' } = filters;

    const query = {};

    if (!isSuperAdmin) {
      // Admin sees checklists they created OR global checklists assigned to them
      query.$or = [
        { createdBy: new mongoose.Types.ObjectId(adminId) },
        { type: 'global', status: 'active' },
      ];
    }

    if (type) query.type = type;
    if (status) query.status = status;
    if (category) query.category = category;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const checklists = await Checklist.find(query)
      .populate('createdBy', 'customerName email role')
      .lean();

    // Enrich with assignment counts
    const checklistsWithStats = await Promise.all(checklists.map(async (cl) => {
      const assignmentQuery = { checklist: cl._id };
      if (!isSuperAdmin) assignmentQuery.assignedBy = new mongoose.Types.ObjectId(adminId);

      const [totalAssignments, completedAssignments, approvedAssignments] = await Promise.all([
        Assignment.countDocuments(assignmentQuery),
        Assignment.countDocuments({ ...assignmentQuery, status: 'completed' }),
        Assignment.countDocuments({ ...assignmentQuery, submissionStatus: 'approved' }),
      ]);

      return {
        ...cl,
        totalAssignments,
        completedAssignments,
        approvedAssignments,
        completionRate: this.safeNumber(
          totalAssignments > 0 ? (completedAssignments / totalAssignments) * 100 : 0,
          0, 1
        ),
        approvalRate: this.safeNumber(
          totalAssignments > 0 ? (approvedAssignments / totalAssignments) * 100 : 0,
          0, 1
        ),
      };
    }));

    const summary = {
      total: checklistsWithStats.length,
      active: checklistsWithStats.filter(c => c.status === 'active').length,
      inactive: checklistsWithStats.filter(c => c.status === 'inactive').length,
      draft: checklistsWithStats.filter(c => c.status === 'draft').length,
      byType: this.groupBy(checklistsWithStats, 'type'),
      byCategory: this.groupBy(checklistsWithStats, 'category'),
      totalAssignments: checklistsWithStats.reduce((sum, c) => sum + (c.totalAssignments || 0), 0),
      totalCompleted: checklistsWithStats.reduce((sum, c) => sum + (c.completedAssignments || 0), 0),
      averageCompletionRate: this.safeNumber(
        checklistsWithStats.reduce((sum, c) => sum + c.completionRate, 0) / (checklistsWithStats.length || 1),
        0, 1
      ),
    };

    const report = {
      generatedAt: new Date(),
      reportType: 'checklist_report',
      filters: { startDate, endDate, type, status, category },
      summary,
      data: checklistsWithStats,
      totalRecords: checklistsWithStats.length,
    };

    return this.formatReport(report, format);
  }

  // ==================== ASSIGNMENT REPORT (Super Admin: all, Admin: own) ====================

  async generateAssignmentReport(userId, userRole, filters = {}) {
    const { isSuperAdmin, adminId } = this.getRoleScope(userId, userRole);
    const { startDate, endDate, status, priority, assignedTo, format = 'json' } = filters;

    const query = {};

    if (!isSuperAdmin) {
      query.assignedBy = new mongoose.Types.ObjectId(adminId);
    }

    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (assignedTo) query['assignedToTeamMembers.userId'] = new mongoose.Types.ObjectId(assignedTo);

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const assignments = await Assignment.find(query)
      .populate('checklist', 'name type category totalFields')
      .populate('assignedToTeamMembers.userId', 'firstName lastName email')
      .populate('assignedBy', 'customerName email role')
      .populate('assets.assetId', 'assetName assetId tagNumber')
      .lean();

    const completed = assignments.filter(a => a.status === 'completed');
    const approved = assignments.filter(a => a.submissionStatus === 'approved');
    const overdue = assignments.filter(a => a.status === 'overdue');
    const pending = assignments.filter(a => a.status === 'pending');

    const summary = {
      total: assignments.length,
      pending: pending.length,
      completed: completed.length,
      approved: approved.length,
      overdue: overdue.length,
      rejected: assignments.filter(a => a.submissionStatus === 'rejected').length,
      inProgress: assignments.filter(a => a.status === 'in_progress').length,
      completionRate: this.safeNumber(
        assignments.length > 0 ? (completed.length / assignments.length) * 100 : 0,
        0, 1
      ),
      approvalRate: this.safeNumber(
        assignments.length > 0 ? (approved.length / assignments.length) * 100 : 0,
        0, 1
      ),
      overdueRate: this.safeNumber(
        assignments.length > 0 ? (overdue.length / assignments.length) * 100 : 0,
        0, 1
      ),
      byPriority: this.groupBy(assignments, 'priority'),
      byStatus: this.groupBy(assignments, 'status'),
      averageCompletionRate: this.safeNumber(
        assignments.reduce((sum, a) => sum + (a.completionRate || 0), 0) / (assignments.length || 1),
        0, 1
      ),
    };

    const report = {
      generatedAt: new Date(),
      reportType: 'assignment_report',
      filters: { startDate, endDate, status, priority, assignedTo },
      summary,
      data: assignments,
      totalRecords: assignments.length,
    };

    return this.formatReport(report, format);
  }

  // ==================== INSPECTION REPORT (Super Admin: all, Admin: own) ====================

  async generateInspectionReport(userId, userRole, filters = {}) {
    const { isSuperAdmin, adminId } = this.getRoleScope(userId, userRole);
    const { startDate, endDate, status, checklistId, assignedTo, format = 'json' } = filters;

    const query = {
      status: { $in: ['completed', 'approved', 'rejected', 'submitted', 'under_review'] },
    };

    if (!isSuperAdmin) {
      query.assignedBy = new mongoose.Types.ObjectId(adminId);
    }

    if (checklistId) query.checklist = new mongoose.Types.ObjectId(checklistId);
    if (assignedTo) query['assignedToTeamMembers.userId'] = new mongoose.Types.ObjectId(assignedTo);
    if (status) query.status = status;

    if (startDate || endDate) {
      query.submittedAt = {};
      if (startDate) query.submittedAt.$gte = new Date(startDate);
      if (endDate) query.submittedAt.$lte = new Date(endDate);
    }

    const inspections = await Assignment.find(query)
      .populate('checklist', 'name type category totalFields')
      .populate('assignedToTeamMembers.userId', 'firstName lastName email')
      .populate('assets.assetId', 'assetName assetId tagNumber currentLocation')
      .populate('assignedBy', 'customerName email')
      .lean();

    const completed = inspections.filter(i => i.status === 'completed' || i.status === 'approved');
    const approved = inspections.filter(i => i.submissionStatus === 'approved');
    const rejected = inspections.filter(i => i.submissionStatus === 'rejected');
    const pendingReview = inspections.filter(i => i.submissionStatus === 'pending_review');

    const stats = {
      total: inspections.length,
      completed: completed.length,
      approved: approved.length,
      rejected: rejected.length,
      pendingReview: pendingReview.length,
      approvalRate: this.safeNumber(
        inspections.length > 0 ? (approved.length / inspections.length) * 100 : 0,
        0, 1
      ),
      completionRate: this.safeNumber(
        inspections.length > 0 ? (completed.length / inspections.length) * 100 : 0,
        0, 1
      ),
      averageCompletionRate: this.safeNumber(
        completed.reduce((sum, i) => sum + (i.completionRate || 0), 0) / (completed.length || 1),
        0, 1
      ),
      averageScore: this.safeNumber(
        completed.reduce((sum, i) => sum + (i.overallRating || 0), 0) / (completed.length || 1),
        0, 1
      ),
      responseQuality: this.calculateResponseQuality(inspections),
      completionTimeDistribution: this.calculateCompletionTimeDistribution(completed),
      byChecklist: this.groupBy(inspections, 'checklistName'),
      byStatus: this.groupBy(inspections, 'status'),
    };

    const report = {
      generatedAt: new Date(),
      reportType: 'inspection_report',
      filters: { startDate, endDate, status, checklistId, assignedTo },
      summary: stats,
      data: inspections,
      totalRecords: inspections.length,
    };

    return this.formatReport(report, format);
  }

  // ==================== REVENUE REPORT (Super Admin only) ====================

  async generateRevenueReport(userId, userRole, filters = {}) {
    const { isSuperAdmin } = this.getRoleScope(userId, userRole);
    const { startDate, endDate, format = 'json' } = filters;

    if (!isSuperAdmin) {
      throw new Error('Access denied: Revenue reports are only available to super admins');
    }

    const query = { role: 'admin', isDeleted: false };
    const clients = await User.find(query)
      .select('customerName membershipPlan subscriptionStartDate subscriptionEndDate licenseLimit usersUsed status createdAt')
      .lean();

    const planPricing = { free: 0, standard: 49, premium: 99, enterprise: 299 };
    let totalRevenue = 0;
    let mrr = 0;
    const revenueByPlan = {};
    const revenueByMonth = {};
    const clientRevenueDetails = [];

    clients.forEach(client => {
      const planRevenue = planPricing[client.membershipPlan] || 0;
      const annualRevenue = planRevenue * 12;
      totalRevenue += annualRevenue;
      mrr += planRevenue;

      revenueByPlan[client.membershipPlan] = (revenueByPlan[client.membershipPlan] || 0) + planRevenue;

      if (client.subscriptionStartDate) {
        const month = new Date(client.subscriptionStartDate).toLocaleString('default', { month: 'short', year: 'numeric' });
        revenueByMonth[month] = (revenueByMonth[month] || 0) + planRevenue;
      }

      clientRevenueDetails.push({
        customerName: client.customerName,
        plan: client.membershipPlan,
        monthlyRevenue: planRevenue,
        annualRevenue,
        licensesUsed: client.usersUsed,
        licenseCapacity: client.licenseLimit,
        utilizationRate: this.safeNumber(
          client.licenseLimit > 0 ? (client.usersUsed / client.licenseLimit) * 100 : 0,
          0, 2
        ),
        subscriptionEndDate: client.subscriptionEndDate,
        status: client.status,
      });
    });

    const previousPeriodRevenue = mrr * 0.85;
    const revenueGrowth = this.safeNumber(
      previousPeriodRevenue > 0 ? ((mrr - previousPeriodRevenue) / previousPeriodRevenue) * 100 : 0,
      0, 2
    );

    const projectedRevenue = this.calculateProjectedRevenue(clients, planPricing);

    // Plan distribution
    const planDistribution = {};
    Object.keys(revenueByPlan).forEach(plan => {
      planDistribution[plan] = {
        clientCount: clients.filter(c => c.membershipPlan === plan).length,
        monthlyRevenue: revenueByPlan[plan],
        annualRevenue: revenueByPlan[plan] * 12,
        percentageOfRevenue: this.safeNumber(mrr > 0 ? (revenueByPlan[plan] / mrr) * 100 : 0, 0, 1),
      };
    });

    const summary = {
      totalClients: clients.length,
      payingClients: clients.filter(c => c.membershipPlan !== 'free').length,
      freeClients: clients.filter(c => c.membershipPlan === 'free').length,
      monthlyRecurringRevenue: mrr,
      annualRecurringRevenue: totalRevenue,
      averageRevenuePerClient: this.safeNumber(clients.length > 0 ? mrr / clients.length : 0, 0, 2),
      averageRevenuePerPayingClient: this.safeNumber(
        clients.filter(c => c.membershipPlan !== 'free').length > 0
          ? mrr / clients.filter(c => c.membershipPlan !== 'free').length
          : 0,
        0, 2
      ),
      revenueGrowth,
      projectedAnnualRevenue: projectedRevenue.total,
      projectedMonthlyRevenue: projectedRevenue.monthly,
      planDistribution,
      revenueByMonth,
    };

    const report = {
      generatedAt: new Date(),
      reportType: 'revenue_report',
      filters: { startDate, endDate },
      summary,
      data: clientRevenueDetails,
      totalRecords: clients.length,
    };

    return this.formatReport(report, format);
  }

  // ==================== COMPLIANCE REPORT (Admin only) ====================

  async generateComplianceReport(userId, userRole, filters = {}) {
    const { isSuperAdmin, adminId } = this.getRoleScope(userId, userRole);
    const { startDate, endDate, format = 'json' } = filters;

    const scopedAdminId = isSuperAdmin ? null : adminId;

    const inspectionQuery = {};
    if (scopedAdminId) inspectionQuery.assignedBy = new mongoose.Types.ObjectId(scopedAdminId);
    if (startDate || endDate) {
      inspectionQuery.submittedAt = {};
      if (startDate) inspectionQuery.submittedAt.$gte = new Date(startDate);
      if (endDate) inspectionQuery.submittedAt.$lte = new Date(endDate);
    }

    const assetQuery = { isDeleted: false };
    if (scopedAdminId) assetQuery.adminId = new mongoose.Types.ObjectId(scopedAdminId);

    const [inspections, assets] = await Promise.all([
      Assignment.find(inspectionQuery)
        .populate('checklist', 'name category')
        .populate('assets.assetId', 'assetName assetCategory')
        .lean(),
      Asset.find(assetQuery).select('assetName assetCategory status lastInspectionDate').lean(),
    ]);

    const overdueAssets = assets.filter(a => {
      if (!a.lastInspectionDate) return true;
      const daysSinceLast = (new Date() - new Date(a.lastInspectionDate)) / (1000 * 60 * 60 * 24);
      return daysSinceLast > 365;
    });

    const approvedCount = inspections.filter(i => i.submissionStatus === 'approved').length;
    const inspectedAssetIds = new Set(
      inspections.flatMap(i => (i.assets || []).map(a => a.assetId?.toString())).filter(Boolean)
    );

    const complianceStats = {
      totalInspections: inspections.length,
      completedInspections: inspections.filter(i => i.status === 'completed').length,
      approvedInspections: approvedCount,
      complianceRate: this.safeNumber(
        inspections.length > 0 ? (approvedCount / inspections.length) * 100 : 0,
        0, 1
      ),
      assetsInspected: inspectedAssetIds.size,
      totalAssets: assets.length,
      assetCoverage: this.safeNumber(
        assets.length > 0 ? (inspectedAssetIds.size / assets.length) * 100 : 0,
        0, 1
      ),
      overdueAssets: overdueAssets.length,
      pendingReviews: inspections.filter(i => i.submissionStatus === 'pending_review').length,
      averageResponseTime: this.calculateAvgResponseTime(inspections),
    };

    const recommendations = this.generateComplianceRecommendations(complianceStats, overdueAssets);

    const report = {
      generatedAt: new Date(),
      reportType: 'compliance_report',
      filters: { startDate, endDate },
      summary: complianceStats,
      recommendations,
      data: { inspections: inspections.slice(0, 100), overdueAssets },
      totalRecords: inspections.length,
    };

    return this.formatReport(report, format);
  }

  // ==================== DASHBOARD ANALYTICS ====================

  async getDashboardAnalytics(userId, userRole, filters = {}) {
    const { isSuperAdmin, adminId } = this.getRoleScope(userId, userRole);
    const { dateRange = 30 } = filters;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(dateRange));

    if (isSuperAdmin) {
      return this._getSuperAdminAnalytics(startDate, endDate);
    } else {
      return this._getAdminAnalytics(adminId, startDate, endDate);
    }
  }

  async _getSuperAdminAnalytics(startDate, endDate) {
    const [clientGrowth, revenueTrend, checklistUsage, topPerformers, requestTrend, assetOverview, inspectionOverview] =
      await Promise.all([
        this._getClientGrowthData(startDate, endDate),
        this._getRevenueTrendData(startDate, endDate),
        this._getChecklistUsageData(startDate, endDate),
        this._getTopPerformingClients(10),
        this._getRequestTrendData(startDate, endDate),
        this._getGlobalAssetOverview(),
        this._getGlobalInspectionOverview(startDate, endDate),
      ]);

    return {
      role: 'super_admin',
      clientGrowth,
      revenueTrend,
      checklistUsage,
      topPerformers,
      requestTrend,
      assetOverview,
      inspectionOverview,
      insights: this._generateSuperAdminInsights({ clientGrowth, revenueTrend, checklistUsage }),
    };
  }

  async _getAdminAnalytics(adminId, startDate, endDate) {
    const [teamPerformance, assetHealth, inspectionTrend, completionRates, pendingTasks, checklistStats] =
      await Promise.all([
        this._getTeamPerformanceData(adminId, startDate, endDate),
        this._getAssetHealthData(adminId),
        this._getInspectionTrendData(adminId, startDate, endDate),
        this._getCompletionRateData(adminId, startDate, endDate),
        this._getPendingTasksData(adminId),
        this._getAdminChecklistStats(adminId, startDate, endDate),
      ]);

    return {
      role: 'admin',
      teamPerformance,
      assetHealth,
      inspectionTrend,
      completionRates,
      pendingTasks,
      checklistStats,
      insights: this._generateAdminInsights({ teamPerformance, assetHealth, inspectionTrend }),
    };
  }

  // ==================== KPI SUMMARY ====================

  async getKPISummary(userId, userRole, filters = {}) {
    const { isSuperAdmin, adminId } = this.getRoleScope(userId, userRole);

    if (isSuperAdmin) {
      const [clients, assets, assignments, checklists] = await Promise.all([
        User.countDocuments({ role: 'admin', isDeleted: false }),
        Asset.countDocuments({ isDeleted: false }),
        Assignment.countDocuments({}),
        Checklist.countDocuments({ status: 'active' }),
      ]);

      const activeClients = await User.countDocuments({ role: 'admin', isDeleted: false, status: 'active' });
      const completedAssignments = await Assignment.countDocuments({ status: { $in: ['completed', 'approved'] } });
      const planPricing = { free: 0, standard: 49, premium: 99, enterprise: 299 };
      const allClients = await User.find({ role: 'admin', isDeleted: false }).select('membershipPlan').lean();
      const mrr = allClients.reduce((sum, c) => sum + (planPricing[c.membershipPlan] || 0), 0);

      return {
        totalClients: clients,
        activeClients,
        monthlyRecurringRevenue: mrr,
        totalAssets: assets,
        totalAssignments: assignments,
        completedAssignments,
        activeChecklists: checklists,
        completionRate: this.safeNumber(
          assignments > 0 ? (completedAssignments / assignments) * 100 : 0, 0, 1
        ),
      };
    } else {
      const [teamCount, assetCount, assignmentCount, checklistCount] = await Promise.all([
        User.countDocuments({ adminId: new mongoose.Types.ObjectId(adminId), role: 'team', isDeleted: false }),
        Asset.countDocuments({ adminId: new mongoose.Types.ObjectId(adminId), isDeleted: false }),
        Assignment.countDocuments({ assignedBy: new mongoose.Types.ObjectId(adminId) }),
        Checklist.countDocuments({ createdBy: new mongoose.Types.ObjectId(adminId), status: 'active' }),
      ]);

      const completedAssignments = await Assignment.countDocuments({
        assignedBy: new mongoose.Types.ObjectId(adminId),
        status: { $in: ['completed', 'approved'] },
      });
      const overdueAssignments = await Assignment.countDocuments({
        assignedBy: new mongoose.Types.ObjectId(adminId),
        status: 'overdue',
      });

      return {
        totalTeamMembers: teamCount,
        totalAssets: assetCount,
        totalAssignments: assignmentCount,
        completedAssignments,
        overdueAssignments,
        activeChecklists: checklistCount,
        completionRate: this.safeNumber(
          assignmentCount > 0 ? (completedAssignments / assignmentCount) * 100 : 0, 0, 1
        ),
      };
    }
  }

  // ==================== BULK EXPORT ====================

  async exportBulkReports(userId, userRole, body = {}) {
    const { isSuperAdmin } = this.getRoleScope(userId, userRole);
    const { reportTypes, dateRange, format = 'excel' } = body;
    const reports = {};

    const jsonFilters = { ...(dateRange || {}), format: 'json' };

    for (const type of reportTypes) {
      switch (type) {
        case 'clients':
          reports.clients = await this.generateClientReport(userId, userRole, jsonFilters);
          break;
        case 'assets':
          reports.assets = await this.generateAssetReport(userId, userRole, jsonFilters);
          break;
        case 'team':
          reports.team = await this.generateTeamReport(userId, userRole, jsonFilters);
          break;
        case 'checklists':
          reports.checklists = await this.generateChecklistReport(userId, userRole, jsonFilters);
          break;
        case 'assignments':
          reports.assignments = await this.generateAssignmentReport(userId, userRole, jsonFilters);
          break;
        case 'inspections':
          reports.inspections = await this.generateInspectionReport(userId, userRole, jsonFilters);
          break;
        case 'revenue':
          if (isSuperAdmin) {
            reports.revenue = await this.generateRevenueReport(userId, userRole, jsonFilters);
          }
          break;
        case 'compliance':
          reports.compliance = await this.generateComplianceReport(userId, userRole, jsonFilters);
          break;
      }
    }

    if (format === 'excel') {
      return this.exportMultipleReportsToExcel(reports);
    }

    return reports;
  }

  // ==================== PRIVATE ANALYTICS HELPERS ====================

  async _getClientGrowthData(startDate, endDate) {
    const total = await User.countDocuments({ role: 'admin', isDeleted: false });
    const newClients = await User.countDocuments({ role: 'admin', isDeleted: false, createdAt: { $gte: startDate, $lte: endDate } });
    const periodMs = endDate - startDate;
    const previousStart = new Date(startDate.getTime() - periodMs);
    const previousNewClients = await User.countDocuments({ role: 'admin', isDeleted: false, createdAt: { $gte: previousStart, $lt: startDate } });
    const growth = previousNewClients > 0 ? ((newClients - previousNewClients) / previousNewClients) * 100 : 0;

    return { total, new: newClients, previous: previousNewClients, growth: this.safeNumber(growth, 0, 1) };
  }

  async _getRevenueTrendData(startDate, endDate) {
    const clients = await User.find({ role: 'admin', isDeleted: false, membershipPlan: { $ne: 'free' } }).select('membershipPlan').lean();
    const planPricing = { standard: 49, premium: 99, enterprise: 299 };
    const currentRevenue = clients.reduce((sum, c) => sum + (planPricing[c.membershipPlan] || 0), 0);
    const previousRevenue = currentRevenue * 0.85;
    const growth = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0;

    return {
      current: currentRevenue,
      previous: previousRevenue,
      growth: this.safeNumber(growth, 0, 1),
      projected: this.safeNumber(currentRevenue * 1.1, 0, 0),
    };
  }

  async _getChecklistUsageData(startDate, endDate) {
    const [total, active, newChecklists] = await Promise.all([
      Checklist.countDocuments({}),
      Checklist.countDocuments({ status: 'active' }),
      Checklist.countDocuments({ createdAt: { $gte: startDate, $lte: endDate } }),
    ]);
    const activeRate = total > 0 ? (active / total) * 100 : 0;

    return { total, active, activeRate: this.safeNumber(activeRate, 0, 1), new: newChecklists };
  }

  async _getTopPerformingClients(limit) {
    return User.aggregate([
      { $match: { role: 'admin', isDeleted: false, status: 'active' } },
      { $lookup: { from: 'assignments', localField: '_id', foreignField: 'assignedBy', as: 'assignments' } },
      {
        $addFields: {
          completionRate: {
            $multiply: [
              { $divide: [
                { $size: { $filter: { input: '$assignments', cond: { $eq: ['$$this.status', 'completed'] } } } },
                { $max: [{ $size: '$assignments' }, 1] },
              ]},
              100,
            ],
          },
        },
      },
      { $sort: { completionRate: -1 } },
      { $limit: limit },
      { $project: { customerName: 1, email: 1, membershipPlan: 1, completionRate: 1 } },
    ]);
  }

  async _getRequestTrendData(startDate, endDate) {
    const requests = await ChecklistRequest.aggregate([
      { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' } }, count: { $sum: 1 }, date: { $first: '$createdAt' } } },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
    ]);
    return requests.map(r => ({ date: r.date, count: r.count }));
  }

  async _getGlobalAssetOverview() {
    const [total, inMaintenance, critical] = await Promise.all([
      Asset.countDocuments({ isDeleted: false }),
      Asset.countDocuments({ isDeleted: false, status: 'In Maintenance' }),
      Asset.countDocuments({ isDeleted: false, assetCondition: 'Critical' }),
    ]);
    const byCategory = await Asset.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$assetCategory', count: { $sum: 1 } } },
    ]);
    return { total, inMaintenance, critical, byCategory: byCategory.reduce((acc, c) => { acc[c._id] = c.count; return acc; }, {}) };
  }

  async _getGlobalInspectionOverview(startDate, endDate) {
    const [total, completed, approved] = await Promise.all([
      Assignment.countDocuments({ createdAt: { $gte: startDate, $lte: endDate } }),
      Assignment.countDocuments({ status: 'completed', createdAt: { $gte: startDate, $lte: endDate } }),
      Assignment.countDocuments({ submissionStatus: 'approved', createdAt: { $gte: startDate, $lte: endDate } }),
    ]);
    return {
      total,
      completed,
      approved,
      completionRate: this.safeNumber(total > 0 ? (completed / total) * 100 : 0, 0, 1),
    };
  }

  async _getTeamPerformanceData(adminId, startDate, endDate) {
    const team = await User.find({ adminId, role: 'team', isDeleted: false }).lean();
    const assignments = await Assignment.find({ assignedBy: adminId, submittedAt: { $gte: startDate, $lte: endDate } }).lean();
    const completed = assignments.filter(a => a.status === 'completed');
    const onTime = completed.filter(a => a.submittedAt && a.dueDate && new Date(a.submittedAt) <= new Date(a.dueDate));
    const onTimeRate = completed.length > 0 ? (onTime.length / completed.length) * 100 : 0;
    const averageScore = completed.length > 0 ? completed.reduce((sum, a) => sum + (a.completionRate || 0), 0) / completed.length : 0;

    return {
      totalMembers: team.length,
      totalAssignments: assignments.length,
      completedAssignments: completed.length,
      onTimeRate: this.safeNumber(onTimeRate, 0, 1),
      averageScore: this.safeNumber(averageScore, 0, 1),
    };
  }

  async _getAssetHealthData(adminId) {
    const assets = await Asset.find({ adminId, isDeleted: false }).lean();
    const critical = assets.filter(a => a.assetCondition === 'Critical');
    const maintenance = assets.filter(a => a.status === 'In Maintenance');
    const averageHealth = assets.length > 0 ? assets.reduce((sum, a) => sum + (a.healthScore || 0), 0) / assets.length : 0;

    return {
      total: assets.length,
      critical: critical.length,
      maintenance: maintenance.length,
      averageHealth: this.safeNumber(averageHealth, 0, 1),
    };
  }

  async _getInspectionTrendData(adminId, startDate, endDate) {
    const assignments = await Assignment.aggregate([
      { $match: { assignedBy: new mongoose.Types.ObjectId(adminId), submittedAt: { $gte: startDate, $lte: endDate } } },
      { $group: {
          _id: { year: { $year: '$submittedAt' }, month: { $month: '$submittedAt' }, day: { $dayOfMonth: '$submittedAt' } },
          count: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          approved: { $sum: { $cond: [{ $eq: ['$submissionStatus', 'approved'] }, 1, 0] } },
      }},
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
    ]);

    const totalCount = assignments.reduce((sum, a) => sum + a.count, 0);
    const completedCount = assignments.reduce((sum, a) => sum + a.completed, 0);
    const completionRate = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

    return {
      trend: assignments.map(a => ({
        date: new Date(a._id.year, a._id.month - 1, a._id.day),
        total: a.count,
        completed: a.completed,
        approved: a.approved,
      })),
      completionRate: this.safeNumber(completionRate, 0, 1),
    };
  }

  async _getCompletionRateData(adminId, startDate, endDate) {
    const assignments = await Assignment.find({ assignedBy: adminId, submittedAt: { $gte: startDate, $lte: endDate } }).lean();
    const weeklyData = [];
    const currentDate = new Date(startDate);
    let weekNumber = 1;

    while (currentDate <= endDate) {
      const weekEnd = new Date(currentDate);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const weekAssignments = assignments.filter(a =>
        new Date(a.submittedAt) >= currentDate && new Date(a.submittedAt) < weekEnd
      );
      const completionRate = weekAssignments.length > 0
        ? weekAssignments.reduce((sum, a) => sum + (a.completionRate || 0), 0) / weekAssignments.length
        : 0;

      weeklyData.push({ week: `Week ${weekNumber}`, completionRate: this.safeNumber(completionRate, 0, 1) });
      currentDate.setDate(currentDate.getDate() + 7);
      weekNumber++;
    }

    return weeklyData;
  }

  async _getPendingTasksData(adminId) {
    return Assignment.countDocuments({
      assignedBy: adminId,
      status: { $in: ['pending', 'in_progress'] },
      dueDate: { $gte: new Date() },
    });
  }

  async _getAdminChecklistStats(adminId, startDate, endDate) {
    const [total, active, recentlyUsed] = await Promise.all([
      Checklist.countDocuments({ createdBy: new mongoose.Types.ObjectId(adminId) }),
      Checklist.countDocuments({ createdBy: new mongoose.Types.ObjectId(adminId), status: 'active' }),
      Checklist.countDocuments({ createdBy: new mongoose.Types.ObjectId(adminId), lastUsedAt: { $gte: startDate } }),
    ]);
    return { total, active, recentlyUsed };
  }

  // ==================== INSIGHTS ====================

  _generateSuperAdminInsights(data) {
    const insights = [];
    if (data.clientGrowth?.growth !== undefined) {
      const growth = this.safeNumber(data.clientGrowth.growth, 0, 1);
      if (growth > 10) insights.push(`Client base grew by ${growth}% this period. Excellent growth!`);
      else if (growth < 0) insights.push(`Client base declined by ${Math.abs(growth)}%. Review acquisition strategies.`);
    }
    if (data.revenueTrend?.growth !== undefined) {
      const revenueGrowth = this.safeNumber(data.revenueTrend.growth, 0, 1);
      if (revenueGrowth > 15) insights.push(`Revenue increased by ${revenueGrowth}%. Great performance!`);
    }
    if (data.checklistUsage?.activeRate !== undefined) {
      const activeRate = this.safeNumber(data.checklistUsage.activeRate, 0, 1);
      if (activeRate < 50) insights.push(`Only ${activeRate}% of checklists are active. Review inactive checklists.`);
    }
    return insights;
  }

  _generateAdminInsights(data) {
    const insights = [];
    if (data.teamPerformance?.averageScore !== undefined) {
      const avgScore = this.safeNumber(data.teamPerformance.averageScore, 0, 1);
      if (avgScore < 70) insights.push('Team performance is below target. Consider additional training.');
    }
    if (data.assetHealth?.critical !== undefined && data.assetHealth.critical > 5) {
      insights.push(`${data.assetHealth.critical} assets are in critical condition. Immediate attention required.`);
    }
    if (data.inspectionTrend?.completionRate !== undefined) {
      const completionRate = this.safeNumber(data.inspectionTrend.completionRate, 0, 1);
      if (completionRate < 60) insights.push('Inspection completion rate is low. Review team workload and deadlines.');
    }
    return insights;
  }

  // ==================== HELPER METHODS ====================

  groupBy(array, key) {
    return array.reduce((result, item) => {
      const value = key.includes('.')
        ? key.split('.').reduce((obj, k) => obj?.[k], item)
        : item[key];
      const groupKey = value || 'Unknown';
      result[groupKey] = (result[groupKey] || 0) + 1;
      return result;
    }, {});
  }

  calculateMonthlyTrend(inspections) {
    const trend = {};
    inspections.forEach(i => {
      if (i.submittedAt) {
        const month = new Date(i.submittedAt).toLocaleString('default', { month: 'short', year: 'numeric' });
        trend[month] = (trend[month] || 0) + 1;
      }
    });
    return Object.entries(trend).map(([month, count]) => ({ month, count }));
  }

  calculateAvgCompletionTime(inspections) {
    const times = inspections
      .filter(i => i.startedAt && i.submittedAt)
      .map(i => (new Date(i.submittedAt) - new Date(i.startedAt)) / (1000 * 60));
    return this.safeNumber(times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0, 0, 1);
  }

  calculateAvgResponseTime(inspections) {
    const times = inspections
      .filter(i => i.submittedAt && i.reviewedAt)
      .map(i => (new Date(i.reviewedAt) - new Date(i.submittedAt)) / (1000 * 60 * 60));
    return this.safeNumber(times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0, 0, 1);
  }

  calculateResponseQuality(inspections) {
    const completed = inspections.filter(i => i.status === 'completed' || i.status === 'approved');
    const completeResponses = completed.filter(i => i.completionRate === 100).length;
    const partialResponses = completed.filter(i => i.completionRate < 100 && i.completionRate > 0).length;

    return {
      completeResponses: this.safeNumber(completed.length > 0 ? (completeResponses / completed.length) * 100 : 0, 0, 1),
      partialResponses: this.safeNumber(completed.length > 0 ? (partialResponses / completed.length) * 100 : 0, 0, 1),
      averageCompletionRate: this.safeNumber(
        completed.reduce((sum, i) => sum + (i.completionRate || 0), 0) / (completed.length || 1),
        0, 1
      ),
    };
  }

  calculateCompletionTimeDistribution(inspections) {
    const distribution = { '0-30 min': 0, '30-60 min': 0, '1-2 hours': 0, '2-4 hours': 0, '4+ hours': 0 };
    inspections.forEach(i => {
      if (i.startedAt && i.submittedAt) {
        const minutes = (new Date(i.submittedAt) - new Date(i.startedAt)) / (1000 * 60);
        if (minutes <= 30) distribution['0-30 min']++;
        else if (minutes <= 60) distribution['30-60 min']++;
        else if (minutes <= 120) distribution['1-2 hours']++;
        else if (minutes <= 240) distribution['2-4 hours']++;
        else distribution['4+ hours']++;
      }
    });
    return distribution;
  }

  calculateProjectedRevenue(clients, planPricing) {
    const monthly = clients.reduce((total, c) => total + (planPricing[c.membershipPlan] || 0), 0);
    const growthRate = 0.10;
    const projectedMonthly = monthly * (1 + growthRate);
    return { monthly: projectedMonthly, quarterly: projectedMonthly * 3, total: projectedMonthly * 12, growthRate: growthRate * 100 };
  }

  generateComplianceRecommendations(stats, overdueAssets) {
    const recommendations = [];
    if (stats.complianceRate < 80) {
      recommendations.push({ priority: 'high', category: 'compliance', message: 'Compliance rate is below 80%. Review inspection processes and increase frequency.' });
    }
    if (stats.assetCoverage < 70) {
      recommendations.push({ priority: 'high', category: 'coverage', message: `Only ${stats.assetCoverage}% of assets have been inspected. Schedule inspections for remaining assets.` });
    }
    if (overdueAssets.length > 0) {
      recommendations.push({ priority: 'critical', category: 'overdue', message: `${overdueAssets.length} assets have overdue inspections. Schedule immediate inspections.` });
    }
    if (stats.pendingReviews > 10) {
      recommendations.push({ priority: 'medium', category: 'review', message: `${stats.pendingReviews} inspections pending review. Assign reviewers to clear backlog.` });
    }
    return recommendations;
  }

  // ==================== FORMAT REPORT ====================

  async formatReport(report, format) {
    switch (format) {
      case 'excel': return this.exportReportToExcel(report);
      case 'pdf':   return this.exportReportToPDF(report);
      case 'json':
      default:      return report;
    }
  }

  async exportReportToExcel(report) {
    const workbook = new ExcelJS.Workbook();
    const sheetName = (report.reportType || 'report').substring(0, 31);
    const worksheet = workbook.addWorksheet(sheetName);

    worksheet.mergeCells('A1', 'F1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = `${(report.reportType || '').replace(/_/g, ' ').toUpperCase()}`;
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: 'center' };

    worksheet.mergeCells('A2', 'F2');
    const dateCell = worksheet.getCell('A2');
    dateCell.value = `Generated: ${new Date().toISOString()}`;
    dateCell.font = { italic: true, size: 10 };
    dateCell.alignment = { horizontal: 'center' };

    worksheet.addRow([]);

    if (report.summary) {
      const summaryTitleRow = worksheet.addRow(['SUMMARY']);
      summaryTitleRow.font = { bold: true, size: 12 };
      worksheet.addRow([]);
      Object.entries(report.summary).forEach(([key, value]) => {
        if (typeof value !== 'object') {
          const row = worksheet.addRow([key, value]);
          row.getCell(1).font = { bold: true };
        }
      });
      worksheet.addRow([]);
    }

    const dataArray = Array.isArray(report.data) ? report.data
      : report.data && typeof report.data === 'object' ? Object.values(report.data).flat() : [];

    if (dataArray.length > 0) {
      const detailTitleRow = worksheet.addRow(['DETAILED DATA']);
      detailTitleRow.font = { bold: true, size: 12 };
      worksheet.addRow([]);

      const headers = Object.keys(dataArray[0]);
      const headerRow = worksheet.addRow(headers);
      headerRow.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      });

      dataArray.slice(0, 1000).forEach(item => {
        const row = headers.map(h => {
          const val = item[h];
          if (val instanceof Date) return val.toISOString().split('T')[0];
          if (typeof val === 'object' && val !== null) return JSON.stringify(val);
          return val;
        });
        worksheet.addRow(row);
      });
    }

    worksheet.columns.forEach(col => {
      let maxLen = 10;
      col.eachCell({ includeEmpty: true }, cell => {
        const len = cell.value ? cell.value.toString().length : 10;
        if (len > maxLen) maxLen = len;
      });
      col.width = Math.min(maxLen + 2, 50);
    });

    return workbook.xlsx.writeBuffer();
  }

  async exportReportToPDF(report) {
    return new Promise(resolve => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      doc.fontSize(20).text(`${(report.reportType || '').replace(/_/g, ' ').toUpperCase()}`, { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
      doc.moveDown();

      if (report.summary) {
        doc.fontSize(14).text('Summary', { underline: true });
        doc.moveDown(0.5);
        Object.entries(report.summary).forEach(([key, value]) => {
          if (typeof value !== 'object') doc.fontSize(10).text(`${key}: ${value}`);
        });
        doc.moveDown();
      }

      const dataArray = Array.isArray(report.data) ? report.data : [];
      if (dataArray.length > 0) {
        doc.fontSize(14).text('Detailed Data', { underline: true });
        doc.moveDown(0.5);
        dataArray.slice(0, 50).forEach((item, index) => {
          doc.fontSize(8).text(`Record ${index + 1}:`);
          Object.entries(item).forEach(([key, value]) => {
            if (value && typeof value !== 'object') doc.text(`  ${key}: ${value}`, { indent: 10 });
          });
          doc.moveDown(0.3);
        });
        if (dataArray.length > 50) doc.fontSize(10).text(`... and ${dataArray.length - 50} more records`);
      }

      doc.end();
    });
  }

  async exportMultipleReportsToExcel(reports) {
    const workbook = new ExcelJS.Workbook();
    for (const [key, report] of Object.entries(reports)) {
      const worksheet = workbook.addWorksheet(key.substring(0, 31));
      worksheet.addRow([`${key.replace(/_/g, ' ').toUpperCase()} REPORT`]);
      worksheet.addRow([`Generated: ${new Date().toISOString()}`]);
      worksheet.addRow([]);

      if (report.summary) {
        worksheet.addRow(['SUMMARY']);
        worksheet.addRow([]);
        Object.entries(report.summary).forEach(([k, v]) => {
          if (typeof v !== 'object') worksheet.addRow([k, v]);
        });
        worksheet.addRow([]);
      }

      const dataArray = Array.isArray(report.data) ? report.data : [];
      if (dataArray.length > 0) {
        worksheet.addRow(['DETAILED DATA']);
        const headers = Object.keys(dataArray[0]);
        worksheet.addRow(headers);
        dataArray.slice(0, 100).forEach(item => {
          worksheet.addRow(headers.map(h => {
            const val = item[h];
            if (val instanceof Date) return val.toISOString().split('T')[0];
            if (typeof val === 'object' && val !== null) return JSON.stringify(val);
            return val;
          }));
        });
      }
    }
    return workbook.xlsx.writeBuffer();
  }
}

export default new ReportService();