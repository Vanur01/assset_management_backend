// services/report.service.js
import User from '../models/user.model.js';
import Asset from '../models/asset.model.js';
import Checklist from '../models/checklist.model.js';
import Assignment from '../models/AssignedChecklist.model.js';
import AuditLog from '../models/auditLog.model.js';
import Notification from '../models/notification.model.js';
import ContactMessage from '../models/contact.model.js';


class ReportService {
  
  generateReport = async (userRole, userId, reportType, filters) => {
    try {
      let reportData = {};
      
      switch (reportType) {
        case 'clients':
          reportData = await this.getClientsReport(userRole, userId, filters);
          break;
        case 'financial':
          reportData = await this.getFinancialReport(userRole, userId, filters);
          break;
        case 'checklists':
          reportData = await this.getChecklistsReport(userRole, userId, filters);
          break;
        case 'assignments':
          reportData = await this.getAssignmentsReport(userRole, userId, filters);
          break;
        case 'audit-logs':
          reportData = await this.getAuditLogsReport(userRole, userId, filters);
          break;
        case 'contact-inquiries':
          reportData = await this.getContactInquiriesReport(userRole, userId, filters);
          break;
        case 'assets':
          reportData = await this.getAssetsReport(userRole, userId, filters);
          break;
        case 'team-members':
          reportData = await this.getTeamMembersReport(userRole, userId, filters);
          break;
        case 'individual-client':
          reportData = await this.getIndividualClientReport(userRole, userId, filters);
          break;
        case 'individual-team':
          reportData = await this.getIndividualTeamReport(userRole, userId, filters);
          break;
        default:
          throw new Error('Invalid report type');
      }
      
      return { 
        success: true, 
        data: reportData, 
        metadata: { 
          generatedAt: new Date(), 
          reportType, 
          userRole, 
          filters 
        } 
      };
    } catch (error) {
      console.error('Report service error:', error);
      return { success: false, error: error.message };
    }
  };
  
  getClientsReport = async (userRole, userId, filters) => {
    if (userRole !== 'super_admin') {
      throw new Error('Unauthorized: Only super admin can access clients report');
    }
    
    const { startDate, endDate, status, clientId } = filters;
    let query = { role: 'admin', isDeleted: false };
    
    if (startDate && endDate) {
      query.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }
    if (status) query.status = status;
    if (clientId) query._id = clientId;
    
    const clients = await User.find(query)
      .select('-password -refreshToken')
      .sort({ createdAt: -1 });
    
    const clientsWithStats = await Promise.all(clients.map(async (client) => {
      const teamMembers = await User.countDocuments({ 
        createdBy: client._id, 
        role: 'team', 
        isDeleted: false 
      });
      
      const assignments = await Assignment.countDocuments({ 
        $or: [{ assignedToAdmin: client._id }, { customerId: client._id }],
        isDeleted: false 
      });
      
      const completedAssignments = await Assignment.countDocuments({ 
        $or: [{ assignedToAdmin: client._id }, { customerId: client._id }],
        status: 'completed',
        isDeleted: false 
      });
      
      return {
        id: client._id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        status: client.status,
        membershipPlan: client.membershipPlan || 'No Plan',
        teamMembers,
        totalAssignments: assignments,
        completedAssignments: completedAssignments,
        completionRate: assignments > 0 ? ((completedAssignments / assignments) * 100).toFixed(2) : 0,
        joinDate: client.joinDate,
        lastActive: client.lastActiveAt
      };
    }));
    
    return {
      summary: {
        totalClients: clients.length,
        activeClients: clients.filter(c => c.status === 'active').length,
        inactiveClients: clients.filter(c => c.status === 'inactive').length,
        totalTeamMembers: clientsWithStats.reduce((sum, c) => sum + c.teamMembers, 0),
        totalAssignments: clientsWithStats.reduce((sum, c) => sum + c.totalAssignments, 0),
        avgCompletionRate: clientsWithStats.reduce((sum, c) => sum + parseFloat(c.completionRate), 0) / clientsWithStats.length || 0
      },
      clients: clientsWithStats
    };
  };
  
