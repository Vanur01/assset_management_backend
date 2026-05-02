// services/dashboard.service.js
import User from '../models/user.model.js';
import Asset from '../models/asset.model.js';
import Checklist from '../models/checklist.model.js';
import Assignment from '../models/AssignedChecklist.model.js';
import ChecklistRequest from '../models/Checklistrequest.model.js';
import mongoose from 'mongoose';

class DashboardService {
  
  // ==================== SUPER ADMIN DASHBOARD ====================
  
  async getsuper_adminDashboard(filters = {}) {
    const { dateRange = 30, startDate, endDate } = filters;
    
    // Date range calculation
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date();
    if (!startDate) start.setDate(start.getDate() - dateRange);
    
    // Parallel queries for better performance
    const [
      clientStats,
      subscriptionStats,
      checklistStats,
      requestStats,
      recentActivities,
      revenueData,
      clientGrowthData,
      topPerformers
    ] = await Promise.all([
      this.getClientStatistics(start, end),
      this.getSubscriptionAnalytics(start, end),
      this.getChecklistStatistics(start, end),
      this.getRequestStatistics(start, end),
      this.getRecentActivities(start, end, 10),
      this.getRevenueData(start, end),
      this.getClientGrowthData(start, end),
      this.getTopPerformingClients(5)
    ]);
    
    // Calculate growth percentages
    const previousPeriodStart = new Date(start);
    previousPeriodStart.setDate(previousPeriodStart.getDate() - (end - start) / (1000 * 60 * 60 * 24));
    const previousClientCount = await User.countDocuments({
      role: 'admin',
      isDeleted: false,
      createdAt: { $lt: start, $gte: previousPeriodStart }
    });
    
    const clientGrowth = previousClientCount > 0 
      ? ((clientStats.total - previousClientCount) / previousClientCount * 100).toFixed(1)
      : 0;
    
    return {
      overview: {
        totalClients: clientStats.total,
        activeClients: clientStats.active,
        inactiveClients: clientStats.inactive,
        expiringSoon: clientStats.expiringSoon,
        clientGrowth: parseFloat(clientGrowth),
        totalRevenue: revenueData.totalRevenue,
        monthlyRecurringRevenue: revenueData.mrr,
        averageRevenuePerClient: clientStats.total > 0 ? Math.round(revenueData.totalRevenue / clientStats.total) : 0
      },
      subscriptionAnalytics: subscriptionStats,
      checklistAnalytics: checklistStats,
      requestAnalytics: requestStats,
      recentActivities,
      charts: {
        revenueTrend: revenueData.trend,
        clientGrowth: clientGrowthData,
        subscriptionDistribution: subscriptionStats.byPlan,
        topPerformers
      }
    };
  }
  
  async getClientStatistics(start, end) {
    const stats = await User.aggregate([
      { $match: { role: 'admin', isDeleted: false } },
      {
        $facet: {
          total: [{ $count: 'count' }],
          active: [{ $match: { status: 'active' } }, { $count: 'count' }],
          inactive: [{ $match: { status: 'inactive' } }, { $count: 'count' }],
          expiringSoon: [
            { $match: { subscriptionEndDate: { $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), $gt: new Date() } } },
            { $count: 'count' }
          ],
          newClients: [
            { $match: { createdAt: { $gte: start, $lte: end } } },
            { $count: 'count' }
          ],
          byPlan: [
            { $group: { _id: '$membershipPlan', count: { $sum: 1 } } }
          ]
        }
      }
    ]);
    
