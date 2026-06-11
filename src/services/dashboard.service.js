// services/dashboard.service.js
import User from '../models/user.model.js';
import Asset from '../models/asset.model.js';
import Checklist from '../models/checklist.model.js';
import Assignment from '../models/AssignedChecklist.model.js';
import AuditLog from '../models/auditLog.model.js';
import Notification from '../models/notification.model.js';
import ContactMessage from '../models/contact.model.js';

class DashboardService {
  
  getDashboard = async (userRole, userId, query) => {
    try {
      const { dateRange = 30, startDate, endDate } = query;
      const dateFilter = this.getDateFilter(dateRange, startDate, endDate);
      
      let dashboardData = {};
      
      switch (userRole) {
        case 'super_admin':
          dashboardData = await this.getSuperAdminDashboard(dateFilter);
          break;
        case 'admin':
          dashboardData = await this.getAdminDashboard(userId, dateFilter);
          break;
        case 'team':
          dashboardData = await this.getTeamDashboard(userId, dateFilter);
          break;
        default:
          throw new Error('Invalid role');
      }
      
      return { success: true, data: dashboardData };
    } catch (error) {
      console.error('Dashboard service error:', error);
      return { success: false, error: error.message };
    }
  };
  
  getSuperAdminDashboard = async (dateFilter) => {
    const [
      clients,
      revenue,
      checklistStats,
      assignmentStats,
      recentActivities,
      notifications,
      contactInquiries
    ] = await Promise.all([
      this.getClientStats(dateFilter),
      this.getRevenueStats(dateFilter),
      this.getChecklistStats(null, dateFilter),
      this.getAssignmentStats(null, dateFilter),
      this.getRecentActivities('super_admin', null, dateFilter),
      this.getRecentNotifications('super_admin'),
      this.getContactInquiryStats(dateFilter)
    ]);
    
    return {
      role: 'super_admin',
      clients,
      revenue,
      checklists: checklistStats,
      assignments: assignmentStats,
      contactInquiries,
      recentActivities,
      notifications,
      timestamp: new Date()
    };
  };
  
  getAdminDashboard = async (adminId, dateFilter) => {
    const [
      team,
      assets,
      checklistStats,
      assignmentStats,
      recentActivities,
      notifications
    ] = await Promise.all([
      this.getTeamStats(adminId, dateFilter),
      this.getAssetStats(adminId, dateFilter),
      this.getChecklistStats(adminId, dateFilter),
      this.getAssignmentStats(adminId, dateFilter),
      this.getRecentActivities('admin', adminId, dateFilter),
      this.getRecentNotifications('admin', adminId)
    ]);
    
    return {
      role: 'admin',
      team,
      assets,
      checklists: checklistStats,
      assignments: assignmentStats,
      recentActivities,
      notifications,
      timestamp: new Date()
    };
  };
  
  getTeamDashboard = async (teamId, dateFilter) => {
    const [
      ownTasks,
      upcomingTasks,
      weeklyTrend,
      completedChecklists,
      recentActivities,
      notifications
    ] = await Promise.all([
      this.getOwnTasks(teamId, dateFilter),
      this.getUpcomingTasks(teamId),
      this.getWeeklyTrend(teamId, dateFilter),
      this.getCompletedChecklists(teamId, dateFilter),
      this.getRecentActivities('team', teamId, dateFilter),
      this.getRecentNotifications('team', teamId)
    ]);
    
    return {
      role: 'team',
      ownTasks,
      upcomingTasks,
      weeklyTrend,
      completedChecklists,
      recentActivities,
      notifications,
      timestamp: new Date()
    };
  };
  
  getClientStats = async (dateFilter) => {
    const query = { role: 'admin', isDeleted: false, ...dateFilter.query };
    const totalClients = await User.countDocuments(query);
    const activeClients = await User.countDocuments({ ...query, status: 'active' });
    const newClients = await User.countDocuments({ 
      role: 'admin', 
      createdAt: { $gte: dateFilter.startDate, $lte: dateFilter.endDate },
      isDeleted: false 
    });
    
    const clients = await User.find({ role: 'admin', isDeleted: false })
      .select('name email status membershipPlan createdAt')
      .limit(10);
    
    return {
      total: totalClients,
      active: activeClients,
      inactive: totalClients - activeClients,
      new: newClients,
      growthRate: totalClients > 0 ? ((newClients / totalClients) * 100).toFixed(2) : 0,
      recent: clients
    };
  };
  
