// services/auditLog.service.js
import AuditLog from '../models/auditLog.model.js';
import mongoose from 'mongoose';

class AuditLogService {
  
  toObjectId(id) {
    if (!id) return null;
    if (id instanceof mongoose.Types.ObjectId) return id;
    if (typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) {
      return new mongoose.Types.ObjectId(id);
    }
    return null;
  }

  /**
   * Create an audit log entry
   */
  async createAuditLog({
    action,
    resource,
    resourceId,
    resourceName = null,
    actor,
    actorRole,
    actorEmail,
    adminId = null,
    teamId = null,
    oldData = null,
    newData = null,
    changedFields = [],
    ipAddress = null,
    userAgent = null,
    description = null,
    status = 'success',
    errorMessage = null,
    referenceId = null,
    metadata = {}
  }) {
    try {
      // Remove sensitive fields from data
      const sanitizeData = (data) => {
        if (!data) return null;
        const sensitiveFields = ['password', 'accessToken', 'refreshToken', 'secretKey', 'twoFactorSecret'];
        const sanitized = JSON.parse(JSON.stringify(data));
        sensitiveFields.forEach(field => delete sanitized[field]);
        return sanitized;
      };
      
      const auditLog = await AuditLog.create({
        action,
        resource,
        resourceId: this.toObjectId(resourceId),
        resourceName,
        actor: this.toObjectId(actor),
        actorRole,
        actorEmail,
        adminId: this.toObjectId(adminId),
        teamId: this.toObjectId(teamId),
        oldData: sanitizeData(oldData),
        newData: sanitizeData(newData),
        changedFields,
        ipAddress,
        userAgent,
        description,
        status,
        errorMessage,
        referenceId,
        metadata
      });
      
      // Don't await to avoid blocking, but log error if fails
      console.log(`[AUDIT] ${action} on ${resource} by ${actorRole} (${actorEmail}) - ${status}`);
      return auditLog;
    } catch (error) {
      console.error('Failed to create audit log:', error);
      return null;
    }
  }

  /**
   * Compare two objects and return changed fields
   */
  compareChanges(oldObj, newObj, ignoreFields = []) {
    const changes = [];
    const allKeys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);
    
    for (const key of allKeys) {
      if (ignoreFields.includes(key)) continue;
      
      const oldValue = oldObj?.[key];
      const newValue = newObj?.[key];
      
      // Handle MongoDB ObjectIds and dates
      const oldStr = oldValue?.toString?.() || oldValue;
      const newStr = newValue?.toString?.() || newValue;
      
      if (oldStr !== newStr) {
        changes.push({
          field: key,
          oldValue: oldValue,
          newValue: newValue
        });
      }
    }
    
