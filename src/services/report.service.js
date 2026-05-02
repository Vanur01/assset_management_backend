// services/report.service.js - Complete fixed version
import User from '../models/user.model.js';
import Asset from '../models/asset.model.js';
import Checklist from '../models/checklist.model.js';
import Assignment from '../models/AssignedChecklist.model.js';
import ChecklistRequest from '../models/Checklistrequest.model.js';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

class ReportService {
  
  // ==================== HELPER METHOD FOR SAFE NUMBER CONVERSION ====================
  
  safeNumber(value, defaultValue = 0, decimals = 1) {
    const num = parseFloat(value);
    if (isNaN(num)) return defaultValue;
    return parseFloat(num.toFixed(decimals));
  }
  
  // ==================== REPORT GENERATION METHODS ====================
  
  async generateClientReport(adminId = null, filters = {}) {
    const { startDate, endDate, membershipPlan, status, format = 'json' } = filters;
    
    const query = { role: 'admin', isDeleted: false };
    if (adminId) query._id = new mongoose.Types.ObjectId(adminId);
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
    
    const clientsWithStats = await Promise.all(clients.map(async (client) => {
      const teamCount = await User.countDocuments({ adminId: client._id, role: 'team', isDeleted: false });
      const assetCount = await Asset.countDocuments({ adminId: client._id, isDeleted: false });
      const inspectionCount = await Assignment.countDocuments({ assignedBy: client._id });
      const completedInspections = await Assignment.countDocuments({ assignedBy: client._id, status: 'completed' });
      
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
        completionRate: inspectionCount > 0 ? ((completedInspections / inspectionCount) * 100).toFixed(2) : 0,
        daysRemaining,
        usagePercentage
      };
    }));
    
    const planPricing = { free: 0, standard: 49, premium: 99, enterprise: 299 };
    const totalRevenue = clientsWithStats.reduce((total, c) => {
      return total + (planPricing[c.membershipPlan] || 0) * 12;
    }, 0);
    
    const summary = {
      totalClients: clientsWithStats.length,
      activeClients: clientsWithStats.filter(c => c.status === 'active').length,
      totalRevenue,
      totalAssets: clientsWithStats.reduce((sum, c) => sum + (c.assetCount || 0), 0),
      totalInspections: clientsWithStats.reduce((sum, c) => sum + (c.inspectionCount || 0), 0),
      averageCompletionRate: clientsWithStats.reduce((sum, c) => sum + parseFloat(c.completionRate), 0) / (clientsWithStats.length || 1)
    };
    
    const report = {
      generatedAt: new Date(),
      reportType: 'client_report',
      filters: { startDate, endDate, membershipPlan, status },
      summary,
      data: clientsWithStats,
      totalRecords: clientsWithStats.length
    };
    