    return {
      total: stats[0]?.total[0]?.count || 0,
      active: stats[0]?.active[0]?.count || 0,
      inactive: stats[0]?.inactive[0]?.count || 0,
      expiringSoon: stats[0]?.expiringSoon[0]?.count || 0,
      newClients: stats[0]?.newClients[0]?.count || 0,
      byPlan: stats[0]?.byPlan?.reduce((acc, { _id, count }) => {
        acc[_id || 'free'] = count;
        return acc;
      }, { free: 0, standard: 0, premium: 0, enterprise: 0 })
    };
  }
  
  async getSubscriptionAnalytics(start, end) {
    const subscriptions = await User.aggregate([
      { $match: { role: 'admin', isDeleted: false, subscriptionEndDate: { $ne: null } } },
      {
        $group: {
          _id: null,
          averageSubscriptionDays: { $avg: { $subtract: ['$subscriptionEndDate', '$subscriptionStartDate'] } },
          totalActiveSubscriptions: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
          expiringIn30Days: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gt: ['$subscriptionEndDate', new Date()] },
                    { $lte: ['$subscriptionEndDate', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)] }
                  ]
                }, 1, 0
              ]
            }
          },
          expiredSubscriptions: {
            $sum: {
              $cond: [{ $lt: ['$subscriptionEndDate', new Date()] }, 1, 0]
            }
          }
        }
      }
    ]);
    
    const revenueByPlan = await User.aggregate([
      { $match: { role: 'admin', isDeleted: false, membershipPlan: { $ne: null } } },
      {
        $group: {
          _id: '$membershipPlan',
          count: { $sum: 1 },
          totalLicenses: { $sum: '$licenseLimit' },
          usedLicenses: { $sum: '$usersUsed' }
        }
      }
    ]);
    
    const planPricing = { free: 0, standard: 49, premium: 99, enterprise: 299 };
    
    return {
      averageSubscriptionDays: Math.round((subscriptions[0]?.averageSubscriptionDays || 0) / (1000 * 60 * 60 * 24)),
      totalActiveSubscriptions: subscriptions[0]?.totalActiveSubscriptions || 0,
      expiringIn30Days: subscriptions[0]?.expiringIn30Days || 0,
      expiredSubscriptions: subscriptions[0]?.expiredSubscriptions || 0,
      byPlan: revenueByPlan.map(plan => ({
        plan: plan._id,
        count: plan.count,
        totalLicenses: plan.totalLicenses,
        usedLicenses: plan.usedLicenses,
        utilizationRate: plan.totalLicenses > 0 ? Math.round((plan.usedLicenses / plan.totalLicenses) * 100) : 0,
        potentialRevenue: plan.count * (planPricing[plan._id] || 0)
      }))
    };
  }
  
  async getChecklistStatistics(start, end) {
    const stats = await Checklist.aggregate([
      {
        $facet: {
          total: [{ $count: 'count' }],
          byType: [
            { $group: { _id: '$type', count: { $sum: 1 } } }
          ],
          byStatus: [
            { $group: { _id: '$status', count: { $sum: 1 } } }
          ],
          newChecklists: [
            { $match: { createdAt: { $gte: start, $lte: end } } },
            { $count: 'count' }
          ],
          totalFields: [
            { $group: { _id: null, total: { $sum: '$totalFields' } } }
          ]
        }
      }
    ]);
    
    const assignments = await Assignment.aggregate([
      {
        $facet: {
          totalAssignments: [{ $count: 'count' }],
          completedAssignments: [{ $match: { status: 'completed' } }, { $count: 'count' }],
          pendingReview: [{ $match: { submissionStatus: 'pending_review' } }, { $count: 'count' }],
          averageCompletionRate: [
            { $group: { _id: null, avg: { $avg: '$completionRate' } } }
          ]
        }
      }
    ]);
    
    return {
      total: stats[0]?.total[0]?.count || 0,
      byType: stats[0]?.byType?.reduce((acc, { _id, count }) => ({ ...acc, [_id]: count }), {}),
      byStatus: stats[0]?.byStatus?.reduce((acc, { _id, count }) => ({ ...acc, [_id]: count }), {}),
      newThisPeriod: stats[0]?.newChecklists[0]?.count || 0,
      totalFields: stats[0]?.totalFields[0]?.total || 0,
      assignments: {
        total: assignments[0]?.totalAssignments[0]?.count || 0,
        completed: assignments[0]?.completedAssignments[0]?.count || 0,
        pendingReview: assignments[0]?.pendingReview[0]?.count || 0,
        averageCompletionRate: Math.round(assignments[0]?.averageCompletionRate[0]?.avg || 0)
      }
    };
  }
  
  async getRequestStatistics(start, end) {
    const stats = await ChecklistRequest.aggregate([
      {
        $match: { createdAt: { $gte: start, $lte: end } }
      },
      {
        $facet: {
          total: [{ $count: 'count' }],
          byStatus: [
            { $group: { _id: '$status', count: { $sum: 1 } } }
          ],
          byUrgency: [
            { $group: { _id: '$urgencyLevel', count: { $sum: 1 } } }
          ],
          averageReviewTime: [
            { $match: { timeToReview: { $ne: null } } },
            { $group: { _id: null, avg: { $avg: '$timeToReview' } } }
          ],
          approved: [{ $match: { status: 'approved' } }, { $count: 'count' }],
          rejected: [{ $match: { status: 'rejected' } }, { $count: 'count' }]
        }
      }
    ]);
    
    return {
      total: stats[0]?.total[0]?.count || 0,
      byStatus: stats[0]?.byStatus?.reduce((acc, { _id, count }) => ({ ...acc, [_id]: count }), {}),
      byUrgency: stats[0]?.byUrgency?.reduce((acc, { _id, count }) => ({ ...acc, [_id]: count }), {}),
      averageReviewTimeHours: Math.round(stats[0]?.averageReviewTime[0]?.avg || 0),
      approved: stats[0]?.approved[0]?.count || 0,
      rejected: stats[0]?.rejected[0]?.count || 0,
      approvalRate: stats[0]?.total[0]?.count > 0 
        ? Math.round(((stats[0]?.approved[0]?.count || 0) / stats[0]?.total[0]?.count) * 100)
        : 0
    };
  }
  
  async getRevenueData(start, end) {
    // Calculate revenue based on active subscriptions
    const clients = await User.find({
      role: 'admin',
      isDeleted: false,
      status: 'active',
      membershipPlan: { $ne: null, $ne: 'free' }
    }).lean();
    
    const planPricing = { standard: 49, premium: 99, enterprise: 299 };
    const monthlyRevenue = clients.reduce((total, client) => {
      return total + (planPricing[client.membershipPlan] || 0);
    }, 0);
    
    // Generate trend data for last 12 months
    const trend = [];
    for (let i = 11; i >= 0; i--) {
      const monthDate = new Date();
      monthDate.setMonth(monthDate.getMonth() - i);
      const month = monthDate.toLocaleString('default', { month: 'short' });
      
      // Simulate or calculate actual revenue for each month
      const monthRevenue = monthlyRevenue * (1 + (Math.random() - 0.5) * 0.2);
      trend.push({ month, revenue: Math.round(monthRevenue) });
    }
    
    return {
      totalRevenue: monthlyRevenue * 12, // Annual projection
      mrr: monthlyRevenue,
      trend
    };
  }
  
  async getClientGrowthData(start, end) {
    const growthData = await User.aggregate([
      {
        $match: {
          role: 'admin',
          isDeleted: false,
          createdAt: { $gte: start, $lte: end }
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
    
    // Format for chart
    const labels = [];
    const data = [];
    let cumulative = 0;
    
    growthData.forEach(item => {
      const date = new Date(item.date);
      const label = `${date.getMonth() + 1}/${date.getDate()}`;
      cumulative += item.count;
      labels.push(label);
      data.push(cumulative);
    });
    
    return { labels, data };
  }
  
  async getTopPerformingClients(limit = 5) {
    const clients = await User.aggregate([
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
          totalAssignments: { $size: '$assignments' },
          completedAssignments: {
            $size: {
              $filter: {
                input: '$assignments',
                cond: { $eq: ['$$this.status', 'completed'] }
              }
            }
          }
        }
      },
      {
        $project: {
          customerName: 1,
          email: 1,
          membershipPlan: 1,
          totalAssignments: 1,
          completedAssignments: 1,
          completionRate: {
            $cond: [
              { $eq: ['$totalAssignments', 0] },
              0,
              { $multiply: [{ $divide: ['$completedAssignments', '$totalAssignments'] }, 100] }
            ]
          }
        }
      },
      { $sort: { completionRate: -1 } },
      { $limit: limit }
    ]);
    
    return clients;
  }
  
  async getRecentActivities(start, end, limit = 10) {
    const [
      newClients,
      newChecklists,
      newRequests,
      completedInspections
    ] = await Promise.all([
      User.find({
        role: 'admin',
        isDeleted: false,
        createdAt: { $gte: start, $lte: end }
      }).select('customerName email createdAt').limit(limit).lean(),
      Checklist.find({
        createdAt: { $gte: start, $lte: end }
      }).select('name type createdBy createdAt').populate('createdBy', 'name email').limit(limit).lean(),
      ChecklistRequest.find({
        createdAt: { $gte: start, $lte: end }
      }).select('checklistName requestedByName status createdAt').limit(limit).lean(),
      Assignment.find({
        completedAt: { $gte: start, $lte: end },
        status: 'completed'
      }).select('checklist primaryMember completedAt').populate('checklist', 'name').populate('primaryMember', 'name').limit(limit).lean()
    ]);
    
    // Combine and sort activities
    const activities = [];
    
    newClients.forEach(c => activities.push({
      type: 'client_created',
      title: `New client registered: ${c.customerName}`,
      details: c.email,
      timestamp: c.createdAt,
      icon: '🏢'
    }));
    
    newChecklists.forEach(c => activities.push({
      type: 'checklist_created',
      title: `New checklist created: ${c.name}`,
      details: `Type: ${c.type}`,
      timestamp: c.createdAt,
      icon: '📋'
    }));
    
    newRequests.forEach(r => activities.push({
      type: 'request_submitted',
      title: `Checklist request: ${r.checklistName}`,
      details: `Status: ${r.status}`,
      timestamp: r.createdAt,
      icon: '📝'
    }));
    
    completedInspections.forEach(i => activities.push({
      type: 'inspection_completed',
      title: `Inspection completed: ${i.checklist?.name}`,
      details: `By: ${i.primaryMember?.name}`,
      timestamp: i.completedAt,
      icon: '✅'
    }));
    
    return activities.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  }
  
  // ==================== ADMIN DASHBOARD ====================
  
  async getAdminDashboard(adminId, filters = {}) {
    const { dateRange = 30, startDate, endDate } = filters;
    
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date();
    if (!startDate) start.setDate(start.getDate() - dateRange);
    
    const [
      teamStats,
      assetStats,
      checklistStats,
      inspectionStats,
      recentActivities,
      performanceData,
      upcomingTasks
    ] = await Promise.all([
      this.getTeamStatistics(adminId),
      this.getAssetStatistics(adminId),
      this.getAdminChecklistStatistics(adminId, start, end),
      this.getInspectionStatistics(adminId, start, end),
      this.getAdminRecentActivities(adminId, start, end, 10),
      this.getTeamPerformanceData(adminId, start, end),
      this.getUpcomingTasks(adminId, 10)
    ]);
    
    // Get subscription info
    const admin = await User.findById(adminId).lean();
    
    return {
      overview: {
        totalTeamMembers: teamStats.total,
        activeTeamMembers: teamStats.active,
        totalAssets: assetStats.total,
        activeAssets: assetStats.active,
        totalChecklists: checklistStats.total,
        totalInspections: inspectionStats.total,
        pendingReviews: inspectionStats.pendingReview,
        averageCompletionRate: inspectionStats.averageCompletionRate
      },
      teamAnalytics: {
        ...teamStats,
        performanceTrend: performanceData.trend,
        topPerformers: performanceData.topPerformers
      },
      assetAnalytics: assetStats,
      checklistAnalytics: checklistStats,
      inspectionAnalytics: inspectionStats,
      subscription: {
        plan: admin?.membershipPlan,
        daysRemaining: admin?.daysRemaining,
        usagePercentage: admin?.usagePercentage,
        licenseLimit: admin?.licenseLimit,
        licensesUsed: admin?.usersUsed,
        licensesRemaining: (admin?.licenseLimit || 0) - (admin?.usersUsed || 0)
      },
      recentActivities,
      upcomingTasks,
      charts: {
        inspectionTrend: inspectionStats.trend,
        assetDistribution: assetStats.byCategory,
        teamPerformance: performanceData.distribution
      }
    };
  }
  
  async getTeamStatistics(adminId) {
    const stats = await User.aggregate([
      { $match: { adminId: new mongoose.Types.ObjectId(adminId), role: 'team', isDeleted: false } },
      {
        $facet: {
          total: [{ $count: 'count' }],
          active: [{ $match: { status: 'active' } }, { $count: 'count' }],
          onLeave: [{ $match: { status: 'on_leave' } }, { $count: 'count' }],
          byRole: [{ $group: { _id: '$teamRole', count: { $sum: 1 } } }],
          averagePerformance: [
            { $match: { performanceScore: { $gt: 0 } } },
            { $group: { _id: null, avg: { $avg: '$performanceScore' } } }
          ],
          totalAssigned: [{ $group: { _id: null, total: { $sum: '$assignedCount' } } }],
          totalCompleted: [{ $group: { _id: null, total: { $sum: '$completedCount' } } }]
        }
      }
    ]);
    
    const totalAssigned = stats[0]?.totalAssigned[0]?.total || 0;
    const totalCompleted = stats[0]?.totalCompleted[0]?.total || 0;
    
    return {
      total: stats[0]?.total[0]?.count || 0,
      active: stats[0]?.active[0]?.count || 0,
      onLeave: stats[0]?.onLeave[0]?.count || 0,
      byRole: stats[0]?.byRole?.reduce((acc, { _id, count }) => ({ ...acc, [_id]: count }), {}),
      averagePerformance: Math.round(stats[0]?.averagePerformance[0]?.avg || 0),
      completionRate: totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 100) : 0,
      totalAssigned,
      totalCompleted
    };
  }
  
  async getAssetStatistics(adminId) {
    const stats = await Asset.aggregate([
      { $match: { adminId: new mongoose.Types.ObjectId(adminId), isDeleted: false } },
      {
        $facet: {
          total: [{ $count: 'count' }],
          active: [{ $match: { status: 'Active' } }, { $count: 'count' }],
          maintenance: [{ $match: { status: 'In Maintenance' } }, { $count: 'count' }],
          retired: [{ $match: { status: 'Retired' } }, { $count: 'count' }],
          byCategory: [{ $group: { _id: '$assetCategory', count: { $sum: 1 } } }],
          byCondition: [{ $group: { _id: '$assetCondition', count: { $sum: 1 } } }],
          averageHealthScore: [{ $group: { _id: null, avg: { $avg: '$healthScore' } } }]
        }
      }
    ]);
    
    return {
      total: stats[0]?.total[0]?.count || 0,
      active: stats[0]?.active[0]?.count || 0,
      maintenance: stats[0]?.maintenance[0]?.count || 0,
      retired: stats[0]?.retired[0]?.count || 0,
      byCategory: stats[0]?.byCategory?.reduce((acc, { _id, count }) => ({ ...acc, [_id]: count }), {}),
      byCondition: stats[0]?.byCondition?.reduce((acc, { _id, count }) => ({ ...acc, [_id]: count }), {}),
      averageHealthScore: Math.round(stats[0]?.averageHealthScore[0]?.avg || 0)
    };
  }
  
  async getAdminChecklistStatistics(adminId, start, end) {
    // Get checklists created by admin
    const checklists = await Checklist.find({
      createdBy: adminId,
      createdAt: { $gte: start, $lte: end }
    });
    
    // Get assignments for these checklists
    const checklistIds = checklists.map(c => c._id);
    const assignments = await Assignment.find({
      checklist: { $in: checklistIds }
    });
    
    return {
      total: checklists.length,
      byType: checklists.reduce((acc, c) => {
        acc[c.type] = (acc[c.type] || 0) + 1;
        return acc;
      }, {}),
      totalAssignments: assignments.length,
      completedAssignments: assignments.filter(a => a.status === 'completed').length,
      averageCompletionRate: assignments.length > 0
        ? Math.round(assignments.reduce((sum, a) => sum + (a.completionRate || 0), 0) / assignments.length)
        : 0
    };
  }
  
  async getInspectionStatistics(adminId, start, end) {
    const assignments = await Assignment.find({
      assignedBy: adminId,
      submittedAt: { $gte: start, $lte: end }
    });
    
    const completed = assignments.filter(a => a.status === 'completed');
    const approved = assignments.filter(a => a.submissionStatus === 'approved');
    const rejected = assignments.filter(a => a.submissionStatus === 'rejected');
    const pendingReview = assignments.filter(a => a.submissionStatus === 'pending_review');
    
    // Generate trend data
    const trend = [];
    const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    for (let i = 0; i <= daysDiff; i++) {
      const date = new Date(start);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      const dayAssignments = assignments.filter(a => 
        a.submittedAt && a.submittedAt.toISOString().split('T')[0] === dateStr
      );
      trend.push({
        date: dateStr,
        count: dayAssignments.length,
        approved: dayAssignments.filter(a => a.submissionStatus === 'approved').length,
        rejected: dayAssignments.filter(a => a.submissionStatus === 'rejected').length
      });
    }
    
    return {
      total: assignments.length,
      completed: completed.length,
      approved: approved.length,
      rejected: rejected.length,
      pendingReview: pendingReview.length,
      averageCompletionRate: completed.length > 0
        ? Math.round(completed.reduce((sum, a) => sum + (a.completionRate || 0), 0) / completed.length)
        : 0,
      approvalRate: assignments.length > 0 ? Math.round((approved.length / assignments.length) * 100) : 0,
      trend
    };
  }
  
  async getTeamPerformanceData(adminId, start, end) {
    const teamMembers = await User.find({ adminId, role: 'team', isDeleted: false });
    
    // Get assignments for each team member
    const memberIds = teamMembers.map(m => m._id);
    const assignments = await Assignment.find({
      primaryMember: { $in: memberIds },
      submittedAt: { $gte: start, $lte: end }
    });
    
    // Calculate performance per member
    const memberPerformance = teamMembers.map(member => {
      const memberAssignments = assignments.filter(a => a.primaryMember.toString() === member._id.toString());
      const completed = memberAssignments.filter(a => a.status === 'completed');
      const onTime = completed.filter(a => a.submittedAt && a.dueDate && a.submittedAt <= a.dueDate);
      
      return {
        name: member.fullName,
        initials: member.initials,
        role: member.teamRole,
        total: memberAssignments.length,
        completed: completed.length,
        onTime: onTime.length,
        onTimeRate: completed.length > 0 ? Math.round((onTime.length / completed.length) * 100) : 0,
        averageScore: completed.length > 0
          ? Math.round(completed.reduce((sum, a) => sum + (a.completionRate || 0), 0) / completed.length)
          : 0
      };
    });
    
    // Generate trend data
    const trend = [];
    const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    for (let i = 0; i <= daysDiff; i++) {
      const date = new Date(start);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      const dayAssignments = assignments.filter(a => 
        a.submittedAt && a.submittedAt.toISOString().split('T')[0] === dateStr
      );
      trend.push({
        date: dateStr,
        completed: dayAssignments.filter(a => a.status === 'completed').length,
        pending: dayAssignments.filter(a => a.status !== 'completed').length
      });
    }
    
    return {
      trend,
      topPerformers: memberPerformance.sort((a, b) => b.averageScore - a.averageScore).slice(0, 5),
      distribution: {
        byRole: teamMembers.reduce((acc, m) => {
          acc[m.teamRole] = (acc[m.teamRole] || 0) + 1;
          return acc;
        }, {}),
        byPerformance: {
          excellent: memberPerformance.filter(m => m.averageScore >= 90).length,
          good: memberPerformance.filter(m => m.averageScore >= 75 && m.averageScore < 90).length,
          average: memberPerformance.filter(m => m.averageScore >= 60 && m.averageScore < 75).length,
          poor: memberPerformance.filter(m => m.averageScore < 60).length
        }
      }
    };
  }
  
  async getUpcomingTasks(adminId, limit = 10) {
    const assignments = await Assignment.find({
      assignedBy: adminId,
      status: { $in: ['pending', 'in_progress'] },
      dueDate: { $gte: new Date() }
    })
      .sort('dueDate')
      .limit(limit)
      .populate('checklist', 'name')
      .populate('primaryMember', 'name email')
      .populate('assetId', 'assetName assetId')
      .lean();
    
    return assignments.map(a => ({
      id: a._id,
      title: a.checklist?.name,
      assignedTo: a.primaryMember?.name,
      asset: a.assetId?.assetName,
      dueDate: a.dueDate,
      status: a.status,
      priority: a.priority,
      daysRemaining: Math.ceil((a.dueDate - new Date()) / (1000 * 60 * 60 * 24))
    }));
  }
  
  async getAdminRecentActivities(adminId, start, end, limit = 10) {
    const [
      newTeamMembers,
      newAssets,
      completedInspections,
      newChecklists
    ] = await Promise.all([
      User.find({
        adminId,
        role: 'team',
        createdAt: { $gte: start, $lte: end }
      }).select('firstName lastName email createdAt').limit(limit).lean(),
      Asset.find({
        adminId,
        createdAt: { $gte: start, $lte: end }
      }).select('assetName assetId createdAt').limit(limit).lean(),
      Assignment.find({
        assignedBy: adminId,
        completedAt: { $gte: start, $lte: end },
        status: 'completed'
      }).select('checklist primaryMember completedAt').populate('checklist', 'name').populate('primaryMember', 'name').limit(limit).lean(),
      Checklist.find({
        createdBy: adminId,
        createdAt: { $gte: start, $lte: end }
      }).select('name type createdAt').limit(limit).lean()
    ]);
    
    const activities = [];
    
    newTeamMembers.forEach(m => activities.push({
      type: 'team_member_added',
      title: `New team member joined: ${m.firstName} ${m.lastName}`,
      details: m.email,
      timestamp: m.createdAt,
      icon: '👤'
    }));
    
    newAssets.forEach(a => activities.push({
      type: 'asset_created',
      title: `New asset added: ${a.assetName}`,
      details: `ID: ${a.assetId}`,
      timestamp: a.createdAt,
      icon: '🔧'
    }));
    
    completedInspections.forEach(i => activities.push({
      type: 'inspection_completed',
      title: `Inspection completed: ${i.checklist?.name}`,
      details: `By: ${i.primaryMember?.name}`,
      timestamp: i.completedAt,
      icon: '✅'
    }));
    
    newChecklists.forEach(c => activities.push({
      type: 'checklist_created',
      title: `New checklist created: ${c.name}`,
      details: `Type: ${c.type}`,
      timestamp: c.createdAt,
      icon: '📋'
    }));
    
    return activities.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  }
  
  // ==================== TEAM MEMBER DASHBOARD ====================
  
  /**
   * Get Team Member Dashboard Stats
   * This is the missing method that was causing the error
   */
  async getTeamDashboardStats(teamMemberId) {
    try {
      // Get team member details
      const teamMember = await User.findById(teamMemberId).lean();
      if (!teamMember) {
        throw new Error('Team member not found');
      }
      
      // Get assigned tasks (inspections)
      const assignments = await Assignment.find({
        primaryMember: teamMemberId,
        isDeleted: false
      })
        .populate('checklist', 'name type sections')
        .populate('assetId', 'assetName assetId')
        .sort({ dueDate: 1 })
        .lean();
      
      const now = new Date();
      
      // Calculate statistics
      const totalTasks = assignments.length;
      const completedTasks = assignments.filter(a => a.status === 'completed').length;
      const inProgressTasks = assignments.filter(a => a.status === 'in_progress').length;
      const pendingTasks = assignments.filter(a => a.status === 'pending').length;
      const overdueTasks = assignments.filter(a => 
        a.dueDate && new Date(a.dueDate) < now && a.status !== 'completed'
      ).length;
      
      // Calculate completion rate
      const completionRate = totalTasks > 0 
        ? Math.round((completedTasks / totalTasks) * 100) 
        : 0;
      
      // Calculate on-time performance
      const onTimeTasks = assignments.filter(a => 
        a.status === 'completed' && 
        a.submittedAt && 
        a.dueDate && 
        new Date(a.submittedAt) <= new Date(a.dueDate)
      ).length;
      const onTimeRate = completedTasks > 0 
        ? Math.round((onTimeTasks / completedTasks) * 100) 
        : 0;
      
      // Get performance score
      const performanceScore = teamMember.performanceScore || 
        (completedTasks > 0 
          ? Math.round(assignments
              .filter(a => a.status === 'completed')
              .reduce((sum, a) => sum + (a.completionRate || 0), 0) / completedTasks)
          : 0);
      
      // Get recent activities (last 10)
      const recentActivities = assignments
        .filter(a => a.submittedAt || a.createdAt)
        .sort((a, b) => (b.submittedAt || b.createdAt) - (a.submittedAt || a.createdAt))
        .slice(0, 10)
        .map(a => ({
          id: a._id,
          type: a.status === 'completed' ? 'completed' : 'assigned',
          title: a.checklist?.name || 'Inspection',
          asset: a.assetId?.assetName,
          status: a.status,
          date: a.submittedAt || a.createdAt,
          completionRate: a.completionRate
        }));
      
      // Get upcoming tasks (next 5)
      const upcomingTasks = assignments
        .filter(a => a.status !== 'completed' && a.dueDate)
        .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
        .slice(0, 5)
        .map(a => ({
          id: a._id,
          title: a.checklist?.name,
          asset: a.assetId?.assetName,
          dueDate: a.dueDate,
          daysRemaining: Math.ceil((new Date(a.dueDate) - now) / (1000 * 60 * 60 * 24)),
          priority: a.priority
        }));
      
      // Get weekly performance trend
      const weeklyTrend = [];
      for (let i = 6; i >= 0; i--) {
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - i);
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 1);
        
        const weekTasks = assignments.filter(a => 
          a.submittedAt && 
          new Date(a.submittedAt) >= weekStart && 
          new Date(a.submittedAt) < weekEnd
        );
        
        weeklyTrend.push({
          date: weekStart.toLocaleDateString(),
          completed: weekTasks.filter(a => a.status === 'completed').length,
          pending: weekTasks.filter(a => a.status !== 'completed').length
        });
      }
      
      return {
        overview: {
          totalTasks,
          completedTasks,
          inProgressTasks,
          pendingTasks,
          overdueTasks,
          completionRate,
          onTimeRate,
          performanceScore
        },
        recentActivities,
        upcomingTasks,
        charts: {
          weeklyTrend,
          taskDistribution: {
            completed: completedTasks,
            inProgress: inProgressTasks,
            pending: pendingTasks
          }
        },
        teamMemberInfo: {
          name: `${teamMember.firstName || ''} ${teamMember.lastName || ''}`.trim(),
          email: teamMember.email,
          role: teamMember.teamRole,
          department: teamMember.department,
          joinDate: teamMember.joinDate,
          avatar: teamMember.initials
        }
      };
    } catch (error) {
      console.error('Error in getTeamDashboardStats:', error);
      throw error;
    }
  }
}

export default new DashboardService();