  getFinancialReport = async (userRole, userId, filters) => {
    if (userRole !== 'super_admin') {
      throw new Error('Unauthorized: Only super admin can access financial report');
    }
    
    const { startDate, endDate, clientId } = filters;
    let query = { role: 'admin', isDeleted: false };
    if (clientId) query._id = clientId;
    
    const clients = await User.find(query);
    const planPrices = { basic: 99, professional: 299, enterprise: 999, null: 0, undefined: 0 };
    
    const financialData = clients.map(client => ({
      clientId: client._id,
      clientName: client.name,
      clientEmail: client.email,
      membershipPlan: client.membershipPlan || 'No Plan',
      monthlySubscription: planPrices[client.membershipPlan] || 0,
      yearlySubscription: (planPrices[client.membershipPlan] || 0) * 12,
      joinDate: client.joinDate,
      status: client.status
    }));
    
    const totalMonthly = financialData.reduce((sum, d) => sum + d.monthlySubscription, 0);
    const activeClientsRevenue = financialData
      .filter(d => clients.find(c => c._id.toString() === d.clientId.toString())?.status === 'active')
      .reduce((sum, d) => sum + d.monthlySubscription, 0);
    
    return {
      summary: {
        totalClients: clients.length,
        activeClients: clients.filter(c => c.status === 'active').length,
        totalMonthlyRevenue: totalMonthly,
        totalYearlyRevenue: totalMonthly * 12,
        averageRevenuePerClient: clients.length > 0 ? (totalMonthly / clients.length).toFixed(2) : 0,
        activeClientsMonthlyRevenue: activeClientsRevenue
      },
      clients: financialData,
      planDistribution: {
        basic: financialData.filter(d => d.membershipPlan === 'basic').length,
        professional: financialData.filter(d => d.membershipPlan === 'professional').length,
        enterprise: financialData.filter(d => d.membershipPlan === 'enterprise').length,
        noPlan: financialData.filter(d => d.membershipPlan === 'No Plan').length
      }
    };
  };
  
  getChecklistsReport = async (userRole, userId, filters) => {
    const { startDate, endDate, status, category, clientId, teamId } = filters;
    let query = { isDeleted: false };
    
    if (userRole === 'super_admin') {
      if (clientId) query.createdBy = clientId;
    } else if (userRole === 'admin') {
      query.createdBy = userId;
      if (teamId) {
        const teamMember = await User.findOne({ 
          _id: teamId, 
          createdBy: userId, 
          role: 'team' 
        });
        if (!teamMember) throw new Error('Unauthorized access to team member data');
      }
    } else if (userRole === 'team') {
      const assignments = await Assignment.find({ 
        assignedToTeamMembers: userId, 
        isDeleted: false 
      }).select('checklistIds');
      const checklistIds = assignments.flatMap(a => a.checklistIds);
      query._id = { $in: checklistIds };
    }
    
    if (startDate && endDate) {
      query.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }
    if (status) query.status = status;
    if (category) query.category = category;
    
    const checklists = await Checklist.find(query)
      .populate('createdBy', 'name email role')
      .sort({ createdAt: -1 });
    
    const checklistsWithStats = await Promise.all(checklists.map(async (checklist) => {
      const assignments = await Assignment.find({ 
        checklistIds: checklist._id, 
        isDeleted: false 
      });
      const totalAssignments = assignments.length;
      const completedAssignments = assignments.filter(a => a.status === 'completed').length;
      
      return {
        id: checklist._id,
        name: checklist.name,
        description: checklist.description,
        category: checklist.category,
        status: checklist.status,
        version: checklist.version,
        totalFields: checklist.fields?.length || 0,
        isGlobal: checklist.isGlobal,
        createdBy: checklist.createdBy,
        createdAt: checklist.createdAt,
        usageStats: {
          totalAssignments,
          completedAssignments,
          completionRate: totalAssignments > 0 ? ((completedAssignments / totalAssignments) * 100).toFixed(2) : 0
        }
      };
    }));
    
    return {
      summary: {
        totalChecklists: checklists.length,
        published: checklists.filter(c => c.status === 'published').length,
        draft: checklists.filter(c => c.status === 'draft').length,
        archived: checklists.filter(c => c.status === 'archived').length,
        categories: [...new Set(checklists.map(c => c.category))],
        totalFields: checklistsWithStats.reduce((sum, c) => sum + c.totalFields, 0),
        totalAssignments: checklistsWithStats.reduce((sum, c) => sum + c.usageStats.totalAssignments, 0)
      },
      checklists: checklistsWithStats
    };
  };
  