    return await this.formatReport(report, format);
  }
  
  // ==================== ANALYTICS METHODS WITH FIXED NUMBER HANDLING ====================
  
  async getClientGrowthData(startDate, endDate) {
    const total = await User.countDocuments({ role: 'admin', isDeleted: false });
    const newClients = await User.countDocuments({
      role: 'admin',
      isDeleted: false,
      createdAt: { $gte: startDate, $lte: endDate }
    });
    const previousPeriodStart = new Date(startDate);
    previousPeriodStart.setDate(previousPeriodStart.getDate() - (endDate - startDate) / (1000 * 60 * 60 * 24));
    const previousNewClients = await User.countDocuments({
      role: 'admin',
      isDeleted: false,
      createdAt: { $gte: previousPeriodStart, $lt: startDate }
    });
    
    let growth = 0;
    if (previousNewClients > 0) {
      growth = ((newClients - previousNewClients) / previousNewClients) * 100;
    }
    
    return {
      total,
      new: newClients,
      previous: previousNewClients,
      growth: this.safeNumber(growth, 0, 1) // Returns number with 1 decimal
    };
  }
  
  async getRevenueTrendData(startDate, endDate) {
    const clients = await User.find({ role: 'admin', isDeleted: false, membershipPlan: { $ne: 'free' } });
    const planPricing = { standard: 49, premium: 99, enterprise: 299 };
    const currentRevenue = clients.reduce((sum, c) => sum + (planPricing[c.membershipPlan] || 0), 0);
    const previousRevenue = currentRevenue * 0.85;
    
    let growth = 0;
    if (previousRevenue > 0) {
      growth = ((currentRevenue - previousRevenue) / previousRevenue) * 100;
    }
    
    return {
      current: currentRevenue,
      previous: previousRevenue,
      growth: this.safeNumber(growth, 0, 1), // Returns number with 1 decimal
      projected: currentRevenue * 1.1
    };
  }
  
  async getChecklistUsageData(startDate, endDate) {
    const total = await Checklist.countDocuments();
    const active = await Checklist.countDocuments({ status: 'active' });
    const newChecklists = await Checklist.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate }
    });
    
    let activeRate = 0;
    if (total > 0) {
      activeRate = (active / total) * 100;
    }
    
    return {
      total,
      active,
      activeRate: this.safeNumber(activeRate, 0, 1),
      new: newChecklists
    };
  }
  
  async getTopPerformingClients(limit) {
    return await User.aggregate([
      { $match: { role: 'admin', isDeleted: false, status: 'active' } },
      {
        $lookup: {
          from: 'assignments',
          localField: '_id',
          foreignField: 'assignedBy',
          as: 'assignments'
        }
      },
      {
        $addFields: {
          completionRate: {
            $multiply: [
              {
                $divide: [
                  { $size: { $filter: { input: '$assignments', cond: { $eq: ['$$this.status', 'completed'] } } } },
                  { $max: [{ $size: '$assignments' }, 1] }
                ]
              },
              100
            ]
          }
        }
      },
      { $sort: { completionRate: -1 } },
      { $limit: limit },
      { $project: { customerName: 1, email: 1, membershipPlan: 1, completionRate: 1 } }
    ]);
  }
  
  async getRequestTrendData(startDate, endDate) {
    const requests = await ChecklistRequest.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          count: { $sum: 1 },
          date: { $first: '$createdAt' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);
    
    return requests.map(r => ({
      date: r.date,
      count: r.count
    }));
  }
  
  async getTeamPerformanceData(adminId, startDate, endDate) {
    const team = await User.find({ adminId, role: 'team', isDeleted: false });
    const assignments = await Assignment.find({
      assignedBy: adminId,
      submittedAt: { $gte: startDate, $lte: endDate }
    });
    
    const completed = assignments.filter(a => a.status === 'completed');
    const onTime = completed.filter(a => a.submittedAt && a.dueDate && a.submittedAt <= a.dueDate);
    
    let onTimeRate = 0;
    if (completed.length > 0) {
      onTimeRate = (onTime.length / completed.length) * 100;
    }
    
    let averageScore = 0;
    if (completed.length > 0) {
      averageScore = completed.reduce((sum, a) => sum + (a.completionRate || 0), 0) / completed.length;
    }
    
    return {
      totalMembers: team.length,
      totalAssignments: assignments.length,
      completedAssignments: completed.length,
      onTimeRate: this.safeNumber(onTimeRate, 0, 1),
      averageScore: this.safeNumber(averageScore, 0, 1)
    };
  }
  
  async getAssetHealthData(adminId) {
    const assets = await Asset.find({ adminId, isDeleted: false });
    const critical = assets.filter(a => a.assetCondition === 'Critical' || a.healthScore < 50);
    const maintenance = assets.filter(a => a.status === 'In Maintenance');
    
    let averageHealth = 0;
    if (assets.length > 0) {
      averageHealth = assets.reduce((sum, a) => sum + (a.healthScore || 0), 0) / assets.length;
    }
    
    return {
      total: assets.length,
      critical: critical.length,
      maintenance: maintenance.length,
      averageHealth: this.safeNumber(averageHealth, 0, 1)
    };
  }
  
  async getInspectionTrendData(adminId, startDate, endDate) {
    const assignments = await Assignment.aggregate([
      {
        $match: {
          assignedBy: new mongoose.Types.ObjectId(adminId),
          submittedAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$submittedAt' },
            month: { $month: '$submittedAt' },
            day: { $dayOfMonth: '$submittedAt' }
          },
          count: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          approved: { $sum: { $cond: [{ $eq: ['$submissionStatus', 'approved'] }, 1, 0] } }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);
    
    const totalCount = assignments.reduce((sum, a) => sum + a.count, 0);
    const completedCount = assignments.reduce((sum, a) => sum + a.completed, 0);
    let completionRate = 0;
    if (totalCount > 0) {
      completionRate = (completedCount / totalCount) * 100;
    }
    
    return {
      trend: assignments.map(a => ({
        date: new Date(a._id.year, a._id.month - 1, a._id.day),
        total: a.count,
        completed: a.completed,
        approved: a.approved
      })),
      completionRate: this.safeNumber(completionRate, 0, 1)
    };
  }
  
  async getCompletionRateData(adminId, startDate, endDate) {
    const assignments = await Assignment.find({
      assignedBy: adminId,
      submittedAt: { $gte: startDate, $lte: endDate }
    });
    
    const weeklyData = [];
    const currentDate = new Date(startDate);
    let weekNumber = 1;
    
    while (currentDate <= endDate) {
      const weekEnd = new Date(currentDate);
      weekEnd.setDate(weekEnd.getDate() + 7);
      
      const weekAssignments = assignments.filter(a => 
        a.submittedAt >= currentDate && a.submittedAt < weekEnd
      );
      
      let completionRate = 0;
      if (weekAssignments.length > 0) {
        completionRate = weekAssignments.reduce((sum, a) => sum + (a.completionRate || 0), 0) / weekAssignments.length;
      }
      
      weeklyData.push({
        week: `Week ${weekNumber}`,
        completionRate: this.safeNumber(completionRate, 0, 1)
      });
      
      currentDate.setDate(currentDate.getDate() + 7);
      weekNumber++;
    }
    
    return weeklyData;
  }
  
  async getPendingTasksData(adminId) {
    return await Assignment.find({
      assignedBy: adminId,
      status: { $in: ['pending', 'in_progress'] },
      dueDate: { $gte: new Date() }
    }).countDocuments();
  }
  
  // ==================== INSIGHTS GENERATION WITH SAFE NUMBER HANDLING ====================
  
  generateInsights(data) {
    const insights = [];
    
    // Safely handle clientGrowth
    if (data.clientGrowth && data.clientGrowth.growth !== undefined) {
      const growth = this.safeNumber(data.clientGrowth.growth, 0, 1);
      if (growth > 10) {
        insights.push(`Client base grew by ${growth}% this period. Excellent growth!`);
      }
    }
    
    // Safely handle revenueTrend
    if (data.revenueTrend && data.revenueTrend.growth !== undefined) {
      const revenueGrowth = this.safeNumber(data.revenueTrend.growth, 0, 1);
      if (revenueGrowth > 15) {
        insights.push(`Revenue increased by ${revenueGrowth}%. Great performance!`);
      }
    }
    
    // Safely handle checklistUsage
    if (data.checklistUsage && data.checklistUsage.activeRate !== undefined) {
      const activeRate = this.safeNumber(data.checklistUsage.activeRate, 0, 1);
      if (activeRate < 50) {
        insights.push(`Only ${activeRate}% of checklists are active. Review inactive checklists.`);
      }
    }
    
    return insights;
  }
  
  generateAdminInsights(data) {
    const insights = [];
    
    // Safely handle teamPerformance
    if (data.teamPerformance && data.teamPerformance.averageScore !== undefined) {
      const avgScore = this.safeNumber(data.teamPerformance.averageScore, 0, 1);
      if (avgScore < 70) {
        insights.push('Team performance is below target. Consider additional training.');
      }
    }
    
    // Safely handle assetHealth
    if (data.assetHealth && data.assetHealth.critical !== undefined) {
      const criticalCount = this.safeNumber(data.assetHealth.critical, 0, 0);
      if (criticalCount > 5) {
        insights.push(`${criticalCount} assets are in critical condition. Immediate attention required.`);
      }
    }
    
    // Safely handle inspectionTrend
    if (data.inspectionTrend && data.inspectionTrend.completionRate !== undefined) {
      const completionRate = this.safeNumber(data.inspectionTrend.completionRate, 0, 1);
      if (completionRate < 60) {
        insights.push('Inspection completion rate is low. Review team workload and deadlines.');
      }
    }
    
    return insights;
  }
  
  // ==================== ANALYTICS AGGREGATION ====================
  
  async getsuper_adminAnalytics(startDate, endDate) {
    const [
      clientGrowth,
      revenueTrend,
      checklistUsage,
      topPerformers,
      requestTrend
    ] = await Promise.all([
      this.getClientGrowthData(startDate, endDate),
      this.getRevenueTrendData(startDate, endDate),
      this.getChecklistUsageData(startDate, endDate),
      this.getTopPerformingClients(10),
      this.getRequestTrendData(startDate, endDate)
    ]);
    
    return {
      clientGrowth,
      revenueTrend,
      checklistUsage,
      topPerformers,
      requestTrend,
      insights: this.generateInsights({ clientGrowth, revenueTrend, checklistUsage })
    };
  }
  
  async getAdminAnalytics(adminId, startDate, endDate) {
    const [
      teamPerformance,
      assetHealth,
      inspectionTrend,
      completionRates,
      pendingTasks
    ] = await Promise.all([
      this.getTeamPerformanceData(adminId, startDate, endDate),
      this.getAssetHealthData(adminId),
      this.getInspectionTrendData(adminId, startDate, endDate),
      this.getCompletionRateData(adminId, startDate, endDate),
      this.getPendingTasksData(adminId)
    ]);
    
    return {
      teamPerformance,
      assetHealth,
      inspectionTrend,
      completionRates,
      pendingTasks,
      insights: this.generateAdminInsights({ teamPerformance, assetHealth, inspectionTrend })
    };
  }
  
  async getDashboardAnalytics(adminId, userRole, filters = {}) {
    const { dateRange = 30 } = filters;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - dateRange);
    
    if (userRole === 'super_admin' || userRole === 'superadmin') {
      return await this.getsuper_adminAnalytics(startDate, endDate);
    } else {
      return await this.getAdminAnalytics(adminId, startDate, endDate);
    }
  }
  
  // ==================== ASSET REPORT ====================
  
  async generateAssetReport(adminId, filters = {}) {
    const { startDate, endDate, status, category, condition, format = 'json' } = filters;
    
    const query = { adminId: new mongoose.Types.ObjectId(adminId), isDeleted: false };
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
      averageHealthScore: assets.reduce((sum, a) => sum + (a.healthScore || 0), 0) / (assets.length || 1),
      assetsNeedingMaintenance: assets.filter(a => a.status === 'In Maintenance').length,
      assetsExpiringWarranty: assets.filter(a => {
        if (!a.warrantyExpiry) return false;
        const daysLeft = (a.warrantyExpiry - new Date()) / (1000 * 60 * 60 * 24);
        return daysLeft <= 90 && daysLeft > 0;
      }).length
    };
    
    const report = {
      generatedAt: new Date(),
      reportType: 'asset_report',
      filters: { startDate, endDate, status, category, condition },
      summary: stats,
      data: assets,
      totalRecords: assets.length
    };
    
    return await this.formatReport(report, format);
  }
  
  // ==================== TEAM REPORT ====================
  
  async generateTeamReport(adminId, filters = {}) {
    const { startDate, endDate, teamRole, status, format = 'json' } = filters;
    
    const query = { adminId: new mongoose.Types.ObjectId(adminId), role: 'team', isDeleted: false };
    if (teamRole) query.teamRole = teamRole;
    if (status) query.status = status;
    
    const teamMembers = await User.find(query)
      .select('firstName lastName email teamRole status assignedCount completedCount onTimeRate qualityScore performanceScore joinDate certifications')
      .lean();
    
    const membersWithData = await Promise.all(teamMembers.map(async (member) => {
      const inspectionQuery = { primaryMember: member._id };
      if (startDate || endDate) {
        inspectionQuery.submittedAt = {};
        if (startDate) inspectionQuery.submittedAt.$gte = new Date(startDate);
        if (endDate) inspectionQuery.submittedAt.$lte = new Date(endDate);
      }
      
      const inspections = await Assignment.find(inspectionQuery).lean();
      const completed = inspections.filter(i => i.status === 'completed');
      const approved = inspections.filter(i => i.submissionStatus === 'approved');
      const onTime = completed.filter(i => i.submittedAt && i.dueDate && i.submittedAt <= i.dueDate);
      
      const monthlyTrend = this.calculateMonthlyTrend(inspections);
      
      return {
        ...member,
        totalInspections: inspections.length,
        completedInspections: completed.length,
        approvedInspections: approved.length,
        onTimeInspections: onTime.length,
        onTimeRate: completed.length > 0 ? (onTime.length / completed.length) * 100 : 0,
        approvalRate: inspections.length > 0 ? (approved.length / inspections.length) * 100 : 0,
        averageCompletionTime: this.calculateAvgCompletionTime(completed),
        monthlyTrend
      };
    }));
    
    const summary = {
      totalMembers: membersWithData.length,
      activeMembers: membersWithData.filter(m => m.status === 'active').length,
      averagePerformance: membersWithData.reduce((sum, m) => sum + (m.performanceScore || 0), 0) / (membersWithData.length || 1),
      totalInspections: membersWithData.reduce((sum, m) => sum + (m.totalInspections || 0), 0),
      totalCompleted: membersWithData.reduce((sum, m) => sum + (m.completedInspections || 0), 0),
      averageOnTimeRate: membersWithData.reduce((sum, m) => sum + (m.onTimeRate || 0), 0) / (membersWithData.length || 1),
      topPerformers: membersWithData.sort((a, b) => b.performanceScore - a.performanceScore).slice(0, 5),
      byRole: this.groupBy(membersWithData, 'teamRole')
    };
    
    const report = {
      generatedAt: new Date(),
      reportType: 'team_performance_report',
      filters: { startDate, endDate, teamRole, status },
      summary,
      data: membersWithData,
      totalRecords: membersWithData.length
    };
    
    return await this.formatReport(report, format);
  }
  
  // ==================== INSPECTION REPORT ====================
  
  async generateInspectionReport(adminId, filters = {}) {
    const { startDate, endDate, status, checklistId, assignedTo, format = 'json' } = filters;
    
    const query = {};
    if (adminId) query.assignedBy = new mongoose.Types.ObjectId(adminId);
    if (checklistId) query.checklist = new mongoose.Types.ObjectId(checklistId);
    if (assignedTo) query.primaryMember = new mongoose.Types.ObjectId(assignedTo);
    if (status) query.status = status;
    
    if (startDate || endDate) {
      query.submittedAt = {};
      if (startDate) query.submittedAt.$gte = new Date(startDate);
      if (endDate) query.submittedAt.$lte = new Date(endDate);
    }
    
    const inspections = await Assignment.find(query)
      .populate('checklist', 'name type category totalFields')
      .populate('primaryMember', 'firstName lastName email')
      .populate('secondaryMember', 'firstName lastName email')
      .populate('assetId', 'assetName assetId tagNumber location')
      .populate('assignedBy', 'customerName email')
      .lean();
    
    const completed = inspections.filter(i => i.status === 'completed');
    const approved = inspections.filter(i => i.submissionStatus === 'approved');
    const rejected = inspections.filter(i => i.submissionStatus === 'rejected');
    const pendingReview = inspections.filter(i => i.submissionStatus === 'pending_review');
    
    const responseQuality = this.calculateResponseQuality(inspections);
    const completionTimeDistribution = this.calculateCompletionTimeDistribution(completed);
    
    const stats = {
      total: inspections.length,
      completed: completed.length,
      approved: approved.length,
      rejected: rejected.length,
      pendingReview: pendingReview.length,
      approvalRate: inspections.length > 0 ? (approved.length / inspections.length) * 100 : 0,
      completionRate: inspections.length > 0 ? (completed.length / inspections.length) * 100 : 0,
      averageCompletionRate: completed.reduce((sum, i) => sum + (i.completionRate || 0), 0) / (completed.length || 1),
      averageScore: completed.reduce((sum, i) => sum + (i.overallRating || 0), 0) / (completed.length || 1),
      responseQuality,
      completionTimeDistribution,
      byChecklist: this.groupBy(inspections, 'checklist.name'),
      byInspector: this.groupBy(inspections, 'primaryMember.fullName'),
      byAsset: this.groupBy(inspections, 'assetId.assetName')
    };
    
    const report = {
      generatedAt: new Date(),
      reportType: 'inspection_report',
      filters: { startDate, endDate, status, checklistId, assignedTo },
      summary: stats,
      data: inspections,
      totalRecords: inspections.length
    };
    
    return await this.formatReport(report, format);
  }
  
  // ==================== FINANCIAL REPORT ====================
  
  async generateFinancialReport(adminId = null, filters = {}) {
    const { startDate, endDate, format = 'json' } = filters;
    
    const query = { role: 'admin', isDeleted: false };
    if (adminId) query._id = new mongoose.Types.ObjectId(adminId);
    
    const clients = await User.find(query)
      .select('customerName membershipPlan subscriptionStartDate subscriptionEndDate licenseLimit usersUsed')
      .lean();
    
    const planPricing = { free: 0, standard: 49, premium: 99, enterprise: 299 };
    let totalRevenue = 0;
    let mrr = 0;
    const revenueByPlan = {};
    const revenueByMonth = {};
    
    clients.forEach(client => {
      const planRevenue = planPricing[client.membershipPlan] || 0;
      totalRevenue += planRevenue * 12;
      mrr += planRevenue;
      
      revenueByPlan[client.membershipPlan] = (revenueByPlan[client.membershipPlan] || 0) + planRevenue;
      
      if (client.subscriptionStartDate) {
        const month = client.subscriptionStartDate.toLocaleString('default', { month: 'short', year: 'numeric' });
        revenueByMonth[month] = (revenueByMonth[month] || 0) + planRevenue;
      }
    });
    
    const previousPeriodRevenue = mrr * 0.85;
    let revenueGrowth = 0;
    if (previousPeriodRevenue > 0) {
      revenueGrowth = ((mrr - previousPeriodRevenue) / previousPeriodRevenue) * 100;
    }
    
    const projectedRevenue = this.calculateProjectedRevenue(clients, planPricing);
    
    const summary = {
      totalRevenue: totalRevenue,
      monthlyRecurringRevenue: mrr,
      averageRevenuePerClient: clients.length > 0 ? totalRevenue / clients.length : 0,
      revenueGrowth: this.safeNumber(revenueGrowth, 0, 2),
      projectedAnnualRevenue: projectedRevenue.total,
      byPlan: revenueByPlan,
      monthlyBreakdown: revenueByMonth
    };
    
    const report = {
      generatedAt: new Date(),
      reportType: 'financial_report',
      filters: { startDate, endDate },
      summary,
      data: clients.map(c => ({
        customerName: c.customerName,
        plan: c.membershipPlan,
        monthlyRevenue: planPricing[c.membershipPlan] || 0,
        annualRevenue: (planPricing[c.membershipPlan] || 0) * 12,
        licensesUsed: c.usersUsed,
        licenseCapacity: c.licenseLimit,
        utilizationRate: ((c.usersUsed / c.licenseLimit) * 100).toFixed(2),
        subscriptionEndDate: c.subscriptionEndDate
      })),
      totalRecords: clients.length
    };
    
    return await this.formatReport(report, format);
  }
  
  // ==================== COMPLIANCE REPORT ====================
  
  async generateComplianceReport(adminId, filters = {}) {
    const { startDate, endDate, format = 'json' } = filters;
    
    const query = { assignedBy: new mongoose.Types.ObjectId(adminId) };
    if (startDate || endDate) {
      query.submittedAt = {};
      if (startDate) query.submittedAt.$gte = new Date(startDate);
      if (endDate) query.submittedAt.$lte = new Date(endDate);
    }
    
    const inspections = await Assignment.find(query)
      .populate('checklist', 'name category')
      .populate('assetId', 'assetName assetCategory')
      .lean();
    
    const assets = await Asset.find({ adminId: new mongoose.Types.ObjectId(adminId), isDeleted: false })
      .select('assetName assetCategory status lastInspectionDate')
      .lean();
    
    const overdueAssets = assets.filter(a => {
      if (!a.lastInspectionDate) return true;
      const daysSinceLast = (new Date() - a.lastInspectionDate) / (1000 * 60 * 60 * 24);
      return daysSinceLast > 365;
    });
    
    const complianceStats = {
      totalInspections: inspections.length,
      completedInspections: inspections.filter(i => i.status === 'completed').length,
      approvedInspections: inspections.filter(i => i.submissionStatus === 'approved').length,
      complianceRate: inspections.length > 0 
        ? (inspections.filter(i => i.submissionStatus === 'approved').length / inspections.length) * 100 
        : 0,
      assetsInspected: new Set(inspections.map(i => i.assetId?._id?.toString()).filter(Boolean)).size,
      totalAssets: assets.length,
      assetCoverage: assets.length > 0 
        ? (new Set(inspections.map(i => i.assetId?._id?.toString()).filter(Boolean)).size / assets.length) * 100 
        : 0,
      overdueAssets: overdueAssets.length,
      pendingReviews: inspections.filter(i => i.submissionStatus === 'pending_review').length,
      averageResponseTime: this.calculateAvgResponseTime(inspections)
    };
    
    const recommendations = this.generateComplianceRecommendations(complianceStats, overdueAssets);
    
    const report = {
      generatedAt: new Date(),
      reportType: 'compliance_report',
      filters: { startDate, endDate },
      summary: complianceStats,
      recommendations,
      data: {
        inspections: inspections.slice(0, 100),
        overdueAssets: overdueAssets
      },
      totalRecords: inspections.length
    };
    
    return await this.formatReport(report, format);
  }
  
  // ==================== CUSTOM REPORT ====================
  
  async generateCustomReport(adminId, reportConfig) {
    const { 
      reportName, 
      dataSources, 
      dateRange, 
      metrics, 
      groupBy, 
      filters,
      format = 'json' 
    } = reportConfig;
    
    const startDate = dateRange?.startDate ? new Date(dateRange.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = dateRange?.endDate ? new Date(dateRange.endDate) : new Date();
    
    const reportData = {};
    
    for (const source of dataSources) {
      switch (source) {
        case 'clients':
          reportData.clients = await this.getClientAnalytics(adminId, startDate, endDate, metrics, groupBy);
          break;
        case 'assets':
          reportData.assets = await this.getAssetAnalytics(adminId, startDate, endDate, metrics, groupBy);
          break;
        case 'inspections':
          reportData.inspections = await this.getInspectionAnalytics(adminId, startDate, endDate, metrics, groupBy);
          break;
        case 'team':
          reportData.team = await this.getTeamAnalytics(adminId, startDate, endDate, metrics, groupBy);
          break;
        case 'checklists':
          reportData.checklists = await this.getChecklistAnalytics(adminId, startDate, endDate, metrics, groupBy);
          break;
      }
    }
    
    const report = {
      generatedAt: new Date(),
      reportType: 'custom_report',
      reportName: reportName,
      config: { dataSources, dateRange, metrics, groupBy, filters },
      data: reportData,
      summary: this.calculateCustomSummary(reportData, metrics)
    };
    
    return await this.formatReport(report, format);
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
        const month = i.submittedAt.toLocaleString('default', { month: 'short', year: 'numeric' });
        trend[month] = (trend[month] || 0) + 1;
      }
    });
    return Object.entries(trend).map(([month, count]) => ({ month, count }));
  }
  
  calculateAvgCompletionTime(inspections) {
    const times = inspections
      .filter(i => i.startedAt && i.submittedAt)
      .map(i => (i.submittedAt - i.startedAt) / (1000 * 60));
    return times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
  }
  
  calculateAvgResponseTime(inspections) {
    const times = inspections
      .filter(i => i.submittedAt && i.reviewedAt)
      .map(i => (i.reviewedAt - i.submittedAt) / (1000 * 60 * 60));
    return times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
  }
  
  calculateResponseQuality(inspections) {
    const completed = inspections.filter(i => i.status === 'completed');
    const completeResponses = completed.filter(i => i.completionRate === 100).length;
    const partialResponses = completed.filter(i => i.completionRate < 100 && i.completionRate > 0).length;
    
    return {
      completeResponses: (completeResponses / (completed.length || 1)) * 100,
      partialResponses: (partialResponses / (completed.length || 1)) * 100,
      averageCompletionRate: completed.reduce((sum, i) => sum + (i.completionRate || 0), 0) / (completed.length || 1)
    };
  }
  
  calculateCompletionTimeDistribution(inspections) {
    const distribution = {
      '0-30 min': 0,
      '30-60 min': 0,
      '1-2 hours': 0,
      '2-4 hours': 0,
      '4+ hours': 0
    };
    
    inspections.forEach(i => {
      if (i.startedAt && i.submittedAt) {
        const minutes = (i.submittedAt - i.startedAt) / (1000 * 60);
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
    const monthly = clients.reduce((total, client) => {
      return total + (planPricing[client.membershipPlan] || 0);
    }, 0);
    
    const growthRate = 0.10;
    const projectedMonthly = monthly * (1 + growthRate);
    
    return {
      monthly: projectedMonthly,
      quarterly: projectedMonthly * 3,
      yearly: projectedMonthly * 12,
      growthRate: growthRate * 100
    };
  }
  
  generateComplianceRecommendations(stats, overdueAssets) {
    const recommendations = [];
    
    if (stats.complianceRate < 80) {
      recommendations.push({
        priority: 'high',
        category: 'compliance',
        message: 'Compliance rate is below 80%. Review inspection processes and increase frequency.'
      });
    }
    
    if (stats.assetCoverage < 70) {
      recommendations.push({
        priority: 'high',
        category: 'coverage',
        message: `Only ${stats.assetCoverage.toFixed(1)}% of assets have been inspected. Schedule inspections for remaining assets.`
      });
    }
    
    if (overdueAssets.length > 0) {
      recommendations.push({
        priority: 'critical',
        category: 'overdue',
        message: `${overdueAssets.length} assets have overdue inspections. Schedule immediate inspections.`
      });
    }
    
    if (stats.pendingReviews > 10) {
      recommendations.push({
        priority: 'medium',
        category: 'review',
        message: `${stats.pendingReviews} inspections pending review. Assign reviewers to clear backlog.`
      });
    }
    
    return recommendations;
  }
  
  async formatReport(report, format) {
    switch (format) {
      case 'excel':
        return await this.exportReportToExcel(report);
      case 'pdf':
        return await this.exportReportToPDF(report);
      case 'json':
      default:
        return report;
    }
  }
  
  async exportReportToExcel(report) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(report.reportType.substring(0, 31));
    
    worksheet.mergeCells('A1', 'F1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = `${report.reportType.toUpperCase()} REPORT`;
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: 'center' };
    
    worksheet.mergeCells('A2', 'F2');
    const dateCell = worksheet.getCell('A2');
    dateCell.value = `Generated: ${new Date().toISOString()}`;
    dateCell.font = { italic: true, size: 10 };
    dateCell.alignment = { horizontal: 'center' };
    
    worksheet.addRow([]);
    
    if (report.summary) {
      worksheet.addRow(['SUMMARY']).font = { bold: true, size: 12 };
      worksheet.addRow([]);
      
      Object.entries(report.summary).forEach(([key, value]) => {
        const row = worksheet.addRow([key, value]);
        row.getCell(1).font = { bold: true };
      });
      worksheet.addRow([]);
    }
    
    if (report.data && report.data.length > 0) {
      worksheet.addRow(['DETAILED DATA']).font = { bold: true, size: 12 };
      worksheet.addRow([]);
      
      const headers = Object.keys(report.data[0]);
      const headerRow = worksheet.addRow(headers);
      headerRow.eachCell((cell) => {
        cell.font = { bold: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4F81BD' }
        };
      });
      
      report.data.slice(0, 1000).forEach(item => {
        const row = headers.map(header => {
          const value = item[header];
          if (value instanceof Date) return value.toISOString().split('T')[0];
          if (typeof value === 'object') return JSON.stringify(value);
          return value;
        });
        worksheet.addRow(row);
      });
    }
    
    worksheet.columns.forEach(column => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, cell => {
        const columnLength = cell.value ? cell.value.toString().length : 10;
        if (columnLength > maxLength) maxLength = columnLength;
      });
      column.width = Math.min(maxLength + 2, 50);
    });
    
    return await workbook.xlsx.writeBuffer();
  }
  
  async exportReportToPDF(report) {
    return new Promise((resolve) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];
      
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      
      doc.fontSize(20).text(`${report.reportType.toUpperCase()} REPORT`, { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
      doc.moveDown();
      
      if (report.summary) {
        doc.fontSize(14).text('Summary', { underline: true });
        doc.moveDown(0.5);
        
        Object.entries(report.summary).forEach(([key, value]) => {
          doc.fontSize(10).text(`${key}: ${value}`);
        });
        doc.moveDown();
      }
      
      if (report.data && report.data.length > 0) {
        doc.fontSize(14).text('Detailed Data', { underline: true });
        doc.moveDown(0.5);
        
        report.data.slice(0, 50).forEach((item, index) => {
          doc.fontSize(8).text(`Record ${index + 1}:`);
          Object.entries(item).forEach(([key, value]) => {
            if (value && typeof value !== 'object') {
              doc.text(`  ${key}: ${value}`, { indent: 10 });
            }
          });
          doc.moveDown(0.3);
        });
        
        if (report.data.length > 50) {
          doc.fontSize(10).text(`... and ${report.data.length - 50} more records`);
        }
      }
      
      doc.end();
    });
  }
  
  async exportMultipleReportsToExcel(reports) {
    const workbook = new ExcelJS.Workbook();
    
    for (const [key, report] of Object.entries(reports)) {
      const worksheet = workbook.addWorksheet(key.substring(0, 31));
      
      worksheet.addRow([`${key.toUpperCase()} REPORT`]);
      worksheet.addRow([`Generated: ${new Date().toISOString()}`]);
      worksheet.addRow([]);
      
      if (report.summary) {
        worksheet.addRow(['SUMMARY']);
        worksheet.addRow([]);
        Object.entries(report.summary).forEach(([k, v]) => {
          worksheet.addRow([k, v]);
        });
        worksheet.addRow([]);
      }
      
      if (report.data && report.data.length > 0) {
        worksheet.addRow(['DETAILED DATA']);
        worksheet.addRow([]);
        
        const headers = Object.keys(report.data[0]);
        worksheet.addRow(headers);
        
        report.data.slice(0, 100).forEach(item => {
          const row = headers.map(header => {
            const value = item[header];
            if (value instanceof Date) return value.toISOString().split('T')[0];
            if (typeof value === 'object') return JSON.stringify(value);
            return value;
          });
          worksheet.addRow(row);
        });
      }
    }
    
    return await workbook.xlsx.writeBuffer();
  }
  
  async getClientAnalytics(adminId, startDate, endDate, metrics, groupBy) {
    const matchStage = { role: 'admin', isDeleted: false };
    if (adminId) matchStage._id = new mongoose.Types.ObjectId(adminId);
    
    const groupStage = {};
    if (groupBy === 'plan') groupStage._id = '$membershipPlan';
    else if (groupBy === 'status') groupStage._id = '$status';
    else groupStage._id = null;
    
    const projectStage = { count: { $sum: 1 } };
    if (metrics.includes('revenue')) {
      projectStage.revenue = { $sum: '$licenseLimit' };
    }
    
    return await User.aggregate([
      { $match: matchStage },
      { $group: groupStage },
      { $project: projectStage }
    ]);
  }
  
  async getAssetAnalytics(adminId, startDate, endDate, metrics, groupBy) {
    const groupStage = {};
    if (groupBy === 'category') groupStage._id = '$assetCategory';
    else if (groupBy === 'status') groupStage._id = '$status';
    else if (groupBy === 'condition') groupStage._id = '$assetCondition';
    else groupStage._id = null;
    
    const projectStage = { count: { $sum: 1 } };
    if (metrics.includes('value')) {
      projectStage.totalValue = { $sum: '$purchaseCost' };
    }
    
    return await Asset.aggregate([
      { $match: { adminId: new mongoose.Types.ObjectId(adminId), isDeleted: false } },
      { $group: groupStage },
      { $project: projectStage }
    ]);
  }
  
  async getInspectionAnalytics(adminId, startDate, endDate, metrics, groupBy) {
    const groupStage = {};
    if (groupBy === 'status') groupStage._id = '$status';
    else if (groupBy === 'inspector') groupStage._id = '$primaryMember';
    else groupStage._id = null;
    
    const projectStage = { count: { $sum: 1 } };
    if (metrics.includes('completionRate')) {
      projectStage.avgCompletion = { $avg: '$completionRate' };
    }
    
    return await Assignment.aggregate([
      { $match: { assignedBy: new mongoose.Types.ObjectId(adminId) } },
      { $group: groupStage },
      { $project: projectStage }
    ]);
  }
  
  async getTeamAnalytics(adminId, startDate, endDate, metrics, groupBy) {
    const groupStage = {};
    if (groupBy === 'role') groupStage._id = '$teamRole';
    else if (groupBy === 'status') groupStage._id = '$status';
    else groupStage._id = null;
    
    const projectStage = { count: { $sum: 1 } };
    if (metrics.includes('performance')) {
      projectStage.avgPerformance = { $avg: '$performanceScore' };
    }
    
    return await User.aggregate([
      { $match: { adminId: new mongoose.Types.ObjectId(adminId), role: 'team', isDeleted: false } },
      { $group: groupStage },
      { $project: projectStage }
    ]);
  }
  
  async getChecklistAnalytics(adminId, startDate, endDate, metrics, groupBy) {
    const groupStage = {};
    if (groupBy === 'type') groupStage._id = '$type';
    else if (groupBy === 'status') groupStage._id = '$status';
    else groupStage._id = null;
    
    const projectStage = { count: { $sum: 1 } };
    if (metrics.includes('fields')) {
      projectStage.totalFields = { $sum: '$totalFields' };
    }
    
    return await Checklist.aggregate([
      { $match: { createdBy: new mongoose.Types.ObjectId(adminId) } },
      { $group: groupStage },
      { $project: projectStage }
    ]);
  }
  
  calculateCustomSummary(data, metrics) {
    const summary = {};
    
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value)) {
        summary[`${key}_total`] = value.length;
        if (metrics.includes('average')) {
          summary[`${key}_average`] = value.reduce((sum, item) => sum + (item.count || 0), 0) / (value.length || 1);
        }
      }
    }
    
    return summary;
  }
}

export default new ReportService();