  getRevenueStats = async (dateFilter) => {
    const admins = await User.find({ role: 'admin', isDeleted: false });
    const planPrices = { basic: 99, professional: 299, enterprise: 999 };
    
    let totalRevenue = 0;
    let activeSubscriptions = 0;
    
    admins.forEach(admin => {
      const price = planPrices[admin.membershipPlan] || 0;
      totalRevenue += price;
      if (admin.status === 'active') activeSubscriptions++;
    });
    
    return {
      totalMonthly: totalRevenue,
      totalYearly: totalRevenue * 12,
      activeSubscriptions,
      averagePerClient: activeSubscriptions > 0 ? (totalRevenue / activeSubscriptions).toFixed(2) : 0,
      projectedAnnual: totalRevenue * 12
    };
  };
  
  getChecklistStats = async (userId, dateFilter) => {
    let query = { isDeleted: false };
    
    if (userId) {
      const user = await User.findById(userId);
      if (user && user.role === 'admin') {
        query.createdBy = userId;
      } else if (user && user.role === 'team') {
        const assignments = await Assignment.find({ 
          assignedToTeamMembers: userId, 
          isDeleted: false 
        });
        const checklistIds = assignments.flatMap(a => a.checklistIds);
        query._id = { $in: checklistIds };
      }
    }
    
    if (dateFilter.query) query = { ...query, ...dateFilter.query };
    
    const total = await Checklist.countDocuments(query);
    const published = await Checklist.countDocuments({ ...query, status: 'published' });
    const draft = await Checklist.countDocuments({ ...query, status: 'draft' });
    const archived = await Checklist.countDocuments({ ...query, status: 'archived' });
    
    return { 
      total, 
      published, 
      draft, 
      archived,
      completionRate: total > 0 ? ((published / total) * 100).toFixed(2) : 0 
    };
  };
  
  getAssignmentStats = async (userId, dateFilter) => {
    let query = { isDeleted: false };
    
    if (userId) {
      const user = await User.findById(userId);
      if (user && user.role === 'admin') {
        query.$or = [{ assignedToAdmin: userId }, { customerId: userId }];
      } else if (user && user.role === 'team') {
        query.assignedToTeamMembers = userId;
      }
    }
    
    if (dateFilter.query) query = { ...query, ...dateFilter.query };
    
    const total = await Assignment.countDocuments(query);
    const pending = await Assignment.countDocuments({ ...query, status: 'pending' });
    const inProgress = await Assignment.countDocuments({ ...query, status: 'in_progress' });
    const completed = await Assignment.countDocuments({ ...query, status: 'completed' });
    const overdue = await Assignment.countDocuments({ 
      ...query, 
      dueDate: { $lt: new Date() }, 
      status: { $ne: 'completed' } 
    });
    
    return { 
      total, 
      pending, 
      inProgress, 
      completed, 
      overdue,
      completionRate: total > 0 ? ((completed / total) * 100).toFixed(2) : 0 
    };
  };
  
  getTeamStats = async (adminId, dateFilter) => {
    const teamMembers = await User.find({ 
      createdBy: adminId, 
      role: 'team', 
      isDeleted: false 
    });
    
    const total = teamMembers.length;
    const active = teamMembers.filter(m => m.status === 'active').length;
    
    const teamIds = teamMembers.map(m => m._id);
    const assignments = await Assignment.find({ 
      assignedToTeamMembers: { $in: teamIds }, 
      status: 'completed' 
    });
    
    const recentMembers = teamMembers.slice(0, 5).map(m => ({ 
      id: m._id, 
      name: m.name, 
      email: m.email, 
      status: m.status,
      qualityScore: m.qualityScore || 0
    }));
    
    return {
      total, 
      active, 
      inactive: total - active,
      avgCompletionRate: total > 0 ? ((assignments.length / total) * 100).toFixed(2) : 0,
      recent: recentMembers
    };
  };
  
  getAssetStats = async (adminId, dateFilter) => {
    const query = { adminId, isDeleted: false, ...dateFilter.query };
    const total = await Asset.countDocuments(query);
    const active = await Asset.countDocuments({ ...query, status: 'Active' });
    const inMaintenance = await Asset.countDocuments({ ...query, status: 'In Maintenance' });
    const decommissioned = await Asset.countDocuments({ ...query, status: 'Decommissioned' });
    
    const assets = await Asset.find(query).select('currentValue purchaseCost');
    const totalValue = assets.reduce((sum, asset) => sum + (asset.currentValue || 0), 0);
    const totalCost = assets.reduce((sum, asset) => sum + (asset.purchaseCost || 0), 0);
    
    const recentAssets = await Asset.find(query)
      .select('assetName tagNumber status currentValue')
      .limit(5)
      .sort({ createdAt: -1 });
    
    return { 
      total, 
      active, 
      inMaintenance,
      decommissioned,
      totalValue,
      totalCost,
      depreciation: totalCost > 0 ? (((totalCost - totalValue) / totalCost) * 100).toFixed(2) : 0,
      recent: recentAssets
    };
  };
  