  getAssignmentsReport = async (userRole, userId, filters) => {
    const { startDate, endDate, status, priority, clientId, teamId, assetId } = filters;
    let query = { isDeleted: false };
    
    if (userRole === 'super_admin') {
      if (clientId) query.$or = [{ assignedToAdmin: clientId }, { customerId: clientId }];
    } else if (userRole === 'admin') {
      query.$or = [{ assignedToAdmin: userId }, { customerId: userId }];
      if (teamId) {
        const teamMember = await User.findOne({ 
          _id: teamId, 
          createdBy: userId, 
          role: 'team' 
        });
        if (!teamMember) throw new Error('Unauthorized access to team member data');
        query.assignedToTeamMembers = teamId;
      }
    } else if (userRole === 'team') {
      query.assignedToTeamMembers = userId;
    }
    
    if (startDate && endDate) {
      query.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }
    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (assetId) query.assetIds = assetId;
    
    const assignments = await Assignment.find(query)
      .populate('assignedToAdmin', 'name email')
      .populate('assignedToTeamMembers', 'name email')
      .populate('customerId', 'name email')
      .sort({ createdAt: -1 });
    
    const assignmentsWithDetails = assignments.map(assignment => ({
      id: assignment._id,
      customer: assignment.customerName,
      assignedToAdmin: assignment.assignedToAdmin,
      assignedToTeam: assignment.assignedToTeamMembers,
      dueDate: assignment.dueDate,
      status: assignment.status,
      priority: assignment.priority,
      checklists: assignment.checklistData?.map(c => c.name) || [],
      completedAt: assignment.completedAt,
      notes: assignment.notes,
      createdAt: assignment.createdAt,
      isOverdue: assignment.dueDate < new Date() && assignment.status !== 'completed'
    }));
    
    const completedAssignments = assignments.filter(a => a.status === 'completed');
    const onTimeCompleted = completedAssignments.filter(a => a.completedAt <= a.dueDate);
    
    return {
      summary: {
        total: assignments.length,
        pending: assignments.filter(a => a.status === 'pending').length,
        inProgress: assignments.filter(a => a.status === 'in_progress').length,
        completed: completedAssignments.length,
        overdue: assignments.filter(a => a.dueDate < new Date() && a.status !== 'completed').length,
        completionRate: assignments.length > 0 ? ((completedAssignments.length / assignments.length) * 100).toFixed(2) : 0,
        onTimeRate: completedAssignments.length > 0 ? ((onTimeCompleted.length / completedAssignments.length) * 100).toFixed(2) : 0,
        priorityDistribution: {
          low: assignments.filter(a => a.priority === 'low').length,
          medium: assignments.filter(a => a.priority === 'medium').length,
          high: assignments.filter(a => a.priority === 'high').length,
          critical: assignments.filter(a => a.priority === 'critical').length
        }
      },
      assignments: assignmentsWithDetails
    };
  };
  
