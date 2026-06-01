// services/dashboard.service.js
import User from '../models/user.model.js';
import Asset from '../models/asset.model.js';
import Checklist from '../models/checklist.model.js';
import Assignment from '../models/AssignedChecklist.model.js';
import ChecklistRequest from '../models/Checklistrequest.model.js';
import mongoose from 'mongoose';

class DashboardService {

  // ─── Main Entry Point ────────────────────────────────────────────────────────

  /**
   * Single entry point — returns role-specific dashboard data.
   * @param {string} role        - 'super_admin' | 'admin' | 'team'
   * @param {string} userId      - The authenticated user's _id
   * @param {object} filters     - { dateRange, startDate, endDate }
   */
  async getDashboard(role, userId, filters = {}) {
    try {
      const { start, end } = this._resolveDateRange(filters);

      if (role === 'super_admin') {
        return await this._superAdminDashboard(start, end);
      }

      if (role === 'admin') {
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
          throw new Error('Valid admin ID is required');
        }
        return await this._adminDashboard(userId, start, end);
      }

      if (role === 'team') {
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
          throw new Error('Valid team member ID is required');
        }
        return await this._teamDashboard(userId);
      }

      throw new Error(`Unknown role: ${role}`);
    } catch (error) {
      console.error(`[DashboardService] getDashboard error (role=${role}):`, error);
      return { success: false, error: error.message, data: null };
    }
  }

  // ─── Super Admin Dashboard ────────────────────────────────────────────────────

  async _superAdminDashboard(start, end) {
    const [
      clientStats,
      checklistStats,
      assignmentStats,
      requestStats,
      revenueStats,
      recentActivities,
    ] = await Promise.all([
      this._getClientStats(start, end),
      this._getSuperAdminChecklistStats(start, end),
      this._getSuperAdminAssignmentStats(start, end),
      this._getRequestStats(start, end),
      this._getRevenueStats(),
      this._getSuperAdminActivities(start, end),
    ]);

    return {
      success: true,
      role: 'super_admin',
      data: {
        // ── Clients ──────────────────────────────────────────────────────────
        clients: {
          total:          clientStats.total,
          active:         clientStats.active,
          inactive:       clientStats.inactive,
          expiringSoon:   clientStats.expiringSoon,
          newThisPeriod:  clientStats.newThisPeriod,
          byPlan:         clientStats.byPlan,
        },

        // ── Revenue ───────────────────────────────────────────────────────────
        revenue: {
          monthlyRecurring: revenueStats.mrr,
          annualEstimate:   revenueStats.annual,
          avgPerClient:     revenueStats.avgPerClient,
          byPlan:           revenueStats.byPlan,
        },

        // ── Checklists ────────────────────────────────────────────────────────
        checklists: {
          total:         checklistStats.total,
          active:        checklistStats.active,
          global:        checklistStats.global,
          custom:        checklistStats.custom,
          newThisPeriod: checklistStats.newThisPeriod,
        },

        // ── Assignments / Inspections ─────────────────────────────────────────
        assignments: {
          total:               assignmentStats.total,
          completed:           assignmentStats.completed,
          pending:             assignmentStats.pending,
          overdue:             assignmentStats.overdue,
          pendingReview:       assignmentStats.pendingReview,
          avgCompletionRate:   assignmentStats.avgCompletionRate,
          approvalRate:        assignmentStats.approvalRate,
        },

        // ── Checklist Requests ────────────────────────────────────────────────
        requests: {
          total:                requestStats.total,
          pending:              requestStats.pending,
          approved:             requestStats.approved,
          rejected:             requestStats.rejected,
          approvalRate:         requestStats.approvalRate,
          avgReviewTimeHours:   requestStats.avgReviewTimeHours,
          byUrgency:            requestStats.byUrgency,
        },

        // ── Recent Activity ───────────────────────────────────────────────────
        recentActivities,
      },
    };
  }

  // ─── Admin Dashboard ──────────────────────────────────────────────────────────

  async _adminDashboard(adminId, start, end) {
    const adminObjId = new mongoose.Types.ObjectId(adminId);

    const [
      teamStats,
      assetStats,
      checklistStats,
      inspectionStats,
      recentActivities,
    ] = await Promise.all([
      this._getTeamStats(adminObjId, start, end),
      this._getAssetStats(adminObjId),
      this._getAdminChecklistStats(adminId, start, end),
      this._getInspectionStats(adminId, start, end),
      this._getAdminActivities(adminId, start, end),
    ]);

    return {
      success: true,
      role: 'admin',
      data: {
        // ── Team Members ──────────────────────────────────────────────────────
        team: {
          total:             teamStats.total,
          active:            teamStats.active,
          inactive:          teamStats.inactive,
          onLeave:           teamStats.onLeave,
          byRole:            teamStats.byRole,
          avgPerformance:    teamStats.avgPerformance,
          completionRate:    teamStats.completionRate,
          topPerformers:     teamStats.topPerformers,
        },

        // ── Assets ────────────────────────────────────────────────────────────
        assets: {
          total:             assetStats.total,
          active:            assetStats.active,
          inMaintenance:     assetStats.maintenance,
          retired:           assetStats.retired,
          byCategory:        assetStats.byCategory,
          byCondition:       assetStats.byCondition,
          avgHealthScore:    assetStats.avgHealthScore,
        },

        // ── Checklists ────────────────────────────────────────────────────────
        checklists: {
          total:             checklistStats.total,
          newThisPeriod:     checklistStats.newThisPeriod,
          byType:            checklistStats.byType,
          totalAssignments:  checklistStats.totalAssignments,
          avgCompletionRate: checklistStats.avgCompletionRate,
        },

        // ── Inspections ───────────────────────────────────────────────────────
        inspections: {
          total:             inspectionStats.total,
          completed:         inspectionStats.completed,
          pending:           inspectionStats.pending,
          overdue:           inspectionStats.overdue,
          approved:          inspectionStats.approved,
          rejected:          inspectionStats.rejected,
          pendingReview:     inspectionStats.pendingReview,
          avgCompletionRate: inspectionStats.avgCompletionRate,
          approvalRate:      inspectionStats.approvalRate,
          dailyTrend:        inspectionStats.dailyTrend,
        },

        // ── Recent Activity ───────────────────────────────────────────────────
        recentActivities,
      },
    };
  }

  // ─── Team Dashboard ───────────────────────────────────────────────────────────

  async _teamDashboard(memberId) {
    const member = await User.findById(memberId).lean();
    if (!member) throw new Error('Team member not found');

    const assignments = await Assignment.find({
      'assignedToTeamMembers.userId': new mongoose.Types.ObjectId(memberId),
      isDeleted: { $ne: true },
    })
      .populate('checklist', 'name type category')
      .populate('assets.assetId', 'assetName assetId')
      .sort({ dueDate: 1 })
      .lean();

    const now = new Date();

    // Status buckets
    const completed  = assignments.filter(a => ['completed', 'approved'].includes(a.status));
    const inProgress = assignments.filter(a => a.status === 'in_progress');
    const pending    = assignments.filter(a => a.status === 'pending');
    const overdue    = assignments.filter(a =>
      a.dueDate && new Date(a.dueDate) < now && !['completed', 'approved', 'rejected'].includes(a.status)
    );

    const completionRate = assignments.length > 0
      ? Math.round((completed.length / assignments.length) * 100)
      : 0;

    const onTime = completed.filter(a =>
      a.submittedAt && a.dueDate && new Date(a.submittedAt) <= new Date(a.dueDate)
    );
    const onTimeRate = completed.length > 0
      ? Math.round((onTime.length / completed.length) * 100)
      : 0;

    const avgScore = completed.length > 0
      ? Math.round(completed.reduce((s, a) => s + (a.completionRate || 0), 0) / completed.length)
      : 0;

    // Upcoming (next 5 non-completed with due date)
    const upcomingTasks = assignments
      .filter(a => !['completed', 'approved', 'rejected'].includes(a.status) && a.dueDate)
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
      .slice(0, 5)
      .map(a => ({
        id:            a._id,
        checklistName: a.checklist?.name || a.checklistName,
        assetName:     a.assets?.[0]?.assetName,
        dueDate:       a.dueDate,
        daysRemaining: Math.ceil((new Date(a.dueDate) - now) / 864e5),
        priority:      a.priority,
        status:        a.status,
      }));

    // Recent activity (last 10 submitted/completed)
    const recentActivities = [...assignments]
      .sort((a, b) => (b.submittedAt || b.updatedAt) - (a.submittedAt || a.updatedAt))
      .slice(0, 10)
      .map(a => ({
        id:            a._id,
        checklistName: a.checklist?.name || a.checklistName,
        assetName:     a.assets?.[0]?.assetName,
        status:        a.status,
        completionRate: a.completionRate,
        date:          a.submittedAt || a.updatedAt,
      }));

    // 7-day trend
    const weeklyTrend = Array.from({ length: 7 }, (_, i) => {
      const day = new Date();
      day.setDate(day.getDate() - (6 - i));
      day.setHours(0, 0, 0, 0);
      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);

      const dayItems = assignments.filter(a => {
        const ts = a.submittedAt || a.updatedAt;
        return ts && new Date(ts) >= day && new Date(ts) < nextDay;
      });

      return {
        date:      day.toLocaleDateString(),
        completed: dayItems.filter(a => ['completed', 'approved'].includes(a.status)).length,
        pending:   dayItems.filter(a => !['completed', 'approved'].includes(a.status)).length,
      };
    });

    return {
      success: true,
      role: 'team',
      data: {
        memberInfo: {
          id:         member._id,
          name:       `${member.firstName || ''} ${member.lastName || ''}`.trim(),
          email:      member.email,
          role:       member.teamRole || 'inspector',
          department: member.department,
          joinDate:   member.joinDate,
          initials:   `${member.firstName?.[0] || ''}${member.lastName?.[0] || ''}`.toUpperCase(),
        },

        overview: {
          total:           assignments.length,
          completed:       completed.length,
          inProgress:      inProgress.length,
          pending:         pending.length,
          overdue:         overdue.length,
          completionRate,
          onTimeRate,
          avgScore,
        },

        upcomingTasks,
        recentActivities,

        charts: {
          weeklyTrend,
          taskDistribution: {
            completed:  completed.length,
            inProgress: inProgress.length,
            pending:    pending.length,
            overdue:    overdue.length,
          },
        },
      },
    };
  }

  // ─── Super Admin Helpers ──────────────────────────────────────────────────────

  async _getClientStats(start, end) {
    const [result] = await User.aggregate([
      { $match: { role: 'admin', isDeleted: false } },
      {
        $facet: {
          total:         [{ $count: 'n' }],
          active:        [{ $match: { status: 'active' } },   { $count: 'n' }],
          inactive:      [{ $match: { status: 'inactive' } }, { $count: 'n' }],
          expiringSoon:  [
            { $match: { subscriptionEndDate: { $gt: new Date(), $lte: new Date(Date.now() + 30 * 864e5) } } },
            { $count: 'n' },
          ],
          newThisPeriod: [
            { $match: { createdAt: { $gte: start, $lte: end } } },
            { $count: 'n' },
          ],
          byPlan: [{ $group: { _id: '$membershipPlan', count: { $sum: 1 } } }],
        },
      },
    ]);

    const byPlan = {};
    (result?.byPlan || []).forEach(({ _id, count }) => { byPlan[_id || 'free'] = count; });

    return {
      total:         result?.total[0]?.n         || 0,
      active:        result?.active[0]?.n        || 0,
      inactive:      result?.inactive[0]?.n      || 0,
      expiringSoon:  result?.expiringSoon[0]?.n  || 0,
      newThisPeriod: result?.newThisPeriod[0]?.n || 0,
      byPlan,
    };
  }

  async _getRevenueStats() {
    const planPricing = { free: 0, standard: 49, premium: 99, enterprise: 299 };

    const plans = await User.aggregate([
      { $match: { role: 'admin', isDeleted: false, status: 'active' } },
      { $group: { _id: '$membershipPlan', count: { $sum: 1 } } },
    ]);

    let mrr = 0;
    const byPlan = {};
    plans.forEach(({ _id, count }) => {
      const price = planPricing[_id] || 0;
      mrr += price * count;
      byPlan[_id || 'free'] = { count, pricePerMonth: price, revenue: price * count };
    });

    const totalClients = plans.reduce((s, p) => s + p.count, 0);

    return {
      mrr,
      annual:       mrr * 12,
      avgPerClient: totalClients > 0 ? Math.round(mrr / totalClients) : 0,
      byPlan,
    };
  }

  async _getSuperAdminChecklistStats(start, end) {
    const [result] = await Checklist.aggregate([
      {
        $facet: {
          total:  [{ $count: 'n' }],
          active: [{ $match: { status: 'active' } }, { $count: 'n' }],
          global: [{ $match: { type: 'global' } },  { $count: 'n' }],
          custom: [{ $match: { type: 'custom' } },  { $count: 'n' }],
          newThisPeriod: [
            { $match: { createdAt: { $gte: start, $lte: end } } },
            { $count: 'n' },
          ],
        },
      },
    ]);

    return {
      total:         result?.total[0]?.n         || 0,
      active:        result?.active[0]?.n        || 0,
      global:        result?.global[0]?.n        || 0,
      custom:        result?.custom[0]?.n        || 0,
      newThisPeriod: result?.newThisPeriod[0]?.n || 0,
    };
  }

  async _getSuperAdminAssignmentStats(start, end) {
    const [result] = await Assignment.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id:             null,
          total:           { $sum: 1 },
          completed:       { $sum: { $cond: [{ $in: ['$status', ['completed', 'approved']] }, 1, 0] } },
          pending:         { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
          overdue:         { $sum: { $cond: [{ $eq: ['$status', 'overdue'] }, 1, 0] } },
          pendingReview:   { $sum: { $cond: [{ $eq: ['$submissionStatus', 'pending_review'] }, 1, 0] } },
          approved:        { $sum: { $cond: [{ $eq: ['$submissionStatus', 'approved'] }, 1, 0] } },
          avgCompletion:   { $avg: '$completionRate' },
        },
      },
    ]);

    const r = result || {};
    const total    = r.total    || 0;
    const approved = r.approved || 0;

    return {
      total,
      completed:         r.completed       || 0,
      pending:           r.pending         || 0,
      overdue:           r.overdue         || 0,
      pendingReview:     r.pendingReview   || 0,
      avgCompletionRate: Math.round(r.avgCompletion || 0),
      approvalRate:      total > 0 ? Math.round((approved / total) * 100) : 0,
    };
  }

  async _getRequestStats(start, end) {
    const [result] = await ChecklistRequest.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      {
        $facet: {
          total:    [{ $count: 'n' }],
          pending:  [{ $match: { status: 'pending' } },  { $count: 'n' }],
          approved: [{ $match: { status: 'approved' } }, { $count: 'n' }],
          rejected: [{ $match: { status: 'rejected' } }, { $count: 'n' }],
          avgTime:  [
            { $match: { timeToReview: { $ne: null } } },
            { $group: { _id: null, avg: { $avg: '$timeToReview' } } },
          ],
          byUrgency: [{ $group: { _id: '$urgencyLevel', count: { $sum: 1 } } }],
        },
      },
    ]);

    const total    = result?.total[0]?.n    || 0;
    const approved = result?.approved[0]?.n || 0;

    const byUrgency = {};
    (result?.byUrgency || []).forEach(({ _id, count }) => { byUrgency[_id] = count; });

    return {
      total,
      pending:            result?.pending[0]?.n  || 0,
      approved,
      rejected:           result?.rejected[0]?.n || 0,
      approvalRate:       total > 0 ? Math.round((approved / total) * 100) : 0,
      avgReviewTimeHours: Math.round(result?.avgTime[0]?.avg || 0),
      byUrgency,
    };
  }

  async _getSuperAdminActivities(start, end, limit = 15) {
    const [clients, checklists, requests] = await Promise.allSettled([
      User.find({ role: 'admin', isDeleted: false, createdAt: { $gte: start, $lte: end } })
        .select('customerName email createdAt').sort({ createdAt: -1 }).limit(limit).lean(),

      Checklist.find({ createdAt: { $gte: start, $lte: end } })
        .select('name type createdAt').sort({ createdAt: -1 }).limit(limit).lean(),

      ChecklistRequest.find({ createdAt: { $gte: start, $lte: end } })
        .select('checklistName status urgencyLevel createdAt').sort({ createdAt: -1 }).limit(limit).lean(),
    ]);

    const activities = [];

    (clients.status === 'fulfilled' ? clients.value : []).forEach(c => activities.push({
      type:      'client_registered',
      title:     `New client: ${c.customerName}`,
      detail:    c.email,
      timestamp: c.createdAt,
    }));

    (checklists.status === 'fulfilled' ? checklists.value : []).forEach(c => activities.push({
      type:      'checklist_created',
      title:     `Checklist created: ${c.name}`,
      detail:    `Type: ${c.type}`,
      timestamp: c.createdAt,
    }));

    (requests.status === 'fulfilled' ? requests.value : []).forEach(r => activities.push({
      type:      'request_submitted',
      title:     `Request: ${r.checklistName}`,
      detail:    `Status: ${r.status} | Urgency: ${r.urgencyLevel}`,
      timestamp: r.createdAt,
    }));

    return activities
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  // ─── Admin Helpers ────────────────────────────────────────────────────────────

  async _getTeamStats(adminObjId, start, end) {
    const [result] = await User.aggregate([
      { $match: { adminId: adminObjId, role: 'team', isDeleted: false } },
      {
        $facet: {
          total:   [{ $count: 'n' }],
          active:  [{ $match: { status: 'active' } },   { $count: 'n' }],
          inactive:[{ $match: { status: 'inactive' } }, { $count: 'n' }],
          onLeave: [{ $match: { status: 'on_leave' } }, { $count: 'n' }],
          byRole:  [{ $group: { _id: '$teamRole', count: { $sum: 1 } } }],
          avgPerf: [
            { $match: { performanceScore: { $gt: 0 } } },
            { $group: { _id: null, avg: { $avg: '$performanceScore' } } },
          ],
          totals: [
            {
              $group: {
                _id:       null,
                assigned:  { $sum: '$assignedCount' },
                completed: { $sum: '$completedCount' },
              },
            },
          ],
        },
      },
    ]);

    const byRole = {};
    (result?.byRole || []).forEach(({ _id, count }) => { byRole[_id || 'inspector'] = count; });

    const assigned  = result?.totals[0]?.assigned  || 0;
    const completed = result?.totals[0]?.completed || 0;

    // Top 5 performers via lookup
    const topPerformers = await User.aggregate([
      { $match: { adminId: adminObjId, role: 'team', isDeleted: false, status: 'active' } },
      {
        $lookup: {
          from:         'assignments',
          localField:   '_id',
          foreignField: 'assignedToTeamMembers.userId',
          as:           'allAssignments',
        },
      },
      {
        $addFields: {
          totalAssigned: { $size: '$allAssignments' },
          totalCompleted: {
            $size: {
              $filter: {
                input: '$allAssignments',
                cond:  { $in: ['$$this.status', ['completed', 'approved']] },
              },
            },
          },
        },
      },
      {
        $project: {
          firstName: 1, lastName: 1, teamRole: 1,
          performanceScore: 1, totalAssigned: 1, totalCompleted: 1,
          completionRate: {
            $cond: [
              { $eq: ['$totalAssigned', 0] }, 0,
              { $multiply: [{ $divide: ['$totalCompleted', '$totalAssigned'] }, 100] },
            ],
          },
        },
      },
      { $sort: { completionRate: -1, performanceScore: -1 } },
      { $limit: 5 },
    ]);

    return {
      total:          result?.total[0]?.n    || 0,
      active:         result?.active[0]?.n   || 0,
      inactive:       result?.inactive[0]?.n || 0,
      onLeave:        result?.onLeave[0]?.n  || 0,
      byRole,
      avgPerformance: Math.round(result?.avgPerf[0]?.avg || 0),
      completionRate: assigned > 0 ? Math.round((completed / assigned) * 100) : 0,
      topPerformers:  topPerformers.map(m => ({
        id:             m._id,
        name:           `${m.firstName || ''} ${m.lastName || ''}`.trim(),
        role:           m.teamRole,
        completionRate: Math.round(m.completionRate),
        totalAssigned:  m.totalAssigned,
        totalCompleted: m.totalCompleted,
      })),
    };
  }

  async _getAssetStats(adminObjId) {
    const [result] = await Asset.aggregate([
      { $match: { adminId: adminObjId, isDeleted: false } },
      {
        $facet: {
          total:       [{ $count: 'n' }],
          active:      [{ $match: { status: 'Active' } },          { $count: 'n' }],
          maintenance: [{ $match: { status: 'In Maintenance' } },  { $count: 'n' }],
          retired:     [{ $match: { status: 'Retired' } },         { $count: 'n' }],
          byCategory:  [{ $group: { _id: '$assetCategory', count: { $sum: 1 } } }],
          byCondition: [{ $group: { _id: '$assetCondition', count: { $sum: 1 } } }],
        },
      },
    ]);

    const byCategory = {};
    (result?.byCategory || []).forEach(({ _id, count }) => { byCategory[_id || 'Other'] = count; });

    const byCondition = {};
    (result?.byCondition || []).forEach(({ _id, count }) => { byCondition[_id || 'Normal'] = count; });

    return {
      total:        result?.total[0]?.n       || 0,
      active:       result?.active[0]?.n      || 0,
      maintenance:  result?.maintenance[0]?.n || 0,
      retired:      result?.retired[0]?.n     || 0,
      byCategory,
      byCondition,
      avgHealthScore: 0, // computed via virtual — skip aggregation cost
    };
  }

  async _getAdminChecklistStats(adminId, start, end) {
    const [result] = await Checklist.aggregate([
      { $match: { createdBy: new mongoose.Types.ObjectId(adminId) } },
      {
        $facet: {
          total:         [{ $count: 'n' }],
          newThisPeriod: [
            { $match: { createdAt: { $gte: start, $lte: end } } },
            { $count: 'n' },
          ],
          byType: [{ $group: { _id: '$type', count: { $sum: 1 } } }],
        },
      },
    ]);

    const byType = {};
    (result?.byType || []).forEach(({ _id, count }) => { byType[_id] = count; });

    // Aggregate assignment stats for this admin's checklists
    const [assignStats] = await Assignment.aggregate([
      { $match: { assignedBy: new mongoose.Types.ObjectId(adminId) } },
      {
        $group: {
          _id:          null,
          total:        { $sum: 1 },
          avgCompletion:{ $avg: '$completionRate' },
        },
      },
    ]);

    return {
      total:             result?.total[0]?.n         || 0,
      newThisPeriod:     result?.newThisPeriod[0]?.n || 0,
      byType,
      totalAssignments:  assignStats?.total        || 0,
      avgCompletionRate: Math.round(assignStats?.avgCompletion || 0),
    };
  }

  async _getInspectionStats(adminId, start, end) {
    const adminObjId = new mongoose.Types.ObjectId(adminId);

    const assignments = await Assignment.find({
      assignedBy: adminObjId,
      createdAt:  { $gte: start, $lte: end },
    }).select('status submissionStatus completionRate dueDate submittedAt').lean();

    const completed    = assignments.filter(a => ['completed', 'approved'].includes(a.status));
    const pending      = assignments.filter(a => ['pending', 'in_progress'].includes(a.status));
    const overdue      = assignments.filter(a => a.status === 'overdue');
    const approved     = assignments.filter(a => a.submissionStatus === 'approved');
    const rejected     = assignments.filter(a => a.submissionStatus === 'rejected');
    const pendingReview= assignments.filter(a => a.submissionStatus === 'pending_review');

    const avgCompletionRate = completed.length > 0
      ? Math.round(completed.reduce((s, a) => s + (a.completionRate || 0), 0) / completed.length)
      : 0;

    // Daily trend (last 30 days max — cap to avoid huge arrays)
    const daysDiff = Math.min(Math.ceil((end - start) / 864e5), 30);
    const dailyTrend = Array.from({ length: daysDiff + 1 }, (_, i) => {
      const day = new Date(start);
      day.setDate(day.getDate() + i);
      const dayStr = day.toISOString().split('T')[0];

      const dayItems = assignments.filter(a => a.submittedAt?.toISOString().split('T')[0] === dayStr);
      return {
        date:     dayStr,
        total:    dayItems.length,
        approved: dayItems.filter(a => a.submissionStatus === 'approved').length,
        rejected: dayItems.filter(a => a.submissionStatus === 'rejected').length,
      };
    });

    return {
      total:             assignments.length,
      completed:         completed.length,
      pending:           pending.length,
      overdue:           overdue.length,
      approved:          approved.length,
      rejected:          rejected.length,
      pendingReview:     pendingReview.length,
      avgCompletionRate,
      approvalRate:      assignments.length > 0
        ? Math.round((approved.length / assignments.length) * 100)
        : 0,
      dailyTrend,
    };
  }

  async _getAdminActivities(adminId, start, end, limit = 15) {
    const adminObjId = new mongoose.Types.ObjectId(adminId);

    const [teamMembers, assets, checklists, inspections] = await Promise.allSettled([
      User.find({ adminId: adminObjId, role: 'team', createdAt: { $gte: start, $lte: end } })
        .select('firstName lastName email createdAt').sort({ createdAt: -1 }).limit(limit).lean(),

      Asset.find({ adminId: adminObjId, createdAt: { $gte: start, $lte: end } })
        .select('assetName assetId createdAt').sort({ createdAt: -1 }).limit(limit).lean(),

      Checklist.find({ createdBy: adminObjId, createdAt: { $gte: start, $lte: end } })
        .select('name type createdAt').sort({ createdAt: -1 }).limit(limit).lean(),

      Assignment.find({
        assignedBy: adminObjId,
        status:     { $in: ['completed', 'approved'] },
        completedAt:{ $gte: start, $lte: end },
      })
        .select('checklistName completedAt')
        .sort({ completedAt: -1 }).limit(limit).lean(),
    ]);

    const activities = [];

    (teamMembers.status === 'fulfilled' ? teamMembers.value : []).forEach(m => activities.push({
      type:      'member_added',
      title:     `Team member added: ${m.firstName || ''} ${m.lastName || ''}`.trim(),
      detail:    m.email,
      timestamp: m.createdAt,
    }));

    (assets.status === 'fulfilled' ? assets.value : []).forEach(a => activities.push({
      type:      'asset_created',
      title:     `Asset added: ${a.assetName}`,
      detail:    `ID: ${a.assetId}`,
      timestamp: a.createdAt,
    }));

    (checklists.status === 'fulfilled' ? checklists.value : []).forEach(c => activities.push({
      type:      'checklist_created',
      title:     `Checklist created: ${c.name}`,
      detail:    `Type: ${c.type}`,
      timestamp: c.createdAt,
    }));

    (inspections.status === 'fulfilled' ? inspections.value : []).forEach(i => activities.push({
      type:      'inspection_completed',
      title:     `Inspection completed: ${i.checklistName}`,
      detail:    null,
      timestamp: i.completedAt,
    }));

    return activities
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  // ─── Utility ──────────────────────────────────────────────────────────────────

  _resolveDateRange({ dateRange = 30, startDate, endDate } = {}) {
    const end   = endDate   ? new Date(endDate)   : new Date();
    const start = startDate ? new Date(startDate) : new Date();
    if (!startDate) start.setDate(start.getDate() - Number(dateRange));

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error('Invalid date range provided');
    }

    return { start, end };
  }
}

export default new DashboardService();