  getOwnTasks = async (teamId, dateFilter) => {
    const query = { assignedToTeamMembers: teamId, isDeleted: false, ...dateFilter.query };
    const total = await Assignment.countDocuments(query);
    const completed = await Assignment.countDocuments({ ...query, status: 'completed' });
    const pending = await Assignment.countDocuments({ ...query, status: 'pending' });
    const inProgress = await Assignment.countDocuments({ ...query, status: 'in_progress' });
    const overdue = await Assignment.countDocuments({ 
      ...query, 
      dueDate: { $lt: new Date() }, 
      status: { $ne: 'completed' } 
    });
    
    return { 
      total, 
      completed, 
      pending,
      inProgress,
      overdue, 
      completionRate: total > 0 ? ((completed / total) * 100).toFixed(2) : 0 
    };
  };
  
  getUpcomingTasks = async (teamId) => {
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    
    const assignments = await Assignment.find({
      assignedToTeamMembers: teamId,
      status: { $in: ['pending', 'in_progress'] },
      dueDate: { $gte: new Date(), $lte: sevenDaysFromNow },
      isDeleted: false
    })
    .populate('checklistIds', 'name')
    .sort({ dueDate: 1 })
    .limit(10);
    
    return assignments.map(a => ({ 
      id: a._id, 
      title: a.checklistData?.map(c => c.name).join(', ') || 'Assignment',
      dueDate: a.dueDate, 
      priority: a.priority,
      status: a.status
    }));
  };
  
  getWeeklyTrend = async (teamId, dateFilter) => {
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      last7Days.push(date);
    }
    
    const trends = await Promise.all(last7Days.map(async (date) => {
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      const completed = await Assignment.countDocuments({
        assignedToTeamMembers: teamId,
        status: 'completed',
        completedAt: { $gte: date, $lt: nextDate },
        isDeleted: false
      });
      return { date: date.toISOString().split('T')[0], completed };
    }));
    
    return trends;
  };
  
  getCompletedChecklists = async (teamId, dateFilter) => {
    const assignments = await Assignment.find({
      assignedToTeamMembers: teamId,
      status: 'completed',
      isDeleted: false,
      ...dateFilter.query
    });
    
    const totalChecklists = assignments.reduce((sum, a) => sum + (a.checklistData?.length || 0), 0);
    const uniqueChecklists = new Set(assignments.flatMap(a => a.checklistIds?.map(id => id.toString()) || [])).size;
    const totalSubmitted = assignments.filter(a => a.submittedAt).length;
    
    return { 
      totalAssignments: assignments.length, 
      totalChecklists, 
      uniqueChecklists,
      totalSubmitted
    };
  };
  
  getContactInquiryStats = async (dateFilter) => {
    const query = dateFilter.query || {};
    const total = await ContactMessage.countDocuments(query);
    const recent = await ContactMessage.find(query)
      .sort({ createdAt: -1 })
      .limit(5);
    
    return { 
      total, 
      recent: recent.map(r => ({ 
        id: r._id, 
        name: r.fullName, 
        email: r.email, 
        createdAt: r.createdAt 
      }))
    };
  };
  
  getRecentActivities = async (role, userId, dateFilter) => {
    let query = {};
    
    if (role === 'admin' && userId) {
      query.$or = [{ actor: userId }, { 'metadata.adminId': userId }];
    } else if (role === 'team' && userId) {
      query.actor = userId;
    }
    
    if (dateFilter.query) {
      query.createdAt = dateFilter.query.createdAt;
    }
    
    const activities = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('actor', 'name email role');
    
    return activities.map(a => ({ 
      id: a._id, 
      action: a.action, 
      resource: a.resource, 
      description: a.description, 
      actor: a.actor,
      status: a.status,
      timestamp: a.createdAt 
    }));
  };
  
  getRecentNotifications = async (role, userId = null) => {
    let query = { isRead: false };
    
    if (role !== 'super_admin' && userId) {
      query.recipient = userId;
    } else if (role === 'super_admin') {
      query.recipientRole = 'super_admin';
    } else {
      query.recipientRole = role;
      if (userId) query.recipient = userId;
    }
    
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(10);
    
    return notifications.map(n => ({ 
      id: n._id, 
      title: n.title, 
      message: n.message, 
      type: n.type, 
      priority: n.priority,
      isRead: n.isRead,
      createdAt: n.createdAt,
      actionLink: n.actionLink
    }));
  };
  
  getDateFilter = (dateRange, startDate, endDate) => {
    if (startDate && endDate) {
      return {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        query: {
          createdAt: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
          }
        }
      };
    }
    
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - parseInt(dateRange));
    
    return {
      startDate: start,
      endDate: end,
      query: {
        createdAt: {
          $gte: start,
          $lte: end
        }
      }
    };
  };
}

export default new DashboardService();