  getAuditLogsReport = async (userRole, userId, filters) => {
    const { startDate, endDate, action, resource, actorId } = filters;
    let query = {};
    
    if (userRole === 'super_admin') {
      if (actorId) query.actor = actorId;
    } else if (userRole === 'admin') {
      query.$or = [
        { actor: userId },
        { 'metadata.adminId': userId },
        { 'metadata.assignedToAdmin': userId }
      ];
    } else if (userRole === 'team') {
      query.actor = userId;
    }
    
    if (startDate && endDate) {
      query.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }
    if (action) query.action = action;
    if (resource) query.resource = resource;
    
    const auditLogs = await AuditLog.find(query)
      .populate('actor', 'name email role')
      .sort({ createdAt: -1 });
    
    const actionStats = {};
    const resourceStats = {};
    auditLogs.forEach(log => {
      actionStats[log.action] = (actionStats[log.action] || 0) + 1;
      resourceStats[log.resource] = (resourceStats[log.resource] || 0) + 1;
    });
    
    return {
      summary: {
        totalLogs: auditLogs.length,
        uniqueActions: Object.keys(actionStats).length,
        uniqueResources: Object.keys(resourceStats).length,
        successCount: auditLogs.filter(l => l.status === 'success').length,
        failureCount: auditLogs.filter(l => l.status === 'failure').length,
        actionBreakdown: actionStats,
        resourceBreakdown: resourceStats
      },
      logs: auditLogs.map(log => ({
        id: log._id,
        action: log.action,
        resource: log.resource,
        resourceId: log.resourceId,
        actor: log.actor,
        actorRole: log.actorRole,
        description: log.description,
        status: log.status,
        ipAddress: log.ipAddress,
        metadata: log.metadata,
        timestamp: log.createdAt
      }))
    };
  };
  
  getContactInquiriesReport = async (userRole, userId, filters) => {
    if (userRole !== 'super_admin') {
      throw new Error('Unauthorized: Only super admin can access contact inquiries report');
    }
    
    const { startDate, endDate, email } = filters;
    let query = {};
    
    if (startDate && endDate) {
      query.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }
    if (email) query.email = email;
    
    const inquiries = await ContactMessage.find(query).sort({ createdAt: -1 });
    
    return {
      summary: {
        totalInquiries: inquiries.length,
        uniqueEmails: [...new Set(inquiries.map(i => i.email))].length
      },
      inquiries: inquiries.map(i => ({
        id: i._id,
        fullName: i.fullName,
        email: i.email,
        phone: i.phone,
        message: i.message,
        submittedAt: i.createdAt
      }))
    };
  };
  
  getAssetsReport = async (userRole, userId, filters) => {
    if (userRole !== 'admin') {
      throw new Error('Unauthorized: Only admin can access assets report');
    }
    
    const { startDate, endDate, status, type, assetId } = filters;
    let query = { adminId: userId, isDeleted: false };
    
    if (startDate && endDate) {
      query.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }
    if (status) query.status = status;
    if (type) query.type = type;
    if (assetId) query._id = assetId;
    
    const assets = await Asset.find(query).sort({ createdAt: -1 });
    
    const statusDistribution = {};
    const typeDistribution = {};
    let totalValue = 0;
    let totalCost = 0;
    
    assets.forEach(asset => {
      statusDistribution[asset.status] = (statusDistribution[asset.status] || 0) + 1;
      typeDistribution[asset.type] = (typeDistribution[asset.type] || 0) + 1;
      totalValue += asset.currentValue || 0;
      totalCost += asset.purchaseCost || 0;
    });
    
    return {
      summary: {
        totalAssets: assets.length,
        totalValue,
        totalCost,
        depreciation: totalCost > 0 ? (((totalCost - totalValue) / totalCost) * 100).toFixed(2) : 0,
        averageValue: assets.length > 0 ? (totalValue / assets.length).toFixed(2) : 0,
        statusDistribution,
        typeDistribution
      },
      assets: assets.map(asset => ({
        id: asset._id,
        assetId: asset.assetId,
        assetName: asset.assetName,
        tagNumber: asset.tagNumber,
        type: asset.type,
        status: asset.status,
        currentLocation: asset.currentLocation,
        manufacturer: asset.manufacturer,
        model: asset.model,
        purchaseCost: asset.purchaseCost,
        currentValue: asset.currentValue,
        warrantyExpiry: asset.warrantyExpiry,
        createdAt: asset.createdAt
      }))
    };
  };
  