    return changes;
  }

  /**
   * Get audit logs with filtering and pagination (Role-based)
   * - super_admin: sees all logs
   * - admin: sees own logs + team members' logs under them
   * - team: sees only their own logs
   */
  async getAuditLogs(filters = {}, page = 1, limit = 20, userRole = null, userId = null, adminId = null) {
    try {
      const query = {};
      
      // Apply filters
      if (filters.action) query.action = filters.action;
      if (filters.resource) query.resource = filters.resource;
      if (filters.actorRole) query.actorRole = filters.actorRole;
      if (filters.status) query.status = filters.status;
      if (filters.resourceId) query.resourceId = this.toObjectId(filters.resourceId);
      
      // Date range filter
      if (filters.startDate || filters.endDate) {
        query.createdAt = {};
        if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
        if (filters.endDate) query.createdAt.$lte = new Date(filters.endDate);
      }
      
      // Search in description, resourceName, or actorEmail
      if (filters.search) {
        query.$or = [
          { description: { $regex: filters.search, $options: 'i' } },
          { resourceName: { $regex: filters.search, $options: 'i' } },
          { actorEmail: { $regex: filters.search, $options: 'i' } },
          { referenceId: { $regex: filters.search, $options: 'i' } }
        ];
      }
      
      // Role-based access control
      if (userRole === 'team') {
        // Team members can only see their own actions
        query.actor = this.toObjectId(userId);
      } else if (userRole === 'admin') {
        // Admins can see their organization's logs (their own + their team members)
        // This includes logs where:
        // 1. The actor is the admin themselves
        // 2. The adminId matches the admin (logs from their team members)
        query.$or = [
          { actor: this.toObjectId(userId) },
          { adminId: this.toObjectId(adminId) }
        ];
      }
      // Super admins see everything (no additional filter)
      
      const skip = (page - 1) * limit;
      
      const [auditLogs, total] = await Promise.all([
        AuditLog.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate('actor', 'name email role')
          .populate('adminId', 'name email')
          .lean(),
        AuditLog.countDocuments(query)
      ]);
      
      return {
        success: true,
        auditLogs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get audit trail for a specific resource
   */
  async getResourceAuditTrail(resourceId, resource, limit = 50) {
    try {
      const auditLogs = await AuditLog.find({ 
        resourceId: this.toObjectId(resourceId), 
        resource 
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('actor', 'name email role')
        .lean();
      
      return {
        success: true,
        auditLogs,
        count: auditLogs.length
      };
    } catch (error) {
      console.error('Error fetching resource audit trail:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get audit statistics (Role-based)
   */
  async getAuditStatistics(userRole = null, userId = null, adminId = null) {
    try {
      const matchStage = {};
      
      if (userRole === 'team') {
        matchStage.actor = this.toObjectId(userId);
      } else if (userRole === 'admin') {
        matchStage.$or = [
          { actor: this.toObjectId(userId) },
          { adminId: this.toObjectId(adminId) }
        ];
      }
      
      const stats = await AuditLog.aggregate([
        { $match: matchStage },
        {
          $facet: {
            totalActions: [{ $count: 'count' }],
            actionsByType: [
              { $group: { _id: '$action', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 20 }
            ],
            actionsByResource: [
              { $group: { _id: '$resource', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 20 }
            ],
            actionsByRole: [
              { $group: { _id: '$actorRole', count: { $sum: 1 } } },
              { $sort: { count: -1 } }
            ],
            actionsToday: [
              {
                $match: {
                  createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
                }
              },
              { $count: 'count' }
            ],
            actionsLast7Days: [
              {
                $match: {
                  createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
                }
              },
              {
                $group: {
                  _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                  count: { $sum: 1 }
                }
              },
              { $sort: { _id: 1 } }
            ],
            uniqueActors: [
              { $group: { _id: '$actor' } },
              { $count: 'count' }
            ],
            recentActivity: [
              { $sort: { createdAt: -1 } },
              { $limit: 10 },
              {
                $lookup: {
                  from: 'users',
                  localField: 'actor',
                  foreignField: '_id',
                  as: 'actorDetails'
                }
              },
              { $unwind: { path: '$actorDetails', preserveNullAndEmptyArrays: true } }
            ]
          }
        }
      ]);
      
      return {
        success: true,
        stats: {
          totalActions: stats[0].totalActions[0]?.count || 0,
          actionsByType: stats[0].actionsByType,
          actionsByResource: stats[0].actionsByResource,
          actionsByRole: stats[0].actionsByRole,
          actionsToday: stats[0].actionsToday[0]?.count || 0,
          actionsLast7Days: stats[0].actionsLast7Days,
          uniqueActors: stats[0].uniqueActors[0]?.count || 0,
          recentActivity: stats[0].recentActivity
        }
      };
    } catch (error) {
      console.error('Error fetching audit statistics:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Export audit logs
   */
  async exportAuditLogs(filters = {}, userRole = null, userId = null, adminId = null, format = 'csv') {
    try {
      const query = {};
      
      if (filters.action) query.action = filters.action;
      if (filters.resource) query.resource = filters.resource;
      if (filters.startDate || filters.endDate) {
        query.createdAt = {};
        if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
        if (filters.endDate) query.createdAt.$lte = new Date(filters.endDate);
      }
      
      if (userRole === 'team') {
        query.actor = this.toObjectId(userId);
      } else if (userRole === 'admin') {
        query.$or = [
          { actor: this.toObjectId(userId) },
          { adminId: this.toObjectId(adminId) }
        ];
      }
      
      const auditLogs = await AuditLog.find(query)
        .sort({ createdAt: -1 })
        .limit(10000)
        .populate('actor', 'name email')
        .lean();
      
      return {
        success: true,
        auditLogs
      };
    } catch (error) {
      console.error('Error exporting audit logs:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get current user's own activity
   */
  async getUserActivity(userId, page = 1, limit = 20) {
    try {
      const skip = (page - 1) * limit;
      
      const [auditLogs, total] = await Promise.all([
        AuditLog.find({ actor: this.toObjectId(userId) })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        AuditLog.countDocuments({ actor: this.toObjectId(userId) })
      ]);
      
      return {
        success: true,
        auditLogs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error fetching user activity:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get organization activity (for admins to see their team's activity)
   */
  async getOrganizationActivity(adminId, page = 1, limit = 20) {
    try {
      const skip = (page - 1) * limit;
      
      const [auditLogs, total] = await Promise.all([
        AuditLog.find({ actor: this.toObjectId(adminId) })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate('actor', 'name email role')
          .lean(),
        AuditLog.countDocuments({ actor: this.toObjectId(adminId) })
      ]);
      
      return {
        success: true,
        auditLogs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error fetching organization activity:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default new AuditLogService();