  getTeamMembersReport = async (userRole, userId, filters) => {
    if (userRole !== 'admin') {
      throw new Error('Unauthorized: Only admin can access team members report');
    }
    
    const { startDate, endDate, status, teamId } = filters;
    let query = { createdBy: userId, role: 'team', isDeleted: false };
    
    if (startDate && endDate) {
      query.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }
    if (status) query.status = status;
    if (teamId) query._id = teamId;
    
    const teamMembers = await User.find(query)
      .select('-password -refreshToken')
      .sort({ createdAt: -1 });
    
    const teamWithStats = await Promise.all(teamMembers.map(async (member) => {
      const assignments = await Assignment.find({ 
        assignedToTeamMembers: member._id, 
        isDeleted: false 
      });
      const completedAssignments = assignments.filter(a => a.status === 'completed');
      const onTimeCompleted = completedAssignments.filter(a => a.completedAt <= a.dueDate);
      
      return {
        id: member._id,
        name: member.name,
        email: member.email,
        phone: member.phone,
        status: member.status,
        teamRole: member.teamRole,
        joinDate: member.joinDate,
        totalAssignments: assignments.length,
        completedAssignments: completedAssignments.length,
        completionRate: assignments.length > 0 ? ((completedAssignments.length / assignments.length) * 100).toFixed(2) : 0,
        onTimeRate: completedAssignments.length > 0 ? ((onTimeCompleted.length / completedAssignments.length) * 100).toFixed(2) : 0,
        qualityScore: member.qualityScore || 0,
        lastActive: member.lastActiveAt
      };
    }));
    
    return {
      summary: {
        totalMembers: teamMembers.length,
        activeMembers: teamMembers.filter(m => m.status === 'active').length,
        inactiveMembers: teamMembers.filter(m => m.status === 'inactive').length,
        totalAssignments: teamWithStats.reduce((sum, m) => sum + m.totalAssignments, 0),
        avgCompletionRate: teamWithStats.reduce((sum, m) => sum + parseFloat(m.completionRate), 0) / teamWithStats.length || 0,
        avgQualityScore: teamWithStats.reduce((sum, m) => sum + m.qualityScore, 0) / teamWithStats.length || 0
      },
      teamMembers: teamWithStats
    };
  };
  
  getIndividualClientReport = async (userRole, userId, filters) => {
    if (userRole !== 'super_admin') {
      throw new Error('Unauthorized: Only super admin can access individual client report');
    }
    
    const { clientId } = filters;
    if (!clientId) throw new Error('Client ID is required');
    
    const client = await User.findOne({ 
      _id: clientId, 
      role: 'admin', 
      isDeleted: false 
    }).select('-password -refreshToken');
    
    if (!client) throw new Error('Client not found');
    
    const teamMembers = await User.find({ 
      createdBy: clientId, 
      role: 'team', 
      isDeleted: false 
    });
    
    const assignments = await Assignment.find({ 
      $or: [{ assignedToAdmin: clientId }, { customerId: clientId }], 
      isDeleted: false 
    }).populate('assignedToTeamMembers', 'name email');
    
    const completedAssignments = assignments.filter(a => a.status === 'completed');
    const checklists = await Checklist.find({ 
      createdBy: clientId, 
      isDeleted: false 
    });
    
    return {
      clientInfo: {
        id: client._id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        status: client.status,
        membershipPlan: client.membershipPlan || 'No Plan',
        joinDate: client.joinDate,
        lastActive: client.lastActiveAt,
        licenseLimit: client.licenseLimit,
        usersUsed: client.usersUsed
      },
      teamStats: {
        total: teamMembers.length,
        active: teamMembers.filter(m => m.status === 'active').length,
        members: teamMembers.map(m => ({ 
          id: m._id, 
          name: m.name, 
          email: m.email, 
          status: m.status 
        }))
      },
      assignmentStats: {
        total: assignments.length,
        completed: completedAssignments.length,
        pending: assignments.filter(a => a.status === 'pending').length,
        inProgress: assignments.filter(a => a.status === 'in_progress').length,
        overdue: assignments.filter(a => a.dueDate < new Date() && a.status !== 'completed').length,
        completionRate: assignments.length > 0 ? ((completedAssignments.length / assignments.length) * 100).toFixed(2) : 0
      },
      checklistStats: {
        total: checklists.length,
        published: checklists.filter(c => c.status === 'published').length,
        draft: checklists.filter(c => c.status === 'draft').length
      },
      recentAssignments: assignments.slice(0, 10).map(a => ({
        id: a._id,
        dueDate: a.dueDate,
        status: a.status,
        priority: a.priority,
        assignedTo: a.assignedToTeamMembers,
        checklists: a.checklistData?.map(c => c.name) || []
      }))
    };
  };
  
  getIndividualTeamReport = async (userRole, userId, filters) => {
    if (userRole !== 'admin') {
      throw new Error('Unauthorized: Only admin can access individual team report');
    }
    
    const { teamId } = filters;
    if (!teamId) throw new Error('Team ID is required');
    
    const teamMember = await User.findOne({ 
      _id: teamId, 
      createdBy: userId, 
      role: 'team', 
      isDeleted: false 
    }).select('-password -refreshToken');
    
    if (!teamMember) throw new Error('Team member not found or unauthorized');
    
    const assignments = await Assignment.find({ 
      assignedToTeamMembers: teamId, 
      isDeleted: false 
    }).populate('assignedToAdmin', 'name email');
    
    const completedAssignments = assignments.filter(a => a.status === 'completed');
    const onTimeCompleted = completedAssignments.filter(a => a.completedAt <= a.dueDate);
    const submittedChecklists = assignments.flatMap(a => a.checklistData || []);
    
    return {
      teamInfo: {
        id: teamMember._id,
        name: teamMember.name,
        email: teamMember.email,
        phone: teamMember.phone,
        status: teamMember.status,
        teamRole: teamMember.teamRole,
        joinDate: teamMember.joinDate,
        lastActive: teamMember.lastActiveAt,
        qualityScore: teamMember.qualityScore || 0,
        performanceScore: teamMember.performanceScore || 0
      },
      assignmentStats: {
        total: assignments.length,
        completed: completedAssignments.length,
        pending: assignments.filter(a => a.status === 'pending').length,
        inProgress: assignments.filter(a => a.status === 'in_progress').length,
        overdue: assignments.filter(a => a.dueDate < new Date() && a.status !== 'completed').length,
        completionRate: assignments.length > 0 ? ((completedAssignments.length / assignments.length) * 100).toFixed(2) : 0,
        onTimeRate: completedAssignments.length > 0 ? ((onTimeCompleted.length / completedAssignments.length) * 100).toFixed(2) : 0
      },
      checklistStats: {
        totalAssigned: assignments.reduce((sum, a) => sum + (a.checklistData?.length || 0), 0),
        totalSubmitted: submittedChecklists.length,
        uniqueChecklists: new Set(assignments.flatMap(a => a.checklistIds?.map(id => id.toString()) || [])).size
      },
      recentAssignments: assignments.slice(0, 10).map(a => ({
        id: a._id,
        dueDate: a.dueDate,
        status: a.status,
        priority: a.priority,
        customer: a.customerName,
        checklists: a.checklistData?.map(c => c.name) || [],
        completedAt: a.completedAt
      }))
    };
  };
}

export default new